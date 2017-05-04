var finder = require('portfinder');
var path = require('path');
var Webcast = require('./WebcastHttp');
var logger = require('../common/logger');

function SoundStreamer(onEndCallback) {
   this.isStreaming = false;
   this.streamingAddress = null;
   var self = this;
   this.webcast = new Webcast(function(port){
       logger.info("Stopped streaming on "+port);
       self.isStreaming = false;
   });
}

SoundStreamer.prototype.suspend = function() {
    this.webcast.suspend();
}

SoundStreamer.prototype.resume = function() {
    this.webcast.resume();
}

SoundStreamer.prototype.getIsStreaming = function () {
    return this.isStreaming;
};

SoundStreamer.prototype.realStartStream = function (onStreamingCallback, onErrorCallback, onEndCallback) {

    var self = this;

    finder.getPort(function (err, port) {

	    try {
                self.webcast.startServer('stream.mp3', port);

                self.isStreaming = true;
                self.streamingAddress = 'http://' + self.webcast.ip + ':' + port + '/stream.mp3';

                logger.info("isStreaming: "+self.isStreaming);
                logger.info("streamAddress: "+self.streamingAddress);

                onStreamingCallback(self.streamingAddress);

            } catch (e) {
                console.log(e);
                self.streamingAddress = null;
                self.isStreaming = false;
                onErrorCallback(e);
            }
	});
};

SoundStreamer.prototype.startStream = function (onStreamingCallback, onErrorCallback, onEndCallback) {

    var self = this;

    logger.info("isStreaming at start: "+self.isStreaming);

    if (self.isStreaming && self.webcast) {
	    onStreamingCallback(self.streamingAddress);
    } else {
        self.realStartStream(onStreamingCallback, onErrorCallback, onEndCallback);
    }
};

SoundStreamer.prototype.stopStream = function () {
	if (this.webcast) {
	    this.webcast.stop();
	}	
};

module.exports = SoundStreamer;
