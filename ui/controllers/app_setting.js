const { AppSetting } = require('../../core/app_setting');
const { AppSettingForm } = require('../forms/app_setting_form');
const { BaseController } = require('./base_controller');
const Templates = require('../common/templates');

class AppSettingController extends BaseController {

    constructor(params) {
        super(params, 'Settings');
    }

    create() {
        let form = new AppSettingForm(new AppSetting());
        let data = { form: form };
        let html = Templates.appSettingForm(data);
        return this.containerContent(html)
    }

    update() {
        return 'Update AppSetting';
    }

    list() {
        return this.containerContent('List AppSetting');
    }

    destroy() {
        return 'Destroy AppSetting';
    }
}

module.exports.AppSettingController = AppSettingController;