var notifier = require('node-notifier');
var logger = require('../common/logger');
var path = require('path');

var notifyCastingStarted = function (device) {
    notifier.notify({
        title: 'Now Streaming',
        message: device.name,
        //icon: path.join(__dirname, 'castingTemplate.png'),
        //appIcon: path.join(__dirname, 'castingTemplate.png'),
        contentImage: path.join(__dirname, 'castingTemplate.png'),
        sender: path.join(__dirname, 'castingTemplate.png'),
        wait: false,
        sticky: false,
	timeout: 3
    });
};

var notifyCastingStopped = function (device) {
    notifier.notify({
        title: 'Streaming Stopped',
        message: device.name,
        //icon: path.join(__dirname, 'not-castingTemplate.png'),
        //appIcon: path.join(__dirname, 'not-castingTemplate.png'),
        contentImage: path.join(__dirname, 'not-castingTemplate.png'),
        sender: path.join(__dirname, 'not-castingTemplate.png'),
        wait: false,
        sticky: false,
	timeout: 3
    });
};

var notify = function (options) {
    notifier.notify({
        title: options.title,
        message: options.message,
        icon: path.join(__dirname, 'not-castingTemplate.png'),
        //appIcon: path.join(__dirname, 'not-castingTemplate.png'),
        //contentImage: path.join(__dirname, 'not-castingTemplate.png'),
        //sender: path.join(__dirname, 'not-castingTemplate.png'),
        wait: false,
        sticky: false,
        timeout: 3
    });
};

module.exports = {
    notify: notify,
    notifyCastingStarted: notifyCastingStarted,
    notifyCastingStopped: notifyCastingStopped
};
