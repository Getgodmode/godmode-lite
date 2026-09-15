'use strict';

const fs = require('fs');
const path = require('path');

const COMMANDS = {
  start: require('./commands/start.js'),
  discover: require('./commands/discover.js'),
  check: require('./commands/check.js'),
  test: require('./commands/test.js'),
  polish: require('./commands/polish.js'),
  end: require('./commands/end.js'),
  status: require('./commands/status.js'),
};

function readVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
    );
    return pkg.version;
  } catch (_e) {
    return '0.0.0';
  }
}

function printHelp() {
  process.stdout.write(
    [
      'godmode-lite runner v' + readVersion(),
      '',
      'Usage:  node bin/lite <command> [args]',
      '',
      'Commands:',
      '  start "<task>"   Begin a run. Stores state, prints layer-1 instructions.',
      '  discover [path]  Scan repo for files related to the task. Defaults to cwd.',
      '  check [path]     Scan files created/modified during the run for stubs and TODOs.',
      '  test [path]      Detect a test runner and execute the suite.',
      '  polish [path]    Detect a formatter / linter and run it on run-modified files.',
      '  end              Finalize the run, print scorecard.',
      '  status           Show the current run state without changing it.',
      '',
      'Every command emits a single-line JSON envelope on stdout:',
      '  {"state":"<state>","run_id":"<id>","narrate":"<one line>","next":"<command>"}',
      '',
    ].join('\n'),
  );
}

module.exports = function dispatch(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printHelp();
    return;
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    process.stdout.write(readVersion() + '\n');
    return;
  }

  const cmd = argv[0];
  const rest = argv.slice(1);
  const fn = COMMANDS[cmd];

  if (!fn) {
    process.stderr.write('Unknown command: ' + cmd + '\n\n');
    printHelp();
    process.exit(2);
  }

  Promise.resolve()
    .then(() => fn(rest))
    .catch((err) => {
      const payload = {
        state: 'error',
        run_id: null,
        narrate: 'lite ' + cmd + ' failed: ' + (err && err.message ? err.message : String(err)),
        next: null,
        error: {
          message: err && err.message ? err.message : String(err),
          ...(process.env.LITE_DEBUG ? { stack: err && err.stack } : {}),
        },
      };
      process.stdout.write(JSON.stringify(payload) + '\n');
      process.exit(1);
    });
};
