import _ from 'lodash'
import EventEmitter from 'events'

export const VAILLANT_POLLER_EVENTS = {
    AUTHENTICATION: 'AUTHENTICATION',
    FACILITIES: 'FACILITIES',
}

class VaillantAPIPoller extends EventEmitter {
    constructor(api, polling, log) {
        super()

        this.polling = polling || 60
        if (this.polling < 30) {
            // minimum value
            this.polling = 30
        }

        this.log = log

        this.api = api

        this.state = {}
        this.observers = []
        this.timers = {
            facilities: undefined,
        }
    }

    // ---------- public api
    async start() {
        this.log('Starting poller ...')
        this.getAllFacilities()
    }

    stop() {
        this.log('Stopping poller ...')
        for (const [key, timer] of Object.entries(this.timers)) {
            if (timer) {
                clearTimeout(timer)
                this.timers[key] = null
            }
        }
    }

    subscribe(serial, path, callback) {
        let facility = this.state[serial].current
        let value = _.at(facility, path)[0]

        let descriptor = {
            serial,
            path,
            callback,
            value,
            id: this.observers.length,
        }

        // force an update with the current value for new subscriber
        setTimeout(() => {
            callback({ current: value, previous: undefined })
        })

        return this.observers.push(descriptor)
    }

    // ----------- private api
    async getAllFacilities() {
        try {
            this.log('Refreshing list of facilities')
            var facilities = await this.api.getFacilities()

            // download details of each discovered facilities
            facilities.forEach(facility => {
                this.createOrUpdateFacility(facility)
            })
        } catch (e) {
            this.log('Failed to get facilities list ... will retry in 30 seconds')

            // failed -- retry in 30 seconds
            this.timers.facilities = setTimeout(this.getAllFacilities.bind(this), 30 * 1000)
        }
    }

    async createOrUpdateFacility(facility) {
        const serial = facility.serialNumber

        this.state[serial] = { facility }

        // trigger a state refresh
        if (!this.timers[serial]) {
            await this.getFacilityState(serial)
        }

        // notify about the new facility
        this.emit(VAILLANT_POLLER_EVENTS.FACILITIES, this.state[serial])
    }

    async getFacilityState(serial) {
        const name = this.state[serial].facility.name

        try {
            this.state[serial].current = await this.api.getFullState(serial)
            this.state[serial].refresh = new Date()

            // notify observers
            this.notifyAll(serial)

            this.log(`Facility ${name} -- ${serial} refreshed`)
        } finally {
            this.timers[serial] = setTimeout(() => {
                try {
                    this.getFacilityState(serial)
                } catch (e) {
                    this.log(`Error while refreshing facility ${name} -- ${serial}`)
                }
            }, this.polling * 1000)
        }
    }

    notifyAll(serial) {
        this.observers.forEach(descriptor => {
            if (descriptor && descriptor.serial === serial) {
                let facility = this.state[serial].current
                let newValue = _.at(facility, descriptor.path)[0]

                if (newValue !== descriptor.value) {
                    descriptor.callback({ current: newValue, previous: descriptor.value })
                    descriptor.value = newValue
                }
            }
        })
    }
}

export default VaillantAPIPoller
