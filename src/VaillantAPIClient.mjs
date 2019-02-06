import _ from 'lodash'
import tough from 'tough-cookie'
import cookieJarSupport from 'axios-cookiejar-support'
import axios from 'axios' 
const qwest = cookieJarSupport(axios)

class VRC9xxAPI {

    constructor(data, log) {
        this.auth = data;
        this.log = log ? log : console.log;
        this.cookieJar = new tough.CookieJar();
    }

    async query(url, method, data) {

        const query = {
            url,
            method,
            jar: this.cookieJar,
            withCredentials: true,
            type: 'json',
            baseURL: 'https://smart.vaillant.com/mobile/api/v4/'
        };

        if (data) {
            query.data = data;
        }

        try {
            var resp = await qwest(query)
            switch (resp.status) {
                case 200:
                    return resp;
                default:
                    return null;
            }

        } catch (e) {
            this.log(e);
            return null;
        }

    }

    async logIn() {

        const url_authenticate = "/account/authentication/v1/token/new";
        const url_authorize = "/account/authentication/v1/authenticate";

        if (!this.auth.authToken) {
            var response = await this.query(url_authenticate, 'post', this.auth);
            this.auth.authToken = response.data.body.authToken;
            this.password = this.auth.password;
            delete this.auth.password;
        }

        const resp = await this.query(url_authorize, 'post', this.auth)
        return (resp.status === 200)

    }

    async getFacilities() {

        const url = "/facilities";
        const facilities = await this.query(url, 'get', null);
        return facilities.data.body.facilitiesList

    }

    async getFullSystem(facilitySerial) {

        const url = `/facilities/${facilitySerial}/systemcontrol/v1/`;
        const system = await this.query(url, 'get', null);
        return system.data.body

    }

    async getStatus(facilitySerial) {

        const url = `/facilities/${facilitySerial}/systemcontrol/v1/status`;
        const info = await this.query(url, 'get', null)
        return info.data.body
    }

    async getEmfLiveReport(facilitySerial) {

        const url = `/facilities/${facilitySerial}/livereport/v1`;
        const info = await this.query(url, 'get', null)
        return info.data.body
    }

    async getGateway(facilitySerial) {

        const url = `/facilities/${facilitySerial}/public/v1/gatewayType`;
        const info = await this.query(url, 'get', null);
        return info.data.body

    }

    async getFullState(facilitySerial) {
        const response = await Promise.all(
            [this.getFullSystem(facilitySerial), this.getEmfLiveReport(facilitySerial), 
             this.getStatus(facilitySerial), this.getGateway(facilitySerial)]
        )

        const state = _.zipObject(["system", "info", "status", "gateway"], response);
        return state
    }

    async setTargetTemperature(facilitySerial, zone, temperature) {

        const zone = "Control_ZO1"
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}/heating/configuration/setpoint_temperature`;

        const data = {
            setpoint_temperature: temperature
        }

        await this.query(url, 'put', data)

    }

    async setTargetReducedTemperature(facilitySerial, zone, temperature) {

        const zone = "Control_ZO1"
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}/heating/configuration/setback_temperature`;

        const data = {
            setback_temperature: temperature
        }

        await this.query(url, 'put', data)

    }

    async getOverview(facilitySerial) {

        const url = `/facilities/${facilitySerial}/hvacstate/v1/overview`;
        const info = await this.query(url, 'get', null)

        var json = JSON.stringify(info.data.body, null, 4);
        this.log(json)

    }

    async getZoneConfig(facilitySerial, zone) {

        const zone = "Control_ZO1"
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}`;
        const info = await this.query(url, 'get', null)

        var json = JSON.stringify(info.data.body, null, 4);
        this.log(json)

    }



    // *******************************************************************
    async getZones(facilitySerial) {

        const url = `/facilities/${facilitySerial}/systemcontrol/v1/zones`;
        const zones = await this.query(url, 'get', null);
        return zones.data.body

    }

    async getDWHTimeprogram(facilitySerial, dhwIdentifier) {

        const dhwIdentifier = "Control_DHW"
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/dhw/${dhwIdentifier}/hotwater/timeprogram`;

        var timeprog = await this.query(url, 'get', null)
        var json = JSON.stringify(timeprog.data.body, null, 4);
        this.log(json)

    }

    async getZoneHeatingConfig(facilitySerial, zone) {

        const zone = "Control_ZO1"
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}/heating/configuration`;
        const info = await this.query(url, 'get', null)

        var json = JSON.stringify(info.data.body, null, 4);
        this.log(json)

    }

    async getEmfReportForDevice() {

        const deviceId = "Control_SYS_MultiMatic"
        const reportId = "WaterPressureSensor"

        const url = `/facilities/${config.facilitySerial}/livereport/v1/devices/${deviceId}/reports/${reportId}`;
        const info = await this.query(url, 'get', null)

        var json = JSON.stringify(info.data.body, null, 4);
        this.log(json)
    }

    async getZoneTimeprogram(facilitySerial, zone) {

        var zone = "Control_ZO1"
        const url = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}/heating/timeprogram`;

        var timeprog = await this.query(url, 'get', null)
        var json = JSON.stringify(timeprog.data.body, null, 4);
        this.log(json)

    }

    async setZoneTimeprogram() {

        const zone = "Control_ZO1"
        const timeschedule = await require('./ts.json');
        const url = `/facilities/${config.facilitySerial}/systemcontrol/v1/zones/${zone}/heating/timeprogram`;

        var timeprog = await this.query(url, 'put', timeschedule)
        this.log(timeprog.status)

    }

    async getParameters(facilitySerial) {

        const url = `/facilities/${facilitySerial}/systemcontrol/v1/parameters`;
        const info = await this.query(url, 'get', null)
        return info.data.body

    }

    async getEvents(facilitySerial) {

        const url = `/facilities/${facilitySerial}/events/v1`;
        const info = await this.query(url, 'get', null)

        return info.data.body
    }
}

export default VRC9xxAPI;