'use strict'

import util from 'util'
import packageFile from '../../package.json'
const VERSION = packageFile.version
const PLUGIN_NAME = packageFile.name
const FRIENDLY_NAME = 'VaillantVRC9xx'

import VRC700Thermostat from './VRC700Thermostat.mjs'
import VRC9xxAPI from '../api/VaillantAPIClient.mjs'
import VRC9xxAPIPoller, { VAILLANT_POLLER_EVENTS } from '../api/VaillantAPIPoller.mjs'
import { buildFacilityDescriptor } from './HomeKitDescriptor.mjs'

export default homebridge => {
    homebridge.registerPlatform(PLUGIN_NAME, FRIENDLY_NAME, VaillantVRC9xxPlatform, true)
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
        this._accessories = {}

        // create API client & poller
        this.VaillantAPI = new VRC9xxAPI(
            {
                smartphoneId: this.config.api.user.device,
                username: this.config.api.user.name,
                password: this.config.api.user.password,
            },
            log
        )

        this.Poller = new VRC9xxAPIPoller(this.VaillantAPI, this.config.api.polling, log)
        this.Poller.on(VAILLANT_POLLER_EVENTS.FACILITIES, this.facilitiesEvent.bind(this))
        this.Poller.on(VAILLANT_POLLER_EVENTS.FACILITIES_DONE, this.facilitiesDone.bind(this))

        defineCustomCharateristics(api.hap.Characteristic)

        // register lifecycle message
        this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this))
    }

    async didFinishLaunching() {
        this.log('Finished launching')
    }

    facilitiesEvent(descriptor) {
        try {
            const facility = buildFacilityDescriptor(descriptor, this.VaillantAPI)

            const name = facility.name
            const serial = facility.serialNumber

            if (this._accessories[serial]) {
                // nothing to do, already known
                return
            }

            var uuid = this.api.hap.uuid.generate(serial)
            this.log(`New facility ${name} - ${serial} - ${uuid}`)

            const config_data = {
                name,
                serial,
                firmware: facility.firmwareVersion,
                gateway: facility.gateway,
                uuid,
                sensors: facility.sensors,
                regulators: facility.regulators,
                dhw_regulators: facility.dhw_regulators,
                switches: facility.switches,
            }

            this._accessories[serial] = config_data
        } catch (error) {
            this.log(error)
            throw error
        }
    }

    facilitiesDone() {
        try {
            let accessories = Object.entries(this._accessories)
                .map(([serial, config]) => new VRC700Thermostat(this.api, this.log, config, this))
                .map(thermostat => thermostat.getAccessories())
                .reduce((prev, val) => {
                    this.log(val)
                    prev.push(...val)
                    return prev
                }, [])

            this.registerAccessories(accessories)
        } catch (error) {
            this.log(error)
            throw error
        }

        this.log(`End of initialization`)
    }

    registerObserver(serial, path, observer) {
        return this.Poller.subscribe(serial, path, observer)
    }

    async accessories(callback) {
        this.log('Received callback')
        this.registerAccessories = callback

        this.log('Start polling for data')
        await this.Poller.start()
    }
}

function defineCustomCharateristics(Characteristic) {
    Characteristic.TargetNightTemperature = function() {
        Characteristic.call(this, 'Target Night Temperature', '2DB4D12B-B2DD-42EA-A469-A23051F478D7')
        this.setProps({
            format: Characteristic.Formats.FLOAT,
            unit: Characteristic.Units.CELSIUS,
            maxValue: 30,
            minValue: 5,
            minStep: 0.5,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY],
        })
        this.value = this.getDefaultValue()
    }

    util.inherits(Characteristic.TargetNightTemperature, Characteristic)
    Characteristic.TargetNightTemperature.UUID = '2DB4D12B-B2DD-42EA-A469-A23051F478D7'

    Characteristic.TargetDayTemperature = function() {
        Characteristic.call(this, 'Target Day Temperature', 'E0C2907C-0011-4392-87B7-10622C654D5C')
        this.setProps({
            format: Characteristic.Formats.FLOAT,
            unit: Characteristic.Units.CELSIUS,
            maxValue: 30,
            minValue: 5,
            minStep: 0.5,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY],
        })
        this.value = this.getDefaultValue()
    }

    util.inherits(Characteristic.TargetDayTemperature, Characteristic)
    Characteristic.TargetDayTemperature.UUID = 'E0C2907C-0011-4392-87B7-10622C654D5C'
}
