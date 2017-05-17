var fs = require('fs');
var utils = require('./utils');
var url = require('url');
var lame = require('lame');
var audio = require('osx-audio');
var debug = require('debug')('webcast');
var logger = require('../common/logger');
const ForeverAgent = require('forever-agent');
const http = require('http');

var Webcast = function (endCb) {

    var self = this;

    self.listeners = [];
    self.port = 0;

    this.endCb = function () {
        self.chunks = [];
        endCb(self.port);
    };

    this.lameOptions = {
        // input
        channels: 2,        // 2 channels (left and right)
        bitDepth: 16,       // 16-bit samples
        sampleRate: 44100,  // 44,100 Hz sample rate

        // output
        bitRate: 192,
        outSampleRate: 44100,
        mode: lame.DUALCHANNEL,
        float: false
    };

    // we need to get the address of the local interface
    this.ip = utils.getLocalIp("en0");
    this.agent = new ForeverAgent();

    this.sendData = function(data) {
	self.sendChunk(data);
    };

    this.encoder = new lame.Encoder(self.lameOptions);
    this.input = new audio.Input();

    return this;
};

Webcast.prototype.initializeStreams = function () {

    var self = this;

    this.encoder.on('data', self.sendData);
    this.input.on('data', function (data) {
        self.encoder.write(data);
    });

    this.encoder.resume();
    this.input.resume();

};

Webcast.prototype.startServer = function(url, port) {

    var self = this;

    this.initializeStreams();

    this.port = port;

    this.server = http.createServer(function (req, res) {

        res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Transfer-Encoding': 'chunked'
        });

        self.addListener(res, req);

        res.on('close', function () {
            self.removeListener(res, req);
        });
    });

    this.server.on('close', function (socket) {
        self.endCb();
    });

    this.server.on('clientError', function (err, socket) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });

    this.server.on('upgrade', function (req, socket, head) {

        socket.write('HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
            'Upgrade: WebSocket\r\n' +
            'Connection: Upgrade\r\n' +
            '\r\n');

        socket.pipe(socket); // echo back
    });

    this.server.listen(port);

    logger.info("streaming at http://" + this.ip + ":" + port + "/" + url);
};

Webcast.prototype.stop = function (callback) {

    var self = this;

    if (this.input != null) {
	this.encoder.removeAllListeners();
	this.input.removeAllListeners();
	this.input.pause();
	this.encoder.pause();
    }

    if (callback) {
        this.endCb = function () {
            self.chunks = [];
            callback(self.port);
        };
    }

    if (this.server) {
        for (var n = 0; n < this.listeners.length; n++) {
            this.listeners[n].end();
        }
	this.listeners = [];
	logger.info("CLOSING server...");
	this.server.close();
	this.server = null;	
    } else {
	this.endCb();
    }
};

Webcast.prototype.suspend = function () {
    this.encoder.pause();
};

Webcast.prototype.resume = function () {
    this.encoder.resume();
};

Webcast.prototype.addListener = function (res, req) {
    logger.info("adding listener");
    this.listeners.push(res);
};

Webcast.prototype.removeListener = function (res, req) {

    var idx1 = this.listeners.indexOf(res);
    this.listeners.splice(idx1, 1);

    if (this.listeners.length === 0) {
	this.stop();
    }
};

Webcast.prototype.sendChunk = function (chunk) {

     var self = this;

    if (self.listeners === null || self.listeners.length === 0) {
	return;
    }

     self.listeners.forEach(function(listener) {
         listener.write(chunk);
     });

     /*
     if (typeof self.chunks === "undefined") {
        self.chunks = [];
     }

     self.chunks.push(chunk);

     if(self.chunks.length >= 4) {
     listeners.forEach(function(listener) {
     self.chunks.forEach(function(data) {
     listener.write(data);
     });
     });
     self.chunks = [];
     }*/
};

module.exports = Webcast;
