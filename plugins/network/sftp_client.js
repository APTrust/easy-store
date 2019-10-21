const Client = require('ssh2-sftp-client');
const { Context } = require('../../core/context');
const fs = require('fs');
const { Plugin } = require('../plugin');
const { Util } = require('../../core/util');


class SFTPClient extends Plugin {

    /**
     * Creates a new SFTPClient.
     *
     * @param {StorageService} storageService - A StorageService record that
     * includes information about how to connect to a remote SFTP service.
     * This record includes the host URL, default folder, and connection
     * credentials.
     */
    constructor(storageService) {
        super();
        this.storageService = storageService;
    }

    /**
     * Returns a {@link PluginDefinition} object describing this plugin.
     *
     * @returns {PluginDefinition}
     */
    static description() {
        return {
            id: 'aa7bb977-59b9-4f08-99a9-dfcc16632728',
            name: 'SFTPClient',
            description: 'Built-in DART SFTP network client',
            version: '0.1',
            readsFormats: [],
            writesFormats: [],
            implementsProtocols: ['sftp'],
            talksToRepository: [],
            setsUp: []
        };
    }

    /**
     * Uploads a file to the remote server. The name of the directory into
     * which the file will be uploaded is determined by the bucket property
     * of the {@link StorageService} passed in to this class'
     * constructor.
     *
     * @param {string} filepath - The path to the local file to be uploaded
     * to the SFTP server.
     *
     * @param {string} keyname - This name to assign the file on the remote
     * server. This parameter is optional. If not specified, it defaults to
     * the basename of filepath. That is, /path/to/bagOfPhotos.tar would
     * default to bagOfPhotos.tar.
     *
     */
    upload(filepath, keyname) {
        if (!filepath) {
            throw new Error('Param filepath is required for upload.');
        }
        if (!keyname) {
            keyname = path.basename(filepath);
        }
        let client = this.connect();
    }


    /**
     * Downloads a file from the remote server. The name of the default
     * directory on the remote server is determined by the bucket property
     * of the {@link StorageService} passed in to this class'
     * constructor.
     *
     * @param {string} filepath - The local path to which we should save the
     * downloaded file.
     *
     * @param {string} keyname - This name of the file to download from
     * the remote server.
     *
     */
    download(filepath, keyname) {

    }

    /**
     * Lists files on a remote SFTP server. NOT YET IMPLEMENTED.
     *
     */
    list() {
        throw 'SFTPClient.list() is not yet implemented.';
    }


    /**
     * Returns an open connection to the remote sftp server, or throws
     * an exception.
     *
     * @returns {Client}
     */
    async _connect() {
        if (!this.storageService) {
            throw Context.y18n.__("SFTP client cannot establish a connection without a StorageService object");
        }
        let connSettings = {
            host: this.storageService.host,
            port: this.storageService.port || 22,
            username: this.storageService.login
        }
        if (!Util.isEmpty(this.storageService.loginExtra)) {
            connSettings.privateKey = this._loadPrivateKey;
        } else if (!Util.isEmpty(this.storageService.password)) {
            Context.logger.info(Context.y18n.__("Using password for SFTP connection"));
            connSettings.password = this.storageService.password
        } else {
            let msg = Context.y18n.__("Storage service %s has no password or key file to connect to remote server", this.storageService.name);
            Context.logger.error(msg);
            throw msg;
        }
        let client = await new Client().connect(connSettings);
        return client;
    }

    /**
     * Loads a private key to be used in establishing an SFTP connection.
     *
     */
    _loadPrivateKey() {
        Context.logger.info(Context.y18n.__("Checking %s for RSA key for SFTP connection", this.storageService.loginExtra));
        if(!fs.existsSync(this.storageService.loginExtra)) {
            throw Context.y18n.__("Private key file %s is missing for storage service %s", this.storageService.loginExtra, this.storageService.name);
        }
        if(!Util.canRead(this.storageService.loginExtra)) {
            throw Context.y18n.__("You do not have permission to read the private key file %s for storage service %s", this.storageService.loginExtra, this.storageService.name);
        }
        let pk = '';
        try {
            pk = fs.readFileSync(this.storageService.loginExtra);
        } catch (ex) {
            throw Context.y18n.__("Error reading private key file %s for storage service %s: %s", this.storageService.loginExtra, this.storageService.name, ex.toString());
        }
        return pk;
    }

    /**
     * @event SFTPClient#start
     * @type {string} A message indicating that the upload or download is starting.
     *
     * @event SFTPClient#warning
     * @type {string} A warning message describing why the SFTPClient is retrying
     * an upload or download operation.
     *
     * @event SFTPClient#error
     * @type {OperationResult} Contains information about what went wrong during
     * an upload or download operation.
     *
     * @event SFTPClient#finish
     * @type {OperationResult} Contains information about the outcome of
     * an upload or download operation.
     */
}

module.exports = SFTPClient;