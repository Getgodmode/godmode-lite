'use strict';

const fs = require('fs');
const path = require('path');
const { walk } = require('./discover.js');

const PATTERNS = [
  { tag: 'TODO', re: /\bTODO\b/g },
  { tag: 'FIXME', re: /\bFIXME\b/g },
  { tag: 'XXX', re: /\bXXX\b/g },
  { tag: 'HACK', re: /\bHACK\b/g },
  { tag: 'STUB', re: /\bSTUB\b/g },
  { tag: 'WIP', re: /\bWIP\b/g },
  { tag: 'pass-stub', re: /^\s*pass\s*(#.*)?$/gm },
  { tag: 'not-implemented', re: /NotImplementedError|raise\s+NotImplemented|throw\s+new\s+Error\s*\(\s*['"`](?:not\s+implemented|TODO|stub)/gi },
  { tag: 'placeholder-return', re: /return\s+(?:null|undefined|None|False|0)\s*;?\s*\/\/\s*(?:TODO|placeholder|stub)/gi },
  { tag: 'debug-log', re: /console\.(?:log|debug)\s*\(\s*['"`](?:test|debug|asdf|here|reached)/gi },
];

// Word tags (whole words) where a match inside a string/HTML literal is almost
// always copy, not an actual incomplete-work marker.
const WORD_TAGS = new Set(['TODO', 'FIXME', 'XXX', 'HACK', 'STUB', 'WIP']);

// Python block keywords whose body may legitimately be a bare `pass`.
const PASS_BLOCK_RE = /(?:^|:)\s*(?:except|finally|else|def|class|try|with|elif|if|for|while|async\s+def)\b[^:]*:\s*$/;

// Heuristic: is the matched word wrapped in a quote on its own line? Covers
// string literals and HTML copy like <p>This is a HACK</p> only when quoted.
function matchInsideStringLiteral(lineText, matchInLine) {
  const q = /(['"`])((?:\\.|(?!\1).)*?)\1/g;
  let qm;
  while ((qm = q.exec(lineText)) !== null) {
    const innerStart = qm.index + 1;
    const innerEnd = qm.index + qm[0].length - 1;
    if (matchInLine >= innerStart && matchInLine < innerEnd) return true;
  }
  return false;
}

function shouldSkipHit(tag, content, lineStart, matchIndex, lineText) {
  if (tag === 'pass-stub') {
    // A bare `pass` that closes a legitimately-empty block (except/finally/def/
    // class/else/etc) is not an incomplete-work marker.
    const prevNl = content.lastIndexOf('\n', lineStart - 2);
    const prevLine = content.slice(prevNl + 1, lineStart - 1);
    if (PASS_BLOCK_RE.test(prevLine)) return true;
    return false;
  }
  if (WORD_TAGS.has(tag)) {
    const matchInLine = matchIndex - lineStart;
    if (matchInsideStringLiteral(lineText, matchInLine)) return true;
    return false;
  }
  return false;
}

function scanFile(file, root) {
  let content;
  try {
    const stat = fs.statSync(file);
    if (stat.size > 1024 * 1024) return [];
    content = fs.readFileSync(file, 'utf8');
  } catch (_e) {
    return [];
  }
  const hits = [];
  for (const { tag, re } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    let count = 0;
    while ((m = re.exec(content)) !== null) {
      const before = content.slice(0, m.index);
      const line = before.split('\n').length;
      const lineStart = before.lastIndexOf('\n') + 1;
      const lineEnd = content.indexOf('\n', m.index);
      const rawLine = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);
      const lineText = rawLine.trim();
      if (!shouldSkipHit(tag, content, lineStart, m.index, rawLine)) {
        hits.push({
          file: path.relative(root, file),
          line,
          tag,
          text: lineText.slice(0, 200),
        });
        count++;
      }
      if (count > 25) break;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return hits;
}

// opts.since (ms epoch): only scan files created or modified at/after that
// time. This scopes the gate to the current run's work so pre-existing legacy
// markers elsewhere in the tree can never make the protocol unsatisfiable.
function scan(root, opts) {
  const since = opts && Number.isFinite(opts.since) ? opts.since : null;
  const { files: walked, truncated } = walk(root);
  const files = since === null
    ? walked
    : walked.filter((f) => {
        try {
          return fs.statSync(f).mtimeMs >= since;
        } catch (_e) {
          return false;
        }
      });
  const all = [];
  for (const f of files) {
    if (f.includes(path.sep + 'godmode-lite' + path.sep + 'runner' + path.sep)) continue;
    const hits = scanFile(f, root);
    for (const h of hits) all.push(h);
    if (all.length > 1000) break;
  }
  const byTag = {};
  for (const h of all) byTag[h.tag] = (byTag[h.tag] || 0) + 1;
  return {
    scanned_files: files.length,
    candidate_files: walked.length,
    truncated,
    scope: since === null ? 'full_tree' : 'modified_during_run',
    since: since === null ? null : new Date(since).toISOString(),
    total_hits: all.length,
    by_tag: byTag,
    hits: all.slice(0, 200),
  };
}

module.exports = { scan, scanFile, PATTERNS };
