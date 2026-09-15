'use strict';

const cp = require('child_process');

function commandExists(name) {
  const isWin = process.platform === 'win32';
  const probe = isWin ? 'where' : 'which';
  try {
    const r = cp.spawnSync(probe, [name], { encoding: 'utf8' });
    return r.status === 0;
  } catch (_e) {
    return false;
  }
}

// Spawn an external tool. On Windows everything goes through
// `cmd.exe /d /s /c` to avoid Node's spawn-without-shell restriction on
// .cmd shims (CVE-2024-27980). On Unix the tool spawns directly, shell:false.
function runTool(detection, opts) {
  const cwd = (opts && opts.cwd) || process.cwd();
  const timeoutMs = (opts && opts.timeoutMs) || 5 * 60 * 1000;
  const tail = (opts && opts.tailBytes) || 8000;
  const isWin = process.platform === 'win32';
  const spawnCmd = isWin ? 'cmd.exe' : detection.cmd;
  const spawnArgs = isWin ? ['/d', '/s', '/c', detection.cmd, ...detection.args] : detection.args;
  let r;
  try {
    r = cp.spawnSync(spawnCmd, spawnArgs, {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      shell: false,
      maxBuffer: 16 * 1024 * 1024,
      windowsVerbatimArguments: false,
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (r.error) {
    // spawnSync does not throw on ENOENT; it reports via r.error.
    const msg = r.error.code === 'ENOENT'
      ? detection.cmd + ' not found on PATH'
      : r.error.message;
    return { ok: false, error: msg, exit_code: r.status, signal: r.signal, stdout: '', stderr: '' };
  }
  return {
    ok: r.status === 0,
    exit_code: r.status,
    signal: r.signal,
    stdout: (r.stdout || '').slice(-tail),
    stderr: (r.stderr || '').slice(-tail),
  };
}

module.exports = { commandExists, runTool };
