import _ from 'lodash'

export function buildFacilityDescriptor(facility, api) {
    function buildSensorsDescriptor(name, serial, info) {
        let sensors = []

        // inside temp
        // iterate on heating zones
        const zones = Object.keys(info.system.zones)
        zones.forEach(key => {
            let zone = info.system.zones[key]

            if (!zone.currently_controlled_by || zone.currently_controlled_by.name !== 'RBR') {
                let sensor = {
                    type: 'SENSOR',
                    name: `${name} - ${zone.configuration.name.trim()} - Inside`,
                    serial,
                    path: `system.zones.${key}.configuration.inside_temperature`,
                    id: `${serial}-${key}-inside_temperature`,
                }

                sensors.push(sensor)
            }
        })

        // iterate on heating rooms (if any)
        if (info.rbr) {
            const rooms = Object.keys(info.rbr.rooms)
            rooms.forEach(roomIndex => {
                let room = info.rbr.rooms[roomIndex]

                let sensor = {
                    type: 'SENSOR',
                    name: `${name} - ${room.configuration.name.trim()} - Room`,
                    serial,
                    path: `rbr.rooms.${roomIndex}.configuration.currentTemperature`,
                    id: `${serial}-${roomIndex}-room_temperature`,
                }

                sensors.push(sensor)
            })
        }

        // outside temperature
        const outside_temp_path = 'system.status.outside_temperature'
        if (_.at(info, outside_temp_path).length > 0) {
            sensors.push({
                type: 'SENSOR',
                name: `${name} - Outside`,
                serial,
                path: outside_temp_path,
                id: `${serial}-outside_temperature`,
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
                    name: `${name} - ${dhw_zone.configuration[conf].name.trim()}`,
                    serial,
                    path: `system.dhw.${key}.configuration.${conf}.value`,
                    id: `${serial}-${key}-dwh_temperature`,
                }

                sensors.push(sensor)
                i++
            })
        })

        return sensors
    }

    function buildRegulatorDescriptor(name, serial, info, api) {
        let regulators = []

        // iterate on heating zones
        const zones = Object.keys(info.system.zones)
        zones.forEach(key => {
            let zone = info.system.zones[key]
            let regulator = { name: `${name} - ${zone.configuration.name.trim()}`, serial }

            // ony if Room-by-room is not active
            if (!zone.currently_controlled_by || zone.currently_controlled_by.name !== 'RBR') {
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
            }
        })

        return regulators
    }

    function buildDHWRegulatorDescriptor(name, serial, info, api) {
        let regulators = []

        // iterate on dhw zones
        const dhw = Object.keys(info.system.dhw)
        dhw.forEach(key => {
            let regulator = { name: `${name} - Hot Water - ${key.replace('_', ' ')}`, serial }

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

    function buildRBRRegulatorDescriptor(name, serial, info, api) {
        let regulators = []

        if (!info.rbr) return regulators

        // iterate on rooms
        const rooms = Object.keys(info.rbr.rooms)
        rooms.forEach(roomIndex => {
            let room = info.rbr.rooms[roomIndex]
            let regulator = { name: `${name} - ${room.configuration.name.trim()}`, serial }

            // current temp
            regulator.current_temp = {
                type: 'SENSOR',
                path: `rbr.rooms.${roomIndex}.configuration.currentTemperature`,
            }

            // status low battery
            regulator.status_low_battery = {
                type: 'STATE',
                path: `rbr.rooms.${roomIndex}.configuration.isBatteryLow`,
            }

            // current status
            regulator.current_status = {
                type: 'STATE',
                path: `rbr.rooms.${roomIndex}.configuration.operationMode`,
            }

            // target temp
            regulator.target_temp = {
                type: 'ACTUATOR',
                path: `rbr.rooms.${roomIndex}.configuration.temperatureSetpoint`,
                update_callback: value => {
                    api.setTargetRoomTemperature(serial, roomIndex, value)
                },
                veto_callback: (value, duration) => {
                    api.setRoomQuickVeto(serial, roomIndex, value, duration)
                },
            }

            // target status
            regulator.target_status = {
                type: 'ACTUATOR',
                path: `rbr.rooms.${roomIndex}.configuration.operationMode`,
                update_callback: value => {
                    api.setRoomOperationMode(serial, roomIndex, value)
                },
            }

            regulators.push(regulator)
        })

        return regulators
    }

    function buildSwitchesDescriptor(name, serial, info) {
        let switches = []

        const pendingSwitch = {
            type: 'SWITCH',
            name: `${name} - Gateway Synced`,
            serial,
            path: `meta.gateway`,
        }
        switches.push(pendingSwitch)

        const staleSwitch = {
            type: 'SWITCH',
            name: `${name} - Cloud Connected`,
            serial,
            path: `meta.cloud`,
        }

        switches.push(staleSwitch)

        return switches
    }

    const serial = facility.description.serialNumber
    const name = facility.description.name.trim()

    let hkDescriptor = {
        ...facility.description,
        gateway: facility.state.gateway.gatewayType,
        sensors: buildSensorsDescriptor(name, serial, facility.state),
        regulators: buildRegulatorDescriptor(name, serial, facility.state, api),
        dhw_regulators: buildDHWRegulatorDescriptor(name, serial, facility.state, api),
        rbr_regulators: buildRBRRegulatorDescriptor(name, serial, facility.state, api),
        switches: buildSwitchesDescriptor(name, serial, facility),
    }

    return hkDescriptor
}
