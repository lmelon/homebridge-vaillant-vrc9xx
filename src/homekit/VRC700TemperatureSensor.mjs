import VRC700Accessory from './VRC700Accessory.mjs'

import moment from 'moment'
import homebridgeLib from 'homebridge-lib'
import historyFactory from 'fakegato-history'

let HistoryService, Eve, Characteristic

class VRC700TemperatureSensor extends VRC700Accessory {
    constructor(config, desc, api, platform, log) {
        super(config, desc, api, platform, log)

        HistoryService = historyFactory(api)
        Eve = new homebridgeLib.EveHomeKitTypes(api)
        Characteristic = api.hap.Characteristic

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

export default VRC700TemperatureSensor
