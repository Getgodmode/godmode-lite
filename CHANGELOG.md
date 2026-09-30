# Changelog

All notable changes to Godmode Lite are documented here.

## 2.5.2 - 2026-09-30

- SKILL.md: the outcome step read the version from a hardcoded
  `~/.claude/skills/godmode-lite` path, so it sent an empty version from any
  other install location (Codex, Cursor). It now uses the runner next to
  `SKILL.md`, like every other step.
- SKILL.md: the Hosts section now says how to run the bash snippets in
  PowerShell, and visual verification says what to report when the host
  cannot take a screenshot instead of leaving the rule unmeetable.
- SKILL.md: the state-file note now lists the `<project>/.evo/godmode-lite`
  fallback the runner already uses.
- `discover` with no matches no longer points only at Claude Code's Glob tool;
  it also names `rg --files` / `git ls-files`.
- README: Codex install location.

## 2.5.1 - 2026-09-29

- Fixed the runner failing to start when the host or OS blocks writes inside
  the skill folder. Run state now lives in a per-user folder
  (`%LOCALAPPDATA%\godmode-lite` on Windows, `~/Library/Application Support/godmode-lite`
  on macOS, `~/.godmode-lite` elsewhere; override with `GODMODE_LITE_STATE_DIR`),
  falling back to `<project>/.evo/godmode-lite` (the only place a sandboxed host such as Codex allows writes) and then the system temp folder, with a one-line notice. Nothing is
  written inside the skill folder. Runs saved in the old location are still read.
- SKILL.md: the verdict and consent steps now fall back to a plain-text
  question in the chat when the host has no `AskUserQuestion` tool.

## 2.5.0 - 2026-09-16

- Fixed broken manual install instructions in the README. The per-file `curl`
  steps only fetched `SKILL.md`, `LICENSE`, `runner/package.json` and
  `runner/bin/lite`, but `runner/bin/lite` requires the full `runner/src/`
  tree to run and crashed immediately with `Cannot find module`. Install now
  documents `git clone` as the primary method, with a tarball download as a
  no-git fallback.

## 2.5.0 - 2026-09-15

- Published Godmode Lite: free 4-layer execution protocol (context load,
  complete execution, exhaustive testing, polish) driven by a deterministic
  Node CLI under `runner/`.
