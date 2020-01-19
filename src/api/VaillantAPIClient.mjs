import * as rxjs from 'rxjs'
import * as operators from 'rxjs/operators'

import _ from 'lodash'
import EventEmitter from 'events'

import { API_COMMANDS } from './VaillantAPICommands.mjs'
import { HTTPClient } from './HttpClient.mjs'

import fs from 'fs'

const { Subject, defer } = rxjs
const { tap, groupBy, mergeMap, distinctUntilChanged, auditTime, concatMap, delay } = operators

const BASE_URL = 'https://smart.vaillant.com/mobile/api/v4'

class VRC9xxAPI extends EventEmitter {
    constructor(data, log, debug) {
        super()

        this.log = log ? log : console.log
        this.httpClient = new HTTPClient(BASE_URL, this.log)
        this.debug = debug
        if (this.debug.active) {
            this.log(`Dumping queries to path ${this.debug.path}`)
            fs.writeFileSync(this.debug.path + '/vaillant-query.log', '=======================================\n')
        }

        this.config = {
            authData: data,
        }

        this.state = {
            authenticated: false,
        }

        this.commandQueue = new Subject()
        this.enqueueCommand = this.debouncedCommandFactory(this.query.bind(this), this.doneUpdate.bind(this))
    }

    debouncedCommandFactory(query, done) {
        this.commandQueue
            .pipe(
                groupBy(command => command.url),
                mergeMap(group$ => {
                    return group$.pipe(
                        distinctUntilChanged(),
                        auditTime(2000),
                        concatMap(command => {
                            return defer(() => query(command)).pipe(
                                delay(1000),
                                tap(resp => done())
                            )
                        })
                    )
                })
            )
            .subscribe()

        return function enqueue(command) {
            this.commandQueue.next(command)
        }
    }

    async query(command) {
        if (!command.unauthenticated && !this.state.authenticated) {
            await this.logIn(true)
        }

        try {
            const resp = await this.httpClient.execute(command)
            if (this.debug.active) {
                this.dumpQuery(command, resp)
            }

            return resp.data ? resp.data : resp
        } catch (e) {
            return this.handleError(e, command)
        }
    }

    dumpQuery(command, data) {
        if (command.description === 'Login') {
            // do not log login
            return
        }

        try {
            fs.appendFileSync(this.debug.path + '/vaillant-query.log', JSON.stringify(command, null, '  '))
            fs.appendFileSync(this.debug.path + '/vaillant-query.log', '\n---------------------------------------\n')
            fs.appendFileSync(this.debug.path + '/vaillant-query.log', JSON.stringify(data, null, '  '))
            fs.appendFileSync(this.debug.path + '/vaillant-query.log', '\n=======================================\n')
        } catch (err) {
            //do nothing
        }
    }

    doneUpdate() {
        this.emit('UPDATE_DONE', {})
    }

    handleError(e, command) {
        switch (e.status) {
            case 401:
                this.state.authenticated = false
        }

        this.log(`${e.status} - ${e.statusText} - ${e.body}`)
        throw e
    }

    async logIn(force = false) {
        if (force) {
            this.httpClient = new HTTPClient(BASE_URL, this.log)
            delete this.state.authData
        }

        if (!this.state.authData) {
            const response = await this.query(API_COMMANDS.LOGIN(this.config.authData))

            this.state.authData = {
                smartphoneId: this.config.authData.smartphoneId,
                username: this.config.authData.username,
                authToken: response.body.authToken,
            }
        }

        await this.query(API_COMMANDS.AUTHORIZE(this.state.authData))

        this.state.authenticated = true
    }

    async getFacilities() {
        this.log('Get all facilities ...')
        const resp = await this.query(API_COMMANDS.GET_ALL_FACILITIES)
        return resp.body.facilitiesList
    }

    async getFullSystem(facilitySerial) {
        return await this.query(API_COMMANDS.GET_FULL_SYSTEM_FOR_FACILITY(facilitySerial))
    }

    async getStatus(facilitySerial) {
        return await this.query(API_COMMANDS.GET_STATUS_FOR_FACILITY(facilitySerial))
    }

    async getEmfLiveReport(facilitySerial) {
        return await this.query(API_COMMANDS.GET_LIVE_REPORT_FOR_FACILITY(facilitySerial))
    }

    async getGateway(facilitySerial) {
        return await this.query(API_COMMANDS.GET_GATEWAY_FOR_FACILITY(facilitySerial), null)
    }

    async getRbrInfos(facilitySerial) {
        return await this.query(API_COMMANDS.GET_RBR_FOR_FACILITY(facilitySerial), null)
    }

    async getFullState(facilitySerial, includeRbr = false) {
        const requests = [
            this.getFullSystem(facilitySerial),
            this.getEmfLiveReport(facilitySerial),
            this.getStatus(facilitySerial),
            this.getGateway(facilitySerial),
        ]

        if (includeRbr) {
            requests.push(this.getRbrInfos(facilitySerial))
        }

        // wait for all requests to complete
        const response = await Promise.all(requests)

        const bodies = response.map(it => {
            return it.body
        })

        const metas = response.map(it => {
            return it.meta
        })

        // build main object
        const info = _.zipObject(['system', 'measures', 'status', 'gateway', 'rbr'], bodies)

        // filter inactive zone
        info.system.zones = info.system.zones.filter(zone => zone.configuration.enabled)

        // index zones by id
        info.system.zones = _.zipObject(
            info.system.zones.map(zone => zone._id),
            info.system.zones
        )

        // index dwh by id
        info.system.dhw = _.zipObject(
            info.system.dhw.map(dhw => dhw._id),
            info.system.dhw
        )

        // if r-b-r
        if (includeRbr) {
            // compute battery_low
            info.rbr.rooms.forEach(room => {
                room.isBatteryLow = false
                room.configuration.devices.forEach(device => {
                    if (device.isBatteryLow) {
                        room.isBatteryLow = true
                    }
                })
            })

            // index dwh by roomIndex
            info.rbr.rooms = _.zipObject(
                info.rbr.rooms.map(room => room.roomIndex),
                info.rbr.rooms
            )
        }

        // isolate temperature measures
        let devices = info.measures.devices
        Object.keys(info.system.dhw).forEach(key => {
            let measures = []
            let reports = devices.find(item => item._id === key)
            if (reports) {
                measures = reports.reports.filter(item => item.measurement_category === 'TEMPERATURE')
            }

            info.system.dhw[key].configuration = _.zipObject(
                measures.map(item => item._id),
                measures
            )
        })

        // look for stale data
        var gateway = false
        metas.forEach(meta => {
            if (meta.resourceState) {
                meta.resourceState.forEach(item => {
                    if (item.state !== 'SYNCED') {
                        gateway = true
                    }
                })
            }
        })

        info.meta = { gateway }

        return info
    }

    async setTargetTemperature(facilitySerial, zone, temperature) {
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}/heating/configuration/setpoint_temperature`

        const data = {
            setpoint_temperature: temperature,
        }

        this.enqueueCommand({
            url,
            data,
            method: 'put',
            description: 'Set Target Day Temp',
        })
    }

    async setTargetDHWTemperature(facilitySerial, dhw, temperature) {
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/dhw/${dhw}/hotwater/configuration/temperature_setpoint`

        const data = {
            temperature_setpoint: temperature,
        }

        this.enqueueCommand({
            url,
            data,
            method: 'put',
            description: 'Set Water Target Temp',
        })
    }

    async setTargetReducedTemperature(facilitySerial, zone, temperature) {
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}/heating/configuration/setback_temperature`

        const data = {
            setback_temperature: temperature,
        }

        this.enqueueCommand({
            url,
            data,
            method: 'put',
            description: 'Set Target Night Temp',
        })
    }

    async setTargetRoomTemperature(facilitySerial, roomIndex, temperature) {
        const url = `/facilities/${facilitySerial}/rbr/v1/rooms/${roomIndex}/configuration/temperatureSetpoint`

        const data = {
            temperatureSetpoint: temperature,
        }

        this.enqueueCommand({
            url,
            data,
            method: 'put',
            description: 'Set Room Target Temp',
        })
    }

    async setRoomQuickVeto(facilitySerial, roomIndex, temperature, duration) {
        const url = `/facilities/${facilitySerial}/rbr/v1/rooms/${roomIndex}/configuration/quickVeto`

        const data = {
            temperatureSetpoint: temperature,
            duration: duration,
        }

        this.enqueueCommand({
            url,
            data,
            method: 'put',
            description: 'Set Room Quick Veto',
        })
    }

    async setHeatingMode(facilitySerial, zone, mode) {
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}/heating/configuration/mode`

        const data = {
            mode,
        }

        this.enqueueCommand({
            url,
            data,
            method: 'put',
            description: 'Set Heating Mode',
        })
    }

    async setDHWOperationMode(facilitySerial, dhw, mode) {
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/dhw/${dhw}/hotwater/configuration/operation_mode`

        const data = {
            operation_mode: mode,
        }

        this.enqueueCommand({
            url,
            data,
            method: 'put',
            description: 'Set Hot Water Mode',
        })
    }

    async setRoomOperationMode(facilitySerial, roomIndex, mode) {
        const url = `/facilities/${facilitySerial}/rbr/v1/rooms/${roomIndex}/configuration/operationMode`

        const data = {
            operationMode: mode,
        }

        this.enqueueCommand({
            url,
            data,
            method: 'put',
            description: 'Set Room Operation Mode',
        })
    }

    // *******************************************************************
    async getOverview(facilitySerial) {
        const url = `/facilities/${facilitySerial}/hvacstate/v1/overview`
        const info = await this.query(url, 'get', null)

        var json = JSON.stringify(info.data.body, null, 4)
        this.log(json)
    }

    async getZoneConfig(facilitySerial, zone = 'Control_ZO1') {
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}`
        const info = await this.query(url, 'get', null)

        var json = JSON.stringify(info.data.body, null, 4)
        this.log(json)
    }

    async getZones(facilitySerial) {
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/zones`
        const zones = await this.query(url, 'get', null)
        return zones.data.body
    }

    async getDWHTimeprogram(facilitySerial, dhwIdentifier = 'Control_DHW') {
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/dhw/${dhwIdentifier}/hotwater/timeprogram`

        var timeprog = await this.query(url, 'get', null)
        var json = JSON.stringify(timeprog.data.body, null, 4)
        this.log(json)
    }

    async getZoneHeatingConfig(facilitySerial, zone = 'Control_ZO1') {
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}/heating/configuration`
        const info = await this.query(url, 'get', null)

        var json = JSON.stringify(info.data.body, null, 4)
        this.log(json)
    }

    async getEmfReportForDevice() {
        const deviceId = 'Control_SYS_MultiMatic'
        const reportId = 'WaterPressureSensor'

        const url = `/facilities/${config.facilitySerial}/livereport/v1/devices/${deviceId}/reports/${reportId}`
        const info = await this.query(url, 'get', null)

        var json = JSON.stringify(info.data.body, null, 4)
        this.log(json)
    }

    async getZoneTimeprogram(facilitySerial, zone = 'Control_ZO1') {
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}/heating/timeprogram`

        var timeprog = await this.query(url, 'get', null)
        var json = JSON.stringify(timeprog.data.body, null, 4)
        this.log(json)
    }

    async setZoneTimeprogram(zone = 'Control_ZO1') {
        const timeschedule = await require('./ts.json')
        const url = `/facilities/${config.facilitySerial}/systemcontrol/v1/zones/${zone}/heating/timeprogram`

        var timeprog = await this.query(url, 'put', timeschedule)
        this.log(timeprog.status)
    }

    async getParameters(facilitySerial) {
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/parameters`
        const info = await this.query(url, 'get', null)
        return info.data.body
    }

    async getEvents(facilitySerial) {
        const url = `/facilities/${facilitySerial}/events/v1`
        const info = await this.query(url, 'get', null)

        return info.data.body
    }
}

export default VRC9xxAPI
