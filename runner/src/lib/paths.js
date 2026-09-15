'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const SKILL_ROOT = path.join(HOME, '.claude', 'skills', 'godmode-lite');
const RUNS_ROOT = path.join(SKILL_ROOT, 'runs');
const ACTIVE_FILE = path.join(SKILL_ROOT, '.active-run.json');
const KEEP_RUNS = 20;

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function ensureRunsRoot() {
  ensureDir(RUNS_ROOT);
}

function runDir(runId) {
  return path.join(RUNS_ROOT, runId);
}

function stateFile(runId) {
  return path.join(runDir(runId), 'state.json');
}

function reportFile(runId) {
  return path.join(runDir(runId), 'report.md');
}

// Home directory or a filesystem root: scanning either walks an entire
// machine, and polish would hand the whole tree to formatters.
function isForbiddenRoot(root) {
  const r = path.resolve(root);
  return r === path.resolve(HOME) || r === path.parse(r).root;
}

// Normalized key for the active-run map. Windows paths are case-insensitive.
function dirKey(p) {
  const r = path.resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

// .active-run.json maps project directory -> run_id so concurrent runs in
// different projects do not clobber each other.
function readActiveMap() {
  if (!fs.existsSync(ACTIVE_FILE)) return {};
  try {
    const j = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
    if (j && j.runs && typeof j.runs === 'object') return j.runs;
    // Legacy single-run shape {"run_id":"..."}: key it by the run's stored cwd.
    if (j && typeof j.run_id === 'string') {
      try {
        const s = JSON.parse(fs.readFileSync(stateFile(j.run_id), 'utf8'));
        if (s && s.cwd) return { [dirKey(s.cwd)]: j.run_id };
      } catch (_e) {}
    }
    return {};
  } catch (_e) {
    return {};
  }
}

function writeActiveMap(map) {
  ensureDir(SKILL_ROOT);
  if (Object.keys(map).length === 0) {
    try {
      if (fs.existsSync(ACTIVE_FILE)) fs.unlinkSync(ACTIVE_FILE);
    } catch (_e) {}
    return;
  }
  fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ runs: map }, null, 2));
}

// Resolve the active run for a directory: exact match first, then the nearest
// ancestor entry (running from a subdir of the project), then, if exactly one
// run is active anywhere, that one (single-run convenience, legacy behavior).
function readActiveRunId(fromDir) {
  const map = readActiveMap();
  const cwd = dirKey(fromDir || process.cwd());
  if (map[cwd]) return map[cwd];
  let best = null;
  for (const dir of Object.keys(map)) {
    if (cwd.startsWith(dir + path.sep) && (!best || dir.length > best.length)) best = dir;
  }
  if (best) return map[best];
  const keys = Object.keys(map);
  if (keys.length === 1) return map[keys[0]];
  return null;
}

function writeActiveRunId(runId, cwd) {
  const map = readActiveMap();
  map[dirKey(cwd || process.cwd())] = runId;
  writeActiveMap(map);
}

// Remove only this run's entries; other projects' active runs stay pointed.
function clearActiveRunId(runId) {
  const map = readActiveMap();
  let changed = false;
  for (const dir of Object.keys(map)) {
    if (map[dir] === runId) {
      delete map[dir];
      changed = true;
    }
  }
  if (changed) writeActiveMap(map);
}

// Keep the newest KEEP_RUNS run folders; drop older ones that are not active.
function pruneRuns() {
  let entries;
  try {
    entries = fs.readdirSync(RUNS_ROOT);
  } catch (_e) {
    return;
  }
  const runs = entries.filter((n) => /^lite-\d+-[0-9a-f]+$/.test(n)).sort().reverse();
  if (runs.length <= KEEP_RUNS) return;
  const active = new Set(Object.values(readActiveMap()));
  for (const name of runs.slice(KEEP_RUNS)) {
    if (active.has(name)) continue;
    try {
      fs.rmSync(path.join(RUNS_ROOT, name), { recursive: true, force: true });
    } catch (_e) {}
  }
}

function newRunId() {
  const ts = Math.floor(Date.now() / 1000);
  const slug = Math.random().toString(16).slice(2, 8);
  return 'lite-' + ts + '-' + slug;
}

module.exports = {
  HOME,
  SKILL_ROOT,
  RUNS_ROOT,
  ACTIVE_FILE,
  ensureDir,
  ensureRunsRoot,
  runDir,
  stateFile,
  reportFile,
  isForbiddenRoot,
  readActiveRunId,
  writeActiveRunId,
  clearActiveRunId,
  pruneRuns,
  newRunId,
};
