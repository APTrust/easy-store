const { BagItProfile } = require('../core/bagit_profile');
const BuiltInProfiles = require('../core/builtin_profiles');
const { Choice } = require('../core/choice');
const { Field } = require('../core/field');
const { Form } = require('../core/form');
const State = require('../core/state');
const Templates = require('../core/templates');
const { Util } = require('../core/util');

class BagItProfileList {

    constructor() {
        // Nothing to do
    }

    initEvents() {
        // Callback for New button
        $("#btnNewBagItProfile").on("click", this.onNewClick());

        // Callback for Create button. This button is in a modal popup
        // and is not present when the page loads. Hence $(document).on("click").
        // $(document).on("click", "#btnNewBagItProfileCreate", this.onCreateClick());

        $('.clickable-row[data-object-type="BagItProfile"]').on("click", this.onProfileClick);
    }

    onNewClick() {
        var self = this;
        return function() {
            var form = new Form();
            form.fields['baseProfile'] = new Field("baseProfile", "baseProfile", "New Profile", "");
            form.fields['baseProfile'].choices = [
                new Choice("", "Blank", true),
            ];
            form.fields['baseProfile'].help = "Do you want to create a blank new profile from scratch, or a new profile that conforms to an existing standard?";
            var sortedKeys = Object.keys(BuiltInProfiles.ProfilesAvailable).sort();
            for(var name of sortedKeys) {
                var profileId = BuiltInProfiles.ProfilesAvailable[name];
                form.fields['baseProfile'].choices.push(new Choice(profileId, name, false));
            }
            var data = {};
            data.form = form;
            $('#modalTitle').text("Create New BagIt Profile");
            $("#modalContent").html(Templates.bagItProfileNew(data));
            $('#modal').modal();
            $("#btnNewBagItProfileCreate").on("click", self.onCreateClick());
        }
    }

    onCreateClick() {
        var self = this;
        return function() {
            var profileId = null;
            var builtinId = $('#baseProfile').val().trim();
            if (!Util.isEmpty(builtinId)) {
                var profile = BagItProfile.createProfileFromBuiltIn(builtinId, true);
                profileId = profile.id;
            } else {
                // New blank profile
                var profile = new BagItProfile();
                profile.initNewBlankProfile();
                profile.save();
                profileId = profile.id;
            }
            $('#modal').modal('hide');
            return BagItProfileList.ShowForm(profileId);
        }
    }

    onProfileClick() {
        var id = $(this).data('object-id');
        BagItProfileList.showForm(id)
    }

    static showForm(id) {
        var profile = new BagItProfile();
        var showDeleteButton = false;
        if (!Util.isEmpty(id)) {
            profile = BagItProfile.find(id);
            showDeleteButton = !profile.isBuiltIn;
        }
        State.ActiveObject = profile;
        var data = {};
        data['form'] = profile.toForm();
        data['tags'] = profile.tagsGroupedByFile();
        data['showDeleteButton'] = showDeleteButton;
        $("#container").html(Templates.bagItProfileForm(data));
    }

}

module.exports.BagItProfileList = BagItProfileList;
