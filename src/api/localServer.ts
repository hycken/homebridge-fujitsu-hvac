import http from 'http';
import { PropertyKey, LanIP } from './models.js';
import { KeyRequestResponse, KeyExchange, KeyRespone, Command, Datapoint, PropertyUpdate } from './serverModels.js';

interface ILogger {
    info(message: string, ...parameters: unknown[]): void;
    warn(message: string, ...parameters: unknown[]): void;
    error(message: string, ...parameters: unknown[]): void;
    debug(message: string, ...parameters: unknown[]): void;
}


export class LocalServer {
    server: http.Server;
    port?: number;
    hostname = '';
    lanip?: LanIP;
    keyExchange?: KeyExchange;
    command = 0;
    requestNumber = 0;
    timer?: NodeJS.Timer;
    running = false;

    valueCache: { [key: string]: number | string | boolean } = {};
    commandQueue: { key: PropertyKey, value: number | string | boolean }[] = [];

    constructor(
        private localIP: string,
        private log: ILogger,
        private fallbackKey: PropertyKey,
        private handler: (key: PropertyKey, value: string | number | boolean) => void,
        private errorHandler: (error: Error) => void
    ) {
        this.server = http.createServer(this.httpHandler.bind(this));
    }

    async start(deviceIP: string, lanIP?: LanIP): Promise<string> {
        this.running = true;
        this.hostname = deviceIP;
        this.lanip = lanIP;
        return new Promise((resolve, reject) => {
            this.server.listen(0, this.localIP, () => {
                const address = this.server.address();
                if (!(address instanceof Object)) { return reject() }
                this.port = address.port;
                this.push(false);
                resolve(`http://${this.localIP}:${this.port}`);
            });
        });
    }

    stop() {
        this.running = false;
        clearInterval(this.timer);
        clearTimeout(this.throttleTimer);
    }

    private throttleTimer?: NodeJS.Timeout

    clearNetworkError() {
        clearTimeout(this.throttleTimer);
        this.throttleTimer = undefined;
    }

    networkErrorHandler(error: Error) {
        if (!this.running || this.throttleTimer) { return; }
        this.log.debug("Network request failed. Reconnecting in 5 minutes.");
        this.throttleTimer = setTimeout(() => {
            this.throttleTimer = undefined;
            this.errorHandler(error);
        }, 300 * 1000);
    }

    async httpHandler(request: http.IncomingMessage, response: http.ServerResponse) {
        if (!request.url) { return this.sendResponse(response, 404) }
        const body = (await this.getBody(request)).trim() || '{}';

        // Remove any get parameters 
        const path = request.url.split('?')[0];
        try {
            switch (path) {
                case '/local_lan/key_exchange.json':
                    return this.handleKeyExchange(response, body);
                case '/local_lan/commands.json':
                    return this.handleCommands(response);
                case '/local_lan/property/datapoint.json':
                    return this.handleDataPoint(response, body);
                // case '/local_lan/time.json':
                //     return this.handleTime(response, body);
                default:
                    this.log.warn(`Unhandled URL: ${request.url}`);
                    this.sendResponse(response, 404);
            }
        } catch (error: unknown) {
            if (!(error instanceof Error)) { return; }
            this.log.error(`${path}: ${error.message}`);
            this.log.debug(body);
        }
    }

    handleKeyExchange(response: http.ServerResponse, body: string) {
        const bodyJSON = JSON.parse(body);
        const keyRequest = bodyJSON as KeyRequestResponse

        if (!this.lanip || !keyRequest.key_exchange) {
            return this.sendResponse(response, 500);
        }
        const keepAlive = (this.lanip.keep_alive || 30) - 1;
        const keyResponse = new KeyRespone();
        this.keyExchange = new KeyExchange(this.lanip.lanip_key, keyRequest.key_exchange, keyResponse);
        this.sendResponse(response, 200, keyResponse);
        clearInterval(this.timer);
        clearTimeout(this.throttleTimer);
        this.timer = setInterval(async () => {
            await this.push(false);
        }, keepAlive * 1000);
    }

    handleCommands(response: http.ServerResponse) {
        let data: Command | PropertyUpdate;
        if (!this.lanip || !this.keyExchange) { return this.sendResponse(response, 500); }
        const command = this.commandQueue.shift();
        if (!command) { // Nothing enqueued, ask for default key.
            data = new Command(this.fallbackKey);
        } else { // Tell the other side the new value for property.
            data = new PropertyUpdate(command.key, command.value);
        }
        const requestData = {
            seq_no: this.requestNumber++,
            data: data
        }
        const encryptedData = this.keyExchange.encrypt(requestData);
        this.sendResponse(response, 200, encryptedData);
    }

    handleDataPoint(response: http.ServerResponse, body: string) {
        const point = this.keyExchange?.decrypt(body) as Datapoint;
        if (!point || !('data' in point)) {
            this.keyExchange = undefined;
            return this.sendResponse(response, 200);
        }
        this.log.debug(`#${point.seq_no}: ${point.data.name}: ${point.data.value}`);
        this.sendResponse(response, 200);

        if (this.valueCache[point.data.name] === point.data.value) { return; }
        this.valueCache[point.data.name] = point.data.value;
        this.handler(point.data.name as PropertyKey, point.data.value);
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
        await this.push(true);
    }

    async push(notify: boolean) {
        try {
            await this.send(notify);
            this.clearNetworkError();
        } catch (error) {
            if (!(error instanceof Error)) { return; }
            this.networkErrorHandler(error);
        }
    }

    private async send(notify: boolean): Promise<http.IncomingMessage | undefined> {
        if (!this.port) { return; }
        const body = JSON.stringify({
            local_reg: {
                ip: this.localIP,
                notify,
                port: this.port,
                uri: '/local_lan'
            }
        });

        return new Promise<http.IncomingMessage>((resolve, reject) => {
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
                if (Math.floor(statusCode / 100) === 2) { resolve(response); }

                if (this.keyExchange) {
                    reject(new Error('Local update request failed.'));
                } else {
                    reject(new Error('Failed to register local connection.'));
                }
            });
            request.on('error', reject);
            request.end(body);
        });
    }
}