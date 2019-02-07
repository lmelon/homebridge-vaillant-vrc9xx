import _ from 'lodash'
import util from 'util'
const inherits = util.inherits

const QUICK_MODES = ["Party", "Day in", "Day out"];

let Accessory, Characteristic, Service;

class VRC700Thermostat {

    constructor(api, log, config, platform) {

        Accessory = api.hap.Accessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;

        //Homebridge Config.
        this.log = log
        this.api = api
        this.platform = platform

        this.name = config.name || "VRC700";
        this.manufacturer = "Vaillant";
        this.model = config.gateway;
        this.firmware = config.firmware || "UNKNOWN";
        this.serial = config.serial
        this.sensors = config.sensors
        this.regulators = config.regulators
        this.dhw_regulators = config.dhw_regulators

        // state
        this.quickModeSwitches = _.zipObject(QUICK_MODES, QUICK_MODES.map(() => {return { value: false }}));

        // services
        this._services = this.createServices();
    }

    getServices() {
        return this._services;
    }

    createServices() {
        const services = [
            this.getAccessoryInformationService(),
            this.getBridgingStateService(),
            ...this.getRegulatorServices(),
            ...this.getSensors(),
            ...this.getQuickActionsSwitches()
        ];

        return services;
    }

    getQuickActionsSwitches() {
        var switches = []; 
        QUICK_MODES.forEach(item => {
            var swi = new Service.Switch(item, item);
            swi
                .getCharacteristic(Characteristic.On)
                .on('set', (value, callback) => { this.setQuickMode(item, value, callback) })
                .updateValue(false)
        
            switches.push(swi);
            this.quickModeSwitches[item].service = swi;
        })

        return switches;
    }

    setQuickMode(mode, value, callback) {
        this.log('Setting Current mode: ', mode, value);

        QUICK_MODES.forEach(item => {
            this.quickModeSwitches[item].value = (mode === item) && value
            this.quickModeSwitches[item].service
                .getCharacteristic(Characteristic.On)
                .updateValue(this.quickModeSwitches[item].value)
        })

        return callback(null);
    }

    getSensors() {
        let services = []
        this.sensors.forEach(descr => {
            let sensor = new VRC700TemperatureSensor(descr, this.platform, this.log)
            services.push(sensor.getService())
        })

        return services
    }

    getRegulatorServices() {
        let services = []
        this.regulators.forEach(descr => {
            let regulator = new VRC700HeaterRegulator(descr, this.platform, this.log)
            services.push(regulator.getService())
        })

        /*
        this.dhw_regulators.forEach(descr => {
            let regulator = new VRC700HotWaterRegulator(descr, this.platform, this.log)
            services.push(regulator.getService())
        })
        */

        return services
    }

    getAccessoryInformationService() {
        return new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial)
            .setCharacteristic(Characteristic.FirmwareRevision, this.firmware)
            .setCharacteristic(Characteristic.HardwareRevision, this.version);
    }

    getBridgingStateService() {
        var bridgingStateService = new Service.BridgingState()
            .setCharacteristic(Characteristic.Reachable, true)
            .setCharacteristic(Characteristic.LinkQuality, 4)
            .setCharacteristic(Characteristic.AccessoryIdentifier, this.name)
            .setCharacteristic(Characteristic.Category, Accessory.Categories.SWITCH);

        return bridgingStateService;
    }

};

class VRC700TemperatureSensor {

    constructor(desc, platform) {
        this.name = desc.name
        this.currentTemperature = 2

        this._service = new Service.TemperatureSensor(this.name, this.name)
        this._service
            .setCharacteristic(Characteristic.Name, this.name)
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', this.getCurrentTemperature.bind(this));

            /*
        this._service
            .getCharacteristic(Characteristic.TargetTemperature)
            .on('get', this.getTargetTemperature.bind(this));
*/

        platform.registerObserver(desc.serial, desc.path, this.updateCurrentTemperature.bind(this))
    }

    getCurrentTemperature(callback) {
        //this.log('Getting Current Temperature:', this.name);
        return callback(null, this.currentTemperature);
    }

    getTargetTemperature(callback) {
        //this.log('Getting Current Temperature:', this.name);
        return callback(null, this.currentTemperature);
    }

    updateCurrentTemperature(value) {
        this.currentTemperature = value.current
    }

    getService() {
        return this._service
    }

}

class VRC700HeaterRegulator {

    constructor(desc, platform, log) {

        this.log = log
        this.name = desc.name

        //State
        this.CurrentHeatingCoolingState = undefined
        this.CurrentTemperature = undefined
        
        this.TargetDayTemperature = undefined
        this.TargetNightTemperature = undefined
        this.TargetHeatingCoolingState = undefined

        this._service = this.createRegulatorService()

        this.setTargetDayTemperatureCallback = desc.target_temp.update_callback
        this.setTargetNightTemperatureCallback = desc.target_reduced_temp.update_callback
        this.setHeatingModeCallback = desc.target_status.update_callback

        platform.registerObserver(desc.serial, desc.current_temp.path, this.updateCurrentTemperature.bind(this))
        platform.registerObserver(desc.serial, desc.current_status.path, this.updateCurrentHeatingCoolingState.bind(this))

        platform.registerObserver(desc.serial, desc.target_temp.path, this.updateTargetDayTemperature.bind(this))
        platform.registerObserver(desc.serial, desc.target_reduced_temp.path, this.updateTargetNightTemperature.bind(this))
        platform.registerObserver(desc.serial, desc.target_status.path, this.updateTargetHeatingCoolingState.bind(this))
        
    }

    getService() {
        return this._service
    }

    // --------- CURRENT STATE
    getCurrentHeatingCoolingState(callback) {
        switch(this.CurrentHeatingCoolingState) {
            case 'STANDBY':
                return callback(null, Characteristic.CurrentHeatingCoolingState.OFF)
            case 'HEATING': 
                return callback(null, Characteristic.CurrentHeatingCoolingState.HEAT)
            default:
                return callback(null, Characteristic.CurrentHeatingCoolingState.COOL)
        }
    }

    updateCurrentHeatingCoolingState(value) {
        this.log('Updating Current State from/to :', this.CurrentHeatingCoolingState, value.current);

        this.CurrentHeatingCoolingState = value.current

        let newValue;
        switch(this.CurrentHeatingCoolingState) {
            case 'STANDBY':
                newValue = Characteristic.CurrentHeatingCoolingState.OFF
                break
            case 'HEATING': 
                newValue = Characteristic.CurrentHeatingCoolingState.HEAT
                break
            default:
                newValue = Characteristic.CurrentHeatingCoolingState.COOL
        }

        this._service
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .updateValue(newValue)

    }

    // --------- TARGET STATE
    vrc700ToHomeKitTargetState(vrc700state) {
        switch(this.TargetHeatingCoolingState) {
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
        switch(hkState) {
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
        this.log('Updating Target State from/to :', this.TargetHeatingCoolingState, value.current);        
        this.TargetHeatingCoolingState = value.current

        let hkState = this.vrc700ToHomeKitTargetState(this.TargetHeatingCoolingState)
        
        this._service
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .updateValue(hkState)

        this.updateTargetTemperature()
    }

    setTargetHeatingCoolingState(value, callback) {

        let vrc700State = this.hkToVRC700TargetState(value)
        this.log('Setting Target State from/to :', this.TargetHeatingCoolingState, vrc700State);

        this.TargetHeatingCoolingState = vrc700State
        this.setHeatingModeCallback(this.TargetHeatingCoolingState)

        this.updateTargetTemperature()

        return callback(null);
    }


    // --------- CURRENT TEMPERATURE
    getCurrentTemperature(callback) {
        this.log('Getting Current Temperature');
        return callback(null, this.CurrentTemperature);
    }

    updateCurrentTemperature(value) {
        this.log('Updating Current Temperature from/to :', this.CurrentTemperature, value.current);
        this.CurrentTemperature = value.current

        this._service
            .getCharacteristic(Characteristic.CurrentTemperature)
            .updateValue(this.CurrentTemperature)

    }

    // --------- TARGET TEMPERATURE
    getTargetTemperature(callback) {
        this.log('Getting Target Temperature');

        let targetTemp = this.TargetDayTemperature
        
        if (this.TargetHeatingCoolingState === 'NIGHT') {
            targetTemp = this.TargetNightTemperature
        }

        return callback(null, targetTemp);
    }

    updateTargetTemperature() {

        let targetTemp = this.TargetDayTemperature
        if (this.TargetHeatingCoolingState === 'NIGHT') {
            targetTemp = this.TargetNightTemperature
        }

        this.log('Target Temperature is now:', targetTemp);

        this._service
            .getCharacteristic(Characteristic.TargetTemperature)
            .updateValue(targetTemp)

    }

    setTargetTemperature(value, callback) {
        if (this.TargetHeatingCoolingState === 'NIGHT') {
            return this.setTargetNightTemperature(value, callback)
        } 
        
        return this.setTargetDayTemperature(value, callback)
        
    }

    // --------- TARGET DAY TEMPERATURE
    updateTargetDayTemperature(value) {
        this.log('Updating Target Day Temperature from/to :', this.TargetDayTemperature, value.current);
        this.TargetDayTemperature = value.current

        this._service
            .getCharacteristic(Characteristic.TargetDayTemperature)
            .updateValue(this.TargetDayTemperature)

        this.updateTargetTemperature()
    }

    getTargetDayTemperature(callback) {
        this.log('Getting Target Day Temperature');
        return callback(null, this.TargetDayTemperature);
    }

    setTargetDayTemperature(value, callback) {
        if (this.TemperatureDisplayUnits == Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
            value = this.cToF(value);
        }

        this.setTargetDayTemperatureCallback(value)
        this.TargetDayTemperature = value
        this.log('Setting Target Day Temperature to: ', value);
        
        this.updateTargetTemperature()

        return callback(null);
    }

    // --------- TARGET NIGHT TEMPERATURE
    updateTargetNightTemperature(value) {
        this.log('Updating Target Night Temperature from/to :', this.TargetNightTemperature, value.current);
        this.TargetNightTemperature = value.current

        this._service
            .getCharacteristic(Characteristic.TargetNightTemperature)
            .updateValue(this.TargetNightTemperature)

        this.updateTargetTemperature()        
    }

    getTargetNightTemperature(callback) {
        this.log('Getting Target Night Temperature');
        return callback(null, this.TargetNightTemperature);
    }

    setTargetNightTemperature(value, callback) {
        if (this.TemperatureDisplayUnits == Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
            value = this.cToF(value);
        }

        this.setTargetNightTemperatureCallback(value)
        this.TargetNightTemperature = value
        this.log('Setting Target Night Temperature to: ', value);
        
        this.updateTargetTemperature()

        return callback(null);
    }


    getTemperatureDisplayUnits(callback) {
        this.log('Getting Temperature Display Units');
        const json = {
            units: 0
        }
        if (json.units == 0) {
            this.TemperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;
            this.log('Temperature Display Units is ℃');
        } else if (json.units == 1) {
            this.TemperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
            this.log('Temperature Display Units is ℉');
        }
        return callback(null, this.TemperatureDisplayUnits);
    }

    setTemperatureDisplayUnits(value, callback) {
        this.log('Setting Temperature Display Units from/to ', this.TemperatureDisplayUnits, value);
        this.TemperatureDisplayUnits = value;
        return callback(null);
    }

    getName(callback) {
        var error;
        this.log('getName :', this.name);
        error = null;
        return callback(error, this.name);
    }

    createRegulatorService() {

        var regulator = new Service.Thermostat(this.name, this.name);

        regulator
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', this.getCurrentHeatingCoolingState.bind(this));

        regulator
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on('get', this.getTargetHeatingCoolingState.bind(this))
            .on('set', this.setTargetHeatingCoolingState.bind(this));

        regulator
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', this.getCurrentTemperature.bind(this));

        regulator
            .getCharacteristic(Characteristic.TargetTemperature)
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this));

        regulator
            .getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .on('get', this.getTemperatureDisplayUnits.bind(this))
            .on('set', this.setTemperatureDisplayUnits.bind(this));

        regulator
            .getCharacteristic(Characteristic.Name)
            .on('get', this.getName.bind(this));

        regulator
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .setProps({
                validValues: [0,1,2,3]    
            })

        regulator
            .getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({
                maxValue: 100,
                minValue: 0,
                minStep: 0.1
            });

        regulator
            .getCharacteristic(Characteristic.TargetTemperature)
            .setProps({
                maxValue: 30,
                minValue: 5,
                minStep: 0.5
            });

        Characteristic.TargetNightTemperature = function() {
            Characteristic.call(this, 'Target Night Temperature', '2DB4D12B-B2DD-42EA-A469-A23051F478D7');
            this.setProps({
                format: Characteristic.Formats.FLOAT,
                unit: Characteristic.Units.CELSIUS,
                maxValue: 30,
                minValue: 5,
                minStep: 0.5,
                perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
            });
            this.value = this.getDefaultValue();
        };
            
        inherits(Characteristic.TargetNightTemperature, Characteristic);    
        Characteristic.TargetNightTemperature.UUID = '2DB4D12B-B2DD-42EA-A469-A23051F478D7';

        regulator
            .getCharacteristic(Characteristic.TargetNightTemperature)
            .setProps({
                maxValue: 30,
                minValue: 5,
                minStep: 0.5
            });

        regulator
            .getCharacteristic(Characteristic.TargetNightTemperature)
            .on('get', this.getTargetNightTemperature.bind(this))
            .on('set', this.setTargetNightTemperature.bind(this));

        Characteristic.TargetDayTemperature = function() {
            Characteristic.call(this, 'Target Day Temperature', 'E0C2907C-0011-4392-87B7-10622C654D5C');
            this.setProps({
                format: Characteristic.Formats.FLOAT,
                unit: Characteristic.Units.CELSIUS,
                maxValue: 30,
                minValue: 5,
                minStep: 0.5,
                perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
            });
            this.value = this.getDefaultValue();
        };
            
        inherits(Characteristic.TargetDayTemperature, Characteristic);    
        Characteristic.TargetDayTemperature.UUID = 'E0C2907C-0011-4392-87B7-10622C654D5C';

        regulator
            .getCharacteristic(Characteristic.TargetDayTemperature)
            .setProps({
                maxValue: 30,
                minValue: 5,
                minStep: 0.5
            });

        regulator
            .getCharacteristic(Characteristic.TargetDayTemperature)
            .on('get', this.getTargetDayTemperature.bind(this))
            .on('set', this.setTargetDayTemperature.bind(this));

        return regulator;

    }


}

class VRC700HotWaterRegulator {

    constructor(desc, platform, log) {

        this.log = log
        this.name = desc.name

        //State
        this.CurrentHeatingCoolingState = undefined
        this.CurrentTemperature = undefined
        this.TargetTemperature = undefined

        this._service = this.createRegulatorService()

        this.setTargetTemperatureCallback = desc.target_temp.update_callback
        this.setHeatingModeCallback = desc.target_status.update_callback

        platform.registerObserver(desc.serial, desc.current_temp.path, this.updateCurrentTemperature.bind(this))
        platform.registerObserver(desc.serial, desc.current_status.path, this.updateCurrentHeatingCoolingState.bind(this))

        platform.registerObserver(desc.serial, desc.target_temp.path, this.updateTargetTemperature.bind(this))
        platform.registerObserver(desc.serial, desc.target_status.path, this.updateTargetHeatingCoolingState.bind(this))
        
    }

    getService() {
        return this._service
    }

    // --------- CURRENT STATE
    getCurrentHeatingCoolingState(callback) {
        switch(this.CurrentHeatingCoolingState) {
            case 'OFF':
                return callback(null, Characteristic.CurrentHeatingCoolingState.OFF)
            case 'DAY': 
                return callback(null, Characteristic.CurrentHeatingCoolingState.HEAT)
            default:
                return callback(null, Characteristic.CurrentHeatingCoolingState.HEAT)
        }
    }

    updateCurrentHeatingCoolingState(value) {
        this.log('Updating Current State from/to :', this.CurrentHeatingCoolingState, value.current);

        this.CurrentHeatingCoolingState = value.current

        let newValue;
        switch(this.CurrentHeatingCoolingState) {
            case 'OFF':
                newValue = Characteristic.CurrentHeatingCoolingState.OFF
                break
            case 'DAY': 
                newValue = Characteristic.CurrentHeatingCoolingState.HEAT
                break
            default:
                newValue = Characteristic.CurrentHeatingCoolingState.HEAT
        }

        this._service
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .updateValue(newValue)

    }

    // --------- TARGET STATE
    vrc700ToHomeKitTargetState(vrc700state) {
        switch(this.TargetHeatingCoolingState) {
            case 'OFF':
                return Characteristic.TargetHeatingCoolingState.OFF
            case 'ON': 
                return Characteristic.TargetHeatingCoolingState.HEAT
            case 'AUTO': 
                return Characteristic.TargetHeatingCoolingState.AUTO
        }
    }

    hkToVRC700TargetState(hkState) {
        switch(hkState) {
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
        this.log('Updating Target State from/to :', this.TargetHeatingCoolingState, value.current);        
        this.TargetHeatingCoolingState = value.current

        let hkState = this.vrc700ToHomeKitTargetState(this.TargetHeatingCoolingState)
        
        this._service
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .updateValue(hkState)

    }

    setTargetHeatingCoolingState(value, callback) {

        let vrc700State = this.hkToVRC700TargetState(value)
        this.log('Setting Target State from/to :', this.TargetHeatingCoolingState, vrc700State);

        this.TargetHeatingCoolingState = vrc700State
        this.setHeatingModeCallback(this.TargetHeatingCoolingState)

        return callback(null);
    }


    // --------- CURRENT TEMPERATURE
    getCurrentTemperature(callback) {
        this.log('Getting Current Temperature');
        return callback(null, this.CurrentTemperature);
    }

    updateCurrentTemperature(value) {
        this.log('Updating Current Temperature from/to :', this.CurrentTemperature, value.current);
        this.CurrentTemperature = value.current

        this._service
            .getCharacteristic(Characteristic.CurrentTemperature)
            .updateValue(this.CurrentTemperature)

    }

    // --------- TARGET TEMPERATURE
    updateTargetTemperature(value) {
        this.log('Updating Target DHW Temperature from/to :', this.TargetTemperature, value.current);
        this.TargetTemperature = value.current

        this._service
            .getCharacteristic(Characteristic.TargetTemperature)
            .updateValue(this.TargetTemperature)

    }

    getTargetTemperature(callback) {
        this.log('Getting Target DHW Temperature');
        return callback(null, this.TargetTemperature);
    }

    setTargetTemperature(value, callback) {
        if (this.TemperatureDisplayUnits == Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
            value = this.cToF(value);
        }

        this.setTargetTemperatureCallback(value)
        this.TargetTemperature = value
        this.log('Setting Target DHW Temperature to: ', value);
        
        return callback(null);
    }

    getTemperatureDisplayUnits(callback) {
        this.log('Getting Temperature Display Units');
        const json = {
            units: 0
        }
        if (json.units == 0) {
            this.TemperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;
            this.log('Temperature Display Units is ℃');
        } else if (json.units == 1) {
            this.TemperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
            this.log('Temperature Display Units is ℉');
        }
        return callback(null, this.TemperatureDisplayUnits);
    }

    setTemperatureDisplayUnits(value, callback) {
        this.log('Setting Temperature Display Units from/to ', this.TemperatureDisplayUnits, value);
        this.TemperatureDisplayUnits = value;
        return callback(null);
    }

    getName(callback) {
        var error;
        this.log('getName :', this.name);
        error = null;
        return callback(error, this.name);
    }

    createRegulatorService() {

        var regulator = new Service.Thermostat(this.name, this.name);

        regulator
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', this.getCurrentHeatingCoolingState.bind(this));

        regulator
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on('get', this.getTargetHeatingCoolingState.bind(this))
            .on('set', this.setTargetHeatingCoolingState.bind(this));

        regulator
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', this.getCurrentTemperature.bind(this));

        regulator
            .getCharacteristic(Characteristic.TargetTemperature)
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this));

        regulator
            .getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .on('get', this.getTemperatureDisplayUnits.bind(this))
            .on('set', this.setTemperatureDisplayUnits.bind(this));

        regulator
            .getCharacteristic(Characteristic.Name)
            .on('get', this.getName.bind(this));

        regulator
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .setProps({
                maxValue: 1,
                minValue: 0,
                validValues: [0,1]    
            })

        regulator
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .setProps({
                validValues: [0,1,3]    
            })

        regulator
            .getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({
                maxValue: 100,
                minValue: 0,
                minStep: 0.1
            });

        regulator
            .getCharacteristic(Characteristic.TargetTemperature)
            .setProps({
                maxValue: 100,
                minValue: 30,
                minStep: 1
            });

        return regulator;

    }


}

function cToF(value) {
    return Number((9 * value / 5 + 32).toFixed(0));
}

function fToC(value) {
    return Number((5 * (value - 32) / 9).toFixed(2));
}

export default VRC700Thermostat;