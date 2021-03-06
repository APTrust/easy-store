const { AppSetting } = require('../core/app_setting');
const { BagItProfile } = require('./bagit_profile');
const { Constants } = require('../core/constants');
const { TagDefinition } = require('./tag_definition');
const { TestUtil } = require('../core/test_util');
const { Util } = require('../core/util');
const fs = require('fs');
const path = require('path');

beforeEach(() => {
    TestUtil.deleteJsonFile('BagItProfile');
});

afterAll(() => {
    TestUtil.deleteJsonFile('BagItProfile');
});

test('Constructor sets initial properties', () => {
    let profile = new BagItProfile();
    expect(profile.name).toEqual('New BagIt Profile');
    expect(profile.description).toEqual('New custom BagIt profile');
    profile = new BagItProfile({ name: 'Test Profile',
                                 description: 'Profile for testing'});
    expect(profile.name).toEqual('Test Profile');
    expect(profile.description).toEqual('Profile for testing');

    expect(profile.acceptBagItVersion).toEqual(['0.97', '1.0']);
    expect(profile.acceptSerialization).toEqual(['application/tar']);
    expect(profile.allowFetchTxt).toEqual(false);
    expect(profile.bagItProfileInfo).not.toBeNull();
    expect(profile.manifestsRequired).toEqual(['sha256']);
    expect(profile.manifestsAllowed).toEqual(Constants.DIGEST_ALGORITHMS);
    expect(profile.tagManifestsRequired).toEqual([]);
    expect(profile.tagManifestsAllowed).toEqual(Constants.DIGEST_ALGORITHMS);
    expect(profile.tagFilesAllowed).toEqual(['*']);
    expect(profile.tags.length).toEqual(17);
    expect(profile.serialization).toEqual('optional');
    expect(profile.baseProfileId).toEqual(null);
    expect(profile.isBuiltIn).toEqual(false);
    expect(profile.tarDirMustMatchName).toEqual(false);
});

test('validate() catches invalid properties', () => {
    let profile = new BagItProfile();
    profile.id = '';
    profile.name = '';
    profile.acceptBagItVersion = [];
    profile.manifestsAllowed = [];
    profile.tags = [];
    profile.serialization = "Cap'n Crunch";
    let result = profile.validate();
    expect(result).toEqual(false);
    expect(profile.errors['id']).toEqual('Id cannot be empty.');
    expect(profile.errors['name']).toEqual('Name cannot be empty.');
    expect(profile.errors['acceptBagItVersion']).toEqual("Profile must accept at least one BagIt version.");
    expect(profile.errors['manifestsAllowed']).toEqual("Profile must allow at least one payload manifest algorithm.");
    expect(profile.errors['tags']).toEqual("Profile lacks requirements for bagit.txt tag file.\nProfile lacks requirements for bag-info.txt tag file.");
    expect(profile.errors['serialization']).toEqual("Serialization must be one of: required, optional, forbidden.");
});

test('findMatchingTags()', () => {
    let profile = new BagItProfile();
    profile.tags.push(new TagDefinition({
        tagFile: 'custom-tag-file.txt',
        tagName: 'Contact-Name'
    }));
    let tags = profile.findMatchingTags('tagName', 'Contact-Name');
    expect(tags.length).toEqual(2);
    expect(tags[0].tagFile).toEqual('bag-info.txt'); // was set in BagItProfile constructor
    expect(tags[1].tagFile).toEqual('custom-tag-file.txt');

    tags = profile.findMatchingTags('tagFile', 'bag-info.txt');
    expect(tags.length).toEqual(15);

    tags = profile.findMatchingTags('defaultValue', '');
    expect(tags.length).toEqual(16);  // BagIt-Version and Tag-File-Character-Encoding have values

    tags = profile.findMatchingTags('fakeProperty', 'fakeValue');
    expect(tags.length).toEqual(0);
});

test('firstMatchingTag()', () => {
    let profile = new BagItProfile();
    profile.tags.push(new TagDefinition({
        tagFile: 'custom-tag-file.txt',
        tagName: 'Contact-Name'
    }));
    let tag = profile.firstMatchingTag('tagName', 'Contact-Name');
    expect(tag.tagFile).toEqual('bag-info.txt');

    tag = profile.firstMatchingTag('tagFile', 'bagit.txt');
    expect(tag.tagName).toEqual('BagIt-Version');

    tag = profile.firstMatchingTag('defaultValue', '');
    expect(tag.tagName).toEqual('Bag-Count');

    tag = profile.firstMatchingTag('fakeProperty', 'fakeValue');
    expect(tag).toBeUndefined();
});


test('getTagsFromFile()', () => {
    let profile = new BagItProfile();
    let tags = profile.getTagsFromFile('bagit.txt', 'BagIt-Version');
    expect(tags.length).toEqual(1);
    expect(tags[0].tagFile).toEqual('bagit.txt');
    expect(tags[0].tagName).toEqual('BagIt-Version');

    tags = profile.getTagsFromFile('bag-info.txt', 'Contact-Name');
    expect(tags.length).toEqual(1);
    expect(tags[0].tagFile).toEqual('bag-info.txt');
    expect(tags[0].tagName).toEqual('Contact-Name');

    // Yes, the spec says a tag can appear more than once in a tag file.
    profile.tags.push(new TagDefinition({
        tagFile: 'bag-info.txt',
        tagName: 'Contact-Name'
    }));
    tags = profile.getTagsFromFile('bag-info.txt', 'Contact-Name');
    expect(tags.length).toEqual(2);

    tags = profile.getTagsFromFile('bag-info.txt', 'No-Such-Tag');
    expect(tags.length).toEqual(0);
});

test('hasTagFile()', () => {
    let profile = new BagItProfile();
    expect(profile.hasTagFile('bagit.txt')).toEqual(true);
    expect(profile.hasTagFile('bag-info.txt')).toEqual(true);
    expect(profile.hasTagFile('no-file.txt')).toEqual(false);
});

test('suggestBagName()', () => {
    let inst = new AppSetting({ name: 'Institution Domain', value: 'aptrust.org' });
    inst.save();

    // Make something that looks like an APTrust profile,
    // just because it has an aptrust-info.txt tag file.
    let aptrustProfile = new BagItProfile();
    aptrustProfile.tags.push(new TagDefinition({
        tagFile: 'aptrust-info.txt',
        tagName: 'Access'
    }));
    expect(aptrustProfile.suggestBagName()).toMatch(/^aptrust.org.bag-\d+$/);

    // Make something that looks like a DPN profile,
    // just because it has an dpn-tags/dpn-info.txt tag file.
    let dpnProfile = new BagItProfile();
    dpnProfile.tags.push(new TagDefinition({
        tagFile: 'dpn-tags/dpn-info.txt',
        tagName: 'Member-Id'
    }));
    let bagName = dpnProfile.suggestBagName();
    expect(Util.looksLikeUUID(bagName)).toEqual(true);

    let genericProfile = new BagItProfile();
    expect(genericProfile.suggestBagName()).toMatch(/^bag-\d+$/);
});

test('suggestGenericBagName()', () => {
    expect(BagItProfile.suggestGenericBagName()).toMatch(/^bag-\d+$/);
});

test('nameLooksLegal() accepts valid file names and rejects invalid ones', () => {
    expect(BagItProfile.nameLooksLegal("legal-name")).toEqual(true);
    expect(BagItProfile.nameLooksLegal("Legal_Name")).toEqual(true);
    expect(BagItProfile.nameLooksLegal("Illeg*l_name")).toEqual(false);
    expect(BagItProfile.nameLooksLegal("Illeg?l_name")).toEqual(false);
    expect(BagItProfile.nameLooksLegal("Illeg\\l_name")).toEqual(false);
    expect(BagItProfile.nameLooksLegal("Illeg/l_name")).toEqual(false);
    expect(BagItProfile.nameLooksLegal("Illegal name")).toEqual(false);
    expect(BagItProfile.nameLooksLegal("Illegal:name")).toEqual(false);
    expect(BagItProfile.nameLooksLegal("Illegal\rname")).toEqual(false);
    expect(BagItProfile.nameLooksLegal("Illegal\nname")).toEqual(false);
    expect(BagItProfile.nameLooksLegal("Illegal\tname")).toEqual(false);
});

test('isValidBagName() asserts profile-specific naming rules', () => {
    let inst = new AppSetting({ name: 'Institution Domain', value: 'aptrust.org' });
    inst.save();

    let aptrustProfile = new BagItProfile();
    aptrustProfile.tags.push(new TagDefinition({
        tagFile: 'aptrust-info.txt',
        tagName: 'Access'
    }));
    expect(aptrustProfile.isValidBagName("aptrust.org.historical-photos-1951")).toEqual(true);
    expect(aptrustProfile.isValidBagName("historical-photos-1951")).toEqual(false);

    let dpnProfile = new BagItProfile();
    dpnProfile.tags.push(new TagDefinition({
        tagFile: 'dpn-tags/dpn-info.txt',
        tagName: 'Member-Id'
    }));
    expect(dpnProfile.isValidBagName(Util.uuid4())).toEqual(true);
    expect(dpnProfile.isValidBagName("BagOfGlass")).toEqual(false);

    let genericProfile = new BagItProfile();
    expect(genericProfile.isValidBagName("BagOfGlass")).toEqual(true);
    expect(genericProfile.isValidBagName("**Bag?Of:Glass**")).toEqual(false);
});

test('tagsGroupedByFile()', () => {
    let profile = new BagItProfile();
    let files = profile.tagsGroupedByFile();
    expect(files['bagit.txt'].length).toEqual(2);
    expect(files['bag-info.txt'].length).toEqual(15);
});

test('getTagFileContents()', () => {
    let profile = new BagItProfile();
    let files = profile.tagsGroupedByFile();
    profile.getTagsFromFile('bag-info.txt', 'External-Description')[0].userValue = 'Bag of Stuff';
    profile.getTagsFromFile('bag-info.txt', 'Bag-Count')[0].userValue = '1';
    profile.getTagsFromFile('bag-info.txt', 'Bag-Size')[0].userValue = '10887';
    profile.getTagsFromFile('bag-info.txt', 'Bagging-Date')[0].userValue = '2018-08-20';
    profile.getTagsFromFile('bag-info.txt', 'Bagging-Software')[0].userValue = 'DART v2.0';
    profile.getTagsFromFile('bag-info.txt', 'Contact-Email')[0].userValue = 'bagger@aptrust.org';
    profile.getTagsFromFile('bag-info.txt', 'Contact-Name')[0].userValue = 'Bagger Vance';
    profile.getTagsFromFile('bag-info.txt', 'Contact-Phone')[0].userValue = '434-555-1212';
    profile.getTagsFromFile('bag-info.txt', 'Bag-Group-Identifier')[0].userValue = 'Stuff Collection';
    profile.getTagsFromFile('bag-info.txt', 'External-Identifier')[0].userValue = 'MYLB/NDA';
    profile.getTagsFromFile('bag-info.txt', 'Internal-Sender-Description')[0].userValue = 'Bag of miscellaneous junk';
    profile.getTagsFromFile('bag-info.txt', 'Internal-Sender-Identifier')[0].userValue = 'NMOT';
    profile.getTagsFromFile('bag-info.txt', 'Organization-Address')[0].userValue = '1234 Main St., Charlottesville, VA 22903';
    profile.getTagsFromFile('bag-info.txt', 'Payload-Oxum')[0].userValue = '10232.4';
    profile.getTagsFromFile('bag-info.txt', 'Source-Organization')[0].userValue = 'Academic Preservation Trust';
    let bagItContents = "BagIt-Version: 0.97\nTag-File-Character-Encoding: UTF-8\n";
    let bagInfoContents = "Bag-Count: 1\nBag-Group-Identifier: Stuff Collection\nBag-Size: 10887\nBagging-Date: 2018-08-20\nBagging-Software: DART v2.0\nContact-Email: bagger@aptrust.org\nContact-Name: Bagger Vance\nContact-Phone: 434-555-1212\nExternal-Description: Bag of Stuff\nExternal-Identifier: MYLB/NDA\nInternal-Sender-Description: Bag of miscellaneous junk\nInternal-Sender-Identifier: NMOT\nOrganization-Address: 1234 Main St., Charlottesville, VA 22903\nPayload-Oxum: 10232.4\nSource-Organization: Academic Preservation Trust\n";
    expect(profile.getTagFileContents('bagit.txt')).toEqual(bagItContents);
    expect(profile.getTagFileContents('bag-info.txt')).toEqual(bagInfoContents);
});

test('isCustomTagFile()', () => {
    let profile = new BagItProfile();

    // These are not custom. They're built in to all profiles.
    expect(profile.isCustomTagFile('bagit.txt')).toEqual(false);
    expect(profile.isCustomTagFile('bag-info.txt')).toEqual(false);

    // This won't be custom, because we're not flagging it as custom.
    let aptrustTag = new TagDefinition({
        tagFile: 'aptrust-info.txt',
        tagName: 'Access'
    });
    aptrustTag.userValue = 'Institution';
    profile.tags.push(aptrustTag);
    expect(profile.isCustomTagFile('aptrust-info.txt')).toEqual(false);

    // This will be custom, because we're flagging it as such.
    let customTag = new TagDefinition({
        tagFile: 'custom-tags.txt',
        tagName: 'Sample-Tag'
    });
    customTag.isUserAddedFile = true;
    customTag.isUserAddedTag = true;
    customTag.userValue = 'electra';
    profile.tags.push(customTag);
    expect(profile.isCustomTagFile('custom-tags.txt')).toEqual(true);

    // Check on a tag file that doesn't even exist.
    expect(profile.isCustomTagFile('file-does-not-exist.txt')).toEqual(false);
});

test('tagFileNames()', () => {
    let profile = new BagItProfile();
    expect(profile.tagFileNames()).toEqual(['bag-info.txt', 'bagit.txt']);

    profile.tags.push(new TagDefinition({
        tagFile: 'aptrust-info.txt',
        tagName: 'Access'
    }));
    profile.tags.push(new TagDefinition({
        tagFile: 'custom-tags.txt',
        tagName: 'Sample-Tag'
    }));
    expect(profile.tagFileNames()).toEqual(['aptrust-info.txt', 'bag-info.txt', 'bagit.txt', 'custom-tags.txt']);
});

test('mustBeTarred()', () => {
    let profile = new BagItProfile();
    expect(profile.mustBeTarred()).toEqual(false);
    profile.acceptSerialization = ['application/tar'];
    expect(profile.mustBeTarred()).toEqual(false);
    profile.serialization = 'required';
    expect(profile.mustBeTarred()).toEqual(true);
});

test('fromJson()', () => {
    let jsonFile = path.join(__dirname, '..', 'profiles', 'aptrust_2.2.json');
    let jsonString = fs.readFileSync(jsonFile).toString();
    // Remove array brackets so this is not a JSON array.
    jsonString = jsonString.replace(/^\s*\[/, '').replace(/\]\s*$/, '');
    let profile = BagItProfile.fromJson(jsonString);
    expect(profile).not.toBeNull();

    // This doesn't test everything, but we spot check a few properties.
    expect(profile.id).toEqual(Constants.BUILTIN_PROFILE_IDS['aptrust']);
    expect(profile.name).toEqual('APTrust');
    expect(profile.description).toEqual('APTrust 2.2 default BagIt profile.');
    expect(profile.acceptBagItVersion).toEqual(['0.97', '1.0']);
    expect(profile.acceptSerialization).toEqual(['application/tar']);
    expect(profile.tags.length).toEqual(14);
    expect(profile.bagItProfileInfo.contactEmail).toEqual('support@aptrust.org');
});

test('load()', () => {
    let jsonFile = path.join(__dirname, '..', 'test', 'profiles', 'multi_manifest.json');
    let profile = BagItProfile.load(jsonFile);
    expect(profile).not.toBeNull();

    // Check some basics.
    expect(profile.id).toEqual('28f48fcc-064d-4acf-bb5b-ea6ad5c6264d');
    expect(profile.name).toEqual('APTrust');
    expect(profile.description).toEqual('Modified version of APTrust 2.2 BagIt profile that includes two required manifest and tag manifest algorithms. This profile is for testing, not for production.');
    expect(profile.acceptBagItVersion).toEqual(['0.97', '1.0']);
    expect(profile.acceptSerialization).toEqual(['application/tar']);
    expect(profile.tags.length).toEqual(15);
    expect(profile.bagItProfileInfo.contactEmail).toEqual('support@aptrust.org');
});

test('bagTitle()', () => {
    let profile = new BagItProfile();
    expect(profile.bagTitle()).toEqual('');

    let titleTag1 = new TagDefinition({
        tagFile: 'bag-info.txt',
        tagName: 'Internal-Title'
    });
    titleTag1.userValue = 'First Title';
    profile.tags.push(titleTag1);
    expect(profile.bagTitle()).toEqual('First Title');

    let titleTag2 = new TagDefinition({
        tagFile: 'bag-info.txt',
        tagName: 'Title'
    });
    titleTag2.userValue = 'Second Title';
    profile.tags.push(titleTag2);
    expect(profile.bagTitle()).toEqual('Second Title');
});

test('bagDescription()', () => {
    let profile = new BagItProfile();
    expect(profile.bagDescription()).toEqual('');

    let titleTag1 = new TagDefinition({
        tagFile: 'bag-info.txt',
        tagName: 'Description'
    });
    titleTag1.userValue = 'First Description';
    profile.tags.push(titleTag1);
    expect(profile.bagDescription()).toEqual('First Description');

    let titleTag2 = new TagDefinition({
        tagFile: 'bag-info.txt',
        tagName: 'Internal-Sender-Description'
    });
    titleTag2.userValue = 'Second Description';
    profile.tags.push(titleTag2);
    expect(profile.bagDescription()).toEqual('Second Description');
});

test('bagInternalIdentifier()', () => {
    let profile = new BagItProfile();
    expect(profile.bagInternalIdentifier()).toEqual("");
    profile.getTagsFromFile('bag-info.txt', 'Internal-Sender-Identifier')[0].userValue = 'NMOT';
    expect(profile.bagInternalIdentifier()).toEqual('NMOT');
});

test('copyDefaultTagValuesFrom()', () => {
    // Set up a profile with specific default tag values.
    let profile1 = new BagItProfile();
    profile1.getTagsFromFile('bag-info.txt', 'External-Description')[0].defaultValue = 'Bag of Stuff';
    profile1.getTagsFromFile('bag-info.txt', 'Bag-Count')[0].defaultValue = '1';
    profile1.getTagsFromFile('bag-info.txt', 'Bag-Size')[0].defaultValue = '10887';
    profile1.getTagsFromFile('bag-info.txt', 'Bagging-Date')[0].defaultValue = '2018-08-20';
    profile1.getTagsFromFile('bag-info.txt', 'Contact-Email')[0].defaultValue = 'bagger@aptrust.org';
    profile1.getTagsFromFile('bag-info.txt', 'Contact-Name')[0].defaultValue = 'Bagger Vance';
    profile1.getTagsFromFile('bag-info.txt', 'Contact-Phone')[0].defaultValue = '434-555-1212';
    profile1.getTagsFromFile('bag-info.txt', 'Bag-Group-Identifier')[0].defaultValue = 'Stuff Collection';
    profile1.getTagsFromFile('bag-info.txt', 'External-Identifier')[0].defaultValue = 'MYLB/NDA';
    profile1.getTagsFromFile('bag-info.txt', 'Internal-Sender-Description')[0].defaultValue = 'Bag of miscellaneous junk';
    profile1.getTagsFromFile('bag-info.txt', 'Internal-Sender-Identifier')[0].defaultValue = 'NMOT';
    profile1.getTagsFromFile('bag-info.txt', 'Organization-Address')[0].defaultValue = '1234 Main St., Charlottesville, VA 22903';
    profile1.getTagsFromFile('bag-info.txt', 'Payload-Oxum')[0].defaultValue = '10232.4';
    profile1.getTagsFromFile('bag-info.txt', 'Source-Organization')[0].defaultValue = 'Academic Preservation Trust';

    // Create a new profile, and copy the default tag values from profile1.
    let profile2 = new BagItProfile();
    profile2.copyDefaultTagValuesFrom(profile1);

    // Make sure the defaults were copied.
    expect(profile2.getTagsFromFile('bag-info.txt', 'External-Description')[0].defaultValue).toEqual('Bag of Stuff');
    expect(profile2.getTagsFromFile('bag-info.txt', 'Bag-Count')[0].defaultValue).toEqual('1');
    expect(profile2.getTagsFromFile('bag-info.txt', 'Bag-Size')[0].defaultValue).toEqual('10887');
    expect(profile2.getTagsFromFile('bag-info.txt', 'Bagging-Date')[0].defaultValue).toEqual('2018-08-20');
    expect(profile2.getTagsFromFile('bag-info.txt', 'Contact-Email')[0].defaultValue).toEqual('bagger@aptrust.org');
    expect(profile2.getTagsFromFile('bag-info.txt', 'Contact-Name')[0].defaultValue).toEqual('Bagger Vance');
    expect(profile2.getTagsFromFile('bag-info.txt', 'Contact-Phone')[0].defaultValue).toEqual('434-555-1212');
    expect(profile2.getTagsFromFile('bag-info.txt', 'Bag-Group-Identifier')[0].defaultValue).toEqual('Stuff Collection');
    expect(profile2.getTagsFromFile('bag-info.txt', 'External-Identifier')[0].defaultValue).toEqual('MYLB/NDA');
    expect(profile2.getTagsFromFile('bag-info.txt', 'Internal-Sender-Description')[0].defaultValue).toEqual('Bag of miscellaneous junk');
    expect(profile2.getTagsFromFile('bag-info.txt', 'Internal-Sender-Identifier')[0].defaultValue).toEqual('NMOT');
    expect(profile2.getTagsFromFile('bag-info.txt', 'Organization-Address')[0].defaultValue).toEqual('1234 Main St., Charlottesville, VA 22903');
    expect(profile2.getTagsFromFile('bag-info.txt', 'Payload-Oxum')[0].defaultValue).toEqual('10232.4');
    expect(profile2.getTagsFromFile('bag-info.txt', 'Source-Organization')[0].defaultValue).toEqual('Academic Preservation Trust');

});

test('mergeTagValues()', () => {
    // Set up a profile with specific default tag values.
    let profile = new BagItProfile();
    profile.getTagsFromFile('bag-info.txt', 'External-Description')[0].userValue = '';
    profile.getTagsFromFile('bag-info.txt', 'Bag-Count')[0].userValue = '';
    profile.getTagsFromFile('bag-info.txt', 'Bag-Size')[0].userValue = '';
    profile.getTagsFromFile('bag-info.txt', 'Bagging-Date')[0].userValue = '';
    profile.getTagsFromFile('bag-info.txt', 'Contact-Email')[0].userValue = '';

    expect(profile.getTagsFromFile('bag-info.txt', 'New-Tag-1')[0]).toBeUndefined();
    expect(profile.getTagsFromFile('bag-info.txt', 'New-Tag-2')[0]).toBeUndefined();

    // Create some tags to merge in.
    let desc = new TagDefinition({
        tagFile: 'bag-info.txt',
        tagName: 'External-Description'
    });
    let count = new TagDefinition({
        tagFile: 'bag-info.txt',
        tagName: 'Bag-Count'
    });
    let size = new TagDefinition({
        tagFile: 'bag-info.txt',
        tagName: 'Bag-Size'
    });
    let date = new TagDefinition({
        tagFile: 'bag-info.txt',
        tagName: 'Bagging-Date'
    });
    let email = new TagDefinition({
        tagFile: 'bag-info.txt',
        tagName: 'Contact-Email'
    });
    let newTag1 = new TagDefinition({
        tagFile: 'bag-info.txt',
        tagName: 'New-Tag-1'
    });
    let newTag2 = new TagDefinition({
        tagFile: 'bag-info.txt',
        tagName: 'New-Tag-2'
    });
    desc.userValue = 'Bag of Stuff';
    count.userValue = '1';
    size.userValue = '10887';
    date.userValue = '2018-08-20';
    email.userValue = 'bagger@aptrust.org';
    newTag1.userValue = 'Bagger Vance';
    newTag2.userValue = '434-555-1212';

    let tags = [desc, count, size, date, email, newTag1, newTag2];
    profile.mergeTagValues(tags);

    // Make sure user values were merged in.
    expect(profile.getTagsFromFile('bag-info.txt', 'External-Description')[0].userValue).toEqual('Bag of Stuff');
    expect(profile.getTagsFromFile('bag-info.txt', 'Bag-Count')[0].userValue).toEqual('1');
    expect(profile.getTagsFromFile('bag-info.txt', 'Bag-Size')[0].userValue).toEqual('10887');
    expect(profile.getTagsFromFile('bag-info.txt', 'Bagging-Date')[0].userValue).toEqual('2018-08-20');
    expect(profile.getTagsFromFile('bag-info.txt', 'Contact-Email')[0].userValue).toEqual('bagger@aptrust.org');

    // Make sure tags that didn't exist before were added.
    expect(profile.getTagsFromFile('bag-info.txt', 'New-Tag-1')[0].userValue).toEqual('Bagger Vance');
    expect(profile.getTagsFromFile('bag-info.txt', 'New-Tag-2')[0].userValue).toEqual('434-555-1212');
});

test('inflateFrom()', () => {
    let jsonFile = path.join(__dirname, '..', 'test', 'profiles', 'multi_manifest.json');

    let profile = BagItProfile.load(jsonFile);
    let copy = BagItProfile.inflateFrom(profile);
    expect(copy).toEqual(profile);
});

test('preferredSerialization()', () => {
    let profile = new BagItProfile();
    profile.acceptSerialization = [
        'application/tar',
        'application/zip'
    ];
    profile.serialization = 'required';
    expect(profile.preferredSerialization()).toEqual('.tar')

    profile.acceptSerialization = [
        'application/zip',
        'application/tar'
    ];
    expect(profile.preferredSerialization()).toEqual('.zip');

    profile.serialization = 'optional';
    expect(profile.preferredSerialization()).toEqual('.zip');

    profile.serialization = 'forbidden';
    expect(profile.preferredSerialization()).toEqual('');
});


test('chooseManifestAlgorithms()', () => {
    let profile = new BagItProfile();

    profile.manifestsRequired = [];
    profile.manifestsAllowed = [];
    profile.tagManifestsRequired = [];
    profile.tagManifestsAllowed = [];
    expect(profile.chooseManifestAlgorithms('manifest')).toEqual(['sha512']);
    expect(profile.chooseManifestAlgorithms('tagmanifest')).toEqual(['sha512']);

    profile.manifestsRequired = ["sha256", "md5"];
    profile.manifestsAllowed = ["md5", "sha256", "sha512"];
    profile.tagManifestsRequired = ["sha256", "md5"];
    profile.tagManifestsAllowed = ["md5", "sha256", "sha512"];

    expect(profile.chooseManifestAlgorithms('manifest')).toEqual(['sha256', 'md5']);
    expect(profile.chooseManifestAlgorithms('tagmanifest')).toEqual(['sha256', 'md5']);

    profile.manifestsRequired = ["md5"];
    profile.manifestsAllowed = ["md5", "sha256", "sha512"];
    profile.tagManifestsRequired = ["md5"];
    profile.tagManifestsAllowed = ["md5", "sha256", "sha512"];
    expect(profile.chooseManifestAlgorithms('manifest')).toEqual(['md5']);
    expect(profile.chooseManifestAlgorithms('tagmanifest')).toEqual(['md5']);

    // In this case, no manifests are required, but tag manifest must
    // be md5. The function should return md5 because BagIt spec section
    // 2.2.1 at https://tools.ietf.org/html/rfc8493#section-2.2.1 says
    // algorithms for payload manifest and tag manifest should match.
    profile.manifestsRequired = [];
    expect(profile.chooseManifestAlgorithms('manifest')).toEqual(['md5']);

    // In this case, with no guidance on manifests or tag manifests,
    // we should get the LOC recommended sha512.
    profile.tagManifestsRequired = [];
    expect(profile.chooseManifestAlgorithms('manifest')).toEqual(['sha512']);

    // Should get sha256, because it's preferred for security.
    profile.manifestsAllowed = ["md5", "sha256"];
    expect(profile.chooseManifestAlgorithms('manifest')).toEqual(['sha256']);

    profile.manifestsAllowed = ["sha1"];
    expect(profile.chooseManifestAlgorithms('manifest')).toEqual(['sha1']);
});


// ---------------------------------
// Tests of PersistentObject methods
// ---------------------------------

test('find()', () => {
    let objs = makeObjects(3);
    let obj = objs[1];
    expect(BagItProfile.find(obj.id)).toEqual(obj);
});

test('sort()', () => {
    let objs = makeObjects(3);
    let sortedAsc = BagItProfile.sort("name", "asc");
    expect(sortedAsc[0].name).toEqual("Name 1");
    expect(sortedAsc[2].name).toEqual("Name 3");
    let sortedDesc = BagItProfile.sort("name", "desc");
    expect(sortedDesc[0].name).toEqual("Name 3");
    expect(sortedDesc[2].name).toEqual("Name 1");
});

test('findMatching()', () => {
    let objs = makeObjects(3);
    let matches = BagItProfile.findMatching("description", "Description 3");
    expect(matches.length).toEqual(1);
    expect(matches[0].description).toEqual("Description 3");
});

test('firstMatching()', () => {
    let objs = makeObjects(3);
    let match = BagItProfile.firstMatching("description", "Description 3");
    expect(match).not.toBeNull();
    expect(match.description).toEqual("Description 3");
});

test('list()', () => {
    let objs = makeObjects(3);
    let fn = function(obj) {
        return obj.description != null;
    }
    let opts = {
        limit: 2,
        offset: 1,
        orderBy: "description",
        sortDirection: "asc"
    }
    let matches = BagItProfile.list(fn, opts);
    expect(matches.length).toEqual(2);
    expect(matches[0].description).toEqual("Description 2");
    expect(matches[1].description).toEqual("Description 3");
});

test('first()', () => {
    let objs = makeObjects(3);
    let fn = function(obj) {
        return obj.description != null;
    }
    let opts = {
        orderBy: "description",
        sortDirection: "desc"
    }
    let match = BagItProfile.first(fn, opts);
    expect(match).not.toBeNull();
    expect(match.description).toEqual("Description 3");
});

function makeObjects(howMany) {
    let list = [];
    for(let i=0; i < howMany; i++) {
        let name = `Name ${i + 1}`;
        let description = `Description ${i + 1}`;
        let obj = new BagItProfile({ name: name, description: description });
        obj.save();
        list.push(obj);
    }
    return list;
}
