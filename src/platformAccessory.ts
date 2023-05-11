import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { networkInterfaces } from 'os'

import { FujitsuHVACPlatform, FujitsuHVACPlatformConfig } from './platform.js';
import { Device, PropertyKey, Capabilities, OpStatus } from './api/models.js';
import { LocalServer } from './api/localServer.js';

class CurrentState {
    currentTemperature = 20;
    targetTemperature = 20;
    targetHeatingState = 0;
    targetRotation = 0;
    fanSpeedAuto = 1;
    targetFanState = 0;
    filterState = 0;
    filterLife = 100;
    swinging = false;
    economyMode = false;
    opStatus: OpStatus = new OpStatus(0);
}

enum FujitsuOperationMode {
    off = 0,
    auto = 2,
    cool = 3,
    dry = 4,
    fanOnly = 5,
    heat = 6
}

enum FujitsuSpeed {
    quiet = 0,
    low = 1,
    medium = 2,
    high = 3,
    auto = 4
}

export class FujitsuHVACPlatformAccessory {
    private service?: Service;
    private fanService?: Service;
    private filterService?: Service;

    private localServer?: LocalServer;

    private device: Device;
    private currentStates = new CurrentState();
    private capabilities: Capabilities;
    private config: FujitsuHVACPlatformConfig;
    private hasCurrentTemperature: boolean;

    constructor(
        private readonly platform: FujitsuHVACPlatform,
        private readonly accessory: PlatformAccessory
    ) {
        this.config = this.platform.config as FujitsuHVACPlatformConfig
        this.device = accessory.context.device as Device;
        this.hasCurrentTemperature = !(this.device.oem_model || '').startsWith('AP-WB');
        const capabilityValue = this.device.getValue<number>(PropertyKey.DeviceCapabilities);
        this.capabilities = new Capabilities(capabilityValue || 0);
        this.loadState();

        this.platform.log.debug('Device Capabilities: ' + JSON.stringify(this.capabilities, null, 2));
        const device_name: string | undefined = this.device.getValue('device_name') ?? this.device.product_name;

        this.accessory.getService(this.platform.Service.AccessoryInformation)
            ?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Fujitsu')
            .setCharacteristic(this.platform.Characteristic.Model, this.device.model ?? 'Default-Model')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.dsn ?? 'Default-Serial')
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.device.sw_version ?? '-');

        // Thermostat service
        this.service = this.accessory.getService(this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat);
        this.service.setCharacteristic(this.platform.Characteristic.Name, device_name);

        this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
            .onGet(async () => this.currentStates.currentTemperature);
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onGet(async () => false)
            .onSet(async () => undefined);

        this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
            .setProps({ minStep: 0.5 })
            .onGet(async () => this.currentStates.targetTemperature)
            .onSet(this.setTargetTemperature.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
            .onGet(this.getCurrentState.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
            .onGet(async () => this.currentStates.targetHeatingState)
            .onSet(this.setTargetHeatingCoolingState.bind(this));


        // Fan
        this.fanService = this.accessory.getService(this.platform.Service.Fanv2) ||
            this.accessory.addService(this.platform.Service.Fanv2, device_name + ' Fan');

        this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
            .setProps({ minStep: 33.333 })
            .onGet(async () => this.currentStates.targetRotation)
            .onSet(this.setRotationSpeed.bind(this));

        this.fanService.getCharacteristic(this.platform.Characteristic.CurrentFanState)
            .onGet(async () => this.platform.Characteristic.CurrentFanState.BLOWING_AIR);

        this.fanService.getCharacteristic(this.platform.Characteristic.TargetFanState)
            .onGet(async () => this.currentStates.targetFanState)
            .onSet(this.setTargetFanState.bind(this));

        this.filterService = this.accessory.getService(this.platform.Service.FilterMaintenance) ||
            this.accessory.addService(this.platform.Service.FilterMaintenance, device_name + ' Filter');

        this.filterService.getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
            .onGet(async () => this.currentStates.filterState);

        this.filterService.getCharacteristic(this.platform.Characteristic.FilterLifeLevel)
            .onGet(async () => this.currentStates.filterLife);
        this.filterService.getCharacteristic(this.platform.Characteristic.ResetFilterIndication)
            .onSet(() => { return; });

        this.service.addLinkedService(this.filterService);

        this.addOptionalCharacteristics();
        this.startLocalServer();
    }

    addOptionalCharacteristics() {

        if (this.capabilities.swing.horizontal || this.capabilities.swing.vertical) {
            this.fanService?.getCharacteristic(this.platform.Characteristic.SwingMode)
                .onGet(() => this.currentStates.swinging)
                .onSet(this.setSwingMode.bind(this));
        } else if (this.fanService?.testCharacteristic(this.platform.Characteristic.SwingMode)) {
            const c = this.fanService.getCharacteristic(this.platform.Characteristic.SwingMode)
                .removeAllListeners();
            this.fanService.removeCharacteristic(c);
        }

        let economyMode = this.accessory.getService('Economy Mode')
        if (this.capabilities.economyMode && this.config.economyModeSwitch) {
            economyMode = economyMode || this.accessory.addService(this.platform.Service.Switch, 'Economy Mode', 'economy_mode');
            economyMode.setCharacteristic(this.platform.Characteristic.Name, 'Economy Mode');

            economyMode.getCharacteristic(this.platform.Characteristic.On)
                .onGet(() => this.currentStates.economyMode)
                .onSet((value: CharacteristicValue) => this.currentStates.economyMode = value as boolean);
            this.service?.addLinkedService(economyMode);
        } else if (economyMode) {
            this.service?.removeLinkedService(economyMode);
            this.accessory.removeService(economyMode);
        }


        let powerfulMode = this.accessory.getService('Powerful Mode')
        if (this.capabilities.powerfulMode && this.config.powerfulModeSwitch) {
            powerfulMode = powerfulMode || this.accessory.addService(this.platform.Service.Switch, 'Powerful Mode', 'powerful_mode');
            powerfulMode.setCharacteristic(this.platform.Characteristic.Name, 'Powerful Mode');

            powerfulMode.getCharacteristic(this.platform.Characteristic.On)
                .onGet(() => this.currentStates.economyMode)
                .onSet((value: CharacteristicValue) => this.currentStates.economyMode = value as boolean);
            this.service?.addLinkedService(powerfulMode);
        } else if (powerfulMode) {
            this.service?.removeLinkedService(powerfulMode);
            this.accessory.removeService(powerfulMode);
        }

        let energySavingFan = this.accessory.getService('Energy Saving Fan')
        if (this.capabilities.energySavingFan && this.config.energySavingFanSwitch) {
            energySavingFan = energySavingFan || this.accessory.addService(this.platform.Service.Switch, 'Energy Saving Fan', 'energy_saving_fan');
            energySavingFan.setCharacteristic(this.platform.Characteristic.Name, 'Energy Saving Fan');
            energySavingFan.getCharacteristic(this.platform.Characteristic.On)
                .onGet(() => this.currentStates.economyMode)
                .onSet((value: CharacteristicValue) => this.currentStates.economyMode = value as boolean);
            this.service?.addLinkedService(energySavingFan);
        } else if (energySavingFan) {
            this.service?.removeLinkedService(energySavingFan);
            this.accessory.removeService(energySavingFan);
        }
    }

    async startLocalServer() {
        try {
            if (this.localServer) {
                // Update from server in case device has new IP.
                this.platform.fglair.reset();

                await this.device.updateDevice(this.platform.fglair);
            }

            const localIP = this.config.localIP || this.getIP(this.device.lan_ip || '');
            if (!localIP) { throw 'Could not find homebridge IP address.'; }
            const defaultKey = this.hasCurrentTemperature ? PropertyKey.DisplayTemperature : PropertyKey.AdjustTemperature;


            this.localServer = new LocalServer(localIP,
                this.platform.log,
                defaultKey,
                this.updateHandler.bind(this),
                this.errorHandler.bind(this)
            );

            const lanIP = await this.platform.fglair.getLanIP(this.device);
            const address = await this.localServer.start(this.device.lan_ip ?? '', lanIP);
            this.platform.log.debug(`Started server on ${address}. Device IP is: ${this.device.lan_ip}`);
        } catch (error) {
            if (!(error instanceof Error)) { return; }
            this.errorHandler(error);
        }
    }

    loadState() {
        for (const property of Object.values(this.device.properties)) {
            if (property.value == null || (typeof property.value === 'number' && isNaN(property.value))) { continue; }
            this.updateHandler(property.name as PropertyKey, property.value);
        }
    }

    toHomeKitMode(fujitsuValue: number): number {
        const modes = this.platform.Characteristic.TargetHeatingCoolingState;
        switch (fujitsuValue) {
            case FujitsuOperationMode.dry:
            case FujitsuOperationMode.fanOnly:
            case FujitsuOperationMode.off: return modes.OFF;
            case FujitsuOperationMode.auto: return modes.AUTO;
            case FujitsuOperationMode.cool: return modes.COOL;
            case FujitsuOperationMode.heat: return modes.HEAT;
            default: return modes.OFF;
        }
    }

    toFujitsuMode(homekitValue: number): number {
        const modes = this.platform.Characteristic.TargetHeatingCoolingState;
        switch (homekitValue) {
            case modes.COOL: return FujitsuOperationMode.cool;
            case modes.HEAT: return FujitsuOperationMode.heat;
            case modes.AUTO: return FujitsuOperationMode.auto;
            case modes.OFF:
                switch (this.config.offMode) {
                    case 'fan': return FujitsuOperationMode.fanOnly;
                    case 'dry': return FujitsuOperationMode.dry;
                    case 'off':
                    default:
                        return FujitsuOperationMode.off;

                }
            default: return FujitsuOperationMode.off;
        }
    }

    toHomekitSpeed(fujitsuValue: number): number {
        if (fujitsuValue == 4) { return 0 }
        return Math.round((fujitsuValue) * 3333) / 100;
    }

    async getCurrentState(): Promise<number> {
        const targetModes = this.platform.Characteristic.TargetHeatingCoolingState;
        const currentModes = this.platform.Characteristic.CurrentHeatingCoolingState;

        const targetMode = this.currentStates.targetHeatingState;

        if (targetMode === targetModes.OFF) { return currentModes.OFF; }

        // Not much we can do if we can't compare current and target temps.
        if (!this.hasCurrentTemperature) {
            switch (this.currentStates.targetHeatingState) {
                case targetModes.COOL: return currentModes.COOL;
                case targetModes.HEAT: return currentModes.HEAT;
                default: return currentModes.OFF;
            }
        }

        const temperature = this.hasCurrentTemperature ? this.currentStates.currentTemperature : this.currentStates.targetTemperature;
        const diff = this.currentStates.targetTemperature - temperature;

        const canHeat = targetMode === targetModes.HEAT || targetMode === targetModes.AUTO;
        const canCool = targetMode === targetModes.COOL || targetMode === targetModes.AUTO;

        if (diff > 0.5 && canHeat) {
            return currentModes.HEAT;
        } else if (diff < -0.5 && canCool) {
            return currentModes.COOL;
        } else {
            return currentModes.OFF;
        }
    }

    async updateHCState() {
        const currentState = await this.getCurrentState();
        this.service?.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, currentState);
    }

    async setTargetTemperature(value: CharacteristicValue) {
        this.currentStates.targetTemperature = value as number;
        this.localServer?.update(PropertyKey.AdjustTemperature, this.currentStates.targetTemperature * 10);
        if (this.hasCurrentTemperature) { return this.updateHCState(); }
        this.currentStates.currentTemperature = value as number;
        this.service?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.currentStates.targetTemperature);
    }

    async setTargetHeatingCoolingState(value: CharacteristicValue) {
        this.currentStates.targetHeatingState = value as number;
        const fujitsuValue = this.toFujitsuMode(value as number);
        this.localServer?.update(PropertyKey.OperationMode, fujitsuValue);
    }

    async setRotationSpeed(value: CharacteristicValue) {
        this.currentStates.targetRotation = value as number;
        const speed: number = Math.round((value as number) / 33.33);
        if (this.currentStates.fanSpeedAuto) { return; }
        this.localServer?.update(PropertyKey.FanSpeed, speed);
    }

    async setTargetFanState(value: CharacteristicValue) {
        this.currentStates.targetFanState = value as number;
        const fan_speed = Math.round(this.currentStates.targetRotation / 33.33);
        this.localServer?.update(PropertyKey.FanSpeed, value ? 4 : fan_speed);
    }

    async setSwingMode(value: CharacteristicValue) {
        this.currentStates.swinging = value == this.platform.Characteristic.SwingMode.SWING_ENABLED;

        if (this.capabilities.swing.horizontal) {
            this.localServer?.update(PropertyKey.HorizontalSwing, value as number);
        } else if (this.capabilities.swing.vertical) {
            this.localServer?.update(PropertyKey.VerticalSwing, value as number);
        }
    }

    errorHandler(error: Error) {
        this.platform.log.debug(error.message);
        this.localServer?.stop();
        this.startLocalServer();
    }

    async updateHandler(key: PropertyKey, value: number | string | boolean) {
        if (typeof value !== 'number') { return; }
        let fanAuto: boolean;
        const fanStates = this.platform.Characteristic.TargetFanState
        const state = this.currentStates;
        switch (key) {
            case PropertyKey.DisplayTemperature:
                state.currentTemperature = (value - 5000) / 100;
                this.service?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, state.currentTemperature);
                return await this.updateHCState();
            case PropertyKey.AdjustTemperature:
                state.targetTemperature = value / 10;
                this.service?.updateCharacteristic(this.platform.Characteristic.TargetTemperature, state.targetTemperature);
                if (this.hasCurrentTemperature) { return await this.updateHCState(); }
                // The device doesn't support current temperature but it's not possible to hide it in homekit.
                state.currentTemperature = state.targetTemperature;
                this.service?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, state.targetTemperature);
                return await this.updateHCState();
            case PropertyKey.FanSpeed:
                fanAuto = value === FujitsuSpeed.auto;
                this.currentStates.fanSpeedAuto = fanAuto ? fanStates.AUTO : fanStates.MANUAL;
                if (!fanAuto) {
                    this.currentStates.targetRotation = this.toHomekitSpeed(value);
                }
                this.fanService?.updateCharacteristic(this.platform.Characteristic.TargetFanState, this.currentStates.fanSpeedAuto);
                this.fanService?.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.currentStates.targetRotation);
                break;
            case PropertyKey.OperationMode:
                state.targetHeatingState = this.toHomeKitMode(value);
                this.service?.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, state.targetHeatingState);
                break;
            case PropertyKey.HorizontalSwing:
                if (!this.capabilities.swing.horizontal) { break; }
                this.currentStates.swinging = value == 1;
                this.service?.updateCharacteristic(this.platform.Characteristic.SwingMode, value);
                break;
            case PropertyKey.VerticalSwing:
                if (!this.capabilities.swing.vertical) { break; }
                this.currentStates.swinging = value == 1;
                this.service?.updateCharacteristic(this.platform.Characteristic.SwingMode, value);
                break;
            case PropertyKey.OpStatus:
                this.currentStates.opStatus = new OpStatus(value);
                this.platform.log.debug('Op Status: ' + value);
                this.platform.log.debug(JSON.stringify(this.currentStates.opStatus, undefined, 2))
                break;
        }
    }

    getIP(deviceIP: string): string | undefined {
        const interfaces = networkInterfaces()
        const allLocal: string[] = Object.values(interfaces).flatMap(net => {
            const results: string[] = [];
            for (const info of (net ?? [])) {
                if (info.family !== 'IPv4' || info.internal) { continue; }
                results.push(info.address);
            }
            return results;
        });
        const subnet = deviceIP.replace(/^((?:\d+\.){3})(\d+)/, '$1');
        allLocal.sort((a, b) => {
            if (a.startsWith(subnet)) { return -1; }
            if (b.startsWith(subnet)) { return 1; }
            return 0;
        });
        return allLocal[0];
    }
}