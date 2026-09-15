'use strict';

const { createState } = require('../lib/state.js');
const { emit } = require('../lib/envelope.js');

const LAYER_1_INSTRUCTIONS = [
  'Layer 1 of 4: Context Load.',
  '',
  'Goal: read everything related and adjacent before writing a single line.',
  '',
  'Steps:',
  '1. Run `node bin/lite discover` to get a ranked list of files related to the task.',
  '2. Read each top-ranked file in full. Do not skim. Do not stop at the first match.',
  '3. Trace imports, callers, configs, schemas, fixtures, and tests for those files.',
  '4. Note conventions: naming, error handling, test layout, formatter style.',
  '5. Only after you can describe the surrounding system in your own words, move to Layer 2.',
];

module.exports = async function startCmd(args) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const task = positional.join(' ').trim();
  if (!task) {
    return emit({
      state: 'error',
      run_id: null,
      narrate: 'usage: node bin/lite start "<task>"',
      next: null,
    });
  }
  const state = createState(task);
  return emit({
    state: state.state,
    run_id: state.run_id,
    narrate: 'Run started for task: ' + task.slice(0, 120),
    next: 'discover',
    instructions: LAYER_1_INSTRUCTIONS.join('\n'),
    data: { task: state.task, cwd: state.cwd, current_layer: 1 },
  });
};
