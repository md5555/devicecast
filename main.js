//Audiodevice by http://whoshacks.blogspot.com/2009/01/change-audio-devices-via-shell-script.html

//Shell and filesystem dependencies
require('shelljs/global');
var path = require('path');
var _ = require('lodash');

//Electron dependencies
const {app, dialog, Menu, MenuItem} = require('electron')
const storage = require('electron-json-storage');

var menubar = require('menubar');
var mb = menubar({dir: __dirname, icon: 'not-castingTemplate.png'});

/* Internals */
var MenuFactory = require('./lib/native/MenuFactory');
var NotificationService = require('./lib/native/NotificationService');

var DeviceLookupService = require('./lib/device/utils/DeviceLookupService');
var DeviceMatcher = require('./lib/device/utils/DeviceMatcher');
var LocalSourceSwitcher = require('./lib/device/utils/LocalSourceSwitcher');
var UpnpMediaClientUtils = require('./lib/device/utils/UpnpMediaClientUtils');

var LocalSoundStreamer = require('./lib/sound/LocalSoundStreamerWebcast');

/* Various Device controllers */
var JongoSpeaker = require('./lib/device/controls/JongoSpeaker');
var RaumfeldZone = require('./lib/device/controls/RaumfeldZone');
var ChromeCast = require('./lib/device/controls/ChromeCast');
var logger = require('./lib/common/logger');
var currentDevice = null;
var menu = null;
var deviceListMenu = null;
var devicesAdded = [];
var streamingAddress;
var reconnect = false;
var reconnectName = null;

var onStop = function() {

    if (currentDevice == null) {
	return;
    }

    NotificationService.notifyCastingStopped(currentDevice);

    // Clean up playing speaker icon
    deviceListMenu.items.forEach(MenuFactory.removeSpeaker);

    // Switch tray icon
    mb.tray.setImage(path.join(__dirname, 'not-castingTemplate.png'));

    LocalSourceSwitcher.resetOriginSource();

    currentDevice = null;
};

var setSpeakIcon = function (item) {

	logger.info("label: %s  name: %s", item.label, this.device.name);

        if (item.label === this.device.name) {
            MenuFactory.setSpeaker(item);
        } else {
            MenuFactory.removeSpeaker(item);
        }
};

var onStreamingUpdateUI = function () {
        // set speak icon when playing
        deviceListMenu.items.forEach(setSpeakIcon.bind({device: this.device}));
    	mb.tray.setContextMenu(menu);

        // Changes tray icon to "Casting"
        mb.tray.setImage(path.join(__dirname, 'castingTemplate.png'));
    };

var scanForDevices = function(self) {

    DeviceLookupService.lookUpDevices(function onDevice(device) {

	var found = false;

	for (var n = 0; n < devicesAdded.length; n++) {
		if(device.name.localeCompare(devicesAdded[n].name) == 0) {
			devicesAdded[n] = device;
			found = true;
			break; 
		}
	}

	if (!found) {
	   devicesAdded.push(device);
	} else {
	   return;
        }

        switch (device.type) {
            case DeviceMatcher.TYPES.CHROMECAST:

                if (DeviceMatcher.isChromecast(device) || DeviceMatcher.isChromecastAudio(device)) {

                    deviceListMenu.append(MenuFactory.chromeCastItem(device, function onClicked() {
                        logger.info('Attempting to play to Chromecast', device.name);

                        // Sets OSX selected input and output audio devices to Soundflower
                        LocalSourceSwitcher.switchSource({
                            output: 'Soundflower (2ch)',
                            input: 'Soundflower (2ch)'
                        });

                        if (!device.controls) {
                            device.controls = new ChromeCast(device);
                        }
                        device.controls.play(streamingAddress, onStreamingUpdateUI.bind({device: device}));
                    }));
                }
                break;
            case DeviceMatcher.TYPES.UPNP:

                if (DeviceMatcher.isSonos(device)) {

                    deviceListMenu.append(MenuFactory.sonosDeviceItem(device, function onClicked() {
                        logger.debug('TODO Sonos');
                        // TODO on click integrate with sonos
                    }));
                }
                else if (DeviceMatcher.isJongo(device)) {
		
                    deviceListMenu.append(MenuFactory.jongoDeviceItem(device, function onClicked() {

                        logger.info('Attempting to play to Jongo device', device.name);

                        // Sets OSX selected input and output audio devices to Soundflower
                        LocalSourceSwitcher.switchSource({
                            output: 'Soundflower (2ch)',
                            input: 'Soundflower (2ch)'
                        });

                        if (!device.controls) {
                            device.controls = new JongoSpeaker(device);
                        }
                        device.controls.play(streamingAddress, onStreamingUpdateUI.bind({device: device}));
                    }));
                }
                else if (DeviceMatcher.isRaumfeld(device)) {

		    var onClicked = function onClicked() {

                        logger.info('Attempting to play to Raumfeld device', device.name);

                        // Sets OSX selected input and output audio devices to Soundflower
                        LocalSourceSwitcher.switchSource({
                            output: 'Soundflower (2ch)',
                            input: 'Soundflower (2ch)'
                        });

                        device.controls = new RaumfeldZone(device);

			currentDevice = device.controls;

			storage.set('reconnect', { 
					setting: reconnect,
					name: device.name
				}, function(error){
					if (error == null) {
						return;
					}
					logger.info("error while storing setting: %s", error.toString());
				});

			device.controls.registerErrorHandler(function(err){
				dialog.showErrorBox("devicecast - An Error Occurred",
						err.toString());
			});

                        device.controls.play(streamingAddress, onStreamingUpdateUI.bind({device: device}));
                    };
		
                    deviceListMenu.append(MenuFactory.raumfeldDeviceItem(device, onClicked));

		    logger.info('Added Raumfeld menu item (reconnect name: %s)', reconnectName);

		    if (reconnectName != null && (reconnectName.localeCompare(device.name) == 0)) {
			onClicked();
		    }
                }
                break;
            default:
                logger.error('Unknown recognised device found', logger.level === 'verbose' ? device : device.name);
        }

        mb.tray.setContextMenu(menu);
   });

};

//Menubar construction
mb.on('ready', function ready() {
  
    storage.get('reconnect',
		function(error, object){

			if (object == null) {
		    		return;
			}

			reconnect = object.setting;
			reconnectName = object.name;

			logger.info("reconnect: "+reconnect+" name: "+reconnectName);
	    	});

    process.on('uncaughtException', function(err) {
	dialog.showErrorBox("devicecast - An Error Occurred", err.toString());
    });

    //Menu startup message
    menu = new Menu();
    deviceListMenu = new Menu();
 
    menu.append(MenuFactory.castToDeviceMenu(deviceListMenu));

    /*
    menu.append(new MenuItem({
        label: 'Reconnect on Start',
	type: 'checkbox',
        click: function (item, window, event) {
	    reconnect = item.checked;
	    reconnectName = self.currentDevice.name;
	    storage.set('reconnect', { 
		setting: reconnect,
		name: self.currentDevice.name
		 }, function(error){
			if (error == null) {
				return;
			}
			logger.info("error while storing setting: %s", error.toString());
		});
        }
    }));
    */

    menu.append(MenuFactory.separator());

    menu.append(new MenuItem({
        label: 'Volume Up',
        click: function () {

		if (!currentDevice) return;

		currentDevice.volumeUp();
        }
    }));

    menu.append(new MenuItem({
        label: 'Volume Down',
        click: function () {

		if (!currentDevice) return;
	
		currentDevice.volumeDown();
        }
    }));
 
    LocalSoundStreamer.startStream(function (streamUrl) {
        streamingAddress = streamUrl;
    }, function(err){
    }, function() {
	onStop();
    });

    // Stream Options
    var streamMenu = new Menu();
    streamMenu.append(new MenuItem({
        label: 'OSX Output (default)',
        click: function () {
            LocalSourceSwitcher.switchSource({
                output: 'Soundflower (2ch)',
                input: 'Soundflower (2ch)'
            });
            NotificationService.notify({
                title: 'Audio Source Switched',
                message: 'OSX Audio via Soundflower'
            });
        }
    }));
    streamMenu.append(new MenuItem({
        label: 'Internal Microphone',
        click: function () {
            LocalSourceSwitcher.switchSource({
                output: 'Soundflower (2ch)',
                input: 'Internal Microphone'
            });
            NotificationService.notify({
                title: 'Audio Source Switched',
                message: 'Internal Microphone via Soundflower'
            });
        }
    }));
    streamMenu.append(MenuFactory.separator());
    streamMenu.append(MenuFactory.aboutStreamFeature());

    // Streaming Menu
    menu.append(MenuFactory.separator());
    menu.append(MenuFactory.steamMenu(streamMenu));
    menu.append(MenuFactory.separator());

    //Clicking this option stops casting audio to Chromecast
    menu.append(new MenuItem({
        label: 'Stop casting',
        enabled: true, // default disabled as not initially playing
        click: function () {

            // Attempt to stop all controls
            attemptToStopAllDevices();

            // Clean up playing speaker icon
            deviceListMenu.items.forEach(MenuFactory.removeSpeaker);

            // Switch tray icon
            mb.tray.setImage(path.join(__dirname, 'not-castingTemplate.png'));

            LocalSourceSwitcher.resetOriginSource();
        }
    }));

   var attemptToStopAllDevices = function () {
        devicesAdded.forEach(function (device) {
            if (_.has(device, 'controls') && _.isFunction(device.controls.stop)) {
                device.controls.stop(function (err, result) {
                    // do something...
                });
            }
        });
    };

    var onQuitHandler = function () {
        mb.tray.setImage(path.join(__dirname, 'not-castingTemplate.png'));
        attemptToStopAllDevices();
        LocalSoundStreamer.stopStream();
        LocalSourceSwitcher.resetOriginSource();
        mb.app.quit();
    };

    // About
    menu.append(MenuFactory.about());

    // Quit
    menu.append(MenuFactory.quit(onQuitHandler));

    // Clicking this option starts casting audio to Cast
    menu.append(MenuFactory.separator());
 
    // CMD + C death
    mb.app.on('quit', onQuitHandler);

    // Set the menu items
    mb.tray.setContextMenu(menu);

    scanForDevices();
});
