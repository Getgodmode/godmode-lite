'use strict';

const path = require('path');
const { resolveActiveState, updateState } = require('../lib/state.js');
const { emit, emitNoActiveRun } = require('../lib/envelope.js');
const { isForbiddenRoot } = require('../lib/paths.js');
const { modifiedSince } = require('../lib/discover.js');
const polishLib = require('../lib/polish.js');

module.exports = async function polishCmd(args) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const state = resolveActiveState(positional[0]);
  if (!state) return emitNoActiveRun('polish');

  const root = path.resolve(positional[0] || state.cwd || process.cwd());

  if (isForbiddenRoot(root)) {
    return emit({
      state: state.state,
      run_id: state.run_id,
      narrate: 'Refusing to polish ' + root + ' (home or filesystem root). cd into the project directory and pass it as an argument: `node bin/lite polish <project-path>`.',
      next: 'polish',
      data: { skipped: 'home_or_root' },
    });
  }

  // Scope fallback formatters to files this run actually touched, so polish
  // can never rewrite unrelated code across the tree.
  const since = state.created_at ? Date.parse(state.created_at) : NaN;
  const modified = Number.isFinite(since)
    ? modifiedSince(root, since).files.map((f) => path.relative(root, f))
    : null;

  const tools = polishLib.detect(root, { modified });
  if (tools.length === 0) {
    updateState(state.run_id, (s) => {
      s.polish = { root, detected: [], modified_count: modified ? modified.length : null, at: new Date().toISOString() };
      if (!s.layers_completed.includes('layer-4')) s.layers_completed.push('layer-4');
      s.state = 'polished_skipped';
      return s;
    });
    const narrate = modified && modified.length === 0
      ? 'No files were created or modified during this run at ' + root + ', so there is nothing to polish. Run `node bin/lite end`.'
      : 'No formatter or linter detected at ' + root + '. Manually scan the diff for dead code, unused imports, leftover logs, then run `node bin/lite end`.';
    return emit({
      state: 'polished_skipped',
      run_id: state.run_id,
      narrate,
      next: 'end',
      data: { root, modified_count: modified ? modified.length : null },
    });
  }

  const results = [];
  for (const t of tools) {
    results.push(polishLib.run(t, { cwd: root }));
  }
  const allOk = results.every((r) => r.ok);

  updateState(state.run_id, (s) => {
    s.polish = { root, detected: tools, results, modified_count: modified ? modified.length : null, at: new Date().toISOString() };
    if (!s.layers_completed.includes('layer-4')) s.layers_completed.push('layer-4');
    s.state = allOk ? 'polished' : 'polished_warn';
    return s;
  });

  const scopeNote = modified ? ' (scoped to ' + modified.length + ' run-modified file(s))' : '';
  const summary = results.map((r) => r.tool + (r.ok ? ' ok' : ' FAIL(' + (r.exit_code != null ? r.exit_code : r.error || '?') + ')')).join(', ');
  return emit({
    state: allOk ? 'polished' : 'polished_warn',
    run_id: state.run_id,
    narrate: 'Polish ran' + scopeNote + ': ' + summary + '. Subtract gate: cut every element that does not move the one goal, re-run tests, then re-read the diff before ending the run.',
    next: 'end',
    data: { detected: tools, results, modified_count: modified ? modified.length : null },
  });
};
