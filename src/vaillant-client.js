const tough = require('tough-cookie');
const qwest = require('axios');
const cookieJarSupport = require('axios-cookiejar-support').default;
cookieJarSupport(qwest);

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
            switch(resp.status) {
                case 200:
                    return resp;
                default:
                    return null;
            }

        }
        catch(e) {
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
        
    }

    async getFacilities() {

        const url_facilities = "/facilities";
        const facilities = await this.query(url_facilities, 'get', null);
        return facilities.data.body.facilitiesList
        
    }

    async getZones(facilitySerial) {

        const url_zones = `/facilities/${facilitySerial}/systemcontrol/v1/zones`;
        const zones = await this.query(url_zones, 'get', null);
    
        var json = JSON.stringify(zones.data.body, null, 4);
        this.log(json)
    
    }
    
    async getSystemStatus(facilitySerial) {
    
        const url_config = `/facilities/${facilitySerial}/systemcontrol/v1/`;
        const system = await this.query(url_config, 'get', null);
    
        var json = JSON.stringify(system.data.body, null, 4);
        this.log(json)
    
    }
    
    
    async getZoneTimeprogram(facilitySerial, zone) {
    
        var zone = "Control_ZO1"
        const url_config = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}/heating/timeprogram`;
    
        var timeprog = await this.query(url_config, 'get', null)
        var json = JSON.stringify(timeprog.data.body, null, 4);
        this.log(json)
    
    }
    
    async setZoneTimeprogram() {
    
        const zone = "Control_ZO1"
        const timeschedule = await require('./ts.json');
        const url_config = `/facilities/${config.facilitySerial}/systemcontrol/v1/zones/${zone}/heating/timeprogram`;
    
        var timeprog = await this.query(url_config, 'put', timeschedule)
        this.log(timeprog.status)
    
    }
    
    async getDWHTimeprogram(facilitySerial, dhwIdentifier) {
    
        const dhwIdentifier = "Control_DHW"
        const url_config = `/facilities/${facilitySerial}/systemcontrol/v1/dhw/${dhwIdentifier}/hotwater/timeprogram`;
    
        var timeprog = await this.query(url_config, 'get', null)
        var json = JSON.stringify(timeprog.data.body, null, 4);
        this.log(json)
    
    }
    
    
    async setTargetTemperature(facilitySerial, zone, temperature) {
    
        const zone = "Control_ZO1"
        const url_config = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}/heating/configuration/setpoint_temperature`;
    
        const data = {
            setpoint_temperature: temperature
        }
    
        await this.query(url_config, 'put', data)
    
    }

    async setTargetReducedTemperature(facilitySerial, zone, temperature) {
    
        const zone = "Control_ZO1"
        const url_config = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}/heating/configuration/setback_temperature`;
    
        const data = {
            setback_temperature: temperature
        }
    
        await this.query(url_config, 'put', data)
    
    }
    
    async getOverview(facilitySerial) {
    
        const url_config = `/facilities/${facilitySerial}/hvacstate/v1/overview`;
        const info = await this.query(url_config, 'get', null)
    
        var json = JSON.stringify(info.data.body, null, 4);
        this.log(json)
    
    }
    
    async getZoneConfig(facilitySerial, zone) {
    
        const zone = "Control_ZO1"
        const url_config = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}`;
        const info = await this.query(url_config, 'get', null)
    
        var json = JSON.stringify(info.data.body, null, 4);
        this.log(json)
    
    }
    
    async getZoneHeatingConfig(facilitySerial, zone) {
    
        const zone = "Control_ZO1"
        const url_config = `/facilities/${facilitySerial}/systemcontrol/v1/zones/${zone}/heating/configuration`;
        const info = await this.query(url_config, 'get', null)
    
        var json = JSON.stringify(info.data.body, null, 4);
        this.log(json)
    
    }
    
    async getEvents(facilitySerial) {
    
        const url_config = `/facilities/${facilitySerial}/events/v1`;
        const info = await this.query(url_config, 'get', null)
    
        var json = JSON.stringify(info.data.body, null, 4);
        this.log(json)
    }
    
    async getStatus(facilitySerial) {
    
        const url_config = `/facilities/${facilitySerial}/systemcontrol/v1/status`;
        const info = await this.query(url_config, 'get', null)
    
        info.data.body.now = new Date();
    
        var json = JSON.stringify(info.data.body, null, 4);
        this.log(json)
    }
    
    async getParameters(facilitySerial) {
    
        const url_config = `/facilities/${facilitySerial}/systemcontrol/v1/parameters`;
        const info = await this.query(url_config, 'get', null)
    
        var json = JSON.stringify(info.data.body, null, 4);
        this.log(json)
    }
    
    async getEmfLiveReport(facilitySerial) {
    
        const url_config = `/facilities/${facilitySerial}/livereport/v1`;
        const info = await this.query(url_config, 'get', null)
    
        var json = JSON.stringify(info.data.body, null, 4);
        this.log(json)
    }
    
    async getEmfReportForDevice() {
    
        const deviceId = "Control_SYS_MultiMatic"
        const reportId = "WaterPressureSensor"
    
        const url_config = `/facilities/${config.facilitySerial}/livereport/v1/devices/${deviceId}/reports/${reportId}`;
        const info = await this.query(url_config, 'get', null)
    
        var json = JSON.stringify(info.data.body, null, 4);
        this.log(json)
    }
}

module.exports = VRC9xxAPI;