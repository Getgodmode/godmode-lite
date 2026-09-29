'use strict';

const fs = require('fs');
const path = require('path');

const {
  ensureDir,
  ensureRunsRoot,
  runDir,
  stateFile,
  writeStateFile,
  readActiveRunId,
  writeActiveRunId,
  clearActiveRunId,
  pruneRuns,
  newRunId,
} = require('./paths.js');

// Single source of truth for the version: runner/package.json.
const STATE_VERSION = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
    );
    return pkg.version || '0.0.0';
  } catch (_e) {
    return '0.0.0';
  }
})();

function readState(runId) {
  const p = stateFile(runId);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!raw || typeof raw !== 'object' || !raw.run_id) return null;
    return raw;
  } catch (_e) {
    return null;
  }
}

function writeState(state) {
  if (!state || !state.run_id) throw new Error('writeState: state.run_id required');
  ensureRunsRoot();
  ensureDir(runDir(state.run_id));
  const p = writeStateFile(state.run_id);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, p);
  return state;
}

function updateState(runId, mutator) {
  const cur = readState(runId);
  if (!cur) throw new Error('no state for run_id ' + runId);
  const next = mutator({ ...cur }) || cur;
  return writeState(next);
}

function createState(task) {
  const runId = newRunId();
  const rd = runDir(runId);
  ensureRunsRoot();
  ensureDir(rd);
  const state = {
    version: STATE_VERSION,
    run_id: runId,
    task: String(task || '').slice(0, 1000),
    cwd: process.cwd(),
    created_at: new Date().toISOString(),
    state: 'started',
    current_layer: 1,
    layers_completed: [],
    discover: null,
    check: null,
    test: null,
    polish: null,
  };
  writeState(state);
  writeActiveRunId(runId, state.cwd);
  pruneRuns();
  return state;
}

// hintDir: a path argument the command received, if any. Lets a command run
// from outside the project still bind to the right run.
function resolveActiveState(hintDir) {
  const id = readActiveRunId(hintDir) || (hintDir ? readActiveRunId() : null);
  if (!id) return null;
  return readState(id);
}

function endState(runId, finalState) {
  const s = readState(runId);
  if (!s) return null;
  const finished = { ...s, state: finalState || 'ended', ended_at: new Date().toISOString() };
  writeState(finished);
  clearActiveRunId(runId);
  return finished;
}

module.exports = {
  STATE_VERSION,
  readState,
  writeState,
  updateState,
  createState,
  resolveActiveState,
  endState,
};
