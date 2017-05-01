var util = require('util');
var EventEmitter = require('events').EventEmitter;
var UpnpMediaClientUtils = require('../utils/UpnpMediaClientUtils');
var logger = require('../../common/logger');
var NotificationService = require('../../native/NotificationService');
var MediaRendererClient = require('../../upnp/RendererClient');
var castUri = null;
var os = require('os');

var defaultStreamingOptions = {
    autoplay: true,
    contentType: 'audio/mpeg3',
    streamType: 'LIVE',
    metadata: {
        title: os.hostname(), 
        creator: 'DeviceCast',
        type: 'audio'
    }
};

function RaumfeldZone(device) {
    this.device = device;

    util.inherits(RaumfeldZone, EventEmitter);
    EventEmitter.call(this);

    var self = this;

    // Instantiate a client with a device description URL (discovered by SSDP)
    try {
    	this.client = new MediaRendererClient(device.xmlRawLocation);
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

RaumfeldZone.prototype.play = function (streamingAddress, callback) {
    logger.info("Calling load() on device [%s]", this.device.name + ' - ' + this.device.host);

    this.castUri = streamingAddress;

    this.client.load(streamingAddress, defaultStreamingOptions, function (err, result) {
        if (err) {
            logger.error('Error playing Raumfeld', err);
            NotificationService.notifyCastingStopped(this.device);
            callback(err);
        } else {
            NotificationService.notifyCastingStarted(this.device);
            logger.debug('playing ...', result);
            callback(null, result);
        }
    }.bind(this));
};

RaumfeldZone.prototype.stop = function () {
    this.client.stop(function (err, result) {
        if (err) {
        } else {
            NotificationService.notifyCastingStopped(this.device);
        }
    }.bind(this));
};

module.exports = RaumfeldZone;
