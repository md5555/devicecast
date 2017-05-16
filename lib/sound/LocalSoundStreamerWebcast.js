var finder = require('portfinder');
var path = require('path');
var Webcast = require('./WebcastHttp');
var logger = require('../common/logger');

function SoundStreamer() {
   this.currentPort = 0;
   this.ports = new Array(); 
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

    finder.getPort(function (err, port) {

	    try {
	       self.webcast = new Webcast(function(port){

		   logger.info("Stopped streaming on "+port);

		   delete self.ports[port];

		   if (self.ports.length == 0) {
		       logger.info("No active streams...");	
		       self.currentPort = 0;
		   }
	       });

                self.webcast.startServer('stream.mp3', port);

                var streamingAddress = 'http://' + self.webcast.ip + ':' + port + '/stream.mp3';

                logger.info("streamAddress: "+streamingAddress);
    
		self.currentPort = port;
		self.ports[self.currentPort] = streamingAddress; 

                onStreamingCallback(streamingAddress);

            } catch (e) {
                console.log(e);
                onErrorCallback(e);
            }
	});
};

SoundStreamer.prototype.startStream = function (onStreamingCallback, onErrorCallback, onEndCallback) {

    var self = this;

    self.realStartStream(onStreamingCallback, onErrorCallback, onEndCallback);
};

SoundStreamer.prototype.stopStream = function (cb) {
	if (this.webcast) {
	    this.webcast.stop(cb);
	} else {
	    if (cb) cb();	
	}
};

module.exports = SoundStreamer;
