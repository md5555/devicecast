var UPnP = require('./UPnP');
var validUrl = require('valid-url');
var request = require('request');
var logger = require('../../common/logger');
const Ssdp = require('upnp-ssdp');
const Browser = require('../controls/Browser');
var client = new Ssdp();
var browser = null; 
var deviceHandler = null;

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

var initialize = function(onDeviceFoundHandler) {

    var self = this;
    self.deviceHandler = onDeviceFoundHandler;

    client.on('up', function (address) {
           logger.info('Found Device [%s]', address);

	    if (isUrl(address)) {
		attemptToLoadXml(address, function (rawXml) {

		    if (rawXml == null) {
			return;
		    }

	   	    var name = getFriendlyName(rawXml);

		    var device = new UPnP({
			name: name,
			address: address,
			xml: rawXml,
			type: "upnp"
		    });

		    device.xmlRawLocation = address;

		    self.deviceHandler(device);
		})
	    } 
	});
	client.on('down', function (address) {
	});
	client.on('error', function (err) {
	});
}

var lookUpDevices = function () {

    logger.info("Refreshing device list...");

    client.search('urn:schemas-upnp-org:device:MediaRenderer:1');

    if (browser != null) {
	browser.stop();
	browser.destroy();
    }

    browser = new Browser();
    
    var self = this;

    browser.on('deviceOn', function (device) {
	self.deviceHandler(device);
    });	
};

function isUrl(url) {
    return validUrl.isUri(url);
}

module.exports = {
    lookUpDevices: lookUpDevices,
    initialize: initialize
};
