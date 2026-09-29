# godmode-lite runner

Tiny Node CLI that drives the 4-layer Godmode Lite execution protocol. Pure stdlib, zero deps, Node 18+.

## Why this exists

The skill used to be markdown only. Claude was meant to read a prompt and "just do it." The new version drives the protocol through deterministic JS commands so each layer has a verifiable artifact (file ranking, completeness scan, test exit code, formatter exit code) instead of vibes.

## Layout

```
runner/
  bin/lite              # Node shebang entry
  package.json          # name, version, no deps
  src/
    dispatch.js         # cmd router + JSON error envelope
    lib/
      paths.js          # run-dir helpers, per-project active-run map, forbidden-root guard, run pruning
      state.js          # atomic JSON read/write per run
      envelope.js       # standard {state, run_id, narrate, next, ...} formatter
      exec.js           # commandExists + runTool (shared external-tool spawner)
      discover.js       # walk + keyword scoring of repo files, modifiedSince
      completeness.js   # TODO / FIXME / stub / placeholder scanner (scoped to files modified during the run)
      runner.js         # detect + run test runner (npm/vitest/jest/pytest/go/cargo/rspec)
      polish.js         # detect + run formatter / linter (prettier/eslint/ruff/black/gofmt)
    commands/
      start.js
      discover.js
      check.js
      test.js
      polish.js
      end.js
      status.js
```

## Usage

```bash
LITE="$HOME/.claude/skills/godmode-lite/runner/bin/lite"

node "$LITE" start "build a login form"
node "$LITE" discover                          # ranked file list
# read top files, implement
node "$LITE" check                             # scan run-modified files for stubs / TODOs
node "$LITE" test                              # detect + run test suite
node "$LITE" polish                            # formatter / linter on run-modified files
node "$LITE" end                               # re-verify completeness, gate, write report.md
node "$LITE" status                            # read-only status of active run
```

Always invoke as `node "$LITE" ...` (the path or `node` prefix). The shebang does not fire on Windows but `node bin/lite` works everywhere.

## Envelope contract

Every command emits a single JSON line on stdout:

```json
{"state":"<state>","run_id":"<id>","narrate":"<one line>","next":"<command|null>","instructions":"<layer prose, optional>","data":{...optional}}
```

States: `started`, `discovered`, `checked_clean`, `checked_dirty`, `tested_pass`, `tested_fail`, `no_runner`, `polished`, `polished_warn`, `polished_skipped`, `ended`, `ended_incomplete`, `no_active_run`, `error`.

`end` may also carry a top-level `warnings` array (no test runner detected, test runner collected no tests, polish never ran). Warnings don't fail the gate; skipping `check` or `test` entirely, unresolved markers, or a failing suite do.

## State

- State folder: `%LOCALAPPDATA%\godmode-lite` on Windows, `~/Library/Application Support/godmode-lite` on macOS, `~/.godmode-lite` elsewhere. Set `GODMODE_LITE_STATE_DIR` to change it. If that folder cannot be written, the runner uses `<tmpdir>/godmode-lite` and prints one line to stderr saying so. Nothing is ever written inside the skill folder, which hosts may protect.
- Run state: `<state folder>/runs/<run-id>/state.json`
- Active runs: `<state folder>/.active-run.json` — a map of project directory → run id, so concurrent runs in different projects don't clobber each other. Commands resolve their run by cwd (exact match, then nearest ancestor, then single-entry fallback); the legacy single-run `{"run_id":...}` shape is migrated on read.
- Run report: `<state folder>/runs/<run-id>/report.md`
- Older runs under `~/.claude/skills/godmode-lite/runs/` are still read, never written.

State is written atomically (tmp file plus rename). Commands after `start` resolve the active run automatically. Old run folders are pruned on `start` (newest 20 kept, active runs never pruned).

## Guards and scoping

- `discover`, `check`, `test`, and `polish` refuse to operate on the home directory or a filesystem root.
- `check` scans only files created or modified since the run started; `end` re-runs that scan before gating so late edits can't slip through on a stale clean result.
- `polish` scopes fallback formatters (prettier, eslint, ruff, black, gofmt) to run-modified files, capped at 40 paths per tool. Project-defined `npm run lint/format` scripts and `cargo fmt` keep their own scope.
- Test detection skips the npm-init placeholder `scripts.test` ("no test specified") and falls through to dependency detection; every ecosystem branch checks the binary actually exists on PATH first. `pytest` exit 5 (collected no tests) reports as `no_runner`, not a failure.

## Adding a new command

1. Add `src/commands/<name>.js` exporting `module.exports = async function(args) { ... }`.
2. Register it in `src/dispatch.js` and the help block.
3. Use `emit({state, run_id, narrate, next, ...})` from `lib/envelope.js`.
4. Use `resolveActiveState()` to pick up the active run.

## Cross-platform notes

Test and polish runners spawn external binaries (npm, pytest, go, cargo). On Windows they go through `cmd.exe /d /s /c <cmd> <args>` to avoid Node 22's spawn-without-shell restriction on `.cmd` files (CVE-2024-27980). On Unix they spawn directly with `shell:false`.
