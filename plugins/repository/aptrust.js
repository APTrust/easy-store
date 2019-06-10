const { AppSetting } = require('../../core/app_setting');
const { Plugin } = require('../plugin');
const { RemoteRepository } = require('../../core/remote_repository');
const path = require('path');
const request = require('request');
const Templates = require('../../ui/common/templates');

/**
 * APTrustClient provides methods for querying an APTrust repository
 * that conform to the DART repository interface.
 *
 *
 */
class APTrustClient extends Plugin {
    /**
     *
     */
    constructor(remoteRepository) {
        super();
        let setting = AppSetting.find('name', 'Institution Domain');
        if (setting) {
            this.institutionDomain = setting.value;
        }
        this.repo = remoteRepository;
        this.objectsUrl = `${this.repo.url}/member-api/v2/objects/?page=1&per_page=50&sort=date&state=A`
        this.itemsUrl = `${this.repo.url}/member-api/v2/items/?page=1&per_page=50&sort=date`

        this.objectsTemplate = Templates.compile(path.join(__dirname, 'aptrust', 'objects.html'));
        this.itemsTemplate = Templates.compile(path.join(__dirname, 'aptrust', 'work_items.html'));
    }

    /**
     * Returns a {@link PluginDefinition} object describing this plugin.
     *
     * @returns {PluginDefinition}
     */
    static description() {
        return {
            id: 'c5a6b7db-5a5f-4ca5-a8f8-31b2e60c84bd',
            name: 'APTrustClient',
            description: 'APTrust repository client. This allows DART to talk to the APTrust demo and/or production repository.',
            version: '0.1',
            readsFormats: [],
            writesFormats: [],
            implementsProtocols: [],
            talksToRepository: ['aptrust'],
            setsUp: []
        };
    }

    provides() {
        return [
            {
                title: 'Ingested Objects',
                description: 'Recently ingested objects.',
                method: this.recentIngests
            },
            {
                title: 'Work Items',
                description: 'A list of tasks.',
                method: this.recentWorkItems
            }
        ];
    }


    /**
     * This returns a list of recently ingested objects. The return value
     * is a string of HTML to be displayed directly in the dashboard.
     *
     * @returns {Promise}
     */
    recentIngests() {
        return this._doRequest(this.objectsUrl, this.formatObjects);
    }

    /**
     * This returns a list of Pharos Work Items, which describe pending
     * ingest requests and other tasks. Items uploaded for ingest that have
     * not yet been processed will be in this list.
     *
     * @returns {Promise}
     */
    recentWorkItems() {
        return this._doRequest(this.itemsUrl, this.formatWorkItems);
    }


    _doRequest(url) {
        let promise = new Promise(function(resolve, reject) {
            aptrust._request(url, function(data) {
                let html = '';
                resolve(html);
            }, function(error) {
                reject(error);
            });
        });
    }

    formatObjects(data) {

    }

    formatWorkItems(data) {

    }


    /**
     * This returns true if the RemoteRepository object has enough info to
     * attempt a connection. (For APTrust, we require url, userId, and apiToken.
     *
     * @returns {boolean}
     */
    hasRequiredConnectionInfo() {
        return this.repo.url && this.repo.user && this.repo.apiKey;
    }

    /**
     * Returns the HTTP request headers our client will need to send when
     * connecting to Pharos.
     *
     * @returns {object}
     */
    _getHeaders() {
        return {
            'User-Agent': `DART ${Context.dartReleaseNumber()} / Node.js request`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Pharos-API-User': this.repo.getValue('userId'),
            'X-Pharos-API-Key': this.repo.getValue('apiToken')
        }
    }

    _request(url, onSuccess, onError) {
        let opts = {
            url: url,
            method: 'GET',
            headers: this._getHeaders()
        }
        Console.logger.info(`Requesting ${url}`);
        request(opts, (err, res, body) => {
            if (err) {
                Context.logger.error(`Error from ${url}:`);
                Context.logger.error(err);
                onError(err, res, body);
            }
            if (response.statusCode == 200) {
                onSuccess(JSON.parse(body));
            }
        });
    }

}

module.exports = APTrustClient;
