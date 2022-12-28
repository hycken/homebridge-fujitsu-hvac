import crypto from 'crypto';
export class Datapoint {
    seq_no = 0;
    data = { name: '', value: 0 };
}
export class Command {
    cmds;
    constructor(key) {
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
    key_exchange;
}
export class PropertyUpdate {
    properties;
    constructor(key, value) {
        this.properties = [{
                property: {
                    base_type: 'integer',
                    name: key,
                    value: value,
                    id: crypto.randomUUID().slice(0, 8)
                }
            }];
    }
}
export class KeyRequest {
    ver = '';
    random_1 = '';
    time_1 = 0;
    proto = 0;
    key_id = 0;
}
export class KeyRespone {
    random_2;
    time_2;
    constructor() {
        this.random_2 = crypto.randomBytes(8).toString('hex').slice(0, 16);
        this.time_2 = Number(process.hrtime.bigint() % BigInt(2 ** 40));
    }
}
export class EncodedBody {
    enc;
}
class HMAC {
    static create(key, message) {
        return crypto.createHmac('sha256', key)
            .update(message)
            .digest();
    }
}
export class KeySet {
    signKey;
    cryptoKey;
    seed;
    constructor(key, base) {
        this.signKey = this.buildKey(key, base + '0');
        this.cryptoKey = this.buildKey(key, base + '1');
        this.seed = this.buildKey(key, base + '2').slice(0, 16);
    }
    buildKey(key, message) {
        const buff1 = Buffer.from(message, 'utf-8');
        const buff2 = Buffer.concat([HMAC.create(key, message), buff1]);
        return HMAC.create(key, buff2);
    }
}
export class KeyExchange {
    encryptSet;
    decryptSet;
    decrypter;
    encrypter;
    constructor(lanIPKey, request, response) {
        const encryptBase = request.random_1 + response.random_2 + request.time_1 + response.time_2;
        this.encryptSet = new KeySet(lanIPKey, encryptBase);
        const decryptBase = response.random_2 + request.random_1 + response.time_2 + request.time_1;
        this.decryptSet = new KeySet(lanIPKey, decryptBase);
        this.encrypter = crypto.createCipheriv('aes-256-cbc', this.encryptSet.cryptoKey, this.encryptSet.seed)
            .setAutoPadding(false);
        this.decrypter = crypto.createDecipheriv('aes-256-cbc', this.decryptSet.cryptoKey, this.decryptSet.seed)
            .setAutoPadding(false);
    }
    verify(signature, message) {
        const hmac = HMAC.create(this.decryptSet.signKey, message).toString('base64');
        return signature == hmac;
    }
    encrypt(message) {
        const json = JSON.stringify(message);
        const data = this.encrypter.update(this.zeroPad(json, 16));
        return {
            "enc": data.toString('base64'),
            "sign": HMAC.create(this.encryptSet.signKey, json).toString('base64')
        };
    }
    decrypt(message) {
        const body = JSON.parse(message);
        if (!body.enc) {
            return;
        }
        const decrypted = this.decrypter.update(body.enc, 'base64')
            .toString('utf8')
            .replace(/^\0+/, '')
            .replace(/\0+$/, '');
        return JSON.parse(decrypted);
    }
    zeroPad(message, bufferSize) {
        var padLength = message.length;
        if (message.length % bufferSize > 0) {
            padLength += bufferSize - message.length % bufferSize;
        }
        return Buffer.from(message.padEnd(padLength, '\0'));
    }
}
