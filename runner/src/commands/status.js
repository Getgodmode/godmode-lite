'use strict';

const { resolveActiveState } = require('../lib/state.js');
const { emit } = require('../lib/envelope.js');

const NEXT_BY_STATE = {
  started: 'discover',
  discovered: 'check',
  checked_clean: 'test',
  checked_dirty: 'check',
  no_runner: 'test',
  tested_pass: 'polish',
  tested_fail: 'test',
  polished: 'end',
  polished_warn: 'end',
  polished_skipped: 'end',
  ended: null,
  ended_incomplete: null,
};

module.exports = async function statusCmd(args) {
  const positional = (args || []).filter((a) => !a.startsWith('--'));
  const state = resolveActiveState(positional[0]);
  if (!state) {
    return emit({
      state: 'no_active_run',
      run_id: null,
      narrate: 'No active run.',
      next: 'start',
    });
  }
  return emit({
    state: state.state,
    run_id: state.run_id,
    narrate:
      'Run ' + state.run_id + ' on layer ' + state.current_layer +
      ' (completed: ' + (state.layers_completed.join(',') || 'none') + ').',
    next: NEXT_BY_STATE[state.state] || null,
    data: {
      task: state.task,
      cwd: state.cwd,
      created_at: state.created_at,
      current_layer: state.current_layer,
      layers_completed: state.layers_completed,
      has_discover: !!state.discover,
      has_check: !!state.check,
      has_test: !!state.test,
      has_polish: !!state.polish,
    },
  });
};
