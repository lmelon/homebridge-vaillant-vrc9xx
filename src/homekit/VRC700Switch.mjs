import VRC700Accessory from './VRC700Accessory.mjs'

let Characteristic, Service

class VRC700Switch extends VRC700Accessory {
    constructor(config, desc, api, platform, log) {
        super(config, desc, api, platform, log)

        Characteristic = api.hap.Characteristic
        Service = api.hap.Service

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

export default VRC700Switch
