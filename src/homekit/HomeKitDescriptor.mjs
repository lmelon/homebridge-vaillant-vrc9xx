import _ from 'lodash'

export function buildFacilityDescriptor(vr9xxState, api) {
    function buildSensorsDescriptor(serial, info) {
        let sensors = []

        // inside temp
        // iterate on heating zones
        const zones = Object.keys(info.system.zones)
        zones.forEach(key => {
            let zone = info.system.zones[key]

            let sensor = {
                type: 'SENSOR',
                name: 'Inside - ' + zone.configuration.name,
                serial,
                path: `system.zones.${key}.configuration.inside_temperature`,
            }

            sensors.push(sensor)
        })

        // outside temperature
        const outside_temp_path = 'system.status.outside_temperature'
        if (_.at(info, outside_temp_path).length > 0) {
            sensors.push({
                type: 'SENSOR',
                name: 'Outside Temperature',
                serial,
                path: outside_temp_path,
            })
        }

        // dhw
        const dhw_zones = Object.keys(info.system.dhw)
        dhw_zones.forEach(key => {
            let dhw_zone = info.system.dhw[key]
            let i = 0

            Object.keys(dhw_zone.configuration).forEach(conf => {
                let sensor = {
                    type: 'SENSOR',
                    name: dhw_zone.configuration[conf].name,
                    serial,
                    path: `system.dhw.${key}.configuration.${conf}.value`,
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
                type: 'SENSOR',
                path: `system.zones.${key}.configuration.inside_temperature`,
            }

            // current status
            regulator.current_status = {
                type: 'STATE',
                path: `system.zones.${key}.configuration.active_function`,
            }

            // target temp
            regulator.target_temp = {
                type: 'ACTUATOR',
                path: `system.zones.${key}.heating.configuration.setpoint_temperature`,
                update_callback: value => {
                    api.setTargetTemperature(serial, key, value)
                },
            }

            // target temp
            regulator.target_reduced_temp = {
                type: 'ACTUATOR',
                path: `system.zones.${key}.heating.configuration.setback_temperature`,
                update_callback: value => {
                    api.setTargetReducedTemperature(serial, key, value)
                },
            }

            // target status
            regulator.target_status = {
                type: 'ACTUATOR',
                path: `system.zones.${key}.heating.configuration.mode`,
                update_callback: value => {
                    api.setHeatingMode(serial, key, value)
                },
            }

            regulators.push(regulator)
        })

        return regulators
    }

    function buildDHWRegulatorDescriptor(serial, info, api) {
        let regulators = []

        // iterate on dhw zones
        const dhw = Object.keys(info.system.dhw)
        dhw.forEach(key => {
            let regulator = { name: key, serial }

            // current temp
            regulator.current_temp = {
                type: 'SENSOR',
                path: `system.dhw.${key}.configuration.DomesticHotWaterTankTemperature.value`,
            }

            // current status
            regulator.current_status = {
                type: 'STATE',
                path: `system.dhw.${key}.hotwater.configuration.operation_mode`,
            }

            // target temp
            regulator.target_temp = {
                type: 'ACTUATOR',
                path: `system.dhw.${key}.hotwater.configuration.temperature_setpoint`,
                update_callback: value => {
                    api.setTargetDHWTemperature(serial, key, value)
                },
            }

            // target status
            regulator.target_status = {
                type: 'ACTUATOR',
                path: `system.dhw.${key}.hotwater.configuration.operation_mode`,
                update_callback: value => {
                    api.setDHWOperationMode(serial, key, value)
                },
            }

            regulators.push(regulator)
        })

        return regulators
    }

    function buildSwitchesDescriptor(serial, info) {
        let switches = []

        const name = info.facility.name
        const pendingSwitch = {
            type: 'SWITCH',
            name: 'Pending - ' + name,
            serial,
            path: `meta.pending`,
        }
        switches.push(pendingSwitch)

        const staleSwitch = {
            type: 'SWITCH',
            name: 'Stale - ' + name,
            serial,
            path: `meta.old`,
        }

        switches.push(staleSwitch)

        return switches
    }

    const serial = vr9xxState.facility.serialNumber

    let hkDescriptor = {
        ...vr9xxState.facility,
        gateway: vr9xxState.current.gateway.gatewayType,
        sensors: buildSensorsDescriptor(serial, vr9xxState.current),
        regulators: buildRegulatorDescriptor(serial, vr9xxState.current, api),
        dhw_regulators: buildDHWRegulatorDescriptor(serial, vr9xxState.current, api),
        switches: buildSwitchesDescriptor(serial, vr9xxState),
    }

    return hkDescriptor
}
