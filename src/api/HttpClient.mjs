import { fetch, CookieJar } from 'node-fetch-cookies'

const NB_RETRY = 3

export class HTTPClient {
    constructor(baseURL, log) {
        this.cookieJar = new CookieJar()
        this.baseURL = baseURL
        this.log = log
    }

    buildQuery(command) {
        return {
            url: this.baseURL + command.url,
            options: {
                method: command.method,
                body: JSON.stringify(command.data) || null,
                headers: { 'Content-Type': 'application/json' },
            },
        }
    }

    async request(query) {
        try {
            const response = await fetch(this.cookieJar, query.url, query.options)
            const body = await json(response)
            const status = response.status
            const statusText = response.statusText

            switch (status) {
                case 200:
                    return { error: false, status, statusText, body, response }
                case 401:
                    return { error: true, status, statusText, body: JSON.stringify(body), response, retry: false }
                case 404:
                    return { error: true, status, statusText, body: response.url, response, retry: false }
                case 409:
                    return { error: true, status, statusText, body: JSON.stringify(body), response, retry: false }
                default:
                    return { error: true, status, statusText, body: JSON.stringify(body), response, retry: true }
            }
        } catch (e) {
            return {
                error: true,
                status: e.errno,
                body: e.message,
                response: e,
                retry: true,
            }
        }
    }

    async execute(command) {
        const query = this.buildQuery(command)
        if (command.description) {
            this.log(`[${command.description}]`)
        }

        let retry = 0
        while (retry++ < NB_RETRY) {
            const value = await this.request(query)

            // not an error -> done
            if (!value.error) return value.body

            // error and no retry -> done
            if (!value.retry) throw value

            // else wait and retry
            this.log(value)
            this.log(`  > ${value.status} - ${value.statusText} - ${value.body}`)

            await delay(retry * 2)
            this.log(`  > retry #${retry}`)
        }

        throw buildError('TOO_MANY_RETRY', 'Too many retry')
    }
}

async function delay(seconds) {
    return new Promise(resolve =>
        setTimeout(() => {
            resolve()
        }, seconds * 1000)
    )
}

async function json(response) {
    var json = {}
    try {
        json = await response.json()
    } catch (e) {}

    return json
}

function buildError(code, message) {
    return {
        error: true,
        status: code,
        statusText: message,
        body: '',
        response: undefined,
        retry: false,
    }
}
