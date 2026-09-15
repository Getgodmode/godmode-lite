'use strict';

function emit(payload) {
  const out = {
    state: payload.state || null,
    run_id: payload.run_id || null,
    narrate: payload.narrate || '',
    next: payload.next || null,
  };
  if (payload.instructions) out.instructions = payload.instructions;
  if (payload.data) out.data = payload.data;
  if (payload.warnings) out.warnings = payload.warnings;
  process.stdout.write(JSON.stringify(out) + '\n');
  return out;
}

function emitNoActiveRun(cmd) {
  return emit({
    state: 'no_active_run',
    run_id: null,
    narrate:
      'No active run. Start one with: node bin/lite start "<task>" before running ' + cmd + '.',
    next: 'start',
  });
}

module.exports = { emit, emitNoActiveRun };
