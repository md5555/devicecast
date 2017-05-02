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
var RaumfeldZone = require('./lib/device/controls/RaumfeldZone');
var ChromeCast = require('./lib/device/controls/ChromeCast');
var logger = require('./lib/common/logger');
const osxsleep = require ('osxsleep');

var currentDevice = null;
var menu = null;
var deviceListMenu = null;
var devicesAdded = [];
var streamingAddress;
var reconnect = false;
var reconnectName = null;
var switchingDevice = false;

var fullReset = function() {

	stopCurrentDevice();

	LocalSoundStreamer.stopStream();

	if (currentDevice != null) {
	    currentDevice.doConnect();
	}
};

var stopCurrentDevice = function (callback) {

	if (currentDevice) {

	    var device = currentDevice;

	    device.controls.stop(function(){

		    // Show user notification
		    NotificationService.notifyCastingStopped(device.controls);

		    // Clean up playing speaker icon
		    deviceListMenu.items.forEach(MenuFactory.removeSpeaker);

		    // Switch tray icon
		    mb.tray.setImage(path.join(__dirname, 'not-castingTemplate.png'));

		    if (callback) callback();
	    });
	} else {
	    if (callback) callback();
	}
    };

var onStartStream = function() {

    LocalSoundStreamer.startStream(function (streamUrl) {
        streamingAddress = streamUrl;
    }, function(err){
    }, function() {
	onStop();
    });
};

var onStop = function() {

    if (switchingDevice) {
       return;
    }

    stopCurrentDevice();
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

	switchingDevice = false;

        // set speak icon when playing
        deviceListMenu.items.forEach(setSpeakIcon.bind({device: this.device}));
    	mb.tray.setContextMenu(menu);

        // Changes tray icon to "Casting"
        mb.tray.setImage(path.join(__dirname, 'castingTemplate.png'));
    };

var scanForDevices = function(self) {

    DeviceLookupService.lookUpDevices(function onDevice(device) {

	var found = false;

        switch (device.type) {
            case DeviceMatcher.TYPES.CHROMECAST:
		device.name = device.name + " (c)";
		break;
	    case DeviceMatcher.TYPES.UPNP:
		device.name = device.name + " (u)";
		break;
		default:
			break;
	}

	for (var n = 0; n < devicesAdded.length; n++) {
		if(device.name.localeCompare(devicesAdded[n].name) == 0) {
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

		device.controls = new ChromeCast(device);

		var doConnectCast = function onClicked() {

		    switchingDevice = true;

		    logger.info('Attempting to play to Chromecast', device.name);

		    stopCurrentDevice(function() {

			    onStartStream();

			    // Sets OSX selected input and output audio devices to Soundflower
			    LocalSourceSwitcher.switchSource({
				output: 'Soundflower (2ch)',
				input: 'Soundflower (2ch)'
			    });

			    storage.set('reconnect', { 
					    setting: reconnect,
					    name: device.name
				    }, function(error){
					    if (error == null) {
						    return;
					    }
					    logger.info("error while storing setting: %s", error.toString());
				    });

			    currentDevice = device;

			    device.controls.play(streamingAddress, onStreamingUpdateUI.bind({device: device}));

		    });

		};

		device.doConnect = doConnectCast;

		deviceListMenu.append(MenuFactory.chromeCastItem(device, doConnectCast));
		
		if (reconnectName != null && (reconnectName.localeCompare(device.name) == 0)) {
		    doConnectCast();
		}

                break;

            case DeviceMatcher.TYPES.UPNP:

                if (DeviceMatcher.isRaumfeld(device)) {

                    device.controls = new RaumfeldZone(device);

		    var doConnectUPnP = function onClicked() {

			switchingDevice = true;

                        logger.info('Attempting to play to Raumfeld device', device.name);

		    	stopCurrentDevice(function() {
		
				onStartStream();

				// Sets OSX selected input and output audio devices to Soundflower
				LocalSourceSwitcher.switchSource({
				    output: 'Soundflower (2ch)',
				    input: 'Soundflower (2ch)'
				});

				currentDevice = device;

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
					/*dialog.showErrorBox("devicecast - An Error Occurred",
							err.toString());*/
					onStop();
				});

				device.controls.play(streamingAddress, onStreamingUpdateUI.bind({device: device}));

			});

                    };

		    device.doConnect = doConnectUPnP;
		
                    deviceListMenu.append(MenuFactory.raumfeldDeviceItem(device, doConnectUPnP));

		    logger.info('Added Raumfeld menu item (reconnect name: %s)', reconnectName);

		    if (reconnectName != null && (reconnectName.localeCompare(device.name) == 0)) {
			doConnectUPnP();
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

    osxsleep.OSXSleep.start(function(state) {
	logger.info("sleep state: %d", state);

	switch (state) {
		case osxsleep.HAS_POWERED_ON:
			if (currentDevice) {
			    currentDevice.doConnect();
			}
			break;
		case osxsleep.WILL_SLEEP:

			switchingDevice = true;
			stopCurrentDevice();

			break;
	}
    });
  
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
	fullReset();
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

		currentDevice.controls.volumeUp();
        }
    }));

    menu.append(new MenuItem({
        label: 'Volume Down',
        click: function () {

		if (!currentDevice) return;
	
		currentDevice.controls.volumeDown();
        }
    }));
 
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
            stopCurrentDevice();
	    currentDevice = null;

            // Clean up playing speaker icon
            deviceListMenu.items.forEach(MenuFactory.removeSpeaker);
        }
    }));

    var onQuitHandler = function () {
	osxsleep.OSXSleep.stop();
        mb.tray.setImage(path.join(__dirname, 'not-castingTemplate.png'));
        stopCurrentDevice();
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
