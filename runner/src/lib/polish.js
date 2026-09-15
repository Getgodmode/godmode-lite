'use strict';

const fs = require('fs');
const path = require('path');
const { commandExists, runTool } = require('./exec.js');

// Keep scoped file lists comfortably under the cmd.exe 8191-char command limit.
const MAX_SCOPED_FILES = 40;

const JS_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.svelte']);

function readPkg(root) {
  const p = path.join(root, 'package.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function filterExt(files, exts) {
  return files.filter((f) => exts.has(path.extname(f).toLowerCase())).slice(0, MAX_SCOPED_FILES);
}

// opts.modified: run-modified files relative to root. When present, fallback
// formatters/linters are scoped to those files instead of the whole tree, so
// polish can never rewrite code the run didn't touch. Project-defined scripts
// (npm run lint/format) and cargo fmt keep their own project-wide scope.
function detect(root, opts) {
  const modified = opts && Array.isArray(opts.modified) ? opts.modified : null;
  const tools = [];
  const pkg = readPkg(root);
  if (pkg && commandExists('npm')) {
    const scripts = pkg.scripts || {};
    const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    if (scripts.lint) tools.push({ tool: 'npm-lint', cmd: 'npm', args: ['run', 'lint', '--silent'] });
    if (scripts.format) tools.push({ tool: 'npm-format', cmd: 'npm', args: ['run', 'format', '--silent'] });
    if (deps.prettier && !scripts.format && commandExists('npx')) {
      const scoped = modified ? modified.slice(0, MAX_SCOPED_FILES) : null;
      if (scoped === null) {
        tools.push({ tool: 'prettier', cmd: 'npx', args: ['--no-install', 'prettier', '--write', '.'] });
      } else if (scoped.length > 0) {
        tools.push({ tool: 'prettier', cmd: 'npx', args: ['--no-install', 'prettier', '--write', '--ignore-unknown', ...scoped] });
      }
    }
    if (deps.eslint && !scripts.lint && commandExists('npx')) {
      const scoped = modified ? filterExt(modified, JS_EXT) : null;
      if (scoped === null) {
        tools.push({ tool: 'eslint', cmd: 'npx', args: ['--no-install', 'eslint', '.', '--fix'] });
      } else if (scoped.length > 0) {
        tools.push({ tool: 'eslint', cmd: 'npx', args: ['--no-install', 'eslint', '--fix', '--no-error-on-unmatched-pattern', ...scoped] });
      }
    }
  }
  if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'setup.cfg'))) {
    const scoped = modified ? filterExt(modified, new Set(['.py'])) : null;
    if (scoped === null || scoped.length > 0) {
      const target = scoped === null ? ['.'] : scoped;
      if (commandExists('ruff')) tools.push({ tool: 'ruff', cmd: 'ruff', args: ['check', '--fix', ...target] });
      if (commandExists('black')) tools.push({ tool: 'black', cmd: 'black', args: [...target] });
    }
  }
  if (fs.existsSync(path.join(root, 'go.mod')) && commandExists('gofmt')) {
    const scoped = modified ? filterExt(modified, new Set(['.go'])) : null;
    if (scoped === null) {
      tools.push({ tool: 'gofmt', cmd: 'gofmt', args: ['-w', '.'] });
    } else if (scoped.length > 0) {
      tools.push({ tool: 'gofmt', cmd: 'gofmt', args: ['-w', ...scoped] });
    }
  }
  if (fs.existsSync(path.join(root, 'Cargo.toml')) && commandExists('cargo')) {
    tools.push({ tool: 'cargo-fmt', cmd: 'cargo', args: ['fmt'] });
  }
  return tools;
}

function run(detection, opts) {
  const r = runTool(detection, Object.assign({ timeoutMs: 3 * 60 * 1000, tailBytes: 4000 }, opts));
  return Object.assign({ tool: detection.tool }, r);
}

module.exports = { detect, run, commandExists };
