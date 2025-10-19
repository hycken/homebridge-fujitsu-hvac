import crypto, { BinaryLike } from 'crypto'
import { PropertyKey } from './models.js'

export class Datapoint {
    seq_no = 0
    data: {
        name: string,
        value: number
    } = { name: '', value: 0 }
}

export class Command {
    cmds: {
        cmd: {
            method: string,
            resource: string,
            uri: string,
            data: string,
            cmd_id: number
        }
    }[]

    constructor(key: PropertyKey) {
        this.cmds = [{
            cmd: {
                method: 'GET',
                resource: `property.json?name=${key}`,
                uri: '/local_lan/property/datapoint.json',
                data: '',
                cmd_id: 0
            }
        }];
    }
}

export class KeyRequestResponse {
    key_exchange?: KeyRequest
}

export class PropertyUpdate {
    properties: {
        property: {
            base_type: 'integer' | 'string' | 'boolean',
            name: string,
            value: number | string | boolean,
            // id: number | string
        }
    }[]

    constructor(key: PropertyKey, value: number | string | boolean) {
        this.properties = [{
            property: {
                base_type: 'integer',
                name: key,
                value: value,
                //id: crypto.randomUUID().slice(0, 8)
            }
        }];
    }
}


export class KeyRequest {
    ver = ''
    random_1 = ''
    time_1 = 0
    proto = 0
    key_id = 0
}

export class KeyRespone {
    random_2: string
    time_2: number

    constructor() {
        this.random_2 = crypto.randomBytes(8).toString('hex').slice(0, 16);
        this.time_2 = Number(process.hrtime.bigint() % BigInt(2 ** 40));
    }
}

export class EncodedBody {
    enc?: string
}

class HMAC {
    static create(key: string | BinaryLike, message: crypto.BinaryLike): Buffer {
        return crypto.createHmac('sha256', key)
            .update(message)
            .digest();
    }
}

export class KeySet {
    signKey: Buffer
    cryptoKey: Buffer
    seed: Buffer

    constructor(key: string, base: string) {
        this.signKey = this.buildKey(key, base + '0');
        this.cryptoKey = this.buildKey(key, base + '1');
        this.seed = this.buildKey(key, base + '2').slice(0, 16);
    }

    private buildKey(key: string, message: string): Buffer {
        const buff1 = Buffer.from(message);
        const buff2 = Buffer.concat([HMAC.create(key, message), buff1]);
        return HMAC.create(key, buff2);
    }
}

export class KeyExchange {

    encryptSet: KeySet
    decryptSet: KeySet


    decrypter: crypto.Decipheriv
    encrypter: crypto.Cipheriv

    constructor(lanIPKey: string, request: KeyRequest, response: KeyRespone) {
        const encryptBase = request.random_1 + response.random_2 + request.time_1 + response.time_2;
        this.encryptSet = new KeySet(lanIPKey, encryptBase);

        const decryptBase = response.random_2 + request.random_1 + response.time_2 + request.time_1
        this.decryptSet = new KeySet(lanIPKey, decryptBase);

        this.encrypter = crypto.createCipheriv('aes-256-cbc', this.encryptSet.cryptoKey, this.encryptSet.seed)
            .setAutoPadding(false);

        this.decrypter = crypto.createDecipheriv('aes-256-cbc', this.decryptSet.cryptoKey, this.decryptSet.seed)
            .setAutoPadding(false);
    }

    verify(signature: string, message: string): boolean {
        const hmac = HMAC.create(this.decryptSet.signKey, message).toString('base64');
        return signature == hmac;
    }

    encrypt(message: object): object {
        const json = JSON.stringify(message);
        const data = this.encrypter.update(this.zeroPad(json, 16));
        return {
            "enc": data.toString('base64'),
            "sign": HMAC.create(this.encryptSet.signKey, json).toString('base64')
        };
    }

    decrypt<T>(message: string): T | undefined {
        try {
            const body = JSON.parse(message) as EncodedBody;
            if (!body.enc) { return; }

            const decrypted = this.decrypter.update(body.enc, 'base64')
                .toString('utf8')
                .replace(/^\0+/, '')
                .replace(/\0+$/, '');
            return JSON.parse(decrypted) as T;
        } catch {
            return undefined;
        }
    }

    zeroPad(message: string, bufferSize: number): Buffer {
        let padLength = message.length;
        if (message.length % bufferSize > 0) {
            padLength += bufferSize - message.length % bufferSize;
        }
        return Buffer.from(message.padEnd(padLength, '\0'));
    }
}