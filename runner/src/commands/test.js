'use strict';

const path = require('path');
const { resolveActiveState, updateState } = require('../lib/state.js');
const { emit, emitNoActiveRun } = require('../lib/envelope.js');
const { isForbiddenRoot } = require('../lib/paths.js');
const runnerLib = require('../lib/runner.js');

module.exports = async function testCmd(args) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const state = resolveActiveState(positional[0]);
  if (!state) return emitNoActiveRun('test');

  const root = path.resolve(positional[0] || state.cwd || process.cwd());

  if (isForbiddenRoot(root)) {
    return emit({
      state: state.state,
      run_id: state.run_id,
      narrate: 'Refusing to run tests at ' + root + ' (home or filesystem root). cd into the project directory and pass it as an argument: `node bin/lite test <project-path>`.',
      next: 'test',
      data: { skipped: 'home_or_root' },
    });
  }

  const detection = runnerLib.detect(root);
  if (!detection) {
    updateState(state.run_id, (s) => {
      s.test = { root, detected: null, at: new Date().toISOString() };
      s.state = 'no_runner';
      return s;
    });
    return emit({
      state: 'no_runner',
      run_id: state.run_id,
      narrate: 'No usable test runner detected at ' + root + ' (placeholder npm test scripts and missing binaries do not count). Add a test suite (vitest, jest, pytest, go test, cargo test, rspec) then re-run.',
      next: 'test',
      data: { root },
    });
  }

  const result = runnerLib.run(detection, { cwd: root });

  // pytest exit 5 = collected no tests: treat as "no tests yet", not a failure.
  const noTests = detection.tool === 'pytest' && result.exit_code === 5;

  updateState(state.run_id, (s) => {
    s.test = { root, detected: detection, result, at: new Date().toISOString() };
    if (noTests) s.test.no_tests = true;
    if (result.ok && !s.layers_completed.includes('layer-3')) s.layers_completed.push('layer-3');
    s.current_layer = result.ok ? 4 : 3;
    s.state = result.ok ? 'tested_pass' : noTests ? 'no_runner' : 'tested_fail';
    return s;
  });

  if (noTests) {
    return emit({
      state: 'no_runner',
      run_id: state.run_id,
      narrate: 'pytest ran but collected no tests at ' + root + '. Write tests, then re-run `node bin/lite test`.',
      next: 'test',
      data: { detected: detection, result, no_tests: true },
    });
  }

  const failDetail = result.exit_code != null
    ? 'exit ' + result.exit_code
    : result.error
      ? result.error
      : 'spawn error';
  const narrate = result.ok
    ? 'Tests passed via ' + detection.tool + '. Move to polish.'
    : 'Tests failed via ' + detection.tool + ' (' + failDetail + '). Fix the failures, do not delete the failing tests.';

  return emit({
    state: result.ok ? 'tested_pass' : 'tested_fail',
    run_id: state.run_id,
    narrate,
    next: result.ok ? 'polish' : 'test',
    instructions: result.ok
      ? [
          'Layer 4 of 4: Polish.',
          '',
          'Goal: leave the code cleaner than you found it.',
          '',
          'Steps:',
          '1. Run `node bin/lite polish` to detect and run the project formatter and linter.',
          '2. Remove dead code, unused imports, leftover console output.',
          '3. Re-read your diff. Anything that surprised you when you re-read it gets fixed now.',
          '4. When polish is done, run `node bin/lite end` for the final summary.',
        ].join('\n')
      : 'Read the stderr/stdout in data.result. Fix the underlying bug, then re-run `node bin/lite test`.',
    data: { detected: detection, result },
  });
};
