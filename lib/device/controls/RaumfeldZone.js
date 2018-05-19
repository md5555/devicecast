var util = require('util');
var EventEmitter = require('events').EventEmitter;
var UpnpMediaClientUtils = require('../utils/UpnpMediaClientUtils');
var logger = require('../../common/logger');
var NotificationService = require('../../native/NotificationService');
var MediaRendererClient = require('../../upnp/RendererClient');
var os = require('os');
var castUri = null;
var URL = require('url');
var request = require('request');
var parseString = require('xml2js').parseString;
var stringify = require('json-stringify');

var defaultStreamingOptions = {
    autoplay: true,
    contentType: 'audio/mpeg',
    streamType: 'LIVE',
    metadata: {
        title: os.hostname(), 
        creator: 'DeviceCast',
        type: 'audio',
	duration: Number.MAX_SAFE_INTEGER 
    }
};

function RaumfeldZone(device) {
    this.device = device;

    util.inherits(RaumfeldZone, EventEmitter);
    EventEmitter.call(this);

    var self = this;

    // Instantiate a client with a device description URL (discovered by SSDP)
    try {
    	this.client = new MediaRendererClient(device.xmlRawLocation, device.xml);
    } catch(err) {
	self.emit('error', err);
    }

    // Simply adds in logging for all client event hooks
    UpnpMediaClientUtils.decorateClientMethodsForLogging(this.client);

    this.client.on('error', function(err) {
	self.emit('stopped', null);
    });

    this.client.on('stopped', function() {
 	self.emit('stopped', null);	
    });
}

RaumfeldZone.prototype.destroy = function() {

    this.client.removeAllListeners();
}

RaumfeldZone.prototype.reconfigureZone = function() {
    
    var split = URL.parse(this.device.host);    
    var udn = split.path.substring(0, split.path.length-4);

    var zoneUrl = "http://"+split.hostname+":47365"+udn+"/getZones";
//    var connectUrl = "http://"+split.hostname+":47365"+udn+"/connectRoomToZone?zoneUDN=&roomUDN=";
    var connectUrl = "http://"+split.hostname+":47365"+udn+"/connectRoomToZone";

    logger.info("Getting Zone config ("+this.device.host+"): "+zoneUrl);

    request(zoneUrl.toString(), function(error, response, body) {

	var obj = parseString(body, function(err, result) {

	    if (result === undefined) {
		logger.info("Could not get Zones, no result");
		return;
	    }

	    if (result.zoneConfig.zones != null) {
		logger.info("Zones already exist");
		return;
	    }

	    if (result.zoneConfig.unassignedRooms == null || result.zoneConfig.unassignedRooms.length == 0) {
		logger.info("No unassigned rooms");
		return;
	    }

/*
	    for (var n = 0; n < result.zoneConfig.unassignedRooms.length; n++) {
		
		var udn = result.zoneConfig.unassignedRooms[n].room[0].$.udn;
	        var fqn = connectUrl + udn.substring(5);	
*/

		logger.info("Requesting zone reassignment... "+connectUrl);

		request(connectUrl.toString(), function(error, response, body) {

		    if ((response && response.statusCode == 200)) {
			logger.info("Reconfiguration OK");
		    } else {
			logger.warn("Could not complete zone reconfiguration request: "+(response && response.statusCode));
		    }

		});

/*
		break;
	    }*/

	});
    });

}

RaumfeldZone.prototype.registerErrorHandler = function(handler) {
	this.client.addListener("error", handler);
}

RaumfeldZone.prototype.volumeUp = function() {

	var self = this;

	this.client.getVolume(function(err, result) {
		result = result + 10;
		self.client.setVolume(result);
	});
};

RaumfeldZone.prototype.volumeDown = function() {
  
	var self = this;

	this.client.getVolume(function(err, result) {
		result = result - 10;
		self.client.setVolume(result);
	});
};

RaumfeldZone.prototype.pause = function () {
    this.client.pause();
}

RaumfeldZone.prototype.unpause = function() {

    this.client.play();
}

RaumfeldZone.prototype.play = function (streamingAddress, callback) {
    logger.info("Calling load() on device [%s]", this.device.name + ' - ' + this.device.host);

    this.client.load(streamingAddress, defaultStreamingOptions, function (err, result) {
        if (err) {
            logger.error('Error playing Raumfeld', err);
            NotificationService.notifyCastingStopped(this.device);
        } else {
            NotificationService.notifyCastingStarted(this.device);
            logger.debug('playing ...', result);
            callback();
        }
    }.bind(this));
};

RaumfeldZone.prototype.stop = function (callback) {

    var self = this;

	self.client.stop(function (err, result) {
	    logger.info("Client stop result: "+result);
	    if (callback) callback();
	});
};

module.exports = RaumfeldZone;
