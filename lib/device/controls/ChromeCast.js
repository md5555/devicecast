var util = require('util');
var EventEmitter = require('events').EventEmitter;
var NotificationService = require('../../native/NotificationService');
var logger = require('../../common/logger');
var Device = require('./Device');

function ChromeCast(device) {

    this.dv = device;
}

ChromeCast.prototype.play = function (streamingAddress, callback) {

    var self = this;

    this.dv.play(streamingAddress, 0, function() {
        NotificationService.notifyCastingStarted(self.dv);
	if (callback) callback();
    });
};

ChromeCast.prototype.stop = function (callback) {

    this.dv.close(new function() {
	callback();
    }); 
};

module.exports = ChromeCast;
