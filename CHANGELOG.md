# Changelog

All notable changes to Godmode Lite are documented here.

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
