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
        this.emit(VAILLANT_POLLER_EVENTS.FACILITIES, facility);
    }

    async refreshFacility(serial) {
        let system = await this.api.getFullState(serial)

        this.state[serial].current = system
        this.state[serial].refresh = new Date()

        setTimeout(() => { this.refreshFacility(serial) }, this.config.polling * 1000)
        this.log(`Facility ${this.state[serial].facility.name} refreshed`)
    }

}

export default VaillantAPIPoller;