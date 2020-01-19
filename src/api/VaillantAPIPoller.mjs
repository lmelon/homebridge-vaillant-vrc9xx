import _ from 'lodash'
import EventEmitter from 'events'

export const VAILLANT_POLLER_EVENTS = {
    AUTHENTICATION: 'AUTHENTICATION',
    FACILITIES: 'FACILITIES',
    FACILITIES_DONE: 'FACILITIES_DONE',
}

class VaillantAPIPoller extends EventEmitter {
    constructor(api, config, log) {
        super()

        this.polling = config.api.polling
        this.ignoreRooms = config.api.rooms.disabled

        this.log = log
        this.api = api
        this.facilities = {}
        this.timer = null
    }

    // ---------- public api
    async start() {
        this.log('Starting poller ...')
        await this.getAllFacilities()

        this.api.on('UPDATE_DONE', () => {
            this.refreshAllFacilities(10000)
        })
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
                await this.initFacilityState(facility)
            }

            this.emit(VAILLANT_POLLER_EVENTS.FACILITIES_DONE)
        } catch (e) {
            this.log('Failed to get facilities list ... will retry in 30 seconds')

            // failed -- retry in 30 seconds
            this.timer = setTimeout(this.getAllFacilities.bind(this), 30 * 1000)
        }
    }

    async initFacilityState(facility) {
        const serial = facility.serialNumber

        // check if room-by-room is available
        facility.rbr = facility.capabilities.filter(it => it === 'ROOM_BY_ROOM').length === 1

        if (facility.rbr && this.ignoreRooms) {
            this.log(`Facility ${serial} is reporting RbR but is disabled by config`)
            facility.rbr = false
        }

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

            await this.refreshFacilityState(serial)
        }
    }

    refreshAllFacilities(delay) {
        Object.keys(this.facilities).forEach(serial => {
            const facility = this.facilities[serial]

            // clear timer if any
            if (facility.timer) {
                clearTimeout(facility.timer)
            }

            // program next run in 10s
            facility.timer = setTimeout(() => {
                this.refreshFacilityState(serial, true)
            }, delay)
        })
    }

    async refreshFacilityState(serial, force = false) {
        const facility = this.facilities[serial]
        const name = facility.description.name
        const rbr = facility.description.rbr

        // clear timer if any
        if (facility.timer) {
            clearTimeout(facility.timer)
            facility.timer = null
        }

        // do the refresh
        try {
            facility.state = await this.api.getFullState(serial, rbr)
            facility.status.refresh = new Date().getTime()
            facility.status.stale = false

            if (!facility.status.initialized) {
                // notify about the new facility
                this.emit(VAILLANT_POLLER_EVENTS.FACILITIES, facility)
                facility.status.initialized = true
            }

            // notify observers
            this.notifyAll(serial, force)
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

    notifyAll(serial, force) {
        const facility = this.facilities[serial]
        const state = facility.state
        const observers = facility.observers

        observers.forEach(descriptor => {
            try {
                let newValue = _.at(state, descriptor.path)[0]
                if (force || newValue !== descriptor.value) {
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
