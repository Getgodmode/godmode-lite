'use strict';

const path = require('path');
const { resolveActiveState, updateState } = require('../lib/state.js');
const { emit, emitNoActiveRun } = require('../lib/envelope.js');
const { isForbiddenRoot } = require('../lib/paths.js');
const { discover } = require('../lib/discover.js');

module.exports = async function discoverCmd(args) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const state = resolveActiveState(positional[0]);
  if (!state) return emitNoActiveRun('discover');

  const root = path.resolve(positional[0] || state.cwd || process.cwd());

  // Guard: refuse to scan the home directory or a filesystem root. Walking
  // either traverses an entire machine and surfaces unrelated files.
  if (isForbiddenRoot(root)) {
    return emit({
      state: state.state,
      run_id: state.run_id,
      narrate: 'Refusing to scan ' + root + ' (home or filesystem root). cd into the project directory and pass it as an argument: `node bin/lite discover <project-path>`.',
      next: 'discover',
      data: { keywords: [], scanned_files: 0, matched_files: 0, top: [], skipped: 'home_or_root' },
    });
  }

  const result = discover(root, state.task);

  updateState(state.run_id, (s) => {
    s.discover = { root, ...result, at: new Date().toISOString() };
    s.current_layer = 2;
    if (!s.layers_completed.includes('layer-1')) s.layers_completed.push('layer-1');
    s.state = 'discovered';
    return s;
  });

  const truncNote = result.truncated
    ? ' Scan hit the file cap, so ranking is partial — pass a narrower path if key files are missing.'
    : '';
  const narrate =
    result.matched_files === 0
      ? 'No keyword matches in ' + root + '. Read the task again, then list files manually with the Glob tool.' + truncNote
      : 'Found ' + result.matched_files + ' candidate files (top ' + result.top.length + ' returned). Read them in full before writing.' + truncNote;

  return emit({
    state: 'discovered',
    run_id: state.run_id,
    narrate,
    next: 'check',
    instructions: [
      'Layer 2 of 4: Execute.',
      '',
      'Goal: complete implementation. No stubs, no TODO markers, no half-built helpers.',
      '',
      'Steps:',
      '1. Read every top-ranked file from data.top below. Read in full, not in slices.',
      '2. Implement the task end to end. If you start a function, finish it.',
      '3. Update tests in the same edit set as the code change.',
      '4. When you believe Layer 2 is done, run `node bin/lite check` to verify completeness.',
    ].join('\n'),
    data: result,
  });
};
