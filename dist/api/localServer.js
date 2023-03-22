import http from 'http';
import { KeyExchange, KeyRespone, Command, PropertyUpdate } from './serverModels.js';
export class LocalServer {
    localIP;
    log;
    fallbackKey;
    handler;
    errorHandler;
    server;
    port;
    hostname = '';
    lanip;
    keyExchange;
    command = 0;
    requestNumber = 0;
    timer;
    valueCache = {};
    commandQueue = [];
    constructor(localIP, log, fallbackKey, handler, errorHandler) {
        this.localIP = localIP;
        this.log = log;
        this.fallbackKey = fallbackKey;
        this.handler = handler;
        this.errorHandler = errorHandler;
        this.server = http.createServer(this.httpHandler.bind(this));
    }
    async start(deviceIP, lanIP) {
        this.hostname = deviceIP;
        this.lanip = lanIP;
        return new Promise((resolve, reject) => {
            this.server.listen(0, this.localIP, () => {
                const address = this.server.address();
                if (!(address instanceof Object)) {
                    return reject();
                }
                this.port = address.port;
                resolve(`http://${this.localIP}:${this.port}`);
            });
        });
    }
    stop() {
        clearInterval(this.timer);
    }
    async httpHandler(request, response) {
        if (!request.url) {
            return this.sendResponse(response, 404);
        }
        const body = (await this.getBody(request)).trim() || '{}';
        // Remove any get parameters 
        const path = request.url.split('?')[0];
        switch (path) {
            case '/local_lan/key_exchange.json':
                return this.handleKeyExchange(response, body);
            case '/local_lan/commands.json':
                return this.handleCommands(response);
            case '/local_lan/property/datapoint.json':
                return this.handleDataPoint(response, body);
            case '/local_lan/time.json':
                return this.handleTime(response, body);
            default:
                this.log.warn(`Unhandled URL: ${request.url}`);
                this.sendResponse(response, 404);
        }
    }
    handleKeyExchange(response, body) {
        const bodyJSON = JSON.parse(body);
        const keyRequest = bodyJSON;
        if (!this.lanip || !keyRequest.key_exchange) {
            return this.sendResponse(response, 500);
        }
        const keepAlive = (this.lanip.keep_alive || 30) - 1;
        const keyResponse = new KeyRespone();
        this.keyExchange = new KeyExchange(this.lanip.lanip_key, keyRequest.key_exchange, keyResponse);
        this.sendResponse(response, 200, keyResponse);
        this.stop();
        this.timer = setInterval(async () => {
            try {
                await this.push(false);
            }
            catch (error) {
                if (!(error instanceof Error)) {
                    return;
                }
                this.errorHandler(error);
            }
        }, keepAlive * 1000);
    }
    handleCommands(response) {
        let data;
        if (!this.lanip || !this.keyExchange) {
            return this.sendResponse(response, 500);
        }
        const command = this.commandQueue.shift();
        if (!command) { // Nothing enqueued, ask for default key.
            data = new Command(this.fallbackKey);
        }
        else { // Tell the other side the new value for property.
            data = new PropertyUpdate(command.key, command.value);
        }
        const requestData = {
            seq_no: this.requestNumber++,
            data: data
        };
        const encryptedData = this.keyExchange.encrypt(requestData);
        this.sendResponse(response, 200, encryptedData);
    }
    handleTime(response, body) {
        this.sendResponse(response, 200);
        try {
            const point = this.keyExchange?.decrypt(body);
            if (!('data' in point)) {
                return this.sendResponse(response, 200);
            }
        }
        catch (error) {
            if (!error || typeof error.message != 'string') {
                return;
            }
            this.log.error(error.message);
        }
    }
    handleDataPoint(response, body) {
        try {
            const point = this.keyExchange?.decrypt(body);
            if (!('data' in point)) {
                return this.sendResponse(response, 200);
            }
            this.log.debug(`#${point.seq_no}: ${point.data.name}: ${point.data.value}`);
            this.sendResponse(response, 200);
            if (this.valueCache[point.data.name] === point.data.value) {
                return;
            }
            this.valueCache[point.data.name] = point.data.value;
            this.handler(point.data.name, point.data.value);
        }
        catch (error) {
            this.sendResponse(response, 200);
            if (!error || typeof error.message != 'string') {
                return;
            }
            this.log.error(error.message);
        }
    }
    async getBody(request) {
        return new Promise((resolve) => {
            let body = '';
            request.on('data', (data) => { body += data; });
            request.on('end', () => { resolve(body); });
        });
    }
    sendResponse(response, statusCode, body) {
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
    async update(key, value) {
        this.valueCache[key] = value;
        this.commandQueue.push({ key, value });
        try {
            await this.push(true);
        }
        catch (error) {
            if (!(error instanceof Error)) {
                return;
            }
            this.errorHandler(error);
        }
    }
    async push(notify) {
        if (!this.port) {
            return;
        }
        const body = JSON.stringify({
            local_reg: {
                ip: this.localIP,
                notify,
                port: this.port,
                uri: '/local_lan'
            }
        });
        return new Promise((resolve, reject) => {
            const request = http.request({
                hostname: this.hostname,
                port: 80,
                path: '/local_reg.json',
                method: !this.keyExchange ? 'POST' : 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': body.length
                }
            }, response => {
                const statusCode = response.statusCode || 0;
                if (Math.floor(statusCode / 100) === 2) {
                    resolve(response);
                }
                if (this.keyExchange) {
                    reject(new Error('Local update request failed.'));
                }
                else {
                    reject(new Error('Failed to register local connection.'));
                }
            });
            request.on('error', reject);
            request.end(body);
        });
    }
}
