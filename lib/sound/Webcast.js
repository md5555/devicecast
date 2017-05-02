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

  options.agent = new ForeverAgent(options);

  this.options = options;
  this.lameOptions = {
    // input
    channels: 2,        // 2 channels (left and right)
    bitDepth: 16,       // 16-bit samples
    sampleRate: 44100,  // 44,100 Hz sample rate

    // output
    bitRate: options.bitrate,
    outSampleRate: options.samplerate,
    mode: (options.mono ? lame.MONO : lame.STEREO), // STEREO (default), JOINTSTEREO, DUALCHANNEL or MONO
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
  this.app.get('/' + options.url, function (req, res) {
    res.set({
      'Content-Type': 'audio/mp3',
      'Transfer-Encoding': 'chunked'
    });

    if (!self.input) {
      debug("no input exists yet, creating");
      self.input = new audio.Input();
      self.input.pipe(self.encoder);
    }

    self.addListener(res);

    var onEnd = function() {
      endCb();
      logger.info("Stopped streaming...");
    }

    res.on('abort', onEnd);
    res.on('aborted', onEnd);
    res.on('close', onEnd);
  });

  this.server = this.app.listen(options.port);

  logger.info("streaming at http://" + this.ip + ":" + options.port + "/" + options.url);

  return this;
};

Webcast.prototype.stop = function() {
   if (this.server) {

        if (this.encoder) {
	   this.encoder.pause();
	}

	if (this.input) {
		this.input.pause();
		this.input.unpipe(this.encoder);
	}

	this.input = null;
        this.encoder = null;
        this.listeners = [];
   	this.server.close();
	this.server = null;
   }
};

Webcast.prototype.addListener = function(res) {
  debug("adding listener");
  this.listeners.push(res);
};

Webcast.prototype.removeListener = function(res) {
  var idx = this.listeners.indexOf(res);
  this.listeners.splice(idx, 1);
  debug("removed listener. " + this.listeners.length + " are left.");
};

Webcast.prototype.sendChunk = function(chunk) {

  var self = this;
  self.listeners.forEach(function(listener) {
    listener.write(chunk);
  });
};

module.exports = Webcast;
