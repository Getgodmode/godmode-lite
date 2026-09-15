# Godmode Lite — Free Execution Protocol for Claude Code

Godmode Lite is a free Claude Code skill. It wraps any task and drives Claude through 4 execution layers instead of a single unstructured attempt: deep context loading, complete execution, exhaustive testing, and polish. A small zero-dependency Node CLI under `runner/` gives each layer a deterministic pass/fail gate, so Claude can't skip a step or call something done before it verifiably is.

## Install

```bash
mkdir -p ~/.claude/skills/godmode-lite
cd ~/.claude/skills/godmode-lite
curl -O https://raw.githubusercontent.com/Getgodmode/godmode-lite/main/SKILL.md
curl -O https://raw.githubusercontent.com/Getgodmode/godmode-lite/main/LICENSE
mkdir -p runner/bin runner/src
curl -o runner/package.json https://raw.githubusercontent.com/Getgodmode/godmode-lite/main/runner/package.json
curl -o runner/bin/lite https://raw.githubusercontent.com/Getgodmode/godmode-lite/main/runner/bin/lite
chmod +x runner/bin/lite
```

Or clone the whole repo into `~/.claude/skills/godmode-lite/`:

```bash
git clone https://github.com/Getgodmode/godmode-lite.git ~/.claude/skills/godmode-lite
```

## Usage

Type any of these before a task in Claude Code:

```
godmode lite: build a REST API with auth
gm lite: refactor this module with full test coverage
try godmode lite: audit this codebase and fix every issue
```

Claude then runs the `runner/bin/lite` CLI through each layer in order (`start` → `discover` → `check` → `test` → `polish` → `end`), reading the envelope each command returns to decide the next step. See `SKILL.md` for the full protocol.

## What's included (free)

| Layer | What it does |
|-------|---------------|
| Deep Context Load | Reads every related file before writing a line |
| Complete Execution | Every edge case handled, no stubs, no TODOs |
| Exhaustive Testing | Detects and runs the project's test suite, fails the gate on a failing test |
| Polish | Formatter/linter pass scoped to files the run touched |

## Want more?

The full [Godmode](https://getgodmode.dev) protocol adds security hardening, alternative-approach exploration, auto-documentation, and ripple checking, plus higher tiers with smarter planning, a self-improving evolution engine, and an execute-assess-fix loop that won't stop until every dimension passes.

Need something built to spec instead of a general-purpose skill? See the [custom build](https://getgodmode.dev/custom-build.html?utm_source=directory&utm_medium=listing&utm_campaign=custom-build) offer.

## License

MIT — see [LICENSE](LICENSE).
