const $ = require('jquery');
const { BagItProfile } = require('../../bagit/bagit_profile');
const { Constants } = require('../../core/constants');
const { Context } = require('../../core/context');
const { DartProcess } = require('../../core/dart_process');
const { fork } = require('child_process');
const fs = require('fs');
const { Job } = require('../../core/job');
const { JobRunner } = require('../../workers/job_runner');
const path = require('path');
const { RunningJobsController } = require('./running_jobs_controller');
const Templates = require('../common/templates');
const { UIConstants } = require('../common/ui_constants');
const { StorageService } = require('../../core/storage_service');
const { Util } = require('../../core/util');

/**
 * The JobRunController displays the page where users review
 * and run a Job.
 *
 * @param {URLSearchParams} params - The URL search params parsed
 * from the URL used to reach this page. This should contain at
 * least the Job Id.
 *
 * @param {string} params.id - The id of the Job being worked
 * on. Job.id is a UUID string.
 */
class JobRunController extends RunningJobsController {

    constructor(params) {
        super(params, 'Jobs');
        this.model = Job;
        this.job = Job.find(this.params.get('id'));
        this.dartProcess = null;
        this.childProcess = null;
        this.reachedEndOfOutput = false;
    }

    /**
     * Displays a summary of the Job and the "Run Job" button.
     */
    show() {
        let uploadTargets = [];
        for (let op of this.job.uploadOps) {
            let target = StorageService.find(op.storageServiceId);
            if (target) {
                uploadTargets.push(target.name);
            }
        }
        let data = { job: this.job, uploadTargets: uploadTargets }
        return this.containerContent(Templates.jobRun(data));
    }

    /**
     * Runs the Job in a separate process.
     */
    run() {
        // Grey this out while job is running.
        // Run job in separate process, so user can
        // navigate to other screens without disrupting it.
        let tmpFile = Util.tmpFilePath();
        fs.writeFileSync(tmpFile, JSON.stringify(this.job));

        // Need to change npm command outside of dev env.
        let modulePath = path.join(__dirname, '..', '..', 'main.js');
        this.childProcess = fork(
                modulePath,
                ['--job', tmpFile, '--deleteJobFile']
        );

        // TODO: Do we still need this? It's job is to keep
        // track of running jobs for the UI.
        // Looks like it's used in a number of places, but confirm.
        this.dartProcess = new DartProcess(
            this.job.title,
            this.job.id,
            this.childProcess
        );
        this.initRunningJobDisplay(this.dartProcess);
        Context.childProcesses[this.dartProcess.id] = this.dartProcess;
        $('#btnRunJob').prop('disabled', true);
        return this.noContent();
    }

    /**
     * This handles the page's Back button click.
     */
    back() {
        let prevController = 'JobUpload';
        // If we have a workflow id, the uploads for this job
        // are already determined, so we can skip that screen.
        if (this.job.workflowId) {
            prevController = 'JobMetadata';
        }
        return this.redirect(prevController, 'show', this.params);
    }


    postRenderCallback(fnName) {

    }
}

module.exports.JobRunController = JobRunController;
