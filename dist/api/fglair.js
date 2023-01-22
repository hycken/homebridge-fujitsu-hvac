import { Device } from './models.js';
import fetch from 'node-fetch';
export class FGLAir {
    region;
    user;
    token = undefined;
    constructor(region, user) {
        this.region = region;
        this.user = user;
    }
    hasExpired(token) {
        let expireDate = token.date;
        if (!expireDate) {
            return true;
        }
        expireDate.setSeconds(expireDate.getSeconds() + token.expires_in);
        return expireDate < new Date();
    }
    async getToken() {
        if (this.token !== undefined && !this.hasExpired(this.token)) {
            return this.token;
        }
        let path;
        let user;
        if (this.token) {
            path = 'refresh_token.json';
            user = this.token;
        }
        else {
            path = 'sign_in.json';
            user = {
                email: this.user.username,
                password: this.user.password,
                application: {
                    app_id: this.region.appID,
                    app_secret: this.region.appSecret
                }
            };
        }
        const requestedAt = new Date();
        const response = await fetch('https://' + this.region.authHostname + '/users/' + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user })
        });
        let json = await response.json();
        if (!json.access_token) {
            return;
        }
        json.date = requestedAt;
        this.token = json;
        return this.token;
    }
    async request(path, body = undefined) {
        const start = new Date();
        const token = await this.getToken();
        const url = 'https://' + this.region.hostname + '/apiv1/' + path;
        if (!token) {
            return;
        }
        const bodyString = body !== undefined ? JSON.stringify(body) : undefined;
        const method = body !== undefined ? 'POST' : 'GET';
        const result = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'auth_token ' + token.access_token
            },
            body: bodyString
        });
        return result;
    }
    async getDevices() {
        const response = await this.request('devices.json');
        const body = await response?.json();
        const devices = body;
        if (!devices || devices.length == 0) {
            return [];
        }
        return devices
            .filter(d => d.device !== undefined)
            .map(d => Object.assign(new Device(), d.device));
    }
    async getProperties(device) {
        const response = await this.request('dsns/' + device.dsn + '/properties.json');
        const body = await response?.json();
        const properties = body;
        if (!properties || !properties.length) {
            return {};
        }
        let list = properties
            .filter(p => p.property !== undefined)
            .map(p => p.property);
        return list.reduce((prev, item) => {
            let result = prev;
            result[item.display_name] = item;
            return result;
        }, {});
    }
    async setProperty(property, value) {
        const response = await this.request('properties/' + property.key + '/datapoints.json', {
            'datapoint': { value }
        });
        const body = await response?.json();
    }
    async getLanIP(device) {
        const response = await this.request('dsns/' + device.dsn + '/lan.json');
        const body = await response?.json();
        if (!('lanip' in body)) {
            return;
        }
        return body.lanip;
    }
}
