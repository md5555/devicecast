var UPnP = require('./UPnP');
var validUrl = require('valid-url');
var request = require('request');
var logger = require('../../common/logger');
const Ssdp = require('upnp-ssdp');
var client = new Ssdp();

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

var lookUpDevices = function (onDeviceFoundHandler) {

    logger.info("Refreshing device list...");

	client.on('up', function (address) {
           logger.info('Found Device [%s]', address);

	    if (isUrl(address)) {
		attemptToLoadXml(address, function (rawXml) {

	   	    var name = getFriendlyName(rawXml);

		    var device = new UPnP({
			name: name,
			address: address,
			xml: rawXml,
			type: "upnp"
		    });

		    device.xmlRawLocation = address;

		    onDeviceFoundHandler(device);
		})
	    } 
	});
	client.on('down', function (address) {
	});
	client.on('error', function (err) {
	});

	client.search('urn:schemas-upnp-org:device:MediaRenderer:1');
};

function isUrl(url) {
    return validUrl.isUri(url);
}

module.exports = {
    lookUpDevices: lookUpDevices
};
