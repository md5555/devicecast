'use strict';

// http://www.upnp.org/specs/arch/UPnP-arch-DeviceArchitecture-v1.0-20080424.pdf

var dgram = require('dgram'),
    EventEmitter = require('events').EventEmitter,
    util = require('util'),
    assert = require('assert');

var SSDP_ADDRESS = '239.255.255.250', SSDP_PORT = 1900;

var PACKET_TYPE = 'MAN', SEARCH_TARGET = 'ST', WAIT_TIME = 'MX', LOCATION = 'LOCATION'; // some ssdp terminology

function localAddress() {
    var os = require('os');
    var ifaces = os.networkInterfaces();
    var addresses = [ ];
    for (var dev in ifaces) {
        ifaces[dev].forEach(function (details) {
            if (details.family == 'IPv4' && details.internal === false) addresses.push(details.address);
        });
    }
    return addresses.length === 0 ? null : addresses[0];
}

function parseLines(lines) {
    var headers = { };
    for (var i = 1; i < lines.length; i++) {
        var colonPos = lines[i].indexOf(':');
        if (colonPos === -1) continue;
        headers[lines[i].substr(0, colonPos).toUpperCase()] = lines[i].substr(colonPos+1).trim();
    }
    return headers;
}

function parseMsearchRequest(msg) {
    var lines = msg.toString().split('\r\n');
    if (!/^M-SEARCH \* HTTP\/1.1/.test(lines[0])) return null;
    return parseLines(lines);
}

function parseMsearchResponse(msg) {
    var lines = msg.toString().split('\r\n');
    if (!/^HTTP\/1.1 200 OK/.test(lines[0])) return null;
    return parseLines(lines);
}

function Ssdp() {
    EventEmitter.call(this);
    this._msearchTimer = null;
    this._lastLocation = null;
}
util.inherits(Ssdp, EventEmitter);

Ssdp.prototype.destroy = function() {

    var sock = this.socket;
    this.socket = null;

    sock.removeAllListeners();
    sock.close();
}

Ssdp.prototype.announce = function (config) {
    assert(typeof config.name === 'string');
    assert(typeof config.port === 'number');

    var that = this;

    this.socket = dgram.createSocket('udp4');

    this.socket.on('error', function (err) {
        that.emit('error', err);
    });

    this.socket.on('message', function (msg, rinfo) {
        var headers = parseMsearchRequest(msg);
        if (headers === null) return;

        if (headers[PACKET_TYPE] !== '"ssdp:discover"' || headers[SEARCH_TARGET] !== config.name) return;

        var waitTime = typeof headers[WAIT_TIME] === 'number' ? headers[WAIT_TIME] : 0;

        setTimeout(function () {
            var response = new Buffer('HTTP/1.1 200 OK\r\n' +
                                      'CACHE-CONTROL: max-age=172800\r\n' +
                                      'DATE: ' + (new Date()).toString() + '\r\n' +
                                      'EXT: \r\n' +
                                      'LOCATION: http://' + localAddress() + ':' + config.port + '\r\n' +
                                      'ST: ' + config.name + '\r\n\r\n');
            var client = dgram.createSocket('udp4');
            client.send(response, 0, response.length, rinfo.port, rinfo.address, function (err, bytes) {
                client.close();
                that.emit('reply', rinfo);
            });
        }, waitTime);
    });

    this.socket.bind(SSDP_PORT, function () {
        var address = that.socket.address();

        try {
            that.socket.addMembership(SSDP_ADDRESS);
        } catch (e) {
            that.emit('error', e);
        }
    });
};

Ssdp.prototype.search = function (service) {
    var that = this;
    var timeout = 5000;
    var response = false;

    this.socket = dgram.createSocket('udp4');

    this.socket.on('error', function (err) {
        that.emit('error', err);
    });

    function sendMsearch() {

	if (that.socket == null) {
	    return;
	}

        var message = new Buffer(
            'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: ' + SSDP_ADDRESS + ':' + SSDP_PORT + '\r\n' +
            'MAN: "ssdp:discover"\r\n' +
            'ST: ' + service + '\r\n' +
            'MX: 1\r\n\r\n');

        that.socket.send(message, 0, message.length, SSDP_PORT, SSDP_ADDRESS);

        setTimeout(function checkResponse() {
            if (!response) {
                if (that._lastLocation) that.emit('down', that._lastLocation);
                that._lastLocation = null;
            }
            response = false;
            sendMsearch();
        }, timeout);
    }

    this.socket.bind(0, sendMsearch);

    this.socket.on('message', function (msg, rinfo) {
        var headers = parseMsearchResponse(msg);
        if (headers === null || !headers[LOCATION]) return;

        response = true;

        if (that._lastLocation !== headers[LOCATION]) {
            that._lastLocation = headers[LOCATION];
            that.emit('up', headers[LOCATION]);
        }
    });
};

exports = module.exports = Ssdp;
