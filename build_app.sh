#!/usr/bin/env bash

electron-packager . devicecast --platform=darwin --arch=x64 --icon=./assets/icon.icns --overwrite --enable-logging
