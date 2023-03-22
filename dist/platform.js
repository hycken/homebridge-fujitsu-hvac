import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { FujitsuHVACPlatformAccessory } from './platformAccessory.js';
import { FGLAir } from './api/fglair.js';
import { Region, User } from './api/models.js';
export class FujitsuHVACPlatform {
    log;
    config;
    api;
    Service;
    Characteristic;
    accessories = [];
    fglair;
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.log.debug('Finished initializing platform:', this.config.name);
        this.api = api;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;
        const fullConfig = config;
        const region = Region.getRegion(fullConfig.region);
        const user = new User(fullConfig.username, fullConfig.password);
        this.fglair = new FGLAir(region, user);
        this.api.on('didFinishLaunching', () => {
            this.discoverDevices();
        });
    }
    configureAccessory(accessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }
    async discoverDevices() {
        const devices = await this.fglair.getDevices();
        const addedUUIDs = [];
        for (const device of devices) {
            this.log.debug('Device Info: ' + JSON.stringify(device, undefined, 2));
            const uuid = this.api.hap.uuid.generate(device.dsn);
            await device.updateAllProperties(this.fglair);
            this.log.debug('Properties: ' + Object.keys(device.properties).join(', '));
            const device_name = device.getValue('device_name');
            addedUUIDs.push(uuid);
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
            if (existingAccessory) {
                existingAccessory.context.device = device;
                new FujitsuHVACPlatformAccessory(this, existingAccessory, this.reload);
            }
            else {
                const accessory = new this.api.platformAccessory(device_name ?? device.product_name ?? 'Fujitsu', uuid);
                accessory.context.device = device;
                new FujitsuHVACPlatformAccessory(this, accessory, this.reload);
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        }
        const removedAccessories = this.accessories.filter(accessory => !addedUUIDs.includes(accessory.UUID));
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, removedAccessories);
    }
    reload() {
        this.log.info("Lost connection to accessory. Rediscovering...");
        this.discoverDevices();
    }
}
