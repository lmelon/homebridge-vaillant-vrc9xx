import _ from 'lodash'
import EventEmitter from 'events';
import VRC9xxAPI from './VaillantAPIClient'

export const VAILLANT_POLLER_EVENTS = {
    AUTHENTICATION: "AUTHENTICATION",
    FACILITIES: "FACILITIES"
}

class VaillantAPIPoller extends EventEmitter {

    constructor(config, log) {
        super();

        this.config = config
        this.log = log

        this.api = new VRC9xxAPI(this.createCredential(), log);

        this.state = {}
        this.observers = []
        
    }

    async start() {
        const success = await this.api.logIn()
        this.emit(VAILLANT_POLLER_EVENTS.AUTHENTICATION, {success});

        if (success) {
            let facilities = await this.api.getFacilities()
            facilities.forEach(facility => {
                this.createFacility(facility)
            });
        }
    }

    stop() {
        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = null
        }
    }

    createCredential() {
        return {
            smartphoneId: this.config.user.device,
            username: this.config.user.name,
            password: this.config.user.password
        }
    }

    async createFacility(facility) {

        const serial = facility.serialNumber
        this.state[serial] = { facility }

        await this.refreshFacility(serial)
        this.emit(VAILLANT_POLLER_EVENTS.FACILITIES, this.buildFacilityDescriptor(serial));
    }

    buildFacilityDescriptor(serial) {

        function buildSensorsDescriptor(serial, info) {

            let sensors = []
    
            // outside temperature
            const outside_temp_path = "system.status.outside_temperature"
            if (_.at(info, outside_temp_path).length > 0) {
                sensors.push({
                    type: "SENSOR",
                    name: "Outside Temperature",
                    serial,
                    path: outside_temp_path
                })
            }
        
            // dhw    
            const dhw_zones = Object.keys(info.system.dhw)
            dhw_zones.forEach(key => {
                let dhw_zone = info.system.dhw[key]
                let i = 0
                dhw_zone.configuration.forEach(conf => {
    
                    let sensor = {
                        type: "SENSOR",
                        name: conf.name,
                        serial,
                        path: `system.dhw.${key}.configuration[${i}].value`
                    }
        
                    sensors.push(sensor)
                    i++
                })
            })
    
            return sensors
        }

        function buildRegulatorDescriptor(serial, info, api) {

            let regulators = []

            // iterate on heating zones
            const zones = Object.keys(info.system.zones)
            zones.forEach(key => {
                
                let zone = info.system.zones[key]
                let regulator = { name: zone.configuration.name, serial }
    
                // current temp
                regulator.current_temp = {
                    type: "SENSOR",
                    path: `system.zones.${key}.configuration.inside_temperature`
                }

                // current status
                regulator.current_status = {
                    type: "STATE",
                    path: `system.zones.${key}.configuration.active_function`
                }

                // target temp
                regulator.target_temp = {
                    type: "ACTUATOR",
                    path: `system.zones.${key}.heating.configuration.setpoint_temperature`,
                    update_callback: (value) => { api.setTargetTemperature(serial, key, value) }
                }

                // target reduced temp
                regulator.target_reduced_temp = {
                    type: "ACTUATOR",
                    path: `system.zones.${key}.heating.configuration.setback_temperature`,
                    update_callback: (value) => { api.setTargetReducedTemperature(serial, key, value) }
                }

                // target status
                regulator.target_status = {
                    type: "ACTUATOR",
                    path: `system.zones.${key}.heating.configuration.mode`,
                    update_callback: (value) => { api.setHeatingMode(serial, key, value) }
                }

                regulators.push(regulator)
            })

            return regulators
        }

        const info = this.state[serial].current
        let descriptor = this.state[serial].facility
        
        descriptor.gateway = info.gateway.gatewayType
        descriptor.sensors = buildSensorsDescriptor(serial, info)
        descriptor.regulators = buildRegulatorDescriptor(serial, info, this.api)

        console.log(JSON.stringify(descriptor));

        return descriptor
    }

    async refreshFacility(serial) {
        let info = await this.api.getFullState(serial)

        this.state[serial].current = info
        this.state[serial].refresh = new Date()

        this.notifyAll(serial)

        this.timer = setTimeout(() => { this.refreshFacility(serial) }, this.config.polling * 1000)
        this.log(`Facility ${this.state[serial].facility.name} refreshed`)
    }

    subscribe(serial, path, callback) {
        let facility = this.state[serial].current
        let value = _.at(facility, path)[0]

        let descriptor = {
            serial,
            path,
            callback,
            value,
            id: this.observers.length
        }

        setTimeout(() => {callback({current: value, previous: undefined})})
        return this.observers.push(descriptor)
    }

    notifyAll(serial) {
        this.observers.forEach((descriptor) => {
            if (descriptor && descriptor.serial === serial) {
                let facility = this.state[serial].current
                let newValue = _.at(facility, descriptor.path)[0]

                if (newValue !== descriptor.value) {
                    descriptor.callback({current: newValue, previous: descriptor.value})
                    descriptor.value = newValue
                }

            }
        })
    }

}

export default VaillantAPIPoller;