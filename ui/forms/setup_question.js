const $ = require('jquery');
const { Context } = require('../../core/context');
const { Field } = require('./field');
const { Util } = require('../../core/util');

/**
 * SetupQuestion is a question to be asked by a setup module. DART presents
 * these questions one at a time, and the user must provide a valid answer
 * before proceeding to the next question.
 *
 * You'll typically want to copy the responses from these questions into
 * some persistent DART setting.
 *
 * @param {object} opts - An object containing setup options.
 *
 * @param {string} opts.question - The question to ask the user.
 *
 * @param {string} opts.initialValue - The initial value for this question.
 * This value will appear in the text box, or as the selected value in the
 * select list when the page loads.
 *
 * @param {string} opts.error - An error message to display if the user's
 * response is invalid.
 *
 * @param {string} [opts.choices] - An array of choices for the user to select
 * from. This parameter is optional. If supplied, the Setup page will display
 * a select list instead of a text input.
 *
 * @param {string} [opts.dataType] - The type to which the user's response
 * should be cast. Valid values are 'number' and 'boolean'. If the dataType
 * is string you don't need to include this param, as values are strings
 * by default.
 *
 * @param {string} [opts.validator] - An optional function to validate the
 * user's response. This function takes one param, the value that the user
 * entered, and returns true or false to indicate whether it's valid. See
 * {@link SetupQuestion.getRequiredValidator},
 * {@link SetupQuestion.getPatternValidator}, and
 * {@link SetupQuestion.getIntRangeValidator}. You can also write your own
 * custom validation function.
 *
 * @param {string} opts.onValideResponse - A function to call when the user
 * has supplied a valid response. This function will be called before DART
 * moves on to the next SetupQuestion. Typically, you'll want this function
 * to copy the user's response into some peristent setting. This function takes
 * the user-entered value as its only parameter. The SetupQuestion constructor
 * will blow up if you don't give it an onValidResponse handler.
 *
 * @example
 *
 * // Create a question that asks for a domain name and copies the value
 * // into an AppSetting.
 *
 * let appSetting = AppSetting.firstMatching("My Domain Name") || new AppSetting({ name: "My Domain Name" });
 * let validator = SetupQuestion.getPatternValidator(Constants.RE_DOMAIN);
 * let onValidResponse = function(value) {
 *     appSetting.value = value;
 *     appSetting.save();
 * }
 * let q = new SetupQuestion({
 *     question: "What is your organization's domain name?",
 *     initialValue: appSetting.value,
 *     error: "Please enter a valid domain name.",
 *     validator: validator,
 *     onValidResponse: onValidResponse
 * });
 *
 */
class SetupQuestion extends Field {
    constructor(opts) {
        let rand = 'setup_' + Math.random().toString().replace(/^0\./, '');
        super(rand, rand, opts.question, opts.initialValue)
        this.dataType = opts.dataType || 'string';
        this.choices = opts.choices || [];
        this.error = opts.error || Context.y18n.__("The response is not valid.");
        this.validator = opts.validator || function (val) { return true };
        this.onValidResponse = opts.onValidResponse;
        if (typeof this.onValidResponse != 'function') {
            throw new Error(Context.y18n.__("%s should be a function", "onValidResponse"));
        }
    }

    /**
     * This returns the value that the user entered in the form input
     * field.
     *
     * @returns {string|number|boolean}
     */
    readUserInput() {
        let field = this;
        let formValue = $(`#${field.id}`).val() || '';
        return Util.cast(formValue.trim(), this.dataType);
    }

    /**
     * This reads the value the user input on the form. If the input
     * is valid, this calls the onValidResponse callback. If the input
     * was invalid, this returns false.
     *
     * @returns {boolean}
     */
    processResponse() {
        let value = this.readUserInput();
        if (this.validator(value)) {
            this.value = value;
            this.onValidResponse(value);
            return true;
        }
        return false;
    }

    /**
     * Returns a validator function that tests whether a value is empty.
     * The validator function returns false if it gets an empty value,
     * true otherwise.
     *
     * @returns {function}
     */
    static getRequiredValidator() {
        return function(value) {
            return !Util.isEmpty(value);
        }
    }

    /**
     * Returns a validator function that tests whether a value matches
     * a regular expression pattern. The validator function returns true
     * if the value matches the pattern false otherwise.
     *
     * The Constants module contains a number of pre-defined patterns,
     * including:
     *
     * - {@link Constants.RE_DOMAIN}
     * - {@link Constants.RE_EMAIL}
     * - {@link Constants.RE_FILE_PATH_POSIX}
     * - {@link Constants.RE_FILE_PATH_WINDOWS}
     * - {@link Constants.RE_FILE_PATH_ANY_OS}
     * - {@link Constants.RE_IPV4}
     *
     * @param {RegExp} pattern - The pattern to test against.
     *
     * @param {boolean} emptyOk - Are empty response allowed? Default is false.
     *
     * @returns {function}
     */
    static getPatternValidator(pattern, emptyOk = false) {
        return function(value) {
            return emptyOk && Util.isEmpty(value) || value.match(pattern) !== null;
        }
    }

    /**
     * Returns a validator function that checks whether an interger value
     * is within a given range. The function returns true or false.
     *
     * @param {number} min - The minimum value. A valid integer must be
     * greater than or equal to this.
     *
     * @param {number} max - The maximum value. A valid integer must be
     * less than or equal to this.
     *
     * @param {boolean} emptyOk - Are empty response allowed? Default is false.
     *
     * @returns {function}
     */
    static getIntRangeValidator(min, max, emptyOk = false) {
        return function(value) {
            if (emptyOk && Util.isEmpty(value)) {
                return true;
            }
            let intValue = NaN;
            if (typeof value === 'string') {
                intValue = parseInt(value, 10);
            } else if (typeof value === 'number') {
                intValue = Math.floor(value);
            }
            if (isNaN(intValue)) {
                return false
            }
            return intValue >= min && intValue <= max;
        }
    }
}

module.exports.SetupQuestion = SetupQuestion;
