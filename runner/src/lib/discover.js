'use strict';

const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.svelte-kit',
  '.nuxt',
  'dist',
  'build',
  'out',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  'target',
  '.gradle',
  '.idea',
  '.vscode',
  'coverage',
]);

const CODE_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cc', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.lua', '.sh', '.bash',
  '.html', '.css', '.scss', '.sass',
  '.json', '.yaml', '.yml', '.toml', '.md',
  '.sql', '.vue', '.svelte',
]);

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'fix', 'add', 'update', 'change', 'make', 'build', 'create', 'remove', 'delete',
  'this', 'that', 'these', 'those', 'it', 'its', 'their', 'there',
  'task', 'project', 'code', 'file', 'files',
]);

function tokenize(text) {
  const words = String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return Array.from(new Set(words));
}

// Returns { files, truncated }. `truncated` means the maxFiles cap was hit,
// so downstream ranking / completeness coverage is partial.
function walk(root, opts) {
  const max = (opts && opts.maxFiles) || 4000;
  const out = [];
  const stack = [root];
  while (stack.length && out.length < max) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      continue;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.') && ent.name !== '.env' && ent.name !== '.gitignore') {
        if (ent.isDirectory()) continue;
      }
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (IGNORE_DIRS.has(ent.name)) continue;
        stack.push(full);
        continue;
      }
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!CODE_EXT.has(ext)) continue;
      out.push(full);
      if (out.length >= max) break;
    }
  }
  return { files: out, truncated: out.length >= max };
}

// Absolute paths of files created or modified at/after `since` (ms epoch).
function modifiedSince(root, since, opts) {
  const { files, truncated } = walk(root, opts);
  const out = files.filter((f) => {
    try {
      return fs.statSync(f).mtimeMs >= since;
    } catch (_e) {
      return false;
    }
  });
  return { files: out, truncated };
}

function scoreFile(filePath, keywords) {
  let score = 0;
  const base = path.basename(filePath).toLowerCase();
  for (const kw of keywords) {
    if (base.includes(kw)) score += 5;
  }
  let content = '';
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024) return score;
    content = fs.readFileSync(filePath, 'utf8').toLowerCase();
  } catch (_e) {
    return score;
  }
  for (const kw of keywords) {
    if (!kw) continue;
    let i = 0;
    let count = 0;
    while ((i = content.indexOf(kw, i)) !== -1) {
      count++;
      i += kw.length;
      if (count > 20) break;
    }
    score += Math.min(count, 20);
  }
  return score;
}

function discover(root, task, opts) {
  const keywords = tokenize(task);
  const { files, truncated } = walk(root, opts);
  const scored = [];
  for (const f of files) {
    const s = scoreFile(f, keywords);
    if (s > 0) scored.push({ path: path.relative(root, f), score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, (opts && opts.topN) || 25);
  return {
    keywords,
    scanned_files: files.length,
    matched_files: scored.length,
    truncated,
    top,
  };
}

module.exports = { discover, tokenize, walk, modifiedSince };
