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
        this.facilities = {}
        this.timer = null
    }

    // ---------- public api
    async start() {
        this.log('Starting poller ...')
        this.getAllFacilities()
    }

    stop() {
        this.log('Stopping poller ...')
        if (this.timer) {
            clearTimeout(this.timer)
        }

        this.facilities.forEach(facility => {
            clearTimeout(facility.timer)
        })
    }

    subscribe(serial, path, callback) {
        const facility = this.facilities[serial]
        const state = facility.state

        let value = _.at(state, path)[0]

        let descriptor = {
            serial,
            path,
            callback,
            value,
            id: facility.observers.length,
        }

        facility.observers.push(descriptor)

        // force an update with the current value for new subscriber
        setTimeout(() => {
            callback({ current: value, previous: undefined })
        })
    }

    // ----------- private api
    async getAllFacilities() {
        try {
            this.log('Refreshing list of facilities')
            var facilities = await this.api.getFacilities()

            // download details of each discovered facilities
            for (const facility of facilities) {
                this.initFacilityState(facility)
            }
        } catch (e) {
            this.log('Failed to get facilities list ... will retry in 30 seconds')

            // failed -- retry in 30 seconds
            this.timer = setTimeout(this.getAllFacilities.bind(this), 30 * 1000)
        }
    }

    async initFacilityState(facility) {
        const serial = facility.serialNumber

        if (!this.facilities[serial]) {
            this.facilities[serial] = {
                description: facility,
                status: {
                    initialized: false,
                    refresh: null,
                    stale: true,
                },
                state: null,
                timer: null,
                observers: [],
            }

            this.refreshFacilityState(serial)
        }
    }

    async refreshFacilityState(serial) {
        const facility = this.facilities[serial]
        const name = facility.description.name

        try {
            facility.state = await this.api.getFullState(serial)
            facility.status.refresh = new Date().getTime()
            facility.status.stale = false

            if (!facility.status.initialized) {
                // notify about the new facility
                this.emit(VAILLANT_POLLER_EVENTS.FACILITIES, facility)
                facility.status.initialized = true
            }

            // notify observers
            this.notifyAll(serial)
            this.log(`Facility ${name} -- ${serial} refreshed`)
        } catch (e) {
            if (e.status === 409) {
                facility.status.stale = true
            }

            this.log(`Error while refreshing facility ${name} -- ${serial}`)
        } finally {
            if (facility.status.initialized) {
                const now = new Date().getTime()
                facility.state.meta.gateway = facility.state.meta.gateway || facility.status.stale
                facility.state.meta.cloud = now - facility.status.refresh > 2 * 60 * 1000
            }

            // notify observers
            this.notifyAll(serial)

            // program next run
            facility.timer = setTimeout(() => {
                this.refreshFacilityState(serial)
            }, this.polling * 1000)
        }
    }

    notifyAll(serial) {
        const facility = this.facilities[serial]
        const state = facility.state
        const observers = facility.observers

        observers.forEach(descriptor => {
            try {
                let newValue = _.at(state, descriptor.path)[0]
                if (newValue !== descriptor.value) {
                    descriptor.callback({ current: newValue, previous: descriptor.value })
                    descriptor.value = newValue
                }
            } catch (e) {
                // do nothing
            }
        })
    }
}

export default VaillantAPIPoller
