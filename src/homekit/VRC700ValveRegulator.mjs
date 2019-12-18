import VRC700Accessory from './VRC700Accessory.mjs'

let Characteristic, Service

const BATTERY_LEVEL_NORMAL = 0
const BATTERY_LEVEL_LOW = 1

class VRC700ValveRegulator extends VRC700Accessory {
    constructor(config, desc, api, platform, log) {
        super(config, desc, api, platform, log)

        Characteristic = api.hap.Characteristic
        Service = api.hap.Service

        this.name = desc.name

        //State
        this.CurrentHeatingCoolingState = undefined
        this.CurrentTemperature = undefined
        this.TargetTemperature = undefined
        this.StatusLowBattery = undefined

        this.setTargetTemperatureCallback = desc.target_temp.update_callback
        this.setHeatingModeCallback = desc.target_status.update_callback

        platform.registerObserver(desc.serial, desc.current_temp.path, this.updateCurrentTemperature.bind(this))
        platform.registerObserver(desc.serial, desc.status_low_battery.path, this.updateStatusLowBattery.bind(this))

        platform.registerObserver(
            desc.serial,
            desc.current_status.path,
            this.updateCurrentHeatingCoolingState.bind(this)
        )

        platform.registerObserver(desc.serial, desc.target_temp.path, this.updateTargetTemperature.bind(this))
        platform.registerObserver(desc.serial, desc.target_status.path, this.updateTargetHeatingCoolingState.bind(this))
    }

    // --------- CURRENT STATE
    getCurrentHeatingCoolingState(callback) {
        if (this.CurrentHeatingCoolingState === 'OFF') {
            return callback(null, Characteristic.CurrentHeatingCoolingState.OFF)
        }

        if (this.CurrentTemperature > this.TargetTemperature) {
            return callback(null, Characteristic.CurrentHeatingCoolingState.OFF)
        }

        return callback(null, Characteristic.CurrentHeatingCoolingState.HEAT)
    }

    updateCurrentHeatingCoolingState(value) {
        this.log(`Updating Current State from ${this.CurrentHeatingCoolingState} to ${value.current}`)
        this.CurrentHeatingCoolingState = value.current

        this.getCurrentHeatingCoolingState((_, value) =>
            this.accessoryService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(value)
        )
    }

    // --------- TARGET STATE
    vrc700ToHomeKitTargetState(vrc700state) {
        switch (vrc700state) {
            case 'OFF':
                return Characteristic.TargetHeatingCoolingState.OFF
            case 'MANUAL':
                return Characteristic.TargetHeatingCoolingState.HEAT
            case 'AUTO':
                return Characteristic.TargetHeatingCoolingState.AUTO
        }
    }

    hkToVRC700TargetState(hkState) {
        switch (hkState) {
            case Characteristic.TargetHeatingCoolingState.OFF:
                return 'OFF'
            case Characteristic.TargetHeatingCoolingState.HEAT:
                return 'MANUAL'
            case Characteristic.TargetHeatingCoolingState.AUTO:
                return 'AUTO'
            case Characteristic.TargetHeatingCoolingState.COOL:
                return 'OFF'
        }
    }

    getTargetHeatingCoolingState(callback) {
        let hkState = this.vrc700ToHomeKitTargetState(this.TargetHeatingCoolingState)
        return callback(null, hkState)
    }

    updateTargetHeatingCoolingState(value) {
        this.log(`Updating Target State from ${this.TargetHeatingCoolingState} to ${value.current}`)
        this.TargetHeatingCoolingState = value.current

        let hkState = this.vrc700ToHomeKitTargetState(this.TargetHeatingCoolingState)

        this.accessoryService.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(hkState)
    }

    setTargetHeatingCoolingState(value, callback) {
        let vrc700State = this.hkToVRC700TargetState(value)

        if (this.TargetHeatingCoolingState !== vrc700State) {
            this.log(`Setting Target State from ${this.TargetHeatingCoolingState} to ${vrc700State}`)

            this.TargetHeatingCoolingState = vrc700State
            this.setHeatingModeCallback(this.TargetHeatingCoolingState)
        }

        return callback(null)
    }

    // --------- CURRENT TEMPERATURE
    getCurrentTemperature(callback) {
        this.log('Getting Current Temperature')
        return callback(null, this.CurrentTemperature)
    }

    updateCurrentTemperature(value) {
        this.log(`Updating Current Temperature from ${this.CurrentTemperature} to ${value.current}`)
        this.CurrentTemperature = value.current

        this.accessoryService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(this.CurrentTemperature)
    }

    // --------- Low Battery
    getStatusLowBattery(callback) {
        this.log('Getting Current Battery Status')
        return callback(null, this.StatusLowBattery)
    }

    updateStatusLowBattery(value) {
        this.log(`Updating Current Battery Status from ${this.StatusLowBattery} to ${value.current}`)
        this.StatusLowBattery = value.current ? BATTERY_LEVEL_LOW : BATTERY_LEVEL_NORMAL

        this.accessoryService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(this.StatusLowBattery)
    }

    // --------- TARGET TEMPERATURE
    updateTargetTemperature(value) {
        this.log(`Updating Target Room Temperature from ${this.TargetTemperature} to ${value.current}`)
        this.TargetTemperature = value.current

        this.accessoryService.getCharacteristic(Characteristic.TargetTemperature).updateValue(this.TargetTemperature)
    }

    getTargetTemperature(callback) {
        this.log('Getting Target Room Temperature')
        return callback(null, this.TargetTemperature)
    }

    setTargetTemperature(value, callback) {
        if (this.TemperatureDisplayUnits === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
            value = cToF(value)
        }

        this.setTargetTemperatureCallback(value)
        this.TargetTemperature = value
        this.log('Setting Target Room Temperature to: ', value)

        return callback(null)
    }

    getTemperatureDisplayUnits(callback) {
        this.log('Getting Temperature Display Units')
        const json = {
            units: 0,
        }
        if (json.units === 0) {
            this.TemperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS
            this.log('Temperature Display Units is ℃')
        } else if (json.units === 1) {
            this.TemperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.FAHRENHEIT
            this.log('Temperature Display Units is ℉')
        }
        return callback(null, this.TemperatureDisplayUnits)
    }

    setTemperatureDisplayUnits(value, callback) {
        this.log(`Setting Temperature Display Units from ${this.TemperatureDisplayUnits} to ${value}`)
        this.TemperatureDisplayUnits = value
        return callback(null)
    }

    getName(callback) {
        var error
        this.log('getName :', this.name)
        error = null
        return callback(error, this.name)
    }

    createAccessoryService() {
        var regulator = new Service.Thermostat(this.name, this.name)

        regulator
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', this.getCurrentHeatingCoolingState.bind(this))

        regulator
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on('get', this.getTargetHeatingCoolingState.bind(this))
            .on('set', this.setTargetHeatingCoolingState.bind(this))

        regulator.getCharacteristic(Characteristic.CurrentTemperature).on('get', this.getCurrentTemperature.bind(this))

        regulator.getCharacteristic(Characteristic.StatusLowBattery).on('get', this.getStatusLowBattery.bind(this))

        regulator
            .getCharacteristic(Characteristic.TargetTemperature)
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this))

        regulator
            .getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .on('get', this.getTemperatureDisplayUnits.bind(this))
            .on('set', this.setTemperatureDisplayUnits.bind(this))

        regulator.getCharacteristic(Characteristic.Name).on('get', this.getName.bind(this))

        regulator.getCharacteristic(Characteristic.CurrentHeatingCoolingState).setProps({
            maxValue: 1,
            minValue: 0,
            validValues: [0, 1],
        })

        regulator.getCharacteristic(Characteristic.TargetHeatingCoolingState).setProps({
            validValues: [0, 1, 3],
        })

        regulator.getCharacteristic(Characteristic.CurrentTemperature).setProps({
            maxValue: 100,
            minValue: 0,
            minStep: 0.1,
        })

        regulator.getCharacteristic(Characteristic.TargetTemperature).setProps({
            maxValue: 30,
            minValue: 5,
            minStep: 0.5,
        })

        this.accessoryService = regulator

        return regulator
    }
}

export default VRC700ValveRegulator
