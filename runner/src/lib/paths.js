'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
// Where the skill is installed. Read-only from the runner's point of view:
// hosts and Windows can protect this folder, so no state is ever written here.
const SKILL_ROOT = path.join(HOME, '.claude', 'skills', 'godmode-lite');
const LEGACY_RUNS_ROOT = path.join(SKILL_ROOT, 'runs');
const LEGACY_ACTIVE_FILE = path.join(SKILL_ROOT, '.active-run.json');
const KEEP_RUNS = 20;

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function defaultStateDir() {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
    return path.join(base, 'godmode-lite');
  }
  if (process.platform === 'darwin') {
    return path.join(HOME, 'Library', 'Application Support', 'godmode-lite');
  }
  return path.join(HOME, '.godmode-lite');
}

function isWritableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.write-probe-' + process.pid);
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return true;
  } catch (_e) {
    return false;
  }
}

// Per-user state dir, resolved once per process: GODMODE_LITE_STATE_DIR, then
// the platform default, then os.tmpdir(). Falling back prints one plain line
// on stderr (stdout carries the JSON envelope).
let cachedRoot = null;
function stateRoot() {
  if (cachedRoot) return cachedRoot;
  const wanted = process.env.GODMODE_LITE_STATE_DIR
    ? path.resolve(process.env.GODMODE_LITE_STATE_DIR)
    : defaultStateDir();
  const candidates = [wanted];
  const dflt = defaultStateDir();
  if (dflt !== wanted) candidates.push(dflt);
  candidates.push(path.join(os.tmpdir(), 'godmode-lite'));
  for (let i = 0; i < candidates.length; i++) {
    if (isWritableDir(candidates[i])) {
      cachedRoot = candidates[i];
      if (i > 0) {
        process.stderr.write('godmode-lite: state saved in ' + cachedRoot + ' (' + wanted + ' is not writable)' + String.fromCharCode(10));
      }
      return cachedRoot;
    }
  }
  throw new Error('no writable folder for godmode-lite state (tried ' + candidates.join(', ') + ')');
}

function runsRoot() {
  return path.join(stateRoot(), 'runs');
}

function activeFile() {
  return path.join(stateRoot(), '.active-run.json');
}

function ensureRunsRoot() {
  ensureDir(runsRoot());
}

// Where new writes go.
function runDir(runId) {
  return path.join(runsRoot(), runId);
}

function writeStateFile(runId) {
  return path.join(runDir(runId), 'state.json');
}

// Where a read looks: the new dir first, then the legacy skill-folder copy.
function stateFile(runId) {
  const p = writeStateFile(runId);
  if (fs.existsSync(p)) return p;
  const legacy = path.join(LEGACY_RUNS_ROOT, runId, 'state.json');
  return fs.existsSync(legacy) ? legacy : p;
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

function parseActiveFile(file) {
  if (!fs.existsSync(file)) return {};
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
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

// .active-run.json maps project directory -> run_id so concurrent runs in
// different projects do not clobber each other. Entries from the old
// skill-folder file are still honoured until their run ends; the new file wins.
function readActiveMap() {
  const map = {};
  const legacy = parseActiveFile(LEGACY_ACTIVE_FILE);
  for (const dir of Object.keys(legacy)) {
    try {
      const s = JSON.parse(fs.readFileSync(stateFile(legacy[dir]), 'utf8'));
      if (s && typeof s.state === 'string' && s.state.startsWith('ended')) continue;
    } catch (_e) {}
    map[dir] = legacy[dir];
  }
  return Object.assign(map, parseActiveFile(activeFile()));
}

function writeActiveMap(map) {
  ensureDir(stateRoot());
  const file = activeFile();
  if (Object.keys(map).length === 0) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (_e) {}
    return;
  }
  fs.writeFileSync(file, JSON.stringify({ runs: map }, null, 2));
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
    entries = fs.readdirSync(runsRoot());
  } catch (_e) {
    return;
  }
  const runs = entries.filter((n) => /^lite-\d+-[0-9a-f]+$/.test(n)).sort().reverse();
  if (runs.length <= KEEP_RUNS) return;
  const active = new Set(Object.values(readActiveMap()));
  for (const name of runs.slice(KEEP_RUNS)) {
    if (active.has(name)) continue;
    try {
      fs.rmSync(path.join(runsRoot(), name), { recursive: true, force: true });
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
  stateRoot,
  runsRoot,
  writeStateFile,
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
