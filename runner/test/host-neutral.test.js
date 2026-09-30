'use strict';

// Run with: node --test runner/test/host-neutral.test.js (or `npm test` in runner/)
// The skill must work in hosts other than Claude Code (Codex, Cursor): no
// instruction may depend on a Claude-only tool, install path or shell without
// a fallback next to it.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LITE = path.join(__dirname, '..', 'bin', 'lite');
const SKILL_MD = fs.readFileSync(path.join(__dirname, '..', '..', 'SKILL.md'), 'utf8');

function paragraphs(md) {
  return md.split(/\n\s*\n/);
}

function section(md, heading) {
  const start = md.indexOf('\n## ' + heading);
  assert.ok(start >= 0, 'SKILL.md has a "## ' + heading + '" section');
  const next = md.indexOf('\n## ', start + 4);
  return md.slice(start, next < 0 ? md.length : next);
}

function run(home, args) {
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
  };
  delete env.GODMODE_LITE_STATE_DIR;
  const r = spawnSync(process.execPath, [LITE, ...args], {
    cwd: path.join(home, 'proj'),
    env,
    encoding: 'utf8',
  });
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

test('discover with no matches does not require the Claude-only Glob tool', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gml-host-'));
  fs.mkdirSync(path.join(home, 'proj'));
  fs.writeFileSync(path.join(home, 'proj', 'readme.txt'), 'hello');
  run(home, ['start', 'qzxv wibble']);
  const env = run(home, ['discover']);
  assert.strictEqual(env.state, 'discovered');
  assert.strictEqual(env.data.matched_files, 0);
  assert.match(env.narrate, /rg --files|git ls-files/, 'narrate offers a host-neutral way to list files: ' + env.narrate);
});

test('every AskUserQuestion mention has a plain-text fallback in the same paragraph', () => {
  for (const p of paragraphs(SKILL_MD)) {
    if (!p.includes('AskUserQuestion')) continue;
    assert.match(p, /plain text/, 'no fallback in: ' + p.slice(0, 160));
  }
});

test('the runner is never invoked by a hardcoded Claude install path without the "next to this SKILL.md" note', () => {
  const lines = SKILL_MD.split('\n');
  lines.forEach((line, i) => {
    if (!line.includes('.claude/skills/godmode-lite/runner')) return;
    const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
    assert.match(context, /next to this SKILL\.md/, 'hardcoded runner path at SKILL.md line ' + (i + 1) + ': ' + line.trim());
  });
});

test('Hosts section tells PowerShell hosts how to run the bash snippets', () => {
  const hosts = section(SKILL_MD, 'Hosts');
  assert.match(hosts, /PowerShell/);
  assert.match(hosts, /curl\.exe|Invoke-RestMethod/);
});

test('visual verification says what to do when the host cannot take a screenshot', () => {
  const vis = section(SKILL_MD, 'Visual verification');
  assert.match(vis, /cannot (take|run)/i);
  assert.match(vis, /never claim/i);
});

test('state file section lists the project .evo fallback the runner actually uses', () => {
  const state = SKILL_MD.slice(SKILL_MD.indexOf('### State file'), SKILL_MD.indexOf('## Layer reference'));
  assert.match(state, /\.evo\/godmode-lite/);
});
