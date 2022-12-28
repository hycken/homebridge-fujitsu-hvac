import { Region, Device, Property, Token, User, DeviceResponse, PropertyResponse, LanIP, LanIPResponse } from './models.js'
import fetch, { Response } from 'node-fetch'


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
        const response = await fetch('https://' + this.region.authHostname + '/users/' + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user })
        });
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

        // if (bodyString) {
        //     console.log(bodyString);
        // }
        const result = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'auth_token ' + token.access_token
            },
            body: bodyString
        });
        //console.log(((new Date().getTime() - start.getTime()) / 1000) + 's: ' + path);
        return result;
    }


    async getDevices(): Promise<Device[]> {
        const response = await this.request('devices.json');
        const body = await response?.json();
        const devices = body as DeviceResponse[];

        if (devices.length == 0) { return [] }

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