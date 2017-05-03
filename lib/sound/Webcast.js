var fs = require('fs');
var utils = require('./utils');
var express = require('express')
var lame = require('lame');
var audio = require('osx-audio');
var debug = require('debug')('webcast');
var logger = require('../common/logger');
const ForeverAgent = require('forever-agent');
const http = require('http');
var onEnd = null;
var agent = null;
var req = null;
var endCb = null;

var Webcast = function(options, endCb) {
  if (!(this instanceof Webcast)) {
    return new Webcast(options);
  }
 
  this.agent = new ForeverAgent(options);
  options.agent = this.agent; 

  this.endCb = endCb;
  this.options = options;
  this.lameOptions = {
    // input
    channels: 2,        // 2 channels (left and right)
    bitDepth: 16,       // 16-bit samples
    sampleRate: 44100,  // 44,100 Hz sample rate

    // output
    bitRate: 256,
    outSampleRate: options.samplerate,
    mode: (options.mono ? lame.MONO : lame.JOINTSTEREO), // STEREO (default), JOINTSTEREO, DUALCHANNEL or MONO
    float: false
  };

  // we need to get the address of the local interface
  this.ip = utils.getLocalIp(options.iface);
  
  // create the Encoder instance
  this.input = null;
  this.encoder = new lame.Encoder(this.lameOptions);
  this.encoder.on('data', this.sendChunk.bind(this));

  // listeners
  this.listeners = [];

  // set up an express app
  this.app = express()

  var count = 0;

  var self = this;
  this.app.get('/' + options.url, function (req, res, next) {

    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked'
    });

    if (!self.input) {
      logger.info("no input exists yet, creating");
      self.input = new audio.Input();
      self.input.pipe(self.encoder);
    }

    self.addListener(res);
  });

  this.server = this.app.listen(options.port);

  this.server.on('connection', function(socket) {
    socket.setKeepAlive();
    socket.setTimeout(Number.MAX_SAFE_INTEGER); 
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

 	if (callback) this.onEnd = callback;

	for(var n = 0; n < this.agent.sockets.length; n++) {
	    this.agent.sockets[n].end();
	}

   	this.server.close();
	this.server.unref();

	this.agent.destroy();

        this.endCb();

        logger.info("Stopped streaming...");
   }
};

Webcast.prototype.addListener = function(res) {
  logger.info("adding listener");
  this.listeners.push(res);
};

Webcast.prototype.removeListener = function(res) {
  var idx = this.listeners.indexOf(res);
  this.listeners.splice(idx, 1);
  logger.info("removed listener. " + this.listeners.length + " are left.");
};

Webcast.prototype.sendChunk = function(chunk) {

  var self = this;
  self.listeners.forEach(function(listener) {
    listener.write(chunk);
  });
};

module.exports = Webcast;
