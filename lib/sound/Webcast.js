var finder = require('portfinder');
var Worker = require('webworker-threads').Worker;
var fs = require('fs');
var utils = require('./utils');
var express = require('express')
var lame = require('lame');
var audio = require('osx-audio');
var debug = require('debug')('webcast');
var logger = require('../common/logger');
const ForeverAgent = require('forever-agent');
const http = require('http');

var Webcast = function(options, endCb) {
  if (!(this instanceof Webcast)) {
    return new Webcast(options);
  }
 
  this.agent = new ForeverAgent(options);
  options.agent = this.agent; 

  var self = this;

  this.endCb = function() { 
	if (self.agent.sockets.length === 0) {
	   endCb();
	} else {
           logger.info("Client disconnected.");
	}
  };

  this.options = options;
  this.lameOptions = {
    // input
    channels: 2,        // 2 channels (left and right)
    bitDepth: 16,       // 16-bit samples
    sampleRate: 44100,  // 44,100 Hz sample rate

    // output
    bitRate: options.bitrate,
    outSampleRate: options.samplerate,
    mode: (options.mono ? lame.MONO : lame.DUALCHANNEL), // STEREO (default), JOINTSTEREO, DUALCHANNEL or MONO
    float: false
  };

  // we need to get the address of the local interface
  this.ip = utils.getLocalIp(options.iface);
  
  this.listeners = [];
  this.activeSockets = [];

  // create the Encoder instance
  this.input = null;

  // set up an express app
  this.app = express({ agent: this.agent})

  this.app.get('/' + options.url, function (req, res, next) {

    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked'
    });

    if (!self.input) {

      logger.info("no input exists yet, creating");

      self.input = new audio.Input({objectMode: true});
      self.encoder = new lame.Encoder(self.lameOptions);

      self.encoder.on('data', (data) => {
          self.sendChunk(data, self.listeners);
      });

      self.encoder.resume();
  
      self.input.resume().on('data', (data) => {
	  self.encoder.write(data);
      });
    }

    res.on('abort', self.endCb);
    res.on('aborted', self.endCb);
    res.on('close', self.endCb);
    res.on('finish', self.endCb);
    res.on('end', self.endCb);

    self.addListener(res);

    self.next = next;
  });

  this.server = this.app.listen(options.port);

    this.server.on('abort', self.endCb);
    this.server.on('aborted', self.endCb);
    this.server.on('close', self.endCb);
    this.server.on('finish', self.endCb);
    this.server.on('end', self.endCb);


  this.server.on('connection', function(socket) {
    socket.setTimeout(0); 
    self.activeSockets.push(socket);
  });

  this.server.on('upgrade', (req, socket, head) => {

      socket.write('HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
		   'Upgrade: WebSocket\r\n' +
		   'Connection: Upgrade\r\n' +
		   '\r\n');

      socket.pipe(socket); // echo back
  });

  logger.info("streaming at http://" + this.ip + ":" + options.port + "/" + options.url);

  return this;
};

Webcast.prototype.stop = function(callback) {

   if (this.server) {

	for(var n = 0; n < this.activeSockets.length; n++) {
	    this.activeSockets[n].end();
	    this.activeSockets[n].destroy();
	}

   	this.server.close();
	this.server.unref();

	this.agent.destroy();

	this.input.closeInput();
   }
};

Webcast.prototype.suspend = function() {
	this.input.closeInput();
}

Webcast.prototype.resume = function() {
	this.input.openInput();
}

Webcast.prototype.addListener = function(res) {
  logger.info("adding listener");
  this.listeners.push(res);
};

Webcast.prototype.removeListener = function(res) {
  var idx = this.listeners.indexOf(res);
  this.listeners.splice(idx, 1);
  logger.info("removed listener. " + this.listeners.length + " are left.");
};

Webcast.prototype.sendChunk = function(chunk, listeners) {

  var self = this;

  if (typeof self.chunks === "undefined") {
      self.chunks = [];
  }

  self.chunks.push(chunk);

  if(self.chunks.length == 4) {
	  listeners.forEach(function(listener) {
		self.chunks.forEach(function(data) {
	  	    listener.write(data);
		});
	  });
	  self.chunks = [];
  }
};

module.exports = Webcast;
