export const API_COMMANDS = {
    LOGIN: data => {
        return {
            description: 'Login',
            url: '/account/authentication/v1/token/new',
            method: 'post',
            data,
            unauthenticated: true,
        }
    },
    AUTHORIZE: data => {
        return {
            description: 'Authorization',
            url: '/account/authentication/v1/authenticate',
            method: 'post',
            data,
            unauthenticated: true,
        }
    },
    GET_ALL_FACILITIES: {
        description: 'Get facilities',
        url: '/facilities',
        method: 'get',
    },
    GET_FULL_SYSTEM_FOR_FACILITY: serial => {
        return {
            description: 'Get facility details',
            url: `/facilities/${serial}/systemcontrol/v1`,
            method: 'get',
        }
    },
    GET_STATUS_FOR_FACILITY: serial => {
        return {
            description: 'Get facility status',
            url: `/facilities/${serial}/systemcontrol/v1/status`,
            method: 'get',
        }
    },
    GET_LIVE_REPORT_FOR_FACILITY: serial => {
        return {
            description: 'Get facility live report',
            url: `/facilities/${serial}/livereport/v1`,
            method: 'get',
        }
    },
    GET_GATEWAY_FOR_FACILITY: serial => {
        return {
            description: 'Get facility gateway information',
            url: `/facilities/${serial}/public/v1/gatewayType`,
            method: 'get',
        }
    },
    GET_RBR_FOR_FACILITY: serial => {
        return {
            description: 'Get facility room-by-room information',
            url: `/facilities/${serial}/rbr/v1/rooms`,
            method: 'get',
        }
    },
}
