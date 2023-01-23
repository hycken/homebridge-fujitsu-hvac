import https from 'https';
import { IncomingMessage, OutgoingHttpHeaders } from 'http'
import { Region, Device, Property, Token, User, DeviceResponse, PropertyResponse, LanIP, LanIPResponse } from './models.js'

interface Response extends IncomingMessage {
    json: () => Object
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
        let expireDate = token.date
        if (!expireDate) { return true; }
        expireDate.setSeconds(expireDate.getSeconds() + token.expires_in);
        return expireDate < new Date();
    }

    async getToken(): Promise<Token | undefined> {
        if (this.token !== undefined && !this.hasExpired(this.token)) {
            return this.token;
        }
        let path: string
        let user: Object
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
        let json = await response.json() as Token;
        if (!json.access_token) { return; }

        json.date = requestedAt;
        this.token = json;
        return this.token;

    }

    async request(path: string, body: object | undefined = undefined): Promise<Response | undefined> {
        const start = new Date();
        const token = await this.getToken();
        const url = 'https://' + this.region.hostname + '/apiv1/' + path;
        if (!token) { return; }

        const bodyString = body !== undefined ? JSON.stringify(body) : undefined;
        const method = body !== undefined ? 'POST' : 'GET';

        const result = await this.fetch(this.region.hostname, '/apiv1/' + path, method, {
            'Authorization': 'auth_token ' + token.access_token
        }, body);
        return result;
    }

    async fetch(hostname: string, path: string, method: string, headers: OutgoingHttpHeaders, body: Object | undefined = undefined): Promise<Response> {
        return new Promise<Response>((resolve, reject) => {
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
                let response = r as Response
                let data = '';
                response.json = async () => {
                    return new Promise((resolve, reject) => {
                        r.on('data', d => { data += d; });
                        r.on('end', () => { resolve(JSON.parse(data)); });
                    })
                }
                resolve(response);
            });
            request.on('error', reject);
            request.end(json);
        });
    }


    async getDevices(): Promise<Device[]> {
        const response = await this.request('devices.json');
        const body = await response?.json();
        const devices = body as DeviceResponse[];

        if (!devices || devices.length == 0) { return []; }

        return devices
            .filter(d => d.device !== undefined)
            .map(d => Object.assign(new Device(), d.device)) as Device[];
    }

    async getProperties(device: Device): Promise<{ [name: string]: Property }> {
        const response = await this.request('dsns/' + device.dsn + '/properties.json');
        const body = await response?.json();
        const properties = body as PropertyResponse[];
        if (!properties || !properties.length) {
            return {};
        }
        let list = properties
            .filter(p => p.property !== undefined)
            .map(p => p.property) as Property[];

        return list.reduce((prev: { [name: string]: Property }, item: Property) => {
            let result = prev
            result[item.display_name] = item;
            return result;
        }, {});
    }

    async setProperty(property: Property, value: string | number | boolean) {
        const response = await this.request('properties/' + property.key + '/datapoints.json', {
            'datapoint': { value }
        });
        const body = await response?.json();
    }

    async getLanIP(device: Device): Promise<LanIP | undefined> {
        const response = await this.request('dsns/' + device.dsn + '/lan.json');
        const body = await response?.json() as LanIPResponse;
        if (!('lanip' in body)) { return; }
        return body.lanip;
    }
}