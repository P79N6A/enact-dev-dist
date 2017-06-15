/*
 *  vdom-server-render.js
 *
 *  Uses a domserver component like react-dom/server to render the HTML string
 *  for a given javascript virtualdom Enact codebase.
 */

var path = require('path'),
	fs = require('fs'),
	findCacheDir = require('find-cache-dir'),
	nodeFetch = require('node-fetch'),
	vm = require('vm'),
	FileXHR = require('./FileXHR');

require('console.mute');

// Setup a generic shared context to run App code within
var m = {
	exports:{}
};
var sandbox = Object.assign({
	require: require,
	requireUncached: require('import-fresh'),
	module: m,
	exports: m.exports,
	__dirname: process.cwd(),
	__filename: 'main.js',
	fetch: nodeFetch,
	Response: nodeFetch.Response,
	Headers: nodeFetch.Headers,
	Request: nodeFetch.Request
}, global);
var context = vm.createContext(sandbox);
var renderTarget = path.join(findCacheDir({name: 'enact-dev', create:true}), './main.js');

/*
	Options:
		server			ReactDomServer or server with compatible APIs
		code			Javascript sourcecode string
		file 			Filename to designate the code from in NodeJS (visually noted within thrown errors)
		locale 			Specific locale to use in rendering
		externals		filepath to external Enact framework to use with rendering
*/
module.exports = {
	stage: function(code, opts) {
		code = code.replace('return __webpack_require__(0);', '__webpack_require__.e = function() {};\nreturn __webpack_require__(0);');

		if(opts.externals) {
			// Add external Enact framework filepath if it's used.
			code = code.replace(/require\(["']enact_framework["']\)/g, 'require("'
					+ path.resolve(path.join(opts.externals, 'enact.js')) +  '")');
		}
		fs.writeFileSync(renderTarget, code, {encoding:'utf8'});
	},

	render: function(opts) {
		var rendered;

		if(opts.locale) {
			sandbox.XMLHttpRequest = sandbox.global.XMLHttpRequest = FileXHR;
		} else {
			delete sandbox.XMLHttpRequest;
			delete sandbox.global.XMLHttpRequest;
		}

		try {
			console.mute();

			if(opts.externals) {
				// Ensure locale switching  support is loaded globally with external framework usage.
				var framework = require(path.resolve(path.join(opts.externals, 'enact.js')));
				sandbox.iLibLocale = sandbox.global.iLibLocale = framework('@enact/i18n/locale');
			} else {
				delete sandbox.iLibLocale;
				delete sandbox.global.iLibLocale;
			}

			m.exports = {};
			vm.runInContext('module.exports = requireUncached("' + path.resolve(renderTarget) + '");', context, {
				filename: opts.file,
				displayErrors: true
			});

			// Update locale if needed.
			if(opts.locale && sandbox.global.iLibLocale && sandbox.global.iLibLocale.updateLocale) {
				console.resume();
				sandbox.global.iLibLocale.updateLocale(opts.locale);
				console.mute();
			}

			rendered = opts.server.renderToString(m.exports['default'] || m.exports);

			console.resume();
		} catch(e) {
			console.resume();
			throw e;
		}
		return rendered;
	},

	unstage: function() {
		if(fs.existsSync(renderTarget)) {
			fs.unlinkSync(renderTarget);
		}
	}
};
