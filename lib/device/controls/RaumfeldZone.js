var util = require('util');
var EventEmitter = require('events').EventEmitter;
var UpnpMediaClientUtils = require('../utils/UpnpMediaClientUtils');
var logger = require('../../common/logger');
var NotificationService = require('../../native/NotificationService');
var MediaRendererClient = require('upnp-mediarenderer-client');
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

    // Instantiate a client with a device description URL (discovered by SSDP)
    try {
    	this.client = new MediaRendererClient(device.xmlRawLocation);
    } catch(err) {
	self.emit('error', err);
    }

    // Simply adds in logging for all client event hooks
    UpnpMediaClientUtils.decorateClientMethodsForLogging(this.client);
	
    var self = this;

    this.client.on('stopped', function() {
 	self.emit('stopped', null);	
    });

    this.client.on('loading', function(e) {
	   self.client.callAction('RenderingControl', 'GetMediaInfo', { InstanceID: this.instanceId}, function(err, result) {
		logger.info("uri: %s", result.CurrentURI);
		if (result.CurrentURI != null && (result.CurrentURI.localeCompare(self.castUri) != 0)) {
		   self.emit('stopped', null);
		}
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

RaumfeldZone.prototype.play = function (streamingAddress, callback) {
    logger.info("Calling load() on device [%s]", this.device.name + ' - ' + this.device.host);

    this.castUri = streamingAddress;

    this.client.load(streamingAddress, defaultStreamingOptions, function (err, result) {
        if (err) {
            logger.error('Error playing jongo', err);
            NotificationService.notifyCastingStopped(this.device);
            callback(err);
        } else {
            NotificationService.notifyCastingStarted(this.device);
            logger.debug('playing ...', result);
            callback(null, result);
        }
    }.bind(this));
};

RaumfeldZone.prototype.stop = function (callback) {
    this.client.stop(function (err, result) {
        if (err) {
            logger.error('Error stopping jonog', err);
            callback(err, null);
        } else {
            logger.debug('Stopped jongi', result);
            NotificationService.notifyCastingStopped(this.device);
            callback(null, result);
        }
    }.bind(this));
};

module.exports = RaumfeldZone;
