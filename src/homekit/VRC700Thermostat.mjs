import _ from 'lodash'
import util from 'util'
import historyFactory from 'fakegato-history'
import moment from 'moment'
import homebridgeLib from 'homebridge-lib'

const inherits = util.inherits

let Accessory, Characteristic, Service, HistoryService, Eve

class VRC700Thermostat {
    constructor(api, log, config, platform) {
        Accessory = api.hap.Accessory
        Characteristic = api.hap.Characteristic
        Service = api.hap.Service
        HistoryService = historyFactory(api)
        Eve = new homebridgeLib.EveHomeKitTypes(api)

        //Homebridge Config.
        this.log = log
        this.api = api
        this.platform = platform
        this.config = config

        this.sensors = config.sensors
        this.regulators = config.regulators
        this.dhw_regulators = config.dhw_regulators
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
            let accessory = new VRC700Switch(this.config, descr, this.platform, this.log)
            accessories.push(accessory)
        })

        return accessories
    }

    createSensors() {
        let accessories = []
        this.sensors.forEach(descr => {
            let accessory = new VRC700TemperatureSensor(this.config, descr, this.platform, this.log)
            accessories.push(accessory)
        })

        return accessories
    }

    createRegulators() {
        let accessories = []
        this.regulators.forEach(descr => {
            let regulator = new VRC700HeaterRegulator(this.config, descr, this.platform, this.api, this.log)
            accessories.push(regulator)
        })

        this.dhw_regulators.forEach(descr => {
            let regulator = new VRC700HotWaterRegulator(this.config, descr, this.platform, this.log)
            accessories.push(regulator)
        })

        return accessories
    }
}

class VRC700Accessory {
    constructor(config, desc, platform, log) {
        this.name = config.name || 'VRC700'
        this.manufacturer = 'Vaillant'
        this.model = config.gateway
        this.firmware = config.firmware || 'UNKNOWN'
        this.serial = config.serial

        this._services = undefined
        this.log = (...args) => log(this.name, '>', ...args)
    }

    getServices() {
        if (!this._services) {
            this._services = this.createServices()
        }

        return this._services
    }

    getAccessoryInformationService() {
        return new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial)
            .setCharacteristic(Characteristic.FirmwareRevision, this.firmware)
            .setCharacteristic(Characteristic.HardwareRevision, this.version)
    }

    getBridgingStateService() {
        var bridgingStateService = new Service.BridgingState()
            .setCharacteristic(Characteristic.Reachable, true)
            .setCharacteristic(Characteristic.LinkQuality, 4)
            .setCharacteristic(Characteristic.AccessoryIdentifier, this.name)
            .setCharacteristic(Characteristic.Category, Accessory.Categories.SWITCH)

        return bridgingStateService
    }

    createServices() {
        var services = [this.getAccessoryInformationService(), this.getBridgingStateService()]
        var accessoryService = this.createAccessoryService()

        if (Array.isArray(accessoryService)) {
            accessoryService.forEach(serv => {
                services.push(serv)
            })
        } else {
            services.push(accessoryService)
        }

        return services
    }
}

class VRC700Switch extends VRC700Accessory {
    constructor(config, desc, platform, log) {
        super(config, desc, platform, log)

        this.name = desc.name
        this.currentValue = Characteristic.ContactSensorState.CONTACT_NOT_DETECTED

        platform.registerObserver(desc.serial, desc.path, this.updateCurrentValue.bind(this))
    }

    getCurrentValue(callback) {
        return callback(null, this.currentValue)
    }

    updateCurrentValue(value) {
        this.currentValue = value.current
            ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : Characteristic.ContactSensorState.CONTACT_DETECTED

        this.accessoryService.getCharacteristic(Characteristic.ContactSensorState).updateValue(this.currentValue)
    }

    createAccessoryService() {
        let service = new Service.ContactSensor(this.name, this.name)
        service
            .setCharacteristic(Characteristic.Name, this.name)
            .getCharacteristic(Characteristic.ContactSensorState)
            .on('get', this.getCurrentValue.bind(this))

        this.accessoryService = service

        return service
    }
}

class VRC700TemperatureSensor extends VRC700Accessory {
    constructor(config, desc, platform, log) {
        super(config, desc, platform, log)

        this.name = desc.name
        this.displayName = desc.name

        this.currentTemperature = undefined
        this.serial = desc.id

        this.platform = platform

        this.platform.registerObserver(desc.serial, desc.path, this.updateCurrentTemperature.bind(this))
    }

    getCurrentTemperature(callback) {
        return callback(null, this.currentTemperature)
    }

    updateCurrentTemperature(value) {
        this.log(`Updating Current Temperature from ${this.currentTemperature} to ${value.current}`)
        this.currentTemperature = value.current

        this.accessoryService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(this.currentTemperature)

        this.addHistoricalEntry()
    }

    addHistoricalEntry() {
        /*
            We want an entry at least every 5 min. So schedule a timer to log 1 data point every 10 mins (if no new data comes in).
            If new data is received, cancel the existing timer and schedule a new one (in 10 mins from now).
        */

        if (this.historyTimer) {
            clearTimeout(this.historyTimer)
            this.historyTimer = null
        }

        const entry = { time: moment().unix(), temp: this.currentTemperature }
        this.loggingService.addEntry(entry)

        this.historyTimer = setTimeout(this.addHistoricalEntry.bind(this), 5 * 60 * 1000)
    }

    createAccessoryService() {
        let service = new Eve.Services.TemperatureSensor(this.name, this.name)
        service
            .setCharacteristic(Characteristic.Name, this.name)
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', this.getCurrentTemperature.bind(this))

        this.accessoryService = service

        const config = {
            disableTimer: true,
            disableRepeatLastData: true,
            storage: 'fs',
            path: this.platform.api.user.storagePath() + '/accessories',
            filename: 'history_' + this.serial + '.json',
        }
        this.loggingService = new HistoryService('weather', this, config)

        return [service, this.loggingService]
    }
}

class VRC700HeaterRegulator extends VRC700Accessory {
    constructor(config, desc, platform, api, log) {
        super(config, desc, platform, log)

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

class VRC700HotWaterRegulator extends VRC700Accessory {
    constructor(config, desc, platform, log) {
        super(config, desc, platform, log)

        this.name = desc.name

        //State
        this.CurrentHeatingCoolingState = undefined
        this.CurrentTemperature = undefined
        this.TargetTemperature = undefined

        this.setTargetTemperatureCallback = desc.target_temp.update_callback
        this.setHeatingModeCallback = desc.target_status.update_callback

        platform.registerObserver(desc.serial, desc.current_temp.path, this.updateCurrentTemperature.bind(this))
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
        switch (this.CurrentHeatingCoolingState) {
            case 'OFF':
                return callback(null, Characteristic.CurrentHeatingCoolingState.OFF)
            case 'DAY':
                return callback(null, Characteristic.CurrentHeatingCoolingState.HEAT)
            default:
                return callback(null, Characteristic.CurrentHeatingCoolingState.HEAT)
        }
    }

    updateCurrentHeatingCoolingState(value) {
        this.log(`Updating Current State from ${this.CurrentHeatingCoolingState} to ${value.current}`)

        this.CurrentHeatingCoolingState = value.current

        let newValue
        switch (this.CurrentHeatingCoolingState) {
            case 'OFF':
                newValue = Characteristic.CurrentHeatingCoolingState.OFF
                break
            case 'DAY':
                newValue = Characteristic.CurrentHeatingCoolingState.HEAT
                break
            default:
                newValue = Characteristic.CurrentHeatingCoolingState.HEAT
        }

        this.accessoryService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(newValue)
    }

    // --------- TARGET STATE
    vrc700ToHomeKitTargetState(vrc700state) {
        switch (vrc700state) {
            case 'OFF':
                return Characteristic.TargetHeatingCoolingState.OFF
            case 'ON':
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
                return 'ON'
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

    // --------- TARGET TEMPERATURE
    updateTargetTemperature(value) {
        this.log(`Updating Target DHW Temperature from ${this.TargetTemperature} to ${value.current}`)
        this.TargetTemperature = value.current

        this.accessoryService.getCharacteristic(Characteristic.TargetTemperature).updateValue(this.TargetTemperature)
    }

    getTargetTemperature(callback) {
        this.log('Getting Target DHW Temperature')
        return callback(null, this.TargetTemperature)
    }

    setTargetTemperature(value, callback) {
        if (this.TemperatureDisplayUnits === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
            value = cToF(value)
        }

        this.setTargetTemperatureCallback(value)
        this.TargetTemperature = value
        this.log('Setting Target DHW Temperature to: ', value)

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
            maxValue: 75,
            minValue: 5,
            minStep: 0.1,
        })

        regulator.getCharacteristic(Characteristic.TargetTemperature).setProps({
            maxValue: 70,
            minValue: 35,
            minStep: 1,
        })

        this.accessoryService = regulator

        return regulator
    }
}

function cToF(value) {
    return Number(((9 * value) / 5 + 32).toFixed(0))
}

function fToC(value) {
    return Number(((5 * (value - 32)) / 9).toFixed(2))
}

export default VRC700Thermostat
