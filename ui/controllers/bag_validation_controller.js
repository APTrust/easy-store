const $ = require('jquery');
const { BagItProfile } = require('../../bagit/bagit_profile');
const { BagValidationForm } = require('../forms/bag_validation_form');
const { BaseController } = require('./base_controller');
const { Constants } = require('../../core/constants');
const { Context } = require('../../core/context');
const fs = require('fs');
const { Job } = require('../../core/job');
const path = require('path');
const Templates = require('../common/templates');
const { Util } = require('../../core/util');

/**
 * The BagValidationController presents a page on which users can
 * validate a bag against a BagIt profile.
 *
 * @param {URLSearchParams} params - The URL search params parsed
 * from the URL used to reach this page. This should contain at
 * least the Job Id.
 *
 * @param {string} params.id - The id of the Job being worked
 * on. Job.id is a UUID string.
 */
class BagValidationController extends BaseController {

    constructor(params) {
        super(params, 'Jobs');
        this.model = Job;
        this.job = new Job();
        this.form = null;
    }

    /**
     * This displays a form where users can choose a bag and
     * a profile.
     */
    show() {
        this.form = new BagValidationForm(this.job);
        let data = {
            job: this.job,
            form: this.form
        }
        let html = Templates.bagValidationForm(data);
        return this.containerContent(html);
    }

    validateBag() {
        this.form.parseFromDOM();
        let job = this.form.obj;
        // let tmpFile = Util.tmpFilePath();
        // fs.writeFileSync(tmpFile, JSON.stringify(job));
        // let modulePath = path.join(__dirname, '..', '..', 'main.js');
        // this.childProcess = fork(
        //         modulePath,
        //         ['--job', tmpFile]
        // );
        // this.dartProcess = new DartProcess(
        //     this.job.title,
        //     this.job.id,
        //     this.childProcess
        // );
        // //this.initRunningJobDisplay(this.dartProcess);
        // Context.childProcesses[this.dartProcess.id] = this.dartProcess;
        // $('#btnValidate').prop('disabled', true);
        // return this.noContent();
    }

    postRenderCallback(fnName) {
        let controller = this;
        $('#pathToBag').on('change',function(e){
            var filename = document.getElementById('pathToBag').files[0].path
            $(this).next('.custom-file-label').html(filename);
        })
        $('#btnValidate').on('click', () => { controller.validateBag() })
    }

}

module.exports.BagValidationController = BagValidationController;
