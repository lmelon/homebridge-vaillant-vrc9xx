const _ = require('lodash');
const QUICK_MODES = ["Party", "Day in", "Day out"];

let Accessory, Characteristic, Service;

class VRC700Thermostat {

    constructor(api, log, config) {

        Accessory = api.hap.Accessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;

        var dispCelsius = Characteristic.TemperatureDisplayUnits.CELSIUS;
        var dispFahrenheit = Characteristic.TemperatureDisplayUnits.FAHRENHEIT;

        //Generic Config.
        this.log = log;
        this.name = config.name || "VRC700";
        this.manufacturer = "Vaillant";
        this.model = "Homebridge VRC700";
        this.serial_number = config.serial_number || "UNKNOWN";

        //Specific config.
        this.CurrentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
        this.TargetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;
        this.CurrentTemperature = 20;
        this.TargetTemperature = 20;

        this.CoolingThresholdTemperature = 25;
        this.HeatingThresholdTemperature = 20;

        this.currentOutsideTemperature = 4;

        this.quickModeSwitches = _.zipObject(QUICK_MODES, QUICK_MODES.map(() => {return { value: false }}));

        this._services = this.createServices();
    }

    getServices() {
        return this._services;
    }

    cToF(value) {
        return Number((9 * value / 5 + 32).toFixed(0));
    }

    fToC(value) {
        return Number((5 * (value - 32) / 9).toFixed(2));
    }

    identify(callback) {
        this.log('Identify requested!');
        return callback(); // succes
    }

    getCurrentHeatingCoolingState(callback) {
        this.log('Getting Current State');

        const json = {
            currentState: 1
        }

        if (json.currentState == 0) {
            this.CurrentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
        } else if (json.currentState == 1) {
            this.CurrentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.HEAT;
        } else if (json.currentState == 2) {
            this.CurrentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.COOL;
        }
        return callback(null, this.CurrentHeatingCoolingState);

    }

    getTargetHeatingCoolingState(callback) {
        this.log('Getting Current State');

        const json = {
            currentState: 1
        }

        if (json.currentState == 0) {
            this.CurrentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
        } else if (json.currentState == 1) {
            this.CurrentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.HEAT;
        } else if (json.currentState == 2) {
            this.CurrentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.COOL;
        }

        return callback(null, this.CurrentHeatingCoolingState);
    }

    setTargetHeatingCoolingState(value, callback) {
        var tarState = 0;
        this.log('Setting Target State from/to :', this.TargetHeatingCoolingState, value);
        if (value == Characteristic.TargetHeatingCoolingState.OFF) {
            this.TargetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;
            tarState = 0;
        } else if (value == Characteristic.TargetHeatingCoolingState.HEAT) {
            this.TargetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.HEAT;
            tarState = 1;
        } else if (value == Characteristic.TargetHeatingCoolingState.COOL) {
            //this.TargetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.COOL;
            //tarState = 2;
            return callback(value + " state unsupported");
        } else if (value == Characteristic.TargetHeatingCoolingState.AUTO) {
            this.TargetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.AUTO;
            tarState = 3;
        } else {
            this.log('Unsupported value', value);
            tarState = 0;
            return callback(value + " state unsupported");
        }

        return callback(null);

    }

    getCurrentTemperature(callback) {
        this.log('Getting Current Temperature');
        return callback(null, this.CurrentTemperature);
    }

    getTargetTemperature(callback) {
        this.log('Getting Target Temperature');
        return callback(null, this.TargetTemperature);
    }

    setTargetTemperature(value, callback) {
        if (this.TemperatureDisplayUnits == Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
            value = this.cToF(value);
        }

        this.log('Setting Target Temperature to: ', value);
        return callback(null);
    }

    getHeatingThresholdTemperature(callback) {
        this.log('Getting Heating Threshold');
        return callback(null, this.HeatingThresholdTemperature);
    }

    setHeatingThresholdTemperature(value, callback) {
        if (this.TemperatureDisplayUnits == Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
            value = this.cToF(value);
        }

        this.log('Setting Target Heat Threshold to: ', value);
        this.HeatingThresholdTemperature = value;
        return callback(null);
    }

    getCoolingThresholdTemperature(callback) {
        this.log('Getting Heating Threshold');
        return callback(null, this.CoolingThresholdTemperature);
    }

    setCoolingThresholdTemperature(value, callback) {
        if (this.TemperatureDisplayUnits == Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
            value = this.cToF(value);
        }

        this.log('Setting Target Heat Threshold to: ', value);
        this.CoolingThresholdTemperature = value;
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

    getCurrentRelativeHumidity(callback) {
        var error;
        this.log('Get humidity unsupported');
        error = "Get humidity unsupported";
        return callback(error);
    }

    getTargetRelativeHumidity(callback) {
        var error;
        this.log('Get humidity unsupported');
        error = "Get humidity unsupported";
        return callback(error);
    }

    setTargetRelativeHumidity(value, callback) {
        var error;
        this.log('Set humidity unsupported');
        error = "Set humidity unsupported";
        return callback(error);
    }

    getCurrentOutsideTemperature(callback) {
        this.log('Getting Current Outside Temperature');
        return callback(null, this.currentOutsideTemperature);
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

    getName(callback) {
        var error;
        this.log('getName :', this.name);
        error = null;
        return callback(error, this.name);
    }

    createServices() {
        const services = [
            this.getAccessoryInformationService(),
            this.getBridgingStateService(),
            this.getThermostatService(),
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

    getSensors() {

        var outsideSensor = new Service.TemperatureSensor("Outside Temp")
        outsideSensor
            .setCharacteristic(Characteristic.Name, "Outside Temp")
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', this.getCurrentOutsideTemperature.bind(this));

        return [outsideSensor]

    }

    getAccessoryInformationService() {
        return new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial_number)
            .setCharacteristic(Characteristic.FirmwareRevision, this.version)
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



    getThermostatService() {

        var thermostat = new Service.Thermostat(this.name);

        thermostat
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', this.getCurrentHeatingCoolingState.bind(this));

        thermostat
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on('get', this.getTargetHeatingCoolingState.bind(this))
            .on('set', this.setTargetHeatingCoolingState.bind(this));

        thermostat
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', this.getCurrentTemperature.bind(this));

        thermostat
            .getCharacteristic(Characteristic.TargetTemperature)
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this));

        thermostat
            .getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .on('get', this.getTemperatureDisplayUnits.bind(this))
            .on('set', this.setTemperatureDisplayUnits.bind(this));

        thermostat
            .getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .on('get', this.getHeatingThresholdTemperature.bind(this))
            .on('set', this.setHeatingThresholdTemperature.bind(this));

        thermostat
            .getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .on('get', this.getCoolingThresholdTemperature.bind(this))
            .on('set', this.setCoolingThresholdTemperature.bind(this));

        thermostat
            .getCharacteristic(Characteristic.Name)
            .on('get', this.getName.bind(this));

        thermostat
            .getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({
                maxValue: 100,
                minValue: 0,
                minStep: 1
            });

        thermostat
            .getCharacteristic(Characteristic.TargetTemperature)
            .setProps({
                maxValue: this.maxTemp,
                minValue: this.minTemp,
                minStep: 1
            });

        thermostat
            .getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .setProps({
                maxValue: 35,
                minValue: 0,
                minStep: 1
            });

        thermostat
            .getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .setProps({
                maxValue: 35,
                minValue: 0,
                minStep: 1
            });

        return thermostat;

    }

};

module.exports = VRC700Thermostat;