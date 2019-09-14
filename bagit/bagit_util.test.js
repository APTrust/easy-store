const { BagItUtil } = require('./bagit_util');
const { Constants } = require('../core/constants');
const { Context } = require('../core/context');
const fs = require('fs');
const path = require('path');
const { TestUtil } = require('../core/test_util');

const BASE_PATH = path.join(__dirname, '..', 'test', 'profiles', 'bagit_profiles_github');
const FOO_PATH = path.join(BASE_PATH, 'bagProfileFoo.json');
const BAR_PATH = path.join(BASE_PATH, 'bagProfileBar.json');

// This implicitly tests profileFromStandardObject as well.
test('profileFromStandardJson', () => {
    let fooProfileJson = fs.readFileSync(FOO_PATH).toString();
    let origProfile = JSON.parse(fooProfileJson);
    let convertedProfile = BagItUtil.profileFromStandardJson(fooProfileJson);

    expect(convertedProfile.name).toEqual("BagIt profile for packaging disk images");
    expect(convertedProfile.description).toEqual(Context.y18n.__("Imported from %s", "http://www.library.yale.edu/mssa/bagitprofiles/disk_images.json"));
    expect(convertedProfile.acceptSerialization).toEqual(["application/zip", "application/tar"]);
    expect(convertedProfile.allowFetchTxt).toBe(false);
    expect(convertedProfile.manifestsRequired).toEqual(["md5"]);
    expect(convertedProfile.manifestsAllowed).toEqual(["md5","sha1","sha224","sha256","sha384","sha512"]);
    expect(convertedProfile.tagManifestsRequired).toEqual([]);
    expect(convertedProfile.tagManifestsAllowed).toEqual(["md5","sha1","sha224","sha256","sha384","sha512"]);
    expect(convertedProfile.tagFilesAllowed).toEqual(["*"]);
    expect(convertedProfile.serialization).toEqual("required");

    // BagItProfileInfo
    expect(convertedProfile.bagItProfileInfo.bagItProfileIdentifier).toEqual("http://www.library.yale.edu/mssa/bagitprofiles/disk_images.json");
    expect(convertedProfile.bagItProfileInfo.bagItProfileVersion).toEqual("1.1.0");
    expect(convertedProfile.bagItProfileInfo.contactName).toEqual("Mark Matienzo");
    expect(convertedProfile.bagItProfileInfo.externalDescription).toEqual("BagIt profile for packaging disk images");
    expect(convertedProfile.bagItProfileInfo.sourceOrganization).toEqual("Yale University");
    expect(convertedProfile.bagItProfileInfo.version).toEqual("0.3");

    // Tags
    expect(convertedProfile.tags.length).toEqual(17);

    let sourceOrg = convertedProfile.firstMatchingTag("tagName", "Source-Organization");
    expect(sourceOrg).toBeDefined();
    expect(sourceOrg.required).toBe(true);
    expect(sourceOrg.values).toEqual(["Simon Fraser University", "York University"]);
    expect(sourceOrg.defaultValue).toBeNull();

    let contactPhone = convertedProfile.firstMatchingTag("tagName", "Contact-Phone");
    expect(contactPhone).toBeDefined();
    expect(contactPhone.required).toBe(true);
    expect(contactPhone.isBuiltIn).toBe(false);
    expect(contactPhone.isUserAddedFile).toBe(false);
    expect(contactPhone.isUserAddedTag).toBe(false);
    expect(contactPhone.wasAddedForJob).toBe(false);
});


test('profileFromStandardJson with tag files', () => {
    let barProfileJson = fs.readFileSync(BAR_PATH).toString();
    let origProfile = JSON.parse(barProfileJson);
    let convertedProfile = BagItUtil.profileFromStandardJson(barProfileJson);

    expect(convertedProfile.tagFilesAllowed.length).toEqual(1);
    expect(convertedProfile.tagFilesAllowed).toEqual(origProfile["Tag-Files-Allowed"]);

    // A.D. - 2019-09-05
    //
    // We're not currently supporting tagFilesRequired because we want
    // a change to the spec. See https://trello.com/c/SBLvoiwK
    //
    // expect(convertedProfile.tagFilesRequired.length).toEqual(2);
    // expect(convertedProfile.tagFilesRequired).toEqual(origProfile["Tag-Files-Required"]);
})

test('profileToStandardObject', () => {
    let profile = TestUtil.loadProfile('multi_manifest.json');
    let obj = BagItUtil.profileToStandardObject(profile);
    let expected = expectedStandardObject();
    expect(obj).toBeDefined();
    expect(obj).toEqual(expected);
});

test('profileToStandardJson', () => {
    let profile = TestUtil.loadProfile('multi_manifest.json');
    let json = BagItUtil.profileToStandardJson(profile);
    let expected = JSON.stringify(expectedStandardObject(), null, 2);
    expect(json).toBeDefined();
    expect(json).toEqual(expected);
});


function expectedStandardObject() {
    return {
      "Accept-BagIt-Version": [
        "0.97",
        "1.0"
      ],
      "Accept-Serialization": [
        "application/tar"
      ],
      "Allow-Fetch.txt": false,
      "Serialization": "required",
      "Manifests-Required": [
        "md5",
        "sha256"
      ],
      "Manifests-Allowed": [
        "md5",
        "sha1",
        "sha224",
        "sha256",
        "sha384",
        "sha512"
      ],
      "Tag-Manifests-Required": [
        "md5",
        "sha256"
      ],
      "Tag-Manifests-Allowed": [
        "md5",
        "sha1",
        "sha224",
        "sha256",
        "sha384",
        "sha512"
      ],
      "Tag-Files-Allowed": [
        "*"
      ],
      "BagIt-Profile-Info": {
        "BagIt-Profile-Identifier": "https://wiki.aptrust.org/APTrust_BagIt_Profile-2.2",
        "BagIt-Profile-Version": "",
        "Contact-Email": "support@aptrust.org",
        "Contact-Name": "A. Diamond",
        "External-Description": "BagIt profile for ingesting content into APTrust. Updated November 9, 2018.",
        "Source-Organization": "aptrust.org",
        "Version": "2.2"
      },
      "Bag-Info": {
        "Source-Organization": {
          "required": true
        },
        "Bag-Count": {
          "required": false
        },
        "Bagging-Date": {
          "required": false
        },
        "Bagging-Software": {
          "required": false,
          "values": [
            "DART",
            "TRAD"
          ]
        },
        "Bag-Group-Identifier": {
          "required": false
        },
        "Internal-Sender-Description": {
          "required": false
        },
        "Internal-Sender-Identifier": {
          "required": false
        },
        "Payload-Oxum": {
          "required": false
        }
      },
      "Tag-Files-Required": [
        "aptrust-info.txt"
      ]
    }
}