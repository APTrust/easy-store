const { Context } = require('../../core/context');
const path = require('path');
const { SetupBase } = require('./setup_base');

/**
 * DPNSetup provides a walk-through setup for DART users
 * to create a basic DPN environment.
 *
 */
class DPNSetup extends SetupBase {

    constructor() {
        super(path.join(__dirname, 'dpn'));
    }

    /**
     * Returns a {@link PluginDefinition} object describing this plugin.
     *
     * @returns {PluginDefinition}
     */
    static description() {
        return {
            id: 'ba6cf526-f73a-454c-b0b3-6378edc3851a',
            name: 'DPNSetup',
            description: Context.y18n.__('This helps you set up the basic DPN configuration.'),
            version: '0.1',
            readsFormats: [],
            writesFormats: [],
            implementsProtocols: [],
            talksToRepository: [],
            setsUp: ['dpn']
        };
    }
}

module.exports = DPNSetup;