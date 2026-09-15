'use strict';

const fs = require('fs');
const { resolveActiveState, updateState, endState } = require('../lib/state.js');
const { emit, emitNoActiveRun } = require('../lib/envelope.js');
const { reportFile } = require('../lib/paths.js');
const { scan } = require('../lib/completeness.js');

// Hard gates: things that mean the run did NOT finish clean.
function gateFailures(s) {
  const failures = [];
  if (!s.check) {
    failures.push('Layer 2 (completeness) never ran — run `check` before ending.');
  } else if (s.check.total_hits > 0) {
    failures.push(s.check.total_hits + ' unresolved completeness marker(s) remain (TODO/FIXME/stub/etc).');
  }
  if (!s.test) {
    failures.push('Layer 3 (tests) never ran — run `test` before ending.');
  } else if (s.test.detected && s.test.result && s.test.result.ok === false && !s.test.no_tests) {
    failures.push('Layer 3 (tests) did not pass.');
  }
  return failures;
}

// Soft gates: worth flagging, but they don't make the run incomplete —
// otherwise projects with no test infra could never satisfy the protocol.
function gateWarnings(s) {
  const warnings = [];
  if (s.test && !s.test.detected) {
    warnings.push('No test runner was detected — the implementation is unverified by tests.');
  } else if (s.test && s.test.no_tests) {
    warnings.push('The test runner collected no tests — the implementation is unverified by tests.');
  }
  if (!s.polish) {
    warnings.push('Layer 4 (polish) never ran.');
  }
  return warnings;
}

function buildReport(s, failures, warnings) {
  const lines = [];
  lines.push('# Godmode Lite run ' + s.run_id);
  lines.push('');
  if (failures && failures.length) {
    lines.push('> **WARNING: finalized with unsatisfied gates.** This run did NOT pass clean.');
    for (const f of failures) {
      lines.push('> - ' + f);
    }
    lines.push('');
  }
  if (warnings && warnings.length) {
    lines.push('> Warnings:');
    for (const w of warnings) {
      lines.push('> - ' + w);
    }
    lines.push('');
  }
  lines.push('Task: ' + s.task);
  lines.push('Started: ' + s.created_at);
  lines.push('Ended: ' + (s.ended_at || new Date().toISOString()));
  lines.push('Layers completed: ' + (s.layers_completed.join(', ') || 'none'));
  lines.push('');
  if (s.discover) {
    lines.push('## Layer 1 (context)');
    lines.push('Scanned: ' + s.discover.scanned_files + ' files. Matched: ' + s.discover.matched_files + '.');
    lines.push('Top files:');
    for (const f of (s.discover.top || []).slice(0, 10)) {
      lines.push('- ' + f.path + ' (score ' + f.score + ')');
    }
    lines.push('');
  }
  if (s.check) {
    lines.push('## Layer 2 (completeness)');
    lines.push('Hits: ' + s.check.total_hits + ' across ' + s.check.scanned_files + ' files.'
      + (s.check.reverified_at_end ? ' (re-verified at end)' : ''));
    if (s.check.by_tag) {
      const tags = Object.keys(s.check.by_tag).map((k) => k + '=' + s.check.by_tag[k]).join(', ');
      if (tags) lines.push('By tag: ' + tags);
    }
    lines.push('');
  }
  if (s.test) {
    lines.push('## Layer 3 (tests)');
    if (!s.test.detected) {
      lines.push('No test runner detected.');
    } else if (s.test.no_tests) {
      lines.push(s.test.detected.tool + ': ran but collected no tests.');
    } else {
      const r = s.test.result || {};
      lines.push(s.test.detected.tool + ': ' + (r.ok ? 'passed' : 'failed') + (r.exit_code != null ? ' (exit ' + r.exit_code + ')' : ''));
    }
    lines.push('');
  }
  if (s.polish) {
    lines.push('## Layer 4 (polish)');
    if (!s.polish.results || s.polish.results.length === 0) {
      lines.push('No polish tools ran.');
    } else {
      for (const r of s.polish.results) {
        lines.push('- ' + r.tool + ': ' + (r.ok ? 'ok' : 'fail (exit ' + r.exit_code + ')'));
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = async function endCmd(args) {
  const positional = (args || []).filter((a) => !a.startsWith('--'));
  const state = resolveActiveState(positional[0]);
  if (!state) return emitNoActiveRun('end');

  // Re-verify completeness before gating: code written after the last `check`
  // must not slip through on a stale clean result.
  let current = state;
  if (state.check && state.check.root) {
    const since = state.created_at ? Date.parse(state.created_at) : NaN;
    const fresh = scan(state.check.root, Number.isFinite(since) ? { since } : undefined);
    current = updateState(state.run_id, (s) => {
      s.check = { root: s.check.root, ...fresh, at: new Date().toISOString(), reverified_at_end: true };
      return s;
    });
  }

  const failures = gateFailures(current);
  const warnings = gateWarnings(current);
  const incomplete = failures.length > 0;

  const finished = endState(current.run_id, incomplete ? 'ended_incomplete' : 'ended');
  const report = buildReport(finished, failures, warnings);
  const rp = reportFile(finished.run_id);
  fs.writeFileSync(rp, report);

  const warnNote = warnings.length ? ' ' + warnings.length + ' warning(s): ' + warnings.join(' ') : '';
  const narrate = incomplete
    ? 'Run ended with unsatisfied gates (' + failures.length + '): ' + failures.join(' ') + warnNote + ' Report at ' + rp
    : 'Run ended.' + warnNote + ' Report at ' + rp;

  return emit({
    state: incomplete ? 'ended_incomplete' : 'ended',
    run_id: finished.run_id,
    narrate,
    next: null,
    warnings: warnings.length ? warnings : undefined,
    data: {
      report_path: rp,
      gate_failures: failures,
      gate_warnings: warnings,
      layers_completed: finished.layers_completed,
      summary: {
        discover: finished.discover ? { matched: finished.discover.matched_files } : null,
        check: finished.check ? { total_hits: finished.check.total_hits, reverified_at_end: !!finished.check.reverified_at_end } : null,
        test: finished.test && finished.test.result ? { ok: finished.test.result.ok, exit_code: finished.test.result.exit_code, no_tests: !!finished.test.no_tests } : null,
        polish: finished.polish && finished.polish.results ? finished.polish.results.map((r) => ({ tool: r.tool, ok: r.ok })) : null,
      },
    },
  });
};
