const { BagItFile } = require('./bagit_file');
const { Constants } = require('../core/constants');
const { Context } = require('../core/context');
const crypto = require('crypto');
const EventEmitter = require('events');
const fs = require('fs');
const { ManifestParser } = require('./manifest_parser');
const minimatch = require("minimatch")
const os = require('os');
const path = require('path');
const { PluginManager } = require('../plugins/plugin_manager');
const stream = require('stream');
const { TagFileParser } = require('./tag_file_parser');
const { TaskDescription } = require('./task_description');
const { Util } = require('../core/util');

/**
 * Validator validates BagIt packages (tarred or in directory format)
 * according to a BagIt profile.
 *
 * See the validate() method for a list of events.
 *
 */
class Validator extends EventEmitter {

    /**
     * Constructs a new BagIt validator.
     *
     * @param {string} pathToBag is the absolute path the the bag,
     * whether it's a directory or a tar file.
     *
     * @param {BagItProfile} profile is the BagItProfile that describes
     * what consititutes a valid bag.
     *
     */
    constructor(pathToBag, profile) {
        super();
        /**
         * pathToBag is the path to the directory or tar file that
         * contains the bag you want to validate.
         *
         * @type {string}
         */
        this.pathToBag = pathToBag;
        /**
         * profile is the BagItProfile against which we will validate
         * the bag.
         *
         * @type {BagItProfile}
         */
        this.profile = profile;
        /**
         * bagName is the calculated name of the bag, which will be either
         * the name of the directory that contains the bag files, or the name
         * of the tar file, minus the .tar extension. You can override this
         * by setting it explicitly.
         *
         * @type {BagItProfile}
         */
        this.bagName = path.basename(pathToBag, '.tar');
        /**
         * bagRoot is the name of the top-level folder to which a tarred
         * bag untars. The folder name should match the bag name.
         *
         * E.g. "bag123.tar" should untar to bagRoot "bag123"
         *
         * For non-tarred bags, this property will be null.
         *
         * @type {string}
         */
        this.bagRoot = null;
        /**
         * files is a hash of BagItFiles, where the file's path
         * within the bag (relPath) is the key, and the BagItFile
         * object is the value. The hash makes it easy to get files
         * by relative path within the archive (e.g. data/photos/img.jpg).
         *
         * @type {object.<string, BagItFile>}
        */
        this.files = {};
        /**
         * This is a list of manifest algorithms found during an initial
         * scan of the bag. While some BagItProfiles specify that a manifest
         * with algorithm X must be present, the profile does preclude other
         * manifests with different algorithms also being present. It's
         * common among APTrust bags, for example, to find both md5 and sha256
         * manifests. The validator does an initial scan of the bag to find
         * extra manifests so it knows which checksums to run on payload and
         * tag files.
         *
         * If an initial scan reveals manifest-md5.txt and manifest-sha256.txt,
         * the manifestAlgorithmsFoundInBag will contain ["md5", "sha256"].
         *
         * See also {@link _scanBag}.
         *
         * @type {Array<string>}
         */
        this.manifestAlgorithmsFoundInBag = [];
        /**
         * This is a list of tag manifest algorithms found during an initial
         * scan of the bag.
         *
         * If an initial scan reveals tagmanifest-md5.txt and
         * tagmanifest-sha256.txt, tagManifestAlgorithmsFoundInBag will
         * contain ["md5", "sha256"].
         *
         * See also {@link _scanBag}.
         *
         * @type {Array<string>}
         */
        this.tagManifestAlgorithmsFoundInBag = [];
        /**
         * errors is a list of error messages describing problems encountered
         * while trying to validate the bag or specific violations of the
         * BagItProfile that render this bag invalid.
         *
         * @type {Array<string>}
         */
        this.errors = [];
        /**
         * When set to true, this flag tells the validator not to validate
         * the bag serialization format. You'll want to disable this in cases
         * where you're trying to validate an unserialized (i.e. not tarred
         * or zipped or otherwise packaged) bag from a directory against a
         * profile that says the bag must be tarreed, zipped, etc. Because
         * sometimes you build a bag and you want to validate it before you
         * zip it or after you untar it.
         *
         * @type {boolean}
         * @default false
         */
        this.disableSerializationCheck = false;
        /**
         * This is a private internal variable that keeps track of the number
         * of checksum digests currently being calculated. This is part of a
         * lovely hack.
         *
         * @type {number}
         * @default 0
         */
        this._hashesInProgress = 0;
        /**
         * This is a private internal variable that registers a preliminary
         * count of files found in a bag. This count includes tag files and
         * manifests as well as payload files.
         *
         * @type {number}
         * @default 0
         */
        this._initialFileCount = 0;
        /**
         * This is a private internal variable that keeps track of the number
         * of files whose checksums we have compared against checksums in
         * the manifest.
         *
         * @type {number}
         * @default 0
         */
        this._filesChecked = 0;
    }

    /**
     * readingFromTar returns true if the bag being validated is in tar format.
     *
     * @deprecated Will be removed soon.
     *
     * @returns {boolean}
     */
    readingFromTar() {
        // TODO: Remove me!
        return this.pathToBag.endsWith('.tar');
    }

    /**
     * readingFromDir returns true if the bag being validated is
     * unserialized. That is, it is a directory on a file system, and not
     * a tar, zip, gzip, or other single-file format.
     *
     * @returns {boolean}
     */
    readingFromDir() {
        return fs.existsSync(this.pathToBag) && fs.statSync(this.pathToBag).isDirectory();
    }

    /**
     * This returns the file extension of the bag in this.pathToBag.
     * If the bag is a directory, this returns an empty string, but
     * you should still check on your own to see whether pathToBag
     * points to a directory. In the special (and common) case of
     * '.tar.gz' files, this returns '.tar.gz'.
     *
     * @returns {string}
     */
    fileExtension() {
        var ext = path.extname(this.pathToBag);
        if (this.pathToBag.endsWith('.tar.gz')) {
            ext = '.tar.gz';
        }
        return ext;
    }

    /**
     * Returns an array of BagItFile objects that represent payload files.
     *
     * @returns {Array<BagItFile>}
     */
    payloadFiles() {
        return Object.values(this.files).filter(f => f.isPayloadFile());
    }

    /**
     * Returns an array of BagItFile objects that represent payload manifests.
     *
     * @returns {Array<BagItFile>}
     */
    payloadManifests() {
        return Object.values(this.files).filter(f => f.isPayloadManifest());
    }

    /**
     * Returns an array of BagItFile objects that represent tag files.
     *
     * @returns {Array<BagItFile>}
     */
    tagFiles() {
        return Object.values(this.files).filter(f => f.isTagFile());
    }

    /**
     * Returns an array of BagItFile objects that represent tag manifests.
     *
     * @returns {Array<BagItFile>}
     */
    tagManifests() {
        return Object.values(this.files).filter(f => f.isTagManifest());
    }

    /**
     * Returns a reader plugin that is capable of reading the bag we want
     * to validate. Note that this always returns a new reader, so if you
     * call it 20 times, you're going to get 20 individual reader objects.
     *
     * @returns {Plugin}
     */
    getNewReader() {
        var fileExtension = path.extname(this.pathToBag);
        if (this.readingFromDir()) {
            fileExtension = 'directory';
        }
        var plugins = PluginManager.canRead(fileExtension);
        if (!plugins) {
            throw new Error(`No plugins know how to read ${this.pathToBag}`);
        }
        // plugins[0] is a reader plugin (a class) with a constructor
        // that takes pathToBag as its sole param.
        return new plugins[0](this.pathToBag);
    }

    /**
     * validate runs all validation operations on the bag specified in the
     * validator's pathToBag property. This includes:
     *
     * * making sure the untarred bag name matches the tarred bag name
     * * validation checksums for all payload files, and for tag files that have checksums
     * * ensuring there are no extra or missing payload files
     * * ensuring that required tag files and manifests are present and valid
     * * ensuring that required tags are present and, where applicable, have legal values
     *
     * This method emits events "start", "task", "end", and "error".
     */
    validate() {
        this.emit('validateStart', `Validating ${this.pathToBag}`);
        if (!fs.existsSync(this.pathToBag)) {
            let msg = Context.y18n.__('File does not exist at %s', this.pathToBag);
            this.errors.push(msg);
            this.emit('error', msg);
            this.emit('end');
            return;
        }
        if (!this._validateProfile()) {
            this.emit('error', this.errors.join(' '));
            this.emit('end');
            return;
        }
        if (!this._validateSerialization()) {
            this.emit('error', this.errors.join(' '));
            this.emit('end')
            return;
        }

        this.emit('task', new TaskDescription(this.pathToBag, 'start'))

        // Scan the bag for manifests. When that completes, it will
        // call _readBag() to read the contents.
        this._scanBag();
    }

    /**
     * This method does an initial scan of the bag to see what manifests
     * are present. While some BagItProfiles specify that a manifest
     * with algorithm X must be present, the profile does preclude other
     * manifests with different algorithms also being present. It's
     * common among APTrust bags, for example, to find both md5 and sha256
     * manifests. The validator does an initial scan of the bag to find
     * extra manifests so it knows which checksums to run on payload and
     * tag files.
     *
     * If an initial scan reveals manifest-md5.txt and manifest-sha256.txt,
     * the manifestAlgorithmsFoundInBag will contain ["md5", "sha256"].
     *
     * The most common reason for finding multiple manifests in a bag
     * comes from institutions that internally require one checksumming
     * algorithm, and who have to produce bags whose spec requires a
     * different algorithm.
     *
     * The validator will later validate ALL checksums, even those found
     * in manifests that are not part of the {@link BagItProfile}.
     *
     */
    _scanBag() {
        var validator = this;
        var reader = this.getNewReader();
        reader.on('error', function(err) {
            validator.emit('error', err);
        });
        reader.on('entry', function (entry) {
            validator._initialFileCount += 1;
            if (validator.bagRoot == null && validator.readingFromTar()) {
                validator.bagRoot = entry.relPath.split(/\//)[0];
            }
            var relPath = validator._cleanEntryRelPath(entry.relPath);
            if (relPath.match(Constants.RE_MANIFEST) || relPath.match(Constants.RE_TAG_MANIFEST)) {
                var algorithm = relPath.split('-')[1].split('.')[0];
                var list = relPath.match(Constants.RE_MANIFEST) ? validator.manifestAlgorithmsFoundInBag : validator.tagManifestAlgorithmsFoundInBag;
                if (!list.includes(algorithm)) {
                    list.push(algorithm);
                }
            }
        });
        reader.on('end', function() {
            validator._readBag();
        });

        // List the contents of the bag.
        reader.list();
    }

    /**
     * This method reads the contents of the bag. The actual work is done
     * in the callbacks. When reading is complete, this calls
     * _validateFormatAndContents()
     *
     */
    _readBag() {
        // Attach listeners to our reader.
        var validator = this;
        var reader = this.getNewReader();
        reader.on('entry', function (entry) { validator._readEntry(entry) });
        reader.on('error', function(err) { validator.emit('error', err) });

        // Once reading is done, validate all the info we've gathered.
        reader.on('end', function() {
            // Is this really what we want to emit here?
            validator.emit('task', new TaskDescription(validator.pathToBag, 'read'))
            // FileSystemReader emits end event while streamreader is
            // still piping file contents to our hashing algorithms. We want
            // those hash pipes to complete before validating checksums in
            // _validateFormatAndContents(), so we don't wind up with
            // undefined checksums. The lag time between end event and the
            // completion of checksums is usually ~5ms. Not sure of a better
            // way to do this, given that we have an unknown number of pipes
            // on each file. Don't want to go full async with promises, because
            // we don't want 10,000 open file handles. So we have this, which
            // is like a WaitGroup counter in Go or a CountDownLatch in
            // Java. We check every 50ms to see if it has reached zero. At
            // zero, we know all the checksums have completed.
            let hashInterval = setInterval(() => {
                if (validator._hashesInProgress === 0) {
                    clearInterval(hashInterval);
                    validator._validateFormatAndContents();
                }
            }, 50);
        });

        // Read the contents of the bag.
        reader.read();
    }

    /**
     * _validateFormatAndContents is called internally by the public validate()
     * method. While validate() reads the contents of the bag, parses manifests
     * and tag files, this method compares the info in the bag to what the
     * {@link BagItProfile} says is valid.
     *
     * This method is private, and it internal operations are
     * subject to change without notice.
     *
     */
    _validateFormatAndContents() {
        var okToProceed = this._validateUntarDirectory();
        if (okToProceed) {
            // ------------------------------------------
            // TODO: Validate fetch.txt
            // ------------------------------------------
            this._validateRequiredManifests(Constants.PAYLOAD_MANIFEST);
            this._validateRequiredManifests(Constants.TAG_MANIFEST);
            this._validateAllowedManifests(Constants.PAYLOAD_MANIFEST);
            this._validateAllowedManifests(Constants.TAG_MANIFEST);
            this._validateAllowedTagFiles();
            this._validateManifestEntries(Constants.PAYLOAD_MANIFEST);
            this._validateManifestEntries(Constants.TAG_MANIFEST);
            this._validateNoExtraneousPayloadFiles();
            this._validatePayloadOxum();
            this._validateTags();
        }
        this.emit('end')
    }

    /**
     * _validateSerialization checks to see whether or not the bag is
     * in a format that adheres to the profile's serialization rules.
     *
     * For example, if the profile's serialization attribute is "required"
     * and acceptSerialization is "application/tar", then this bag MUST
     * be a tar file.
     *
     * You can disable this check by setting
     * Validator.disableSerializationCheck to true. You would want to do
     * that in cases where you've built a bag and want to validate it
     * before you tar or zip it.
     *
     * @returns {boolean} entry - True if profile is valid, false if not.
     *
     */
    _validateSerialization() {
        var validFormat = true;
        if (!this.disableSerializationCheck) {
            var checkSerializationFormat = true;
            var bagIsDirectory = fs.statSync(this.pathToBag).isDirectory();
            if (this.profile.serialization == 'required') {
                if (bagIsDirectory) {
                    this.errors.push(Context.y18n.__("Profile says bag must be serialized, but it is a directory."));
                    validFormat = false;
                }
            } else if (this.profile.serialization == 'forbidden') {
                if (!bagIsDirectory) {
                    this.errors.push(Context.y18n.__("Profile says bag must not be serialized, but bag is not a directory."));
                    validFormat = false;
                    checkSerializationFormat = false;
                }
            }
            if (!bagIsDirectory && checkSerializationFormat) {
                if (!this._validateSerializationFormat()) {
                    var ext = path.extname(this.pathToBag);
                    this.errors.push(Context.y18n.__("Bag has extension %s, but profile says it must be serialized as of one of the following types: %s.", ext, this.profile.acceptSerialization.join(', ')));
                    validFormat = false;
                }
            }
        } else {
            Context.logger.info(`Validator: Skipping validation of serialization format because disableSerializationCheck is true.`);
        }
        return validFormat;
    }

    /**
     * _validateSerializationFormat checks to see if the bag is in an allowed
     * serialized format. This is called only if necessary.
     *
     * @returns {boolean} entry - True if format is valid, false if not.
     *
     */
    _validateSerializationFormat() {
        var matchesValidExtension = false;
        for (var mimetype of this.profile.acceptSerialization) {
            var extensionRegex = Constants.SERIALIZATION_FORMATS[mimetype];
            if (extensionRegex !== undefined && this.pathToBag.match(extensionRegex)) {
                matchesValidExtension = true;
            }
        }
        return matchesValidExtension;
    }

    /**
     * _validateProfile validates the BagItProfile that will be used to
     * validate the bag. If the profile itself is not valid, we can't proceed.
     *
     * Errors in the BagItProfile will be copied into the validator.errors
     * list.
     *
     * @returns {boolean} entry - True if profile is valid, false if not.
     *
     */
    _validateProfile() {
        if (this.profile == null) {
            this.errors.push(Context.y18n.__("Cannot validate bag because BagItProfile is missing."));
            return false;
        }
        if (!this.profile.validate()) {
            for (let err of Object.values(this.profile.errors)) {
                this.errors.push(`BagItProfile: ${err}`);
            }
            return false;
        }
        return true;
    }

    /**
     * _readEntry reads a single entry from a TarReader or FileSystemReader.
     * An entry represents one file within the bag (any type of file: payload,
     * manifest, tag manifest, or tag file). This method add's the file's metadata
     * to the Validator.files hash, computes the file's checksums, and parses the
     * file's contents if necessary.
     *
     * @param {object} entry - An entry returned by a TarReader or FileSystemReader.
     *
     */
    _readEntry(entry) {
        let validator = this;
        if (entry.fileStat.isFile()) {
            var bagItFile = this._addBagItFile(entry);
            if (Context.slowMotionDelay > 0) {
                setTimeout(() => {
                    validator._readFile(bagItFile, entry.stream)
                }, Context.slowMotionDelay);
            } else {
                this._readFile(bagItFile, entry.stream);
            }
        } else if (entry.fileStat.isDirectory()) {
            var relPath = this._cleanEntryRelPath(entry.relPath);
            if (this.bagRoot == null && relPath == '') {
                this.bagRoot = entry.relPath.replace(/\/$/, ''); // right relpath for untarring
            } else if (this.bagRoot == null && relPath == entry.relPath.replace(/\/$/, '')) {
                this.bagRoot = relPath; // wrong relpath for untarring
            }
            entry.stream.pipe(new stream.PassThrough());
        } else {
            // Skip symlinks, block devices, etc.
            entry.stream.pipe(new stream.PassThrough());
            Context.logger.info(`Validator: ${entry.relPath} as is not a regular file`);
        }
    }

    /**
     * _addBagItFile adds a BagItFile to the Validator.files hash, based on
     * the entry it receives from the reader. At this point, the newly created
     * BagItFile will have its path and stats info, but no parsed data or
     * checksums.
     *
     * @param {object} entry - An entry returned by a TarReader or FileSystemReader.
     *
     * @param {string} entry.relPath - The relative path of the file inside the bag.
     *
     * @param {FileStat|fs.Stat} entry.fileStat - An object containing stats info
     * about the file.
     *
     * @returns {BagItFile} The BagItFile created from the entry object.
     *
     */
    _addBagItFile(entry) {
        this.emit('task', new TaskDescription(entry.relPath, 'add'));
        var relPath = this._cleanEntryRelPath(entry.relPath);
        var absPath = '';
        if (!this.readingFromTar()) {
            absPath = path.join(this.pathToBag, relPath);
            if (os.platform() === 'win32' && relPath.indexOf("\\") > -1) {
                relPath = relPath.replace(/\\/g, '/');
            }
        }
        var bagItFile = new BagItFile(absPath, relPath, entry.fileStat);
        this.files[relPath] = bagItFile;
        var fileType = BagItFile.getFileType(relPath);
        //Context.logger.info(`Validator added ${relPath} as ${fileType}`);
        return bagItFile;
    }

    /**
     * _cleanEntryRelPath removes trailing slashes from relPath. When the
     * validator is reading from a tar file, this also removes the leading
     * bag name from the path. Since tarred bags must untar to a directory
     * whose name matches the bag, relative paths within tar files will
     * always be prefixed with the bag name. To get a true relative path,
     * we have to change "bagname/data/file.txt" to "data/file.txt".
     *
     * @param {string} relPath - The relative path, as we got it from the
     * TarReader or FileSystemReader.
     *
     * @returns {string} A clean version of the relative path.
     *
     */
    _cleanEntryRelPath(relPath) {
        var cleanPath = relPath;
        if (this.readingFromTar()) {
            var tarFileName = path.basename(this.pathToBag, '.tar');
            var re = new RegExp("^" + tarFileName + "/");
            cleanPath = relPath.replace(re, '');
        }
        return cleanPath.replace(/\/$/, '');
    }

    /**
     * _readFile pushes the file's bits through whatever checksum algorithms
     * the {@link BagItProfile} says we're supposed to validate. It also parses
     * the contents of the file, if it happens to be a manifest, tag manifest,
     * or text-based tag file.
     *
     * Note that the read() method of TarReader and FileSystemReader will not
     * advance until we've read the entire stream (or until it closes or errors out).
     *
     * @param {BagItFile} bagItFile - A file inside the directory or tarball.
     *
     * @param {ReadStream} readStream - A stream from which we can read
     * the file's contents.
     */
    _readFile(bagItFile, readStream) {
        var validator = this;
        this._filesChecked += 1;
        let percentComplete = (this._filesChecked / this._initialFileCount) * 100;
        this.emit('task', new TaskDescription(bagItFile.relDestPath, 'checksum', '', percentComplete));

        // Get pipes for all of the hash digests we'll need to calculate.
        // We need to calculate checksums on everything in the bag.
        var pipes = this._getCryptoHashes(bagItFile)

        // For manifests, tag manifests, and tag files, we need to parse
        // file contents as well.
        if (bagItFile.isPayloadManifest() || bagItFile.isTagManifest()) {
            var manifestParser = new ManifestParser(bagItFile);
            pipes.push(manifestParser.stream);
        } else if (bagItFile.isTagFile() && bagItFile.relDestPath.endsWith(".txt")) {
            var tagFileParser = new TagFileParser(bagItFile);
            pipes.push(tagFileParser.stream);
        }

        // Push read errors up to where the user can see them.
        readStream.on('error', function(err) {
            validator.errors.push(`Read error in ${bagItFile.relDestPath}: ${err.toString()}`)
        });

        // Now we can do a single read of the file, piping it through
        // streams for checksum calculations and parsing. This is much
        // more efficient than doing a seperate read for each, especially
        // in bags that use multiple digest algorithms.
        readStream.pause();
        for (var p of pipes) {
            readStream.pipe(p);
        }
        readStream.resume();
        //Context.logger.info(`Validator is running checksums for ${bagItFile.relDestPath}`);
    }

    /**
     * _getCryptoHashes returns a list of prepared cryptographic hashes that
     * are ready to have bits streamed through them. Each hash includes a
     * pre-wired 'end' event that assigns the computed checksum to the
     * BagItFile's checksums hash. For example, a sha256 hash, once the bits
     * have been pushed through it, will set the following in it's event event:
     *
     * @example
     * bagItFile.checksums['sha256'] = "[computed hex value]";
     *
     * @param {BagItFile} bagItFile - A file inside the directory or tarball.
     * This is the file whose checksums will be computed.
     *
     * This method is private, and it internal operations are
     * subject to change without notice.
     *
     * @returns {Array<crypto.Hash>}
     *
     */
    _getCryptoHashes(bagItFile) {
        let validator = this;
        let hashes = [];
        // Put together all of the algorithms we'll need for checksums,
        // filtering out empty strings and duplicates.
        let m = this.profile.chooseManifestAlgorithms('manifest');
        let t = this.profile.chooseManifestAlgorithms('tagmanifest');
        let f = this.manifestAlgorithmsFoundInBag;
        let algorithms = new Set(m.concat(t, f).filter(alg => alg != ''));
        // The done function decreases the validator's internal counter
        // of how many digests are still begin calculated.
        let done = function() { validator._hashCompleted() };
        for (let algorithm of algorithms) {
            hashes.push(bagItFile.getCryptoHash(algorithm, done));
            validator._hashesInProgress++;
        }
        return hashes;
    }

    _hashCompleted() {
        this._hashesInProgress--;
    }

    /**
     * _validateUntarDirectory is for tarred bags only. It checks to see
     * whether the tar file extracts to a directory whose name matches
     * the bag name, minus the ".tar" extension. If it doesn't untar there,
     * this method adds an error to the validation results.
     *
     * E.g. "myBag.tar" should untar to a directory called "myBag"
     *
     * This rule only apples for BagItProfiles where tarDirMustMatchName
     * is true.
     *
     * The official BagIt 1.0 spec at
     * https://tools.ietf.org/html/draft-kunze-bagit-17#section-2 says:
     *
     * `The base directory can have any name.`
     *
     * This method is private, and it internal operations are
     * subject to change without notice.
     *
     * @returns {boolean} - If true, it's ok to proceed with the rest
     * of the validation. If false, validation stops, because no files
     * will be in their expected places.
     *
     */
    _validateUntarDirectory() {
        var okToProceed = true;
        if (this.readingFromTar() && this.profile.tarDirMustMatchName) {
            var tarFileName = path.basename(this.pathToBag, '.tar');
            if (this.bagRoot != tarFileName) {
                this.errors.push(`Bag should untar to directory '${tarFileName}', not '${this.bagRoot}'`);
                okToProceed = false;
            }
        }
        return okToProceed;
    }

    /**
     * _validateRequiredManifests checks to see if the manifests required by
     * the {@link BagItProfile} are actually present in the bag. If they're not,
     * it records the error in the Validator.errors array.
     *
     * This method is private, and it internal operations are
     * subject to change without notice.
     *
     * @param {string} manifestType - The type of manifest to look for.
     * This should be either {@link Constants.PAYLOAD_MANIFEST} or
     * {Constants.TAG_MANIFEST}.
     *
     */
    _validateRequiredManifests(manifestType) {
        var manifestList = this.profile.manifestsRequired;
        if (manifestType === Constants.TAG_MANIFEST) {
            manifestList = this.profile.tagManifestsRequired;
        }
        for (var alg of manifestList) {
            var name = `${manifestType}-${alg}.txt`
            if(this.files[name] === undefined) {
                this.errors.push(`Bag is missing required ${manifestType} ${name}`);
            }
        }
    }


    /**
     * _validateAllowedManifests checks to see if the bag contains manifests
     * not listed in the manifestsAllowed or tagManifestsAllowed list of the
     * {@link BagItProfile}. This records illegal manifests in the
     * Validator.errors array.
     *
     * This method is private, and it internal operations are
     * subject to change without notice.
     *
     * @param {string} manifestType - The type of manifest to look for.
     * This should be either {@link Constants.PAYLOAD_MANIFEST} or
     * {Constants.TAG_MANIFEST}.
     *
     */
    _validateAllowedManifests(manifestType) {
        let allowed = this.profile.manifestsAllowed;
        let foundInBag = this.manifestAlgorithmsFoundInBag;
        if (manifestType === Constants.TAG_MANIFEST) {
            allowed = this.profile.tagManifestsAllowed;
            foundInBag = this.tagManifestAlgorithmsFoundInBag;
        }
        for (var alg of foundInBag) {
            if(!allowed.includes(alg)) {
                this.errors.push(`Bag includes ${manifestType} ${alg}, which is not in the list of allowed ${manifestType}s`);
            }
        }
    }

    /**
     * _validateAllowedTagFiles checks to see if the bag contains tag files
     * not listed in the tagFilesAllowed list of the
     * {@link BagItProfile}. This records illegal tag files in the
     * Validator.errors array.
     *
     * This method is private, and it internal operations are
     * subject to change without notice.
     *
     */
    _validateAllowedTagFiles() {
        let allowed = this.profile.tagFilesAllowed || [];
        let tagFiles = this.tagFiles();
        for (let file of tagFiles) {
            if (file.relDestPath == 'bagit.txt') {
                continue;
            }
            let matchesAllowedPattern = false;
            let fileWasTested = false;
            for (let pattern of allowed) {
                if (Util.isEmpty(pattern) || pattern.trim() == '*') {
                    continue;
                }
                if (minimatch(file.relDestPath, pattern)) {
                    matchesAllowedPattern = true;
                }
                fileWasTested = true;
            }
            //console.log(`${file.relDestPath} Tested: ${fileWasTested}, Allowed: ${matchesAllowedPattern}`)
            if (fileWasTested && !matchesAllowedPattern) {
                this.errors.push(`Tag file ${file.relDestPath} is not in the list of allowed tag files.`);
            }
        }
    }

    /**
     * _validateManifestEntries checks to see that the checksum entries in a
     * payload manifest or tag manifest match the actual computed digests of
     * the files in the bag. It records mismatches in the Validator.errors
     * array.
     *
     * This method is private, and it internal operations are
     * subject to change without notice.
     *
     * @param {string} manifestType - The type of manifest to look for.
     * This should be either {@link Constants.PAYLOAD_MANIFEST} or
     * {Constants.TAG_MANIFEST}.
     *
     */
    _validateManifestEntries(manifestType) {
        var manifests = this.payloadManifests();
        if (manifestType === Constants.TAG_MANIFEST) {
            manifests = this.tagManifests();
        }
        //Context.logger.info(`Validator: Validating ${manifests.length} ${manifestType}s`);
        for(var manifest of Object.values(manifests)) {
            //Context.logger.info(`Validator: Validating ${manifest.relDestPath}`);
            var basename = path.basename(manifest.relDestPath, '.txt');
            var algorithm = basename.split('-')[1];
            for (var filename of manifest.keyValueCollection.keys()) {
                var bagItFile = this.files[filename];
                if (bagItFile === undefined) {
                    this.errors.push(`File '${filename}' in ${manifest.relDestPath} is missing from bag.`);
                    continue;
                }
                var checksumInManifest = manifest.keyValueCollection.first(filename);
                var calculatedChecksum = bagItFile.checksums[algorithm];
                if (checksumInManifest != calculatedChecksum) {
                    this.errors.push(`Bad ${algorithm} digest for '${filename}': manifest says '${checksumInManifest}', file digest is '${calculatedChecksum}'.`);
                }
            }
        }
    }

    /**
     * _validateNoExtraneousPayloadFiles checks for files in the data directory
     * that are not listed in the payload manifest(s). It records offending
     * files in the Validator.errors array.
     *
     * This method is private, and it internal operations are
     * subject to change without notice.
     *
     */
    _validateNoExtraneousPayloadFiles() {
        //Context.logger.info(`Validator: Looking for extraneous payload files in ${this.pathToBag}`);
        for(var manifest of this.payloadManifests()) {
            for (var f of this.payloadFiles()) {
                if (!manifest.keyValueCollection.first(f.relDestPath)) {
                    this.errors.push(`Payload file ${f.relDestPath} not found in ${manifest.relDestPath}`);
                }
            }
        }
    }

    /**
     * _validateTags ensures that all required tag files are present, that
     * all required tags are present, and that all tags have valid values
     * if valid values were defined in the {@link BagItProfile}. This method
     * records all the problems it finds in the Validator.errors array.
     *
     * This method is private, and it internal operations are
     * subject to change without notice.
     *
     */
    _validateTags() {
        //Context.logger.info(`Validator: Validating tags in ${this.pathToBag}`);
        var requiredTags = this.profile.tagsGroupedByFile();
        for (var filename of Object.keys(requiredTags)) {
            //Context.logger.info(`Validator: Validating tags in ${filename}`);
            var tagFile = this.files[filename];
            if (tagFile === undefined) {
                this.errors.push(`Required tag file ${filename} is missing`);
                continue;
            }
            if (tagFile.keyValueCollection == null) {
                this.errors.push(`Tag file ${filename} has no data`);
                continue;
            }
            this._validateTagsInFile(filename, tagFile);
        }
    }

    /**
     * _validateTagsInFile ensures that all required tags in the specified file
     * are present, that all required tags are present, and that all tags have
     * valid values if valid values were defined in the {@link BagItProfile}.
     * This method records all the problems it finds in the Validator.errors
     * array.
     *
     * @param {string} filename - The name of the tag file. E.g. bag-info.txt.
     *
     * @param {BagItFile} tagFile - The tag file whose contents we want to
     * examine.
     *
     * @private
     *
     */
    _validateTagsInFile(filename, tagFile) {
        var requiredTags = this.profile.tagsGroupedByFile();
        for (var tagDef of requiredTags[filename]) {
            var parsedTagValues = tagFile.keyValueCollection.all(tagDef.tagName);
            if (parsedTagValues == null) {
                // Tag was not present at all.
                if (tagDef.required) {
                    this.errors.push(`Required tag ${tagDef.tagName} is missing from ${filename}`);
                }
                continue;
            }
            for (var value of parsedTagValues) {
                if (tagDef.required && value == '') {
                    this.errors.push(`Value for tag '${tagDef.tagName}' in ${filename} is missing.`);
                    continue;
                }
                if (Array.isArray(tagDef.values) && tagDef.values.length > 0 && !Util.listContains(tagDef.values, value)) {
                    this.errors.push(`Tag '${tagDef.tagName}' in ${filename} contains illegal value '${value}'. [Allowed: ${tagDef.values.join(', ')}]`);
                }
            }
        }
    }

    /**
     * _validatePayloadOxum
     *
     * Validates the Payload-Oxum tag, if present, by comparing the number
     * of files and bytes in the bag's payload directory matches what's in
     * the tag.
     *
     * This method is private, and it internal operations are
     * subject to change without notice.
     *
     */
    _validatePayloadOxum() {
        //Context.logger.info(`Validator: Validating Payload-Oxum in ${this.pathToBag}`);
        let found = false;
        let bagInfo = this.files["bag-info.txt"];
        if (bagInfo && bagInfo.keyValueCollection) {
            let oxum = bagInfo.keyValueCollection.first("Payload-Oxum");
            if (oxum) {
                found = true;
                let parts = oxum.split('.');
                let oxumBytes = parseInt(parts[0], 10);
                let oxumFiles = parseInt(parts[1], 10);
                let byteCount = 0;
                let fileCount = 0;
                for (let f of this.payloadFiles()) {
                    fileCount += 1;
                    byteCount += Number(f.size);
                }
                if (oxumFiles != fileCount) {
                    this.errors.push(`Payload-Oxum says there should be ${oxumFiles} files in the payload, but validator found ${fileCount}.`);
                }
                if (oxumBytes != byteCount) {
                    this.errors.push(`Payload-Oxum says there should be ${oxumBytes} bytes in the payload, but validator found ${byteCount}.`);
                }
            }
        }
        if (found === false) {
            Context.logger.info(`Validator: No Payload-Oxum in ${this.pathToBag}`);
        }
    }

}

module.exports.Validator = Validator;
