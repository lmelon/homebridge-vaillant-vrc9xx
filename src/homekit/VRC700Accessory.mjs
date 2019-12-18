let Accessory, Characteristic, Service

export default class VRC700Accessory {
    constructor(config, desc, api, platform, log) {
        Accessory = api.hap.Accessory
        Characteristic = api.hap.Characteristic
        Service = api.hap.Service

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
