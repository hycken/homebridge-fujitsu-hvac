import { FGLAir } from "./fglair";
import http from 'http';
import { PropertyKey, LanIP } from './models.js';
import { KeyRequestResponse, KeyExchange, KeyRespone, Command, Datapoint, PropertyUpdate } from './serverModels.js';

export class LocalServer {
    handler: ((key: PropertyKey, value: string | number | boolean) => void)
    server: http.Server
    port?: number
    hostname: string = ''
    lanip?: LanIP
    keyExchange?: KeyExchange
    localIP: string
    command = 0
    requestNumber = 0
    timer?: NodeJS.Timer

    valueCache: { [key: string]: number | string | boolean } = {}

    commandQueue: { key: PropertyKey, value: number | string | boolean }[] = [];

    constructor(localIP: string, handler: (key: PropertyKey, value: string | number | boolean) => void) {
        this.handler = handler;
        this.localIP = localIP;
        this.server = http.createServer(this.httpHandler.bind(this));
    }

    async start(deviceIP: string, lanIP?: LanIP): Promise<string> {
        this.hostname = deviceIP;
        this.lanip = lanIP;

        return new Promise((resolve, reject) => {
            this.server.listen(0, this.localIP, () => {
                const address = this.server.address();
                if (!(address instanceof Object)) { return reject() }
                this.port = address.port;
                resolve(`http://${this.localIP}:${this.port}`);
            });
        });
    }

    async stop() {
        clearInterval(this.timer);
    }

    async httpHandler(request: http.IncomingMessage, response: http.ServerResponse) {
        if (!request.url) { return this.sendResponse(response, 404) }
        const body = (await this.getBody(request)).trim() || '{}';
        // console.log(request.url);

        // Remove any get parameters 
        const path = request.url.split('?')[0];
        switch (path) {
            case '/local_lan/key_exchange.json':
                const bodyJSON = JSON.parse(body);
                return this.handleKeyExchange(response, bodyJSON);
            case '/local_lan/commands.json':
                const bodyJSON2 = JSON.parse(body);
                return this.handleCommands(request.url, response, bodyJSON2);
            case '/local_lan/property/datapoint.json':
                return this.handleDataPoint(response, body);
            case '/local_lan/property/datapoint/ack.json':
                return this.handleDataPoint(response, body);
            default:
                console.log(`Unknown path: ${path}`);
                this.sendResponse(response, 404);
        }
    }

    handleKeyExchange(response: http.ServerResponse, body: object) {
        const keyRequest = body as KeyRequestResponse
        if (!this.lanip || !(keyRequest.key_exchange)) { return this.sendResponse(response, 500); }

        const keyResponse = new KeyRespone();
        this.keyExchange = new KeyExchange(this.lanip.lanip_key, keyRequest.key_exchange, keyResponse);
        clearInterval(this.timer);
        this.sendResponse(response, 200, keyResponse)
        this.timer = setInterval(() => { this.push(false); }, 30000);
    }

    handleCommands(url: string, response: http.ServerResponse, body: object) {
        const pathKey = (/\?name=(.*)/.exec(url) ?? [])[1];
        let data: Object
        const command = this.commandQueue.shift();
        if (!command) { // Nothing enqueued, just ask for Display Temperature.
            data = new Command(PropertyKey.DisplayTemperature);
        } else { // Tell the other side the new value for property.
            data = new PropertyUpdate(command.key, command.value);
        }
        const requestData = {
            seq_no: this.requestNumber++,
            data: data
        }
        const encryptedData = this.keyExchange?.encrypt(requestData);
        this.sendResponse(response, 200, encryptedData);
    }

    handleDataPoint(response: http.ServerResponse, body: string) {
        const point = this.keyExchange?.decrypt(body) as Datapoint;
        if (!('data' in point)) { return this.sendResponse(response, 200); }

        this.sendResponse(response, 200);
        if (this.valueCache[point.data.name] === point.data.value) { return; }
        this.valueCache[point.data.name] = point.data.value;
        this.handler(point.data.name as PropertyKey, point.data.value);
    }

    handleAck(response: http.ServerResponse, body: string) {
        console.log('ACK');
    }

    async getBody(request: http.IncomingMessage): Promise<string> {
        return new Promise((resolve) => {
            let body = '';
            request.on('data', (data) => { body += data; });
            request.on('end', () => { resolve(body); });
        });
    }

    sendResponse(response: http.ServerResponse, statusCode: number, body?: object | string) {
        if (!body) {
            response.writeHead(statusCode);
            response.end();
            return;
        }
        const bodyString = JSON.stringify(body) ?? '';
        response.writeHead(statusCode, {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': bodyString.length
        });
        response.end(bodyString);
    }

    async update(key: PropertyKey, value: number | string | boolean) {
        this.valueCache[key] = value;
        this.commandQueue.push({ key, value });
        this.push(true);
    }

    async status() {
        if (!this.port) { return; }
        const method = !this.keyExchange ? 'POST' : 'PUT';

        await new Promise<http.IncomingMessage>((resolve, reject) => {
            const request = http.request({
                hostname: this.hostname,
                port: 80,
                path: '/local_reg.json',
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': 0
                }
            }, response => {
                resolve(response);
            });
            request.on('error', err => {
                reject(err);
            });
            request.write('');
            request.end();
        });
    }

    async push(notify = false) {
        if (!this.port) { return; }
        const method = !this.keyExchange ? 'POST' : 'PUT';

        const body = JSON.stringify({
            local_reg: {
                ip: this.localIP,
                notify: notify,
                port: this.port,
                uri: '/local_lan'
            }
        });

        await new Promise<http.IncomingMessage>((resolve, reject) => {
            const request = http.request({
                hostname: this.hostname,
                port: 80,
                path: '/local_reg.json',
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': body.length
                }
            }, response => {
                resolve(response);
            });
            request.on('error', err => {
                reject(err);
            });
            request.write(body);
            request.end();
        });
    }
}