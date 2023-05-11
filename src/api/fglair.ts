import https from 'https';
import { IncomingMessage, OutgoingHttpHeaders } from 'http'
import { Region, Device, Property, Token, User, DeviceResponse, PropertyResponse, LanIP, LanIPResponse, AuthInfo } from './models.js'

interface Response<T> extends IncomingMessage {
    json: () => Promise<T>
}

export class FGLAir {
    region: Region
    user: User
    private token?: Token = undefined

    constructor(region: Region, user: User) {
        this.region = region;
        this.user = user;
    }

    private hasExpired(token: Token): boolean {
        const expireDate = token.date
        if (!expireDate) { return true; }
        expireDate.setSeconds(expireDate.getSeconds() + token.expires_in);
        return expireDate < new Date();
    }

    async getToken(): Promise<Token | undefined> {
        if (this.token !== undefined && !this.hasExpired(this.token)) {
            return this.token;
        }
        let path: string;
        let user: Token | AuthInfo;
        if (this.token) {
            path = 'refresh_token.json';
            user = this.token;
        } else {
            path = 'sign_in.json'
            user = {
                email: this.user.username,
                password: this.user.password,
                application: {
                    app_id: this.region.appID,
                    app_secret: this.region.appSecret
                }
            }
        }

        const requestedAt = new Date();
        const response = await this.fetch(this.region.authHostname, '/users/' + path, 'POST', {
            'Content-Type': 'application/json'
        }, { user });
        const json = await response.json() as Token;
        if (!json.access_token) { return; }

        json.date = requestedAt;
        this.token = json;
        return this.token;
    }

    reset() {
        this.token = undefined;
    }

    async request<T>(path: string, body: object | undefined = undefined): Promise<Response<T> | undefined> {
        const token = await this.getToken();
        if (!token) { return; }

        const method = body !== undefined ? 'POST' : 'GET';

        const result = await this.fetch<T>(this.region.hostname, '/apiv1/' + path, method, {
            'Authorization': 'auth_token ' + token.access_token
        }, body);
        return result;
    }

    async fetch<T>(hostname: string, path: string, method: string, headers: OutgoingHttpHeaders, body: unknown | undefined = undefined): Promise<Response<T>> {
        return new Promise<Response<T>>((resolve, reject) => {
            let json: string
            let allHeaders = Object.assign({}, headers, {
                'Content-Type': 'application/json'
            }) as OutgoingHttpHeaders;

            if (body) {
                json = JSON.stringify(body);
                allHeaders = Object.assign(allHeaders, {
                    'Content-Length': json.length
                });
            } else {
                json = ''
            }
            const request = https.request({
                hostname,
                path,
                method,
                headers: allHeaders
            }, r => {
                const response = r as Response<T>;
                let data = '';
                response.json = async () => {
                    return new Promise((resolve, reject) => {
                        r.on('data', d => { data += d; });
                        r.on('end', () => {
                            try {
                                const json = JSON.parse(data);
                                resolve(json);
                            } catch {
                                reject(new Error(`Failed to parse JSON: "${data}"`));
                            }
                        });
                    })
                }
                resolve(response);
            });
            request.on('error', reject);
            request.end(json);
        });
    }


    async getDevices(): Promise<Device[]> {
        const response = await this.request<DeviceResponse[]>('devices.json');
        const devices = await response?.json();

        if (!devices || devices.length == 0) { return []; }

        return devices
            .filter(d => d.device !== undefined)
            .map(d => new Device(d.device));
    }

    async getDevice(dsn: string): Promise<Device | undefined> {
        const response = await this.request<DeviceResponse>(`dsns/${dsn}.json`)
        const deviceResponse = await response?.json();

        if (!deviceResponse || !deviceResponse.device) { return; }
        return deviceResponse.device;
    }

    async getProperties(device: Device): Promise<{ [name: string]: Property }> {
        const response = await this.request<PropertyResponse[]>('dsns/' + device.dsn + '/properties.json');
        const properties = await response?.json();
        if (!properties || !properties.length) {
            return {};
        }
        const list = properties
            .filter(p => p.property !== undefined)
            .map(p => p.property) as Property[];

        return list.reduce((prev: { [name: string]: Property }, item: Property) => {
            const result = prev
            result[item.display_name] = item;
            return result;
        }, {});
    }

    async setProperty(property: Property, value: string | number | boolean) {
        const response = await this.request('properties/' + property.key + '/datapoints.json', {
            'datapoint': { value }
        });
        await response?.json();
    }

    async getLanIP(device: Device): Promise<LanIP | undefined> {
        const response = await this.request<LanIPResponse>('dsns/' + device.dsn + '/lan.json');
        if (!response) { return; }
        const body = await response.json();

        if (!('lanip' in body)) { return; }
        return body.lanip;
    }
}