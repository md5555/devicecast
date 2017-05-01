var path = require('path');
var Webcast = require('./Webcast');

var streamingAddress = null;
var webcast = null;

var startStream = function (onStreamingCallback, onErrorCallback, onEndCallback) {
    try {
        var options = {
            port: 3000,
            url: 'stream.mp3'
        };

        webcast = new Webcast(options, onEndCallback);

        streamingAddress = 'http://' + webcast.ip + ':' + options.port + '/' + options.url;
        onStreamingCallback(streamingAddress);

    } catch (e) {
        console.log(e);
        streamingAddress = null;
        onErrorCallback(e);
    }
};

var stopStream = function () {
	if (webcast) {
	    webcast.stop();
	}	
};

module.exports = {
    startStream: startStream,
    stopStream: stopStream
};
