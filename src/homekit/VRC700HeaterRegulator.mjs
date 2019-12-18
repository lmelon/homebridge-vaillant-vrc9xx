import VRC700Accessory from './VRC700Accessory.mjs'

let Characteristic, Service

class VRC700HeaterRegulator extends VRC700Accessory {
    constructor(config, desc, api, platform, log) {
        super(config, desc, api, platform, log)

        Characteristic = api.hap.Characteristic
        Service = api.hap.Service

        this.name = desc.name
        this.api = api

        //State
        this.CurrentHeatingCoolingState = undefined
        this.CurrentTemperature = undefined

        this.TargetDayTemperature = undefined
        this.TargetNightTemperature = undefined
        this.TargetHeatingCoolingState = undefined

        this.setTargetDayTemperatureCallback = desc.target_temp.update_callback
        this.setTargetNightTemperatureCallback = desc.target_reduced_temp.update_callback
        this.setHeatingModeCallback = desc.target_status.update_callback

        platform.registerObserver(desc.serial, desc.current_temp.path, this.updateCurrentTemperature.bind(this))
        platform.registerObserver(
            desc.serial,
            desc.current_status.path,
            this.updateCurrentHeatingCoolingState.bind(this)
        )

        platform.registerObserver(desc.serial, desc.target_temp.path, this.updateTargetDayTemperature.bind(this))
        platform.registerObserver(
            desc.serial,
            desc.target_reduced_temp.path,
            this.updateTargetNightTemperature.bind(this)
        )
        platform.registerObserver(desc.serial, desc.target_status.path, this.updateTargetHeatingCoolingState.bind(this))
    }

    // --------- CURRENT STATE
    getCurrentHeatingCoolingState(callback) {
        switch (this.CurrentHeatingCoolingState) {
            case 'STANDBY':
                return callback(null, Characteristic.CurrentHeatingCoolingState.OFF)
            case 'HEATING':
                return callback(null, Characteristic.CurrentHeatingCoolingState.HEAT)
            default:
                return callback(null, Characteristic.CurrentHeatingCoolingState.COOL)
        }
    }

    updateCurrentHeatingCoolingState(value) {
        this.log(`Updating Current State from ${this.CurrentHeatingCoolingState} to ${value.current}`)

        this.CurrentHeatingCoolingState = value.current

        let newValue
        switch (this.CurrentHeatingCoolingState) {
            case 'STANDBY':
                newValue = Characteristic.CurrentHeatingCoolingState.OFF
                break
            case 'HEATING':
                newValue = Characteristic.CurrentHeatingCoolingState.HEAT
                break
            default:
                newValue = Characteristic.CurrentHeatingCoolingState.COOL
        }

        this.accessoryService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(newValue)
    }

    // --------- TARGET STATE
    vrc700ToHomeKitTargetState(vrc700state) {
        switch (this.TargetHeatingCoolingState) {
            case 'OFF':
                return Characteristic.TargetHeatingCoolingState.OFF
            case 'DAY':
                return Characteristic.TargetHeatingCoolingState.HEAT
            case 'AUTO':
                return Characteristic.TargetHeatingCoolingState.AUTO
            case 'NIGHT':
                return Characteristic.TargetHeatingCoolingState.COOL
        }
    }

    hkToVRC700TargetState(hkState) {
        switch (hkState) {
            case Characteristic.TargetHeatingCoolingState.OFF:
                return 'OFF'
            case Characteristic.TargetHeatingCoolingState.HEAT:
                return 'DAY'
            case Characteristic.TargetHeatingCoolingState.AUTO:
                return 'AUTO'
            case Characteristic.TargetHeatingCoolingState.COOL:
                return 'NIGHT'
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

        this.updateTargetTemperature()
    }

    setTargetHeatingCoolingState(value, callback) {
        let vrc700State = this.hkToVRC700TargetState(value)

        if (this.TargetHeatingCoolingState !== vrc700State) {
            this.log(`Setting Target State from ${this.TargetHeatingCoolingState} to ${vrc700State}`)

            this.TargetHeatingCoolingState = vrc700State
            this.setHeatingModeCallback(this.TargetHeatingCoolingState)

            this.updateTargetTemperature()
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

    // --------- TARGET TEMPERATURE
    getTargetTemperature(callback) {
        this.log('Getting Target Temperature')

        let targetTemp = this.TargetDayTemperature

        if (this.TargetHeatingCoolingState === 'NIGHT') {
            targetTemp = this.TargetNightTemperature
        }

        return callback(null, targetTemp)
    }

    updateTargetTemperature() {
        let targetTemp = this.TargetDayTemperature
        if (this.TargetHeatingCoolingState === 'NIGHT') {
            targetTemp = this.TargetNightTemperature
        }

        this.log('Target Temperature is now:', targetTemp)

        this.accessoryService.getCharacteristic(Characteristic.TargetTemperature).updateValue(targetTemp)
    }

    setTargetTemperature(value, callback) {
        if (this.TargetHeatingCoolingState === 'NIGHT') {
            return this.setTargetNightTemperature(value, callback)
        }

        return this.setTargetDayTemperature(value, callback)
    }

    // --------- TARGET DAY TEMPERATURE
    updateTargetDayTemperature(value) {
        this.log(`Updating Target Day Temperature from ${this.TargetDayTemperature} to ${value.current}`)
        this.TargetDayTemperature = value.current

        this.accessoryService
            .getCharacteristic(Characteristic.TargetDayTemperature)
            .updateValue(this.TargetDayTemperature)

        this.updateTargetTemperature()
    }

    getTargetDayTemperature(callback) {
        this.log('Getting Target Day Temperature')

        let value = this.TargetDayTemperature
        if (this.TemperatureDisplayUnits == Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
            value = cToF(value)
        }

        return callback(null, value)
    }

    setTargetDayTemperature(value, callback) {
        this.log('Setting Target Day Temperature to: ', value)

        if (this.TemperatureDisplayUnits === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
            value = fToC(value)
        }

        this.setTargetDayTemperatureCallback(value)
        this.TargetDayTemperature = value

        return callback(null)
    }

    // --------- TARGET NIGHT TEMPERATURE
    updateTargetNightTemperature(value) {
        this.log(`Updating Target Night Temperature from ${this.TargetNightTemperature} to ${value.current}`)
        this.TargetNightTemperature = value.current

        this.accessoryService
            .getCharacteristic(Characteristic.TargetNightTemperature)
            .updateValue(this.TargetNightTemperature)

        this.updateTargetTemperature()
    }

    getTargetNightTemperature(callback) {
        this.log('Getting Target Night Temperature')

        let value = this.TargetNightTemperature
        if (this.TemperatureDisplayUnits == Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
            value = cToF(value)
        }

        return callback(null, value)
    }

    setTargetNightTemperature(value, callback) {
        this.log('Setting Target Night Temperature to: ', value)

        if (this.TemperatureDisplayUnits === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
            value = fToC(value)
        }

        this.setTargetNightTemperatureCallback(value)
        this.TargetNightTemperature = value

        return callback(null)
    }

    getTemperatureDisplayUnits(callback) {
        this.log('Getting Temperature Display Units')
        const json = {
            units: 0,
        }
        if (json.units == 0) {
            this.TemperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS
            this.log('Temperature Display Units is ℃')
        } else if (json.units == 1) {
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
        var regulatorService = new Service.Thermostat(this.name, this.name)

        regulatorService
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', this.getCurrentHeatingCoolingState.bind(this))

        regulatorService
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on('get', this.getTargetHeatingCoolingState.bind(this))
            .on('set', this.setTargetHeatingCoolingState.bind(this))

        regulatorService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', this.getCurrentTemperature.bind(this))

        regulatorService
            .getCharacteristic(Characteristic.TargetTemperature)
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this))

        regulatorService
            .getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .on('get', this.getTemperatureDisplayUnits.bind(this))
            .on('set', this.setTemperatureDisplayUnits.bind(this))

        regulatorService.getCharacteristic(Characteristic.Name).on('get', this.getName.bind(this))

        regulatorService.getCharacteristic(Characteristic.TargetHeatingCoolingState).setProps({
            validValues: [0, 1, 2, 3],
        })

        regulatorService.getCharacteristic(Characteristic.CurrentTemperature).setProps({
            maxValue: 100,
            minValue: 0,
            minStep: 0.1,
        })

        regulatorService.getCharacteristic(Characteristic.TargetTemperature).setProps({
            maxValue: 30,
            minValue: 5,
            minStep: 0.5,
        })

        regulatorService
            .getCharacteristic(Characteristic.TargetNightTemperature)
            .on('get', this.getTargetNightTemperature.bind(this))
            .on('set', this.setTargetNightTemperature.bind(this))

        regulatorService.getCharacteristic(Characteristic.TargetNightTemperature).setProps({
            maxValue: 30,
            minValue: 5,
            minStep: 0.5,
        })

        regulatorService
            .getCharacteristic(Characteristic.TargetDayTemperature)
            .on('get', this.getTargetDayTemperature.bind(this))
            .on('set', this.setTargetDayTemperature.bind(this))

        regulatorService.getCharacteristic(Characteristic.TargetDayTemperature).setProps({
            maxValue: 30,
            minValue: 5,
            minStep: 0.5,
        })

        this.accessoryService = regulatorService

        return regulatorService
    }
}

function cToF(value) {
    return Number(((9 * value) / 5 + 32).toFixed(0))
}

function fToC(value) {
    return Number(((5 * (value - 32)) / 9).toFixed(2))
}

export default VRC700HeaterRegulator
