const { Constants } = require('./core/constants');
const { Context } = require('./core/context');
const fs = require('fs');
const { JobLoader } = require('./util/job_loader');
const { JobRunner } = require('./workers/job_runner');
const minimist = require('minimist');
const process = require('process');

// Electron wants these vars to be global, so we defined them here.
// They will be assigned only if we're running in GUI mode.
let win;
let app;

// This runs the app in either CLI or GUI mode.
// We don't load the heavyweight Electron requirements unless
// we're running in GUI mode.
function run() {
    let opts = minimist(process.argv.slice(2), {
        string: ['j', 'job'],
        boolean: ['d', 'debug', 'h', 'help', 'v', 'version',
                 's', 'stdin'],
        default: { d: false, debug: false,
                   h: false, help: false,
                   s: false, stdin: false,
                   v: false, version: false},
        alias: { D: ['debug'], h: ['help'], j: ['job'],
                 s: ['stdin'], v: ['version'],
                 w: ['workflow']}
    });
    if (opts.job || opts.stdin) {
        process.DART_MODE = 'cli';
        return runWithoutUI(opts);
    } else {
        // GUI mode. Hoist win and app to global namespace.
        process.DART_MODE = 'gui';
        let ui = require('./ui/main');
        win = ui.win;
        app = ui.app;
    }
    Context.logger.info(`DART started (${process.DART_MODE} mode)`);
}

// Run in command-line mode.
async function runWithoutUI(opts) {
    Context.logger.info(`Starting DART command-line mode pid: ${process.pid}, job: ${opts.job}`);
    let stdinData = '';
    if (opts.stdin) {
        stdinData = fs.readFileSync(0, 'utf-8');
    }
    Context.logger.info('STDIN -> ', stdinData);
    let job = new JobLoader(opts, stdinData).loadJob();
    let jobRunner = new JobRunner(job);
    let exitCode = await jobRunner.run();
    Context.logger.info(`Finished DART command-line mode pid: ${process.pid}, job: ${opts.job}. Exit Code: ${exitCode}`);
    process.exit(exitCode);
}

// And away we go...
run();