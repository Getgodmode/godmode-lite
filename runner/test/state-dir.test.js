'use strict';

// Run with: node --test runner/test/state-dir.test.js (or `npm test` in runner/)
// Each test uses a throwaway HOME so nothing touches the real skill folder.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LITE = path.join(__dirname, '..', 'bin', 'lite');

function mkHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gml-home-'));
  fs.mkdirSync(path.join(home, 'proj'));
  fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true });
  return home;
}

// A FILE where the skill folder should be: any write beneath it fails, which
// reproduces "Windows denied the write in the protected skill folder".
function blockSkillRoot(home) {
  const p = path.join(home, '.claude', 'skills', 'godmode-lite');
  fs.writeFileSync(p, 'not a folder');
  return p;
}

function run(home, args, extraEnv) {
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    TMPDIR: path.join(home, 'tmp'),
    TEMP: path.join(home, 'tmp'),
    TMP: path.join(home, 'tmp'),
    ...extraEnv,
  };
  delete env.GODMODE_LITE_STATE_DIR;
  Object.assign(env, extraEnv || {});
  fs.mkdirSync(env.TEMP, { recursive: true });
  const r = spawnSync(process.execPath, [LITE, ...args], {
    cwd: path.join(home, 'proj'),
    env,
    encoding: 'utf8',
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout.trim().split('\n').pop());
  } catch (_e) {}
  return { ...r, json };
}

function defaultDir(home) {
  if (process.platform === 'win32') return path.join(home, 'AppData', 'Local', 'godmode-lite');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'godmode-lite');
  return path.join(home, '.godmode-lite');
}

test('start + end work when the skill folder is unwritable, state lands in the per-user dir', () => {
  const home = mkHome();
  const blocked = blockSkillRoot(home);
  const s = run(home, ['start', 'demo task']);
  assert.strictEqual(s.json && s.json.state, 'started', s.stdout + s.stderr);
  const id = s.json.run_id;
  assert.ok(fs.existsSync(path.join(defaultDir(home), 'runs', id, 'state.json')));
  assert.ok(fs.statSync(blocked).isFile(), 'skill folder must stay untouched');
  const e = run(home, ['end']);
  assert.match(e.json.state, /^ended/, e.stdout + e.stderr);
  assert.ok(fs.existsSync(path.join(defaultDir(home), 'runs', id, 'report.md')));
  assert.strictEqual(run(home, ['status']).json.state === 'no_active_run', true);
});

test('GODMODE_LITE_STATE_DIR overrides the location', () => {
  const home = mkHome();
  const dir = path.join(home, 'custom-state');
  const s = run(home, ['start', 'x'], { GODMODE_LITE_STATE_DIR: dir });
  assert.strictEqual(s.json.state, 'started', s.stdout + s.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'runs', s.json.run_id, 'state.json')));
  assert.ok(fs.existsSync(path.join(dir, '.active-run.json')));
});

test('everything else unwritable falls back to tmpdir and says so on stderr', () => {
  const home = mkHome();
  const blockedFile = path.join(home, 'blocker');
  fs.writeFileSync(blockedFile, 'x');
  // Block the platform default too, so only tmpdir is left.
  const dflt = process.platform === 'win32' ? 'AppData' : process.platform === 'darwin' ? 'Library' : '.godmode-lite';
  fs.writeFileSync(path.join(home, dflt), 'x');
  // ...and the project's .evo folder, so only tmpdir is left.
  fs.writeFileSync(path.join(home, 'proj', '.evo'), 'x');
  const s = run(home, ['start', 'x'], { GODMODE_LITE_STATE_DIR: path.join(blockedFile, 'sub') });
  assert.strictEqual(s.json && s.json.state, 'started', s.stdout + s.stderr);
  const tmpState = path.join(home, 'tmp', 'godmode-lite', 'runs', s.json.run_id, 'state.json');
  assert.ok(fs.existsSync(tmpState), 'expected state in tmpdir fallback');
  assert.match(s.stderr, /godmode-lite: state saved in .*godmode-lite/);
  assert.strictEqual(s.stderr.trim().split('\n').length, 1, 'exactly one plain line');
});

test('legacy runs in the old skill-folder location are still readable and never written', () => {
  const home = mkHome();
  const skill = path.join(home, '.claude', 'skills', 'godmode-lite');
  const id = 'lite-1700000000-abcdef';
  fs.mkdirSync(path.join(skill, 'runs', id), { recursive: true });
  const legacyState = {
    version: '2.4.0', run_id: id, task: 'old', cwd: path.join(home, 'proj'),
    created_at: new Date().toISOString(), state: 'started', current_layer: 1,
    layers_completed: [], discover: null, check: null, test: null, polish: null,
  };
  const legacyFile = path.join(skill, 'runs', id, 'state.json');
  fs.writeFileSync(legacyFile, JSON.stringify(legacyState));
  fs.writeFileSync(path.join(skill, '.active-run.json'), JSON.stringify({ runs: { [process.platform === 'win32' ? path.join(home, 'proj').toLowerCase() : fs.realpathSync(path.join(home, 'proj'))]: id } }));
  const before = fs.readFileSync(legacyFile, 'utf8');
  const st = run(home, ['status']);
  assert.strictEqual(st.json.run_id, id, st.stdout + st.stderr);
  const e = run(home, ['end']);
  assert.strictEqual(e.json.run_id, id, e.stdout + e.stderr);
  assert.strictEqual(fs.readFileSync(legacyFile, 'utf8'), before, 'legacy file untouched');
  assert.ok(fs.existsSync(path.join(defaultDir(home), 'runs', id, 'state.json')));
  assert.strictEqual(run(home, ['status']).json.state, 'no_active_run', 'ended legacy run must not stay active');
});

// chmod-style simulation (macOS / Linux): a real, read-only skill folder, the
// way a protected-skill-folder policy presents it.
const canChmod =
  process.platform !== 'win32' && !(typeof process.getuid === 'function' && process.getuid() === 0);
test('read-only skill folder (chmod 555) does not stop a run', { skip: !canChmod }, () => {
  const home = mkHome();
  const skill = path.join(home, '.claude', 'skills', 'godmode-lite');
  fs.mkdirSync(skill);
  fs.chmodSync(skill, 0o555);
  try {
    const s = run(home, ['start', 'x']);
    assert.strictEqual(s.json && s.json.state, 'started', s.stdout + s.stderr);
    assert.ok(fs.existsSync(path.join(defaultDir(home), 'runs', s.json.run_id, 'state.json')));
    assert.deepStrictEqual(fs.readdirSync(skill), [], 'nothing written into the skill folder');
    assert.match(run(home, ['end']).json.state, /^ended/);
  } finally {
    fs.chmodSync(skill, 0o755);
  }
});

// Codex-style sandbox: nothing outside the workspace is writable, the project
// folder is. State must land in <project>/.evo/godmode-lite/.
function assertWorkspaceState(home, s) {
  assert.strictEqual(s.json && s.json.state, 'started', s.stdout + s.stderr);
  const ws = path.join(home, 'proj', '.evo', 'godmode-lite');
  assert.ok(fs.existsSync(path.join(ws, 'runs', s.json.run_id, 'state.json')), 'state in workspace');
  assert.match(s.stderr, /godmode-lite: state saved in .*\.evo/);
  assert.strictEqual(s.stderr.trim().split('\n').length, 1, 'exactly one plain line');
  return ws;
}

test('sandbox simulation: home unwritable, workspace writable -> state in <project>/.evo/godmode-lite', () => {
  const home = mkHome();
  blockSkillRoot(home);
  const dflt = process.platform === 'win32' ? 'AppData' : process.platform === 'darwin' ? 'Library' : '.godmode-lite';
  fs.writeFileSync(path.join(home, dflt), 'x');
  const s = run(home, ['start', 'x']);
  assertWorkspaceState(home, s);
  // Later commands, even from a subfolder, find the same run.
  fs.mkdirSync(path.join(home, 'proj', 'sub'));
  const env = { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: path.join(home, 'AppData', 'Local') };
  const r = spawnSync(process.execPath, [LITE, 'end'], { cwd: path.join(home, 'proj', 'sub'), env, encoding: 'utf8' });
  assert.match(JSON.parse(r.stdout.trim().split('\n').pop()).state, /^ended/, r.stdout + r.stderr);
});

// Real Windows ACL deny on the whole fake HOME (what a sandbox does), project
// folder outside it stays writable.
test('real Windows ACL deny on HOME: run still works', { skip: process.platform !== 'win32' }, () => {
  const home = mkHome();
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'gml-proj-'));
  const who = process.env.USERNAME;
  const acl = (args) => spawnSync('icacls', [home, ...args], { encoding: 'utf8' });
  const denied = acl(['/deny', who + ':(OI)(CI)(WD,AD,DC)']);
  try {
    assert.strictEqual(denied.status, 0, denied.stdout + denied.stderr);
    const env = { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: path.join(home, 'AppData', 'Local') };
    delete env.GODMODE_LITE_STATE_DIR;
    const opts = { cwd: proj, env, encoding: 'utf8' };
    const s = spawnSync(process.execPath, [LITE, 'start', 'x'], opts);
    const j = JSON.parse(s.stdout.trim().split('\n').pop());
    assert.strictEqual(j.state, 'started', s.stdout + s.stderr);
    assert.ok(fs.existsSync(path.join(proj, '.evo', 'godmode-lite', 'runs', j.run_id, 'state.json')));
    assert.match(s.stderr, /state saved in/);
    const e = spawnSync(process.execPath, [LITE, 'end'], opts);
    assert.match(JSON.parse(e.stdout.trim().split('\n').pop()).state, /^ended/);
  } finally {
    acl(['/remove:d', who]);
  }
});
