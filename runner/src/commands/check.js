'use strict';

const path = require('path');
const { resolveActiveState, updateState } = require('../lib/state.js');
const { emit, emitNoActiveRun } = require('../lib/envelope.js');
const { isForbiddenRoot } = require('../lib/paths.js');
const { scan } = require('../lib/completeness.js');

module.exports = async function checkCmd(args) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const state = resolveActiveState(positional[0]);
  if (!state) return emitNoActiveRun('check');

  const root = path.resolve(positional[0] || state.cwd || process.cwd());

  if (isForbiddenRoot(root)) {
    return emit({
      state: state.state,
      run_id: state.run_id,
      narrate: 'Refusing to scan ' + root + ' (home or filesystem root). cd into the project directory and pass it as an argument: `node bin/lite check <project-path>`.',
      next: 'check',
      data: { skipped: 'home_or_root' },
    });
  }

  // Scope the scan to files created or modified since the run started, so
  // pre-existing legacy markers can't make the gate unsatisfiable.
  const since = state.created_at ? Date.parse(state.created_at) : NaN;
  const result = scan(root, Number.isFinite(since) ? { since } : undefined);

  updateState(state.run_id, (s) => {
    s.check = { root, ...result, at: new Date().toISOString() };
    if (result.total_hits === 0) {
      if (!s.layers_completed.includes('layer-2')) s.layers_completed.push('layer-2');
      s.current_layer = 3;
    }
    s.state = result.total_hits === 0 ? 'checked_clean' : 'checked_dirty';
    return s;
  });

  const clean = result.total_hits === 0;
  const scopeNote = result.scope === 'modified_during_run' ? ' touched during this run' : '';
  const truncNote = result.truncated
    ? ' Warning: the tree walk hit the file cap, so coverage is partial — pass a narrower path.'
    : '';
  const narrate = clean
    ? 'Layer 2 complete. No stubs, TODOs, or placeholder markers found in ' + result.scanned_files + ' files' + scopeNote + '.' + truncNote
    : 'Found ' + result.total_hits + ' completeness markers across ' + result.scanned_files + ' files' + scopeNote + '. Resolve before moving to tests.' + truncNote;

  return emit({
    state: clean ? 'checked_clean' : 'checked_dirty',
    run_id: state.run_id,
    narrate,
    next: clean ? 'test' : 'check',
    instructions: clean
      ? [
          'Layer 3 of 4: Test.',
          '',
          'Goal: prove the implementation works on happy paths and at least the obvious failure paths.',
          '',
          'Steps:',
          '1. Run `node bin/lite test` to detect and execute the project test suite.',
          '2. If no test runner is detected, write tests now, then re-run.',
          '3. Read failing output carefully. Fix the code, not the test.',
          '4. Run again until the suite passes, then move to Layer 4 polish.',
        ].join('\n')
      : [
          'Resolve the markers below before running tests. Each entry is { file, line, tag, text }.',
          '',
          'The scan covers only files created or modified since the run started, so every hit',
          'belongs to this run\'s work — pre-existing legacy markers elsewhere are not counted.',
          'Common cleanup pattern: search the file, finish the partial implementation, delete the marker.',
          'Re-run `node bin/lite check` until total_hits is 0.',
        ].join('\n'),
    data: result,
  });
};
