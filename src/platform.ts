import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { FujitsuHVACPlatformAccessory } from './platformAccessory.js';
import { FGLAir } from './api/fglair.js';
import { Region, User } from './api/models.js';

export interface FujitsuHVACPlatformConfig extends PlatformConfig {
    username: string
    password: string
    region?: string
    localIP: string
    localPort?: number
    offMode: 'fan' | 'dry' | 'off'
    powerfulModeSwitch: boolean
    economyModeSwitch: boolean
    energySavingFanSwitch: boolean
}

export class FujitsuHVACPlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service;
    public readonly Characteristic: typeof Characteristic;

    public readonly accessories: PlatformAccessory[] = [];
    public readonly fglair: FGLAir

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        this.log.debug('Finished initializing platform:', this.config.name);
        this.api = api;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;
        const fullConfig = config as FujitsuHVACPlatformConfig

        const region = Region.getRegion(fullConfig.region);
        const user = new User(fullConfig.username, fullConfig.password);

        this.fglair = new FGLAir(region, user);

        this.api.on('didFinishLaunching', () => {
            this.discoverDevices();
        });
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }

    async discoverDevices() {
        const devices = await this.fglair.getDevices();

        let addedUUIDs: string[] = [];
        for (const device of devices) {
            this.log.debug('Device Info: ' + JSON.stringify(device, undefined, 2));
            const uuid = this.api.hap.uuid.generate(device.dsn);
            await device.updateAllProperties(this.fglair);
            this.log.debug('Properties: ' + Object.keys(device.properties).join(', '));
            const device_name: string | undefined = device.getValue('device_name');
            addedUUIDs.push(uuid);

            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
            if (existingAccessory) {
                existingAccessory.context.device = device;
                new FujitsuHVACPlatformAccessory(this, existingAccessory, this.reload);
            } else {
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