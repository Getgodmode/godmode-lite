'use strict';

const fs = require('fs');
const path = require('path');
const { commandExists, runTool } = require('./exec.js');

function readPkg(root) {
  const p = path.join(root, 'package.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_e) {
    return null;
  }
}

// npm init scaffolds scripts.test as `echo "Error: no test specified" && exit 1`.
// Treating that as a real runner produces a permanent, misleading tested_fail.
function isPlaceholderTestScript(script) {
  return /no test specified/i.test(String(script || ''));
}

function detect(root) {
  const pkg = readPkg(root);
  if (pkg) {
    const scripts = pkg.scripts || {};
    const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    if (scripts.test && !isPlaceholderTestScript(scripts.test) && commandExists('npm')) {
      return { tool: 'npm', cmd: 'npm', args: ['--silent', 'test'], reason: 'package.json scripts.test' };
    }
    if (commandExists('npx')) {
      if (deps.vitest) return { tool: 'vitest', cmd: 'npx', args: ['--no-install', 'vitest', 'run'], reason: 'vitest dep' };
      if (deps.jest) return { tool: 'jest', cmd: 'npx', args: ['--no-install', 'jest'], reason: 'jest dep' };
      if (deps.mocha) return { tool: 'mocha', cmd: 'npx', args: ['--no-install', 'mocha'], reason: 'mocha dep' };
    }
  }
  if ((fs.existsSync(path.join(root, 'pytest.ini')) ||
       fs.existsSync(path.join(root, 'pyproject.toml')) ||
       fs.existsSync(path.join(root, 'tox.ini'))) &&
      commandExists('pytest')) {
    return { tool: 'pytest', cmd: 'pytest', args: ['-q'], reason: 'pytest config detected' };
  }
  if (fs.existsSync(path.join(root, 'go.mod')) && commandExists('go')) {
    return { tool: 'go', cmd: 'go', args: ['test', './...'], reason: 'go.mod present' };
  }
  if (fs.existsSync(path.join(root, 'Cargo.toml')) && commandExists('cargo')) {
    return { tool: 'cargo', cmd: 'cargo', args: ['test'], reason: 'Cargo.toml present' };
  }
  if (fs.existsSync(path.join(root, 'Gemfile')) && commandExists('bundle')) {
    return { tool: 'rspec', cmd: 'bundle', args: ['exec', 'rspec'], reason: 'Gemfile present' };
  }
  return null;
}

function run(detection, opts) {
  return runTool(detection, Object.assign({ tailBytes: 8000 }, opts));
}

module.exports = { detect, run, isPlaceholderTestScript };
