const exc = require('child_process').execSync;
var path = require('path');
var logger = require('../../common/logger');

var original_input;
var original_output;

// N:B - requires trailing space
var AUDIO_DEVICE_PATH = path.join(__dirname, '../../../audiodevice ');

// Sets OSX selected sound device
function setDevice(which, what) {
    var child = exc(AUDIO_DEVICE_PATH + " " + which + ' "' + what + '"');
    // TODO handle not found - output = 'device not found!'
}

// Gets OSX currently selected sound device
function getDevice(which, callback) {
    var child = exc(AUDIO_DEVICE_PATH + " " + which, {stdio: inherit});
    var outputDevice = process.stdout.replace(/(\r\n|\n|\r)/gm, "");
    callback(outputDevice);
}

var switchSource = function (options) {
    logger.info('Switching Audio source', options);

    if (options.input) {
        setDevice('input', options.input);
    }

    if (options.output) {
        setDevice('output', options.output);
    }
};

var resetOriginSource = function () {
    if (original_input) {
        logger.info('Resetting input device to', original_input);
        setDevice('input', original_input);
    }
    if (original_output) {
        logger.info('Resetting output device to', original_output);
        setDevice('output', original_output);
    }
};

module.exports = {
    switchSource: switchSource,
    resetOriginSource: resetOriginSource
};
