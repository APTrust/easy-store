const { BaseController } = require('./base_controller');
const { Context } = require('../../core/context');
const { Job } = require('../../core/job');
const { JobParams } = require('../../core/job_params');
const Templates = require('../common/templates');
const { Workflow } = require('../../core/workflow');
const { WorkflowBatch } = require('../../core/workflow_batch');
const { WorkflowForm } = require('../forms/workflow_form');
const { WorkflowBatchForm } = require('../forms/workflow_batch_form');

class WorkflowBatchController extends BaseController {

    constructor(params) {
        super(params, 'Workflows');
        this.typeMap = {};

        this.model = WorkflowBatch;
        this.formClass = WorkflowBatchForm;
        this.formTemplate = Templates.workflowBatch;
        this.listTemplate = Templates.workflowList;
        this.nameProperty = 'name';
        this.defaultOrderBy = 'name';
        this.defaultSortDirection = 'asc';
    }


    /**
     * Validate the batch and run it.
     *
     */
    runBatch() {
        let form = new WorkflowBatchForm(new WorkflowBatch());
        form.parseFromDOM();
        if (!form.obj.validate()) {
            form.setErrors();
            let html = Templates.workflowBatch({
                form: form,
                batchErrors: Object.values(form.obj.errors),
            });
            return this.containerContent(html);
        }
        alert('Form is valid, but batch feature is not ready yet.');

        // TODO: Use Util.forkJobProcess for each job.
        // See also RunningJobsController. Maybe that should be a helper?
        // Maybe stash JobParams list in storage or in global var and run,
        // or just run from here and embed the views on this page.

        return this.noContent();
    }


    /**
     * The postRenderCallback attaches event handlers to elements
     * that this controller has just rendered.
     */
    postRenderCallback(fnName) {

    }

}

module.exports.WorkflowBatchController = WorkflowBatchController;
