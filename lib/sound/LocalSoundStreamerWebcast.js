var finder = require('portfinder');
var path = require('path');
var Webcast = require('./WebcastHttp');
var logger = require('../common/logger');
var AssociativeArray = require('associative-array');

var endCallback = null;

function SoundStreamer() {
   this.currentPort = 0;
   this.ports = new AssociativeArray(); 
}

SoundStreamer.prototype.suspend = function() {
    this.webcast.suspend();
}

SoundStreamer.prototype.resume = function() {
    this.webcast.resume();
}

SoundStreamer.prototype.getIsStreaming = function () {
    return this.ports.length > 0;
};

SoundStreamer.prototype.realStartStream = function (onStreamingCallback, onErrorCallback, onEndCallback) {

    var self = this;

    self.endCallback = onEndCallback;

    finder.getPort(function (err, port) {

	    try {

		if (self.webcast == null) {

		    self.webcast = new Webcast(function(port){

		       logger.info("Stopped streaming on "+port);

		       self.ports.remove(port);

		       if (self.ports.length == 0) {
			   logger.info("No active streams...");	
			   self.currentPort = 0;
			   onEndCallback();
		       }

			self.webcast = null;
		   });
		}

		self.webcast.on('close', function() {
		    if (self.endCallback) {
			self.endCallback();
		    }
		});

                self.webcast.startServer('stream.mp3', port);

                var streamingAddress = 'http://' + self.webcast.ip + ':' + port + '/stream.mp3';

                logger.info("streamAddress: "+streamingAddress);
    
		self.currentPort = port;
		self.ports.push(self.currentPort, streamingAddress); 

                onStreamingCallback(streamingAddress);

            } catch (e) {
                console.log(e);
                onErrorCallback(e);
            }
	});
};

SoundStreamer.prototype.startStream = function (onStreamingCallback, onErrorCallback, onEndCallback) {

    var self = this;

    if (self.ports.get(self.currentPort) != null) {
	onStreamingCallback(self.ports.get(self.currentPort));
    }

    self.realStartStream(onStreamingCallback, onErrorCallback, onEndCallback);
};

SoundStreamer.prototype.stopStreamIgnoreCb = function (cb) {

	this.endCallback = null;

	if (this.webcast) {
	    this.webcast.stop();
	    this.webcast = null;
	}
};

SoundStreamer.prototype.stopStream = function (cb) {
	if (this.webcast) {
	    this.webcast.stop(cb);
	    this.webcast = null;
	} else {
	    if (cb) cb();	
	}
};

module.exports = SoundStreamer;
