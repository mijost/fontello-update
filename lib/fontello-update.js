var   _       = require('underscore')
	, Q       = require('q')
	, fs      = require('fs')
	, request = require('request')
	, open    = require('open')
	, url     = 'http://fontello.com/'
	, temp    = require('temp')
	, path    = require('path')
;

temp.track();

var AdmZip = require('adm-zip');
var tmpFolder = temp.mkdirSync();

var getSession = function(options)
{
	if (_.isEmpty(options))
		options = {};

	var form     = new (require('form-data'));
	var deferred = Q.defer();

	form.append('config', fs.createReadStream(options.config));
	form.submit(url, function(error, res) {
		res.setEncoding('utf8');
		res.on('data', function(data) {
			deferred.resolve(data);
		});
	});

	return deferred.promise;
}

var downloadPackage = function(session, dest)
{
	var deferred = Q.defer();

	var req = request.get(url + session + '/get').on('response', function (res) {
		if ('404' == res.statusCode) {
			deferred.reject(new Error('No font config found for session ' + session + '.'));
		} else {
			var r = req.pipe(fs.createWriteStream(dest));
			 r.on('close', function() { deferred.resolve(true) });
			 r.on('error', function(error) { deferred.reject(error) });
		}
	});

	return deferred.promise;
}

var unzipPackage = function(archive, session, options)
{
	var zip      = new AdmZip(archive)
	   , entries = zip.getEntries()
	   , dest    = process.cwd() + '/' + options.config
	;

	entries.forEach(function(entry) {
		var name = entry.entryName.substring(entry.entryName.indexOf('/') + 1)

		if ('config.json' == name)
		{
			zip.extractEntryTo(entry.entryName, tmpFolder, false, options.overwrite);

			// Read uncompressed config.
			var config = require(path.join(tmpFolder, 'config.json'));

			// Added session to config.
			config.session = session;

			fs.writeFileSync(dest, JSON.stringify(config, null, '\t'));
		}
		else if ('font/' == name&& !options.updateConfigOnly)
		{
			zip.extractEntryTo(entry.entryName, options.fonts, false, options.overwrite);
		}
		else if ('css/' == name && !options.updateConfigOnly)
		{
			zip.extractEntryTo(entry.entryName, options.css, false, options.overwrite);
		}

	});
}

var updateConfig = function(session, options)
{
	var deferred = Q.defer();
	var zipFile  = path.join(temp.mkdirSync(), 'fontello.zip');

	downloadPackage(session, zipFile)
		.then(function() {
			unzipPackage(zipFile, session, options);
			deferred.resolve(true);
		})
		.catch(function(error) {
			console.log(error);
			deferred.reject(error);
		})
	;

	return deferred.promise;
}

var fontelloUpdate = function(options)
{
	_.defaults(options, {
		  session: null
		, config: 'config.json'
		, overwrite: true
		, fonts: 'font'
		, css: 'css'
		, open: false
		, updateConfigOnly: false
	});

	var deferred = Q.defer();

	if (_.isNull(options.session)) {
		// Try to get session from fontello config.
		var config = require(process.cwd() + '/' + options.config);

		if (_.isEmpty(config.session)) {
			getSession(options)
				.then(function(session) {
					config.session = session;
					fs.writeFileSync(options.config, JSON.stringify(config, null, '\t'));

					if (options.open)
						open(url + session);

					return updateConfig(session, options);
				});
		} else {
			updateConfig(config.session, options)
				.then(function() {
					deferred.resolve(true);
				})
				.catch(function(error) {
					console.log(error);
					// Remove session field from fontello config (since it failed) and try again.
					config.session = undefined;
					fs.writeFileSync(options.config, JSON.stringify(config, null, '\t'));
					return fontelloUpdate(options);
				});
		}
	}

	return deferred.promise;
}

var fontelloOpen = function(options)
{
	_.defaults(options, {	
		  session: null
		, config: 'config.json'
	});
        
        var deferred = Q.defer();

	if (_.isNull(options.session)) {
		// Try to get session from fontello config.
		var config = require(process.cwd() + '/' + options.config);

		getSession(options)
			.then(function(session) {
				config.session = session;
				fs.writeFileSync(options.config, JSON.stringify(config, null, '\t'));
				open(url + session);
				setTimeout(function(){deferred.resolve(true);}, 1000);
			});
	}

	return deferred.promise;
}

var fontelloNew = function(options)
{
    _.defaults(options, {	
		  session: null
		, config: 'config.json'
	});
    //TODO: check if file exist and fail
    var config = {};
    config.name = '';
    config.css_prefix_text = 'icon-';
    config.css_use_suffix = '';
    config.hinting = true;
    config.units_per_em = 1000;
    config.ascent = 850;
    config.glyphs = [];
    fs.writeFileSync(options.config, JSON.stringify(config, null, '\t'));
}

module.exports = {
    fontelloUpdate: function(options){
	return fontelloUpdate(options);
    },
    fontelloOpen: function(options){
	return fontelloOpen(options);
    },
    fontelloNew: function(options){
        return fontelloNew(options);
    }
}
