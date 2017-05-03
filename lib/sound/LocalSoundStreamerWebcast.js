var finder = require('portfinder');
var path = require('path');
var Webcast = require('./Webcast');
var logger = require('../common/logger');

var streamingAddress = null;
var webcast = null;

var isStreaming = false;

var getIsStreaming = function () {
    return this.isStreaming;
};

var startStream = function (onStreamingCallback, onErrorCallback, onEndCallback) {

    var self = this;

    if (isStreaming) {
        onStreamingCallback(self.streamingAddress);
    } else {

	  finder.getPort(function (err, port) {

		    try {
			var options = {
			    port: port,
			    url: 'stream.mp3'
			};

			self.isStreaming = true;

			self.webcast = new Webcast(options, function(){
        		    logger.info("Stopped streaming on %s", port);
			    self.isStreaming = false;
			    onEndCallback();		
			});

			self.streamingAddress = 'http://' + self.webcast.ip + ':' + options.port + '/' + options.url;

			onStreamingCallback(self.streamingAddress);

		    } catch (e) {
			    console.log(e);
			    self.streamingAddress = null;
			    onErrorCallback(e);
		    }
		});
    }
};

var stopStream = function () {
	if (this.webcast) {
	    this.webcast.stop();
	    this.webcast = null;
	}	
};

module.exports = {
    startStream: startStream,
    stopStream: stopStream,
    getIsStreaming: getIsStreaming
};
