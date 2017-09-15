var fs = require('fs');
var utils = require('./utils');
var url = require('url');
var lame = require('lame');
var audio = require('osx-audio');
var debug = require('debug')('webcast');
var logger = require('../common/logger');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
const ForeverAgent = require('forever-agent');
const http = require('http');

var Webcast = function (endCb) {

    EventEmitter.call(this);

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

    return this;
};

util.inherits(Webcast, EventEmitter);

Webcast.prototype.initializeStreams = function () {

        var self = this;


	if (this.encoder == null) {
	    this.encoder = new lame.Encoder(self.lameOptions);

	    this.encoder.on('data', self.sendData);

	    this.encoder.on('close', function() {
		logger.info("Encoder closed..");
		self.encoder = null;
		if (self.input != null) {
		    self.input.removeAllListeners();
		    self.input = null;
		}
		self.initializeStreams();
	    });

	    this.encoder.on('end', function() {
		logger.info("Encoder ended..");
		self.encoder = null;
		if (self.input != null) {
		    self.input.removeAllListeners();
		    self.input = null;
		}
		self.initializeStreams();
	    });
	}

	if (this.input == null) {
	    this.input = new audio.Input();

	    this.input.on('data', function (data) {
		self.encoder.write(data);
	    });

	    this.input.on('close', function() {
		logger.info("Input closed..");
		self.input = null;
		if (self.encoder != null) {
		    self.encoder.removeAllListeners();
		    self.encoder = null;
		}
		self.initializeStreams();
	    });

	    this.input.on('end', function() {
		logger.info("Input end..");
		self.input = null;
		if (self.encoder != null) {
		    self.encoder.removeAllListeners();
		    self.encoder = null;
		}
		self.initializeStreams();
	    });
	}
};

Webcast.prototype.startServer = function(url, port) {

    var self = this;

    self.initializeStreams();

    this.port = port;

    this.server = http.createServer(function (req, res) {

	req.once('error', function() {
	    self.removeListener(res, req);
	});

	res.once('error', function() {
	    self.removeListener(res, req);
	});

        res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Transfer-Encoding': 'chunked'
        });

        self.addListener(res, req);

        res.on('close', function () {
            self.removeListener(res, req);
        });

	req.on('close', function () {
	    self.removeListener(res, req);
	});
    });

    this.server.on('close', function (socket) {

	self.input.removeAllListeners();
	self.input.pause();
	self.input = null;

	self.encoder.removeAllListeners();
	self.encoder.pause();
	self.encoder = null;

        self.endCb();
    });


    this.server.on('error', function(ex) {
	self.emit('close', null);
    });

    this.server.on('socket', function(socket) {

	socket.on('close', function() {
	    self.stop();
	});	

	socket.on('error', function(ex) {
	    self.stop();
	});
    });

    this.server.on('clientError', function (err, socket) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
	self.emit('close', null);	
    });

    this.server.on('close', function() {
	self.emit('close', null);	
    });

    this.server.on('upgrade', function (req, socket, head) {

        socket.write('HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
            'Upgrade: WebSocket\r\n' +
            'Connection: Upgrade\r\n' +
            '\r\n');

        socket.pipe(socket); // echo back
    });

    this.server.listen(port);

    self.input.resume();
    self.encoder.resume();

    logger.info("streaming at http://" + this.ip + ":" + port + "/" + url);
};

Webcast.prototype.stop = function (callback) {

    var self = this;

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
	try {
	   this.server.close();
	} catch (e) {
	}
	this.server = null;	
	self.emit('close', null);
    } else {
	self.emit('close', null);
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
