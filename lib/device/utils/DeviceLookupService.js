var UPnP = require('./UPnP');
var validUrl = require('valid-url');
var request = require('request');
var logger = require('../../common/logger');
const Ssdp = require('./DcSsdp');
const Browser = require('../controls/Browser');
var client = null; 
var browser = null; 
var deviceHandler = null;
var deviceDownHandler = null;

function getFriendlyName(xml) {
    return xml.match(/<friendlyName>(.+?)<\/friendlyName>/)[1];
}

function attemptToLoadXml(url, handler) {
    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            logger.verbose('Loaded XML schema for device', {
                url: url,
                body: body
            });
            handler(body);
        } else {
            logger.info('Failed to loaded XML schema for device', {url: url});
            handler(null);
        }
    }).on('error', function (err) {
        logger.error('Error when attempting to load schema for device', {
            url: url,
            error: err
        });
        handler(null);
    });
}

var stopSearch = function() {

    if (client != null) {
	client.removeAllListeners();
	client.destroy(); 
    }

    if (browser != null) {
	browser.removeAllListeners();
	browser.destroy();
    }

    client = null;
    browser = null;

    foundDevices = [];
}

var initialize = function(onDeviceFoundHandler, onDownHandler) {

    var self = this;
    self.deviceHandler = onDeviceFoundHandler;
    self.deviceDownHandler = onDownHandler;
}

var cb = null;

var foundDevices = [];

var lookUpDevices = function () {

    if (client != null && browser != null) {
	return;
    }

    logger.info("Refreshing device list...");

    client = new Ssdp();

    var self = this;

    client.on('up', function (address) {

	    if (isUrl(address)) {

		for (var n = 0; n < foundDevices.length; n++) {
		    if (address === foundDevices[n]) {
			return;
		    }
		}	

		attemptToLoadXml(address, function (rawXml) {

		    if (rawXml == null) {
			return;
		    }

		    logger.info('Found Device [%s]', address);

		    foundDevices.push(address);	    

	   	    var name = getFriendlyName(rawXml);

		    var device = new UPnP({
			name: name,
			address: address,
			xml: rawXml,
			type: "upnp"
		    });

		    device.xmlRawLocation = address;

		    self.deviceHandler(device);
		});
	    } 
	});
	client.on('down', function (address) {
	    self.deviceDownHandler(address);
	});
	client.on('error', function (err) {
	});

    client.search('urn:schemas-upnp-org:device:MediaRenderer:1');

    var self = this;

    this.cb = function(device) {
	self.deviceHandler(device);
    }

    browser = new Browser();
    browser.on('deviceOn', this.cb);	
};

function isUrl(url) {
    return validUrl.isUri(url);
}

module.exports = {
    lookUpDevices: lookUpDevices,
    initialize: initialize,
    stopSearch: stopSearch
};
