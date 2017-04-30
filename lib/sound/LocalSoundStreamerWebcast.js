var path = require('path');
var Webcast = require('./Webcast');

var streamingAddress = null;

var startStream = function (onStreamingCallback, onErrorCallback, onEndCallback) {
    try {
        var options = {
            port: 3000,
            url: 'stream.mp3'
        };

        var webcast = new Webcast(options, onEndCallback);

        streamingAddress = 'http://' + webcast.ip + ':' + options.port + '/' + options.url;
        onStreamingCallback(streamingAddress);

    } catch (e) {
        console.log(e);
        streamingAddress = null;
        onErrorCallback(e);
    }
};

var stopStream = function () {
};

module.exports = {
    startStream: startStream,
    stopStream: stopStream
};
