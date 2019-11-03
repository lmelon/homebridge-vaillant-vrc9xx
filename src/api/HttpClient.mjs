import axios from 'axios'
import cookieJarSupport from 'axios-cookiejar-support'
import tough from 'tough-cookie'

const axiosClient = cookieJarSupport(axios)

export class HTTPClient {
    constructor(baseURL, log) {
        this.cookieJar = new tough.CookieJar()
        this.baseURL = baseURL
        this.log = log
    }

    buildQuery(command) {
        return {
            url: command.url,
            method: command.method,
            jar: this.cookieJar,
            withCredentials: true,
            type: 'json',
            baseURL: this.baseURL,
            data: command.data || null,
        }
    }

    handleResponse(response, resolve, reject) {
        switch (response.status) {
            case 200:
                resolve(response)
                return true
            case 401:
                reject(response)
                return true
            case 429:
                this.log(`  --> ${response.status} -- ${response.statusText}`)
                return false
            default:
                this.log(`  --> ${response.status} -- ${response.statusText}`)
                if (response.data) {
                    this.log(`  --> ${JSON.stringify(response.data)}`)
                }

                reject(response)
                return false
        }
    }

    async execute(command) {
        const query = this.buildQuery(command)
        if (command.description) {
            this.log(`[${command.description}]`)
        }

        return new Promise(async (resolve, reject) => {
            let retry = 0
            while (true) {
                try {
                    const response = await axiosClient(query)
                    if (this.handleResponse(response, resolve, reject)) {
                        return
                    }
                } catch (e) {
                    if (e.response) {
                        if (this.handleResponse(e.response, resolve, reject)) {
                            return
                        }
                    } else {
                        this.log(`  --> ${e.errno} -- ${e.syscall}`)
                    }

                    if (retry > 2) {
                        return reject(e)
                    }
                }

                retry++
                await delay(retry * 2)
                this.log(`  > retry #${retry}`)
            }
        })
    }
}

async function delay(seconds) {
    return new Promise(resolve =>
        setTimeout(() => {
            resolve()
        }, seconds * 1000)
    )
}
