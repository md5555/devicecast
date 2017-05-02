var path = require('path');
var Webcast = require('./Webcast');

var streamingAddress = null;
var webcast = null;

var isStreaming = false;

var getIsStreaming = function () {
    return this.isStreaming;
};

var startStream = function (onStreamingCallback, onErrorCallback, onEndCallback) {

    var self = this;

    if (isStreaming) {

	self.webcast.stop(function(){

	    try {
		var options = {
		    port: 3000,
		    url: 'stream.mp3'
		};

		webcast = new Webcast(options, function(){
		    self.isStreaming = false;
		    onEndCallback();		
		});

		streamingAddress = 'http://' + webcast.ip + ':' + options.port + '/' + options.url;

		this.isStreaming = true;

		onStreamingCallback(streamingAddress);

	    } catch (e) {
		console.log(e);
		streamingAddress = null;
		onErrorCallback(e);
	    }

	});
    } else {
	    try {
		var options = {
		    port: 3000,
		    url: 'stream.mp3'
		};

		webcast = new Webcast(options, function(){
		    self.isStreaming = false;
		    onEndCallback();		
		});

		streamingAddress = 'http://' + webcast.ip + ':' + options.port + '/' + options.url;

		this.isStreaming = true;

		onStreamingCallback(streamingAddress);

	    } catch (e) {
		console.log(e);
		streamingAddress = null;
		onErrorCallback(e);
	    }
    }
};

var stopStream = function () {
	if (webcast) {
	    this.isStreaming = false;
	    webcast.stop();
	    webcast = null;
	}	
};

module.exports = {
    startStream: startStream,
    stopStream: stopStream,
    getIsStreaming: getIsStreaming
};
