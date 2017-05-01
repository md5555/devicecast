## DeviceCast

Based on the work done by [@andresgottlieb](https://github.com/andresgottlieb) and the project [Soundcast](https://github.com/andresgottlieb/soundcast) as well as the [original DeviceCast](https://github.com/jamesmorgan/devicecast)

### Installation

1. Download and install [Soundflower v2.0b2](https://github.com/mattingalls/Soundflower/releases/download/2.0b2/Soundflower-2.0b2.dmg) (if you have a previous version, follow [this instructions](https://support.shinywhitebox.com/hc/en-us/articles/202751790-Uninstalling-Soundflower) to uninstall it and then install v2.0b2).
2. _checkout & build_ `npm install && ./build_app.sh` (currently broken)
 **OR**
  _checkout & hack_ `npm install && ./run_app.sh`
3. If you want it to start automatically with your computer do [this](http://www.howtogeek.com/206178/mac-os-x-change-which-apps-start-automatically-at-login/).

Don't forget rebooting your computer between both steps.

## Tested On

| Device  | Outcome |
| ------- | ------- |
| Chromecast v1   | PASS |
| Raumfeld One S (UPnP) | PASS |
| Raumfeld One S (Google Cast) | PASS |

## Development

- To package the app, use [electron-packager](https://github.com/maxogden/electron-packager) `./build_app.sh` (currently broken)

It has the ability to:

* Scan the network for available UPNP devices
* Scan the network for available Chromecasts (Both HDMI & Audio)
* Redirect internal Mac OSX sound through Soundflower to create a reliable stream of sound
* Direct this Stream over UPNP or Google Cast

#### Known Issues

#### Release Notes



#### TODO

