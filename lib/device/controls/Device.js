/* global module, require */

var inherits = require('inherits')
var Client = require('castv2-client').Client
var DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver
var EventEmitter = require('events').EventEmitter
var debug = require('debug')('Device')
const os = require('os');

/**
 * Chromecast
 * Supported Media: https://developers.google.com/cast/docs/media
 * Receiver Apps: https://developers.google.com/cast/docs/receiver_apps
 */

/**
 * Device
 * @param {Array}  options.address      IP address
 * @param {String} options.name         name
 */
var Device = function (options) {
  var self = this
  if (!(self instanceof Device)) return new Device(options)
  EventEmitter.call(self)

  self.type = 'chc';
  self.name = options.name
  self.config = options
  self.host = self.config.addresses[0]
  self._playing = false
}

module.exports.Device = Device

inherits(Device, EventEmitter)

Device.prototype.getName = function () {
  return this.name;
}

Device.prototype.play = function (resource, seconds, callback) {
  var self = this

  // Use a fresh client
  if (self.client) self.client.close()

  debug('Connecting to host: ' + self.host)

  self.client = new Client()
  self.client.connect(self.host, function () {
    debug('Connected')
    self.emit('connected')
    debug('Launching app...')
    self.client.launch(DefaultMediaReceiver, function (err, player) {
      if (err) {
        debug('Error:', err)
        if (callback) callback(err)
        return
      }

      self.player = player
      self._privatePlayMedia(resource, seconds, callback)

      player.on('status', function (status) {
        if (status) {
          debug('PlayerState = %s', status.playerState)
          self.emit('status', status)
        }
      })
    })
  })

  self.client.on('error', function (err) {
    console.log('Error: %s', err.message)
    self.client.close()
  })
}

Device.prototype._privatePlayMedia = function (resource, seconds, callback) {
  var self = this

  var options = {
    autoplay: true,
    currentTime: seconds || 0
  }

  var media = {
    // Here you can plug an URL to any mp4, webm, mp3 or jpg file with the proper contentType.
    contentId: resource,
    contentType: 'audio/mpeg',
    streamType: 'LIVE', // BUFFERED or LIVE

    // Title and cover displayed while buffering
    metadata: {
	type: 3,
	metadataType: 0,
	title: os.hostname(), 
	images: [],
	creator: 'DeviceCast'
    }
  };
  
  self.player.load(media, options, function (err, status) {
    self._playing = true
    if (callback) callback(err, status)
  })
}

Device.prototype.getStatus = function (callback) {
  var self = this
  self.player.getStatus(function (err, status) {
    if (err) {
      debug('Error getStatus: %s', err.message)
      return callback(err)
    }

    callback(null, status)
  })
}

Device.prototype.seekTo = function (newCurrentTime, callback) {
  var self = this
  self.player.seek(newCurrentTime, callback)
}

Device.prototype.seek = function (seconds, callback) {
  var self = this
  self.getStatus(function (err, status) {
    if (err) return callback(err)
    var newCurrentTime = status.currentTime + seconds
    self.seekTo(newCurrentTime, callback)
  })
}

Device.prototype.pause = function (callback) {
  var self = this
  self._playing = false
  self.player.pause(callback)
}

Device.prototype.unpause = function (callback) {
  var self = this
  self._playing = true
  self.player.play(callback)
}

Device.prototype.setVolume = function (volume, callback) {
  var self = this
  self.client.setVolume({level: volume}, callback)
}

Device.prototype.stop = function (callback) {
  var self = this
  self._playing = false
  self.player.stop(function () {
    debug('Player stopped')
    if (callback) callback();
  })
}

Device.prototype.setVolumeMuted = function (muted, callback) {
  var self = this
  self.client.setVolume({'muted': muted}, callback)
}

Device.prototype.subtitlesOff = function (callback) {
  var self = this
  self.player.media.sessionRequest({
    type: 'EDIT_TRACKS_INFO',
    activeTrackIds: [] // turn off subtitles
  }, callback)
}

Device.prototype.changeSubtitles = function (subId, callback) {
  var self = this
  self.player.media.sessionRequest({
    type: 'EDIT_TRACKS_INFO',
    activeTrackIds: [subId]
  }, callback)
}

Device.prototype.changeSubtitlesSize = function (fontScale, callback) {
  var self = this
  var newStyle = self.subtitlesStyle
  newStyle.fontScale = fontScale
  self.player.media.sessionRequest({
    type: 'EDIT_TRACKS_INFO',
    textTrackStyle: newStyle
  }, callback)
}

Device.prototype.close = function (callback) {
  var self = this
  self.client.stop(self.player, function () {
    self.client.close()
    self.client = null
    debug('Client closed')
  })
}
