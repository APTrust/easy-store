const { Constants } = require('./core/constants');
const { Context } = require('./core/context');
const fs = require('fs');
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
        boolean: ['D', 'debug', 'h', 'help', 'v', 'version',
                  'd', 'deleteJobFile'],
        default: { D: false, debug: false, d: false, deleteJobFile: false,
                   h: false, help: false, v: false, version: false},
        alias: { D: ['debug'], d: ['deleteJobFile'],
                 h: ['help'], j: ['job'], v: ['version'],
                 w: ['workflow']}
    });
    if (opts.job) {
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
    if (!process.stdin.isTTY) {
        stdinData = fs.readFileSync(0, 'utf-8');
    }
    //console.log(opts);
    //console.log(stdinData);
    let jobRunner = new JobRunner(opts.job, opts.deleteJobFile);
    let exitCode = await jobRunner.run();
    Context.logger.info(`Finished DART command-line mode pid: ${process.pid}, job: ${opts.job}. Exit Code: ${exitCode}`);
    process.exit(exitCode);
}

// And away we go...
run();
