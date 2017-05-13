//Audiodevice by http://whoshacks.blogspot.com/2009/01/change-audio-devices-via-shell-script.html

//Shell and filesystem dependencies
require('shelljs/global');
var path = require('path');

//Electron dependencies
const {dialog, Menu, MenuItem, nativeImage} = require('electron')
const storage = require('electron-json-storage');
const menubar = require('menubar');
const mb = menubar({dir: __dirname, icon: 'not-castingTemplate.png'});

/* Internals */
var MenuFactory = require('./lib/native/MenuFactory');
var NotificationService = require('./lib/native/NotificationService');
var DeviceLookupService = require('./lib/device/utils/DeviceLookupService');
var DeviceMatcher = require('./lib/device/utils/DeviceMatcher');
var LocalSourceSwitcher = require('./lib/device/utils/LocalSourceSwitcher');
var UpnpMediaClientUtils = require('./lib/device/utils/UpnpMediaClientUtils');
var SoundStreamer = require('./lib/sound/LocalSoundStreamerWebcast');
var NativeSleep = require('sleep');

/* Various Device controllers */
const RaumfeldZone = require('./lib/device/controls/RaumfeldZone');
const ChromeCast = require('./lib/device/controls/ChromeCast');
const logger = require('./lib/common/logger');
const osxsleep = require('osxsleep');
const reach = require('osxreachability');

var streamer = new SoundStreamer(function () {
    onStop();
});

var currentDevice = null;
var menu = null;
var devicesAdded = [];
var streamingAddress;
var reconnect = false;
var reconnectName = null;
var deviceMenuChromecast = null;
var deviceMenuUPnP = null;
var deviceListMenu = null;

var fullReset = function () {

    stopCurrentDevice();

    if (currentDevice !== null) {
        currentDevice.doConnect();
    }
};

var clearIcons = function () {

    var menus = [deviceListMenu, deviceMenuChromecast, deviceMenuUPnP];

    for (var a = 0; a < menus.length; a++) {

        var opMenu = menus[a];

        for (var n = 0; n < opMenu.items.length; n++) {
            opMenu.setIcon(n, null);
        }
    }
};

var setTrayIconNotCasting = function() {
    mb.tray.setImage(path.join(__dirname, 'not-castingTemplate.png'));
};

var stopDevice = function (callback, device) {

    if (device) {

        logger.info("Stopping CURRENT device %s", currentDevice.name);

	if (device.controls == null) {
            clearIcons();
            setTrayIconNotCasting();

            if (callback) callback();

	    return;
	}

        device.controls.stop(function () {

            clearIcons();
            setTrayIconNotCasting();

            if (callback) callback();
        });
    } else {
        if (callback) callback();
    }
};

var stopCurrentDevice = function (callback) {
    stopDevice(function() {
	    if (callback) callback();
	}, currentDevice);
};

var stopCurrentDeviceMatch = function (callback, matchDevice) {

    if (currentDevice) {
        if (currentDevice.name === matchDevice.name && currentDevice.type ===
            matchDevice.type) {
            callback();
            return;
        }
        stopDevice(callback, currentDevice);
    } else {
        callback();
    }
};

var onStartStream = function (cb) {

    streamer.startStream(function (streamUrl) {
        streamingAddress = streamUrl;
        if (cb) cb();
    }, function (err) {
    });
};

var onStop = function () {

    if (currentDevice) {
        NotificationService.notifyCastingStopped(currentDevice);
	clearIcons();
	setTrayIconNotCasting();
    }
};

var onStreamingUpdateUI = function () {

    deviceListMenu.setIcon(0, null);
    deviceListMenu.setIcon(1, null);

    for (var n = 0; n < this.opMenu.items.length; n++) {
        if (this.opMenu.items[n].label === this.device.name) {
            logger.info("Setting icon!");
            var castIcon = nativeImage.createFromPath(path.join(__dirname, 'castingTemplate-small.png'));
            this.opMenu.setIcon(n, castIcon);
            deviceListMenu.setIcon(this.a, castIcon);
        }
    }

    mb.tray.setImage(path.join(__dirname, 'castingTemplate.png'));
    mb.tray.setContextMenu(menu);
};

var getDeviceFQN = function(device) {

    return device.name + ":" + device.type;
};

var deviceHandler = function onDevice(device) {

        var found = false;
	var n = 0;

        for ( ; n < devicesAdded.length; n++) {

            var n0 = getDeviceFQN(device); 
            var n1 = getDeviceFQN(devicesAdded[n]);

            if (n0 === n1) {
                found = true;
                break;
            }
        }

        if (!found) {
            devicesAdded.push(device);
        } else {

	    /*
	    switch (device.type) {
		case DeviceMatcher.TYPES.CHROMECAST:
		    device.controls = new ChromeCast(device);
		    break;
		case DeviceMatcher.TYPES.UPNP:
		    device.controls = new RaumfeldZone(device);

		    for (var n = 0; n < deviceMenuUPnP.items.length; n++) {

			var id = deviceMenuUPnP.items[n].id;

			if (id === getDeviceFQN(device)) {
			    deviceMenuUPnP.items[n] = MenuFactory.raumfeldDeviceItem(getDeviceFQN(device), device, doConnectUPnP);
			    break;
			}
		    }

		    break;
	    } 

	    devicesAdded[n] = device;

	    if (currentDevice != null && getDeviceFQN(device) === getDeviceFQN(currentDevice)) {
		currentDevice = device;
	    }
	    */

	    return;
        }

        switch (device.type) {

            case DeviceMatcher.TYPES.CHROMECAST:

		if (found) {
		    return;
		}

                var doConnectCast = function onClicked() {

                    logger.info('Attempting to play to Google Cast device: ', device.name);

                    stopCurrentDeviceMatch(function () {

			device.controls = new ChromeCast(device);

                        // Sets OSX selected input and output audio devices to Soundflower
                        LocalSourceSwitcher.switchSource({
                            output: 'Soundflower (2ch)',
                            input: 'Soundflower (2ch)'
                        });

                        storage.set('reconnect', {
                            setting: reconnect,
                            name: device.name
                        }, function (error) {
                            if (error === null) {
                                return;
                            }
                            logger.info("error while storing setting: %s", error.toString());
                        });

                        currentDevice = device;

                        onStartStream(function () {
                            device.controls.play(streamingAddress, onStreamingUpdateUI.bind({
                                device: device,
                                a: 0,
                                opMenu: deviceMenuChromecast
                            }));
                        });

                    }, device);

                };

                device.doConnect = doConnectCast;

                deviceMenuChromecast.append(MenuFactory.chromeCastItem(getDeviceFQN(device), device, doConnectCast));

                break;

            case DeviceMatcher.TYPES.UPNP:

                if (DeviceMatcher.isRaumfeld(device)) {

                    var doConnectUPnP = function onClicked() {

                        logger.info('Attempting to play on Raumfeld Zone: ', device.name);

                        stopCurrentDeviceMatch(function () {

			    device.controls = new RaumfeldZone(device);

                            // Sets OSX selected input and output audio devices to Soundflower
                            LocalSourceSwitcher.switchSource({
                                output: 'Soundflower (2ch)',
                                input: 'Soundflower (2ch)'
                            });

                            currentDevice = device;

                            storage.set('reconnect', {
                                setting: reconnect,
                                name: device.name
                            }, function (error) {
                                if (error === null) {
                                    return;
                                }
                                logger.info("error while storing setting: %s", error.toString());
                            });

                            device.controls.registerErrorHandler(function () {
                                onStop();
                            });

                            device.controls.play(streamingAddress, onStreamingUpdateUI.bind({
                                device: device,
                                a: 1,
                                opMenu: deviceMenuUPnP
                            }));

                        }, device);

                    };

                    device.doConnect = doConnectUPnP;

		    if (!found) {

			deviceMenuUPnP.append(MenuFactory.raumfeldDeviceItem(getDeviceFQN(device), device, doConnectUPnP));

		    } else {

			for (var n = 0; n < deviceMenuUPnP.items.length; n++) {

			    var id = deviceMenuUPnP.items[n].id;

			    if (id === getDeviceFQN(device)) {
				deviceMenuUPnP.items[n] = MenuFactory.raumfeldDeviceItem(getDeviceFQN(device), device, doConnectUPnP);
				break;
			    }
			}
		    }

                    if (!found && (reconnectName !== null && (reconnectName.localeCompare(device.name) === 0))) {
                        doConnectUPnP();
                    }

		    /*
		    if (!found) {
			var controls = new RaumfeldZone(device);
			controls.reconfigureZone();
		    }*/
                }
                break;
            default:
                logger.error('Unknown recognised device found', logger.level === 'verbose' ? device : device.name);
        }

        mb.tray.setContextMenu(menu);
};

var scanForDevices = function () {

    DeviceLookupService.lookUpDevices();
};


var resetDevices = function() {

    currentDevice = null;

    streamer.stopStream();
    onStartStream();

    devicesAdded = [];

    createMenu();

    DeviceLookupService.lookUpDevices();
}

var createMenu = function() {

    //Menu startup message
    menu = new Menu();

    deviceMenuChromecast = new Menu();
    deviceMenuUPnP = new Menu();
    deviceListMenu = new Menu();

    deviceListMenu.insertSubMenu(0, 0, "Chromecast", deviceMenuChromecast);
    deviceListMenu.insertSubMenu(1, 0, "UPnP", deviceMenuUPnP);

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
        enabled: true,
        click: function () {
            stopCurrentDevice();
            currentDevice = null;
        }
    }));

    var onQuitHandler = function () {
        reach.Reachability.stop();
        osxsleep.OSXSleep.stop();
        stopCurrentDevice(function () {
            streamer.stopStream();
            LocalSourceSwitcher.resetOriginSource();
            mb.app.quit();
        });
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
}

//Menubar construction
mb.on('ready', function ready() {

    DeviceLookupService.initialize(deviceHandler, function(address) {
	logger.warn("Device down: "+address);
    });

    reach.Reachability.start(function (state) {

	logger.info("reachability state: "+state);    

	if (state != 0) {
	    resetDevices();
	}
    });

    osxsleep.OSXSleep.start(function (state) {

        logger.info("sleep state: %d", state);

        switch (state) {
            case osxsleep.HAS_POWERED_ON:
		streamer.stopStream();
		onStartStream();
		resetDevices();
                break;
            case osxsleep.WILL_SLEEP:
                if (currentDevice) {
                    stopCurrentDevice(function (){
			streamer.stopStream();
                        LocalSourceSwitcher.resetOriginSource();
                    });
                }
                break;
        }
    });

    storage.get('reconnect',
        function (error, object) {

            if (object == null || object.setting == null || object.name == null) {
                return;
            }

            reconnect = object.setting;
            reconnectName = object.name;

            logger.info("reconnect: " + reconnect + " name: " + reconnectName);
        });

    process.on('uncaughtException', function (err) {
        fullReset();
        dialog.showErrorBox("devicecast - An Error Occurred", err.toString());
    });

    createMenu();

    onStartStream(function () {
        scanForDevices();
    });
});
