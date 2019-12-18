import _ from 'lodash'

import VRC700Switch from './VRC700Switch.mjs'
import VRC700TemperatureSensor from './VRC700TemperatureSensor.mjs'
import VRC700ValveRegulator from './VRC700ValveRegulator.mjs'
import VRC700HeaterRegulator from './VRC700HeaterRegulator.mjs'
import VRC700HotWaterRegulator from './VRC700HotWaterRegulator.mjs'

class VRC700Thermostat {
    constructor(api, log, config, platform) {
        //Homebridge Config.
        this.log = log
        this.api = api
        this.platform = platform
        this.config = config

        this.sensors = config.sensors
        this.regulators = config.regulators
        this.dhw_regulators = config.dhw_regulators
        this.rbr_regulators = config.rbr_regulators
        this.switches = config.switches

        // state
        this._accessories = this.createAccessories()
    }

    getAccessories() {
        return this._accessories
    }

    createAccessories() {
        const accessories = [...this.createRegulators(), ...this.createSensors(), ...this.createSwitches()]
        return accessories
    }

    createSwitches() {
        let accessories = []
        this.switches.forEach(descr => {
            let accessory = new VRC700Switch(this.config, descr, this.api, this.platform, this.log)
            accessories.push(accessory)
        })

        return accessories
    }

    createSensors() {
        let accessories = []
        this.sensors.forEach(descr => {
            let accessory = new VRC700TemperatureSensor(this.config, descr, this.api, this.platform, this.log)
            accessories.push(accessory)
        })

        return accessories
    }

    createRegulators() {
        let accessories = []
        this.regulators.forEach(descr => {
            let regulator = new VRC700HeaterRegulator(this.config, descr, this.api, this.platform, this.log)
            accessories.push(regulator)
        })

        this.dhw_regulators.forEach(descr => {
            let regulator = new VRC700HotWaterRegulator(this.config, descr, this.api, this.platform, this.log)
            accessories.push(regulator)
        })

        this.rbr_regulators.forEach(descr => {
            let regulator = new VRC700ValveRegulator(this.config, descr, this.api, this.platform, this.log)
            accessories.push(regulator)
        })

        return accessories
    }
}

export default VRC700Thermostat
