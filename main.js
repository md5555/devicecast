//Audiodevice by http://whoshacks.blogspot.com/2009/01/change-audio-devices-via-shell-script.html

//Shell and filesystem dependencies
require('shelljs/global');
var path = require('path');
var _ = require('lodash');

//Electron dependencies
const {app, dialog, Menu, MenuItem, nativeImage} = require('electron')
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
var devicesAdded = [];
var streamingAddress;
var reconnect = false;
var reconnectName = null;
var switchingDevice = false;

var deviceMenuChromecast = null;
var deviceMenuUPnP = null;
var deviceListMenu = null;

var fullReset = function() {

	stopCurrentDevice();

	if (currentDevice != null) {
	    currentDevice.doConnect();
	}
};

var stopDevice = function (callback, device) {

	if (device) {

	    logger.info("Stopping CURRENT device %s", currentDevice.name);

	    device.controls.stop(function(){

		    // Show user notification
		    NotificationService.notifyCastingStopped(device.controls);

		    var menus = [ deviceListMenu, deviceMenuChromecast, deviceMenuUPnP ];

		    // set cast icon when playing

		    for (var a = 0; a < menus.length; a++) {

			    var opMenu = menus[a];

			    for (var n = 0; n < opMenu.items.length; n++) {
				opMenu.setIcon(n, null);
			    }
		    }

		    // Switch tray icon
		    mb.tray.setImage(path.join(__dirname, 'not-castingTemplate.png'));

		    if (callback) callback();
	    });
	} else {
	    if (callback) callback();
	}
    };

var stopCurrentDevice = function(callback) {
    stopDevice(callback, currentDevice);	
};

var stopCurrentDeviceMatch = function(callback, matchDevice) {
    
    if (matchDevice != currentDevice) {
	stopCurrentDevice(callback);
    } else {
	callback();
    }
};

var onStartStream = function(cb) {

    LocalSoundStreamer.startStream(function (streamUrl) {
        streamingAddress = streamUrl;
	if (cb) cb();
    }, function(err){
    }, function() {
	onStop();
    });
};

var onStop = function() {

    if (switchingDevice) {
        return;
    }

    onStartStream();
};

var onStreamingUpdateUI = function () {

	switchingDevice = false;

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

var scanForDevices = function(self) {

    DeviceLookupService.lookUpDevices(function onDevice(device) {

	var found = false;

	for (var n = 0; n < devicesAdded.length; n++) {

		var n0 = device.name+":"+device.type;
		var n1 = devicesAdded[n].name+":"+devicesAdded[n].type;

		if(n0 == n1) {
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

		var doConnectCast = function onClicked() {

		    device.controls = new ChromeCast(device);

		    switchingDevice = true;

		    logger.info('Attempting to play to Chromecast', device.name);

		    stopCurrentDeviceMatch(function() {
	
			    // Sets OSX selected input and output audio devices to Soundflower
			    LocalSourceSwitcher.switchSource({
				output: 'Soundflower (2ch)',
				input: 'Soundflower (2ch)'
			    });

			    onStartStream();

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

			    device.controls.play(streamingAddress, onStreamingUpdateUI.bind({device: device, a: 0, opMenu: deviceMenuChromecast}));
		    }, device);

		};

		device.doConnect = doConnectCast;

		deviceMenuChromecast.append(MenuFactory.chromeCastItem(device, doConnectCast));
		
                break;

            case DeviceMatcher.TYPES.UPNP:

                if (DeviceMatcher.isRaumfeld(device)) {

		    var doConnectUPnP = function onClicked() {

                        device.controls = new RaumfeldZone(device);

			switchingDevice = true;

                        logger.info('Attempting to play to Raumfeld device', device.name);

		    	stopCurrentDeviceMatch(function() {
		
				// Sets OSX selected input and output audio devices to Soundflower
				LocalSourceSwitcher.switchSource({
				    output: 'Soundflower (2ch)',
				    input: 'Soundflower (2ch)'
				});

			    	onStartStream();

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

				device.controls.on('stopped', function() {
					if (device == currentDevice && !switchingDevice) {
					    device.controls.play(streamingAddress, onStreamingUpdateUI.bind({device: device, a: 1, opMenu: deviceMenuUPnP}));
					}
				});

				device.controls.registerErrorHandler(function(err){
					onStop();
				});

				device.controls.play(streamingAddress, onStreamingUpdateUI.bind({device: device, a: 1, opMenu: deviceMenuUPnP}));
			}, device);

                    };

		    device.doConnect = doConnectUPnP;
		
                    deviceMenuUPnP.append(MenuFactory.raumfeldDeviceItem(device, doConnectUPnP));

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

    onStartStream(() => scanForDevices());
});
