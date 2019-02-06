"use strict"

import packageFile from '../package.json'
const VERSION = packageFile.version
const PLUGIN_NAME = packageFile.name
const FRIENDLY_NAME = "VaillantVRC9xx"

import VRC700Thermostat from './VRC700Thermostat.mjs'
import VRC9xxAPIPoller, { VAILLANT_POLLER_EVENTS } from './VaillantAPIPoller.mjs'

export default (homebridge) => {
    homebridge.registerPlatform(PLUGIN_NAME, FRIENDLY_NAME, VaillantVRC9xxPlatform, true);
}

class VaillantVRC9xxPlatform {

    constructor(log, config, api) {

        log(`${FRIENDLY_NAME} Platform loaded - version ${VERSION}`)

        if (!config) {
            log.warn(`Ignoring ${FRIENDLY_NAME} Platform setup because it is not configured`)
            this.disabled = true
            return
        }

        this.config = config
        this.api = api
        this.log = log

        // state
        //this._accessories = []

        // create API client & poller
        this.Poller = new VRC9xxAPIPoller(config.api, log);
        this.Poller
            .on(VAILLANT_POLLER_EVENTS.AUTHENTICATION, this.authenticatedEvent.bind(this))
            .on(VAILLANT_POLLER_EVENTS.FACILITIES, this.facilitiesEvent.bind(this))
            
        // register lifecycle message
        this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));

    }

    async didFinishLaunching() {
        this.Poller.start();
    }

    authenticatedEvent(e) {
        this.log("Authenticated: ", e.success)
    }

    facilitiesEvent(facility) {

        const name = facility.name
        const serial = facility.serialNumber
        const firmware = facility.firmwareVersion

        this.log(`New facility ${name} - ${serial}`)
        var uuid = this.api.hap.uuid.generate(serial);

        const config_data = {
            name,
            facility_serial: serial,
            firmware,
            uuid
        }

        var accessory = new VRC700Thermostat(this.api, this.log, config_data);
        this.registerAccessories([accessory]);

    }

    accessories(callback) {
        this.log("Received callback");
        this.registerAccessories = callback;
    }

    

}