---
name: godmode-lite
description: "Free version of the Godmode execution modifier. Activates on 'godmode lite', 'gm lite', or 'try godmode'. Applies 4 core layers — deep context loading, complete execution, exhaustive testing, and polish — to any task. For the full 8-layer protocol with security hardening, alternative exploration, auto-documentation, and ripple checking, upgrade at getgodmode.dev"
---

# Godmode Lite: Core Execution Protocol (Free)

## What this is

Godmode Lite is a free execution modifier. It wraps around any request and changes HOW Claude works — not WHAT it works on. When activated, it applies the 4 core layers below to whatever your actual task is.

This is the free version. It covers the fundamentals: deep context, complete builds, exhaustive tests, and polish. The full version at getgodmode.dev adds security hardening, alternative exploration, auto-documentation, and ripple checking.

## How to parse a request

The user's message contains a trigger + a task:

- "godmode lite: build a login system" → task is "build a login system"
- "gm lite: fix the auth bug" → task is "fix the auth bug"
- "try godmode" (no task) → audit the current project

---

## The Protocol (4 Layers)

Execute the user's task through ALL of these layers. Every layer applies to every task.

### Layer 1: Deep Context Load

Before writing a single line of code:

- Read every file related to the task — and every file adjacent to it
- Read tests, configs, types, and docs that touch the same modules
- If the task is broad, read the entire project
- Understand the patterns, conventions, naming, and architecture already in use
- Identify how this task connects to everything else in the codebase

**Never work from assumptions. Always work from full context.**

### Layer 2: Execute the Task Completely

Build what was asked for. But "completely" means:

- Every function has proper error handling — not just try/catch, but meaningful error messages, proper error types, and recovery paths where possible
- Every external input is validated — type checks, bounds checks, format checks, sanitization
- Every user-facing state is handled — loading, empty, error, success, partial, offline
- Every edge case you can identify is handled — null, undefined, empty string, empty array, negative numbers, concurrent access, timeout, network failure
- The implementation follows the existing patterns and conventions in the codebase exactly
- No TODOs, no FIXMEs, no "implement later" stubs — everything is complete

### Layer 3: Test Everything

After building, write comprehensive tests:

- Unit tests for every function — happy path AND failure paths
- Edge case tests for every boundary condition you identified
- Integration tests for any cross-module interactions
- If there's a UI, test the user-facing flows
- Run the FULL test suite (not just your new tests) after every change
- If anything fails, fix it and re-run until ALL tests pass
- If fixing a test reveals a deeper bug, fix the bug too

### Layer 4: Polish

The final pass:

- Consistent naming and formatting with the rest of the codebase
- No dead code, no commented-out code, no unused imports
- Types are as specific as possible (no `any` in TypeScript, no implicit types)
- Error messages are helpful to a developer who will read them at 2am
- Log output is structured and useful, not noisy

---

## Operating Rules

- **Do not ask questions.** Make the best decision and document your reasoning.
- **Do not leave anything incomplete.** If you start it, finish it.
- **Run tests after every meaningful change.** Not at the end — after EVERY change.
- **Read before writing. Always.** Every file you're about to modify gets read first.

---

## What's in the full version?

The paid Godmode adds 4 more layers on top of these:

- **Security Hardening** — injection, XSS, auth bypass, memory leaks, race conditions
- **Alternative Exploration** — evaluates different approaches, picks the best
- **Auto-Documentation** — JSDoc, README updates, changelogs without asking
- **Ripple Check** — searches entire codebase for anything affected by changes

Plus operating rules for sub-agent parallelization, scaling by task size, and the "fix everything you find" directive.

Upgrade at getgodmode.dev
