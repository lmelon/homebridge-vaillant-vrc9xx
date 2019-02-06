// Wemo Platform Plugin for HomeBridge (https://github.com/nfarina/homebridge)
//
// Remember to add platform to config.json. Example:
// "platforms": [
//      {
//          "platform": "BelkinWeMo",
//          "name": "Belkin WeMo",
//          "noMotionTimer": 60,  // optional: [WeMo Motion only] a timer (in seconds) which is started no motion is detected, defaults to 60
//          "ignoredDevices": [], // optional: an array of Device serial numbers to ignore
//          "manualDevices": [],  // optional: an array of config urls for devices to be manually configured eg. "manualDevices": ["http://192.168.1.20:49153/setup.xml"]
//          "discovery": true,    // optional: turn off device discovery if not required
//          "wemoClient": {}      // optional: initialisation parameters to be passed to wemo-client
//      }
// ],

'use strict';

const packageFile = require('../package.json');
const VERSION = packageFile.version;
const PLUGIN_NAME = packageFile.name;
const FRIENDLY_NAME = "VaillantVRC9xx"

var HOMEBRIDGE = {
    Accessory: null,
    Service: null,
    Characteristic: null,
    UUIDGen: null
};

const VRC700Thermostat = require('./VRC700Thermostat');
const VRC9xxAPI = require('./vaillant-client');

module.exports = (homebridge) => {

    HOMEBRIDGE.Accessory = homebridge.platformAccessory;
    HOMEBRIDGE.Characteristic = homebridge.hap.Characteristic;
    HOMEBRIDGE.Service = homebridge.hap.Service;
    HOMEBRIDGE.UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform(PLUGIN_NAME, FRIENDLY_NAME, VaillantVRC9xxPlatform, true);

}

class VaillantVRC9xxPlatform {

    constructor(log, config, api) {

        log(`VRC9xx Platform loaded - version ${VERSION}`);

        if (!config) {
            log.warn("Ignoring VRC9xx Platform setup because it is not configured");
            this.disabled = true;
            return;
        }

        this.config = config;
        this.api = api;
        this.log = log;

        // create API client
        this.VRC9xxAPI = new VRC9xxAPI(this.createCredential(config), log);

        // register lifecycle message
        this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));

    }

    async didFinishLaunching() {

        await this.VRC9xxAPI.logIn();
        const facilities = await this.VRC9xxAPI.getFacilities();
        this.log(facilities);

        let _accessories = [];

        
        var uuid = HOMEBRIDGE.UUIDGen.generate("Home");
        this.log(uuid);

        const config_data = {
            name: "Home",
            serial_number: uuid
        }

        var accessory = new VRC700Thermostat(this.api, this.log, config_data);
        _accessories.push(accessory);

        this.registerAccessories(_accessories);

    }

    accessories(callback) {
        this.log("Received callback");
        this.registerAccessories = callback;
    }

    createCredential(config) {
        return {
            smartphoneId: config.api.user.device,
            username: config.api.user.name,
            password: config.api.user.password
        }
    }

}