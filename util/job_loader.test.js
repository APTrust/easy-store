const { AppSetting } = require('../core/app_setting');
const { Constants } = require('../core/constants');
const { Job } = require('../core/job');
const { JobLoader } = require('./job_loader');
const { JobParams } = require('../core/job_params');
const path = require('path');
const { StorageService } = require('../core/storage_service');
const { TestUtil } = require('../core/test_util');
const { Util } = require('../core/util');
const { Workflow } = require('../core/workflow');

// TODO: Too much boilerplate & setup in this file.
// Create fixtures that can be shared by multiple test files.

// The Job Id of the fixture at Job_001.json
let jobId = '3a8ab4fc-141e-494c-82a2-323c6f5dfe87';

// This will be populated by createStorageServices.
let storageServices = [];

const tarPluginId = '90110710-1ff9-4650-a086-d7b23772238f';

beforeAll(() => {
    saveBaggingDirSetting();
    saveBagItProfile();
    saveJob();
    createStorageServices();
    saveTestWorkflow();
});

afterAll(() => {
    TestUtil.deleteJsonFile('AppSetting');
    TestUtil.deleteJsonFile('BagItProfile');
    TestUtil.deleteJsonFile('Job');
    TestUtil.deleteJsonFile('StorageService');
    TestUtil.deleteJsonFile('Workflow');
});

function saveBaggingDirSetting() {
    new AppSetting({
        name: 'Bagging Directory',
        value: '/dev/null'
    }).save();
}

function saveBagItProfile() {
    TestUtil.loadProfilesFromSetup('aptrust')[0].save();
}

function saveJob() {
    let pathToFile = path.join(__dirname, '..', 'test', 'fixtures', 'Job_001.json');
    let job = Job.inflateFromFile(pathToFile);
    job.save();
}

function saveTestWorkflow() {
    new Workflow(opts).save();
}

function createStorageServices() {
    storageServices.push(new StorageService({
        name: 'SS 1',
        protocol: 's3',
        host: 'example.com'
    }));
    storageServices.push(new StorageService({
        name: 'SS 2',
        protocol: 'ftp',
        host: 'aptrust.org'
    }));
    storageServices[0].save();
    storageServices[1].save();
    opts.storageServiceIds = storageServices.map(ss => ss.id);
}

let opts = {
    name: 'Test Workflow',
    description: 'Workflow for unit tests.',
    packageFormat: 'BagIt',
    packagePluginId: tarPluginId,
    bagItProfileId: Constants.BUILTIN_PROFILE_IDS['aptrust']
}

function getJobParams() {
    return new JobParams({
        workflowName: 'Test Workflow',
        packageName: 'Bag of Stuff',
        files: ['file1', 'file2'],
        tags: []
    });
}

let dummyOpts = {
    opt1: 'opt one',
    opt2: 'opt two'
}

// ----- END OF SETUP. NOW THE TESTS ----- //

test('constructor()', () => {
    let stdinData = '{ "key": "value"}';
    let jobLoader = new JobLoader(dummyOpts, stdinData);
    expect(jobLoader.opts).toEqual(dummyOpts);
    expect(jobLoader.stdinData).toEqual(stdinData);
});

test('loadFromStdin() with Job JSON', () => {
    let job = Job.find(jobId);
    let stdinData = JSON.stringify(job);
    let jobLoader = new JobLoader(dummyOpts, stdinData);
    let loadedJob = jobLoader.loadFromStdin();
    expect(loadedJob).toBeTruthy();
    expect(loadedJob.constructor.name).toEqual('Job');
    expect(loadedJob.id).toEqual(job.id);
});

test('loadFromStdin() with JobParams JSON', () => {
    let jobParams = getJobParams();
    let stdinData = JSON.stringify(jobParams);
    let jobLoader = new JobLoader(dummyOpts, stdinData);

    // This should load the Workflow called 'Test Workflow'
    // and create a job from it. The underlying code that
    // converts JobParams to Job is tested more thoroughly
    // in job_params.test.js.
    let loadedJob = jobLoader.loadFromStdin();
    expect(loadedJob).toBeTruthy();
    expect(loadedJob.constructor.name).toEqual('Job');
    expect(Util.looksLikeUUID(loadedJob.id)).toBe(true);

    expect(loadedJob.bagItProfile).not.toBeNull();
    expect(loadedJob.bagItProfile.id).toEqual(opts.bagItProfileId);

    expect(loadedJob.packageOp.packageFormat).toEqual(opts.packageFormat);
    expect(loadedJob.packageOp.pluginId).toEqual(opts.packagePluginId);
    expect(loadedJob.packageOp.sourceFiles).toEqual(['file1', 'file2']);
});

// test('loadFromJobParams() throws error if Workflow does not exist', () => {

// });

// test('loadFromStdin() with valid JSON of bad object type', () => {

// });

// test('loadFromStdin() with invalid JSON', () => {

// });

// test('parseStdin() with valid JSON', () => {

// });

// test('parseStdin() with invalid JSON', () => {

// });

// test('looksLikeJob()', () => {

// });

// test('looksLikeJobParams()', () => {

// });

// test('loadJob() with Job JSON', () => {

// });

// test('loadJob() with JobParams JSON', () => {

// });

// test('loadJob() with valid Job UUID', () => {

// });

// test('loadJob() with invalid Job UUID', () => {

// });

// test('loadJob() with valid file path and good JSON', () => {

// });

// test('loadJob() with valid file path and bad JSON', () => {

// });

// test('loadJob() with invalid file path', () => {

// });
