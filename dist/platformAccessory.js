import { networkInterfaces } from 'os';
import { PropertyKey, Capabilities } from './api/models.js';
import { LocalServer } from './api/localServer.js';
class CurrentState {
    currentTemperature = 20;
    targetTemperature = 20;
    targetHeatingState = 0;
    targetRotation = 0;
    fanSpeedAuto = 0;
    targetFanState = 0;
    filterState = 1;
    filterLife = 1;
    swinging = false;
    economyMode = false;
    opStatus = 0;
}
var FujitsuOperationMode;
(function (FujitsuOperationMode) {
    FujitsuOperationMode[FujitsuOperationMode["off"] = 0] = "off";
    FujitsuOperationMode[FujitsuOperationMode["auto"] = 2] = "auto";
    FujitsuOperationMode[FujitsuOperationMode["cool"] = 3] = "cool";
    FujitsuOperationMode[FujitsuOperationMode["dry"] = 4] = "dry";
    FujitsuOperationMode[FujitsuOperationMode["fanOnly"] = 5] = "fanOnly";
    FujitsuOperationMode[FujitsuOperationMode["heat"] = 6] = "heat";
})(FujitsuOperationMode || (FujitsuOperationMode = {}));
var FujitsuSpeed;
(function (FujitsuSpeed) {
    FujitsuSpeed[FujitsuSpeed["quiet"] = 0] = "quiet";
    FujitsuSpeed[FujitsuSpeed["low"] = 1] = "low";
    FujitsuSpeed[FujitsuSpeed["medium"] = 2] = "medium";
    FujitsuSpeed[FujitsuSpeed["high"] = 3] = "high";
    FujitsuSpeed[FujitsuSpeed["auto"] = 4] = "auto";
})(FujitsuSpeed || (FujitsuSpeed = {}));
export class FujitsuHVACPlatformAccessory {
    platform;
    accessory;
    service;
    fanService;
    filterService;
    localServer;
    device;
    currentStates = new CurrentState();
    capabilities;
    config;
    hasCurrentTemperature;
    constructor(platform, accessory) {
        this.platform = platform;
        this.accessory = accessory;
        this.config = this.platform.config;
        this.device = accessory.context.device;
        this.hasCurrentTemperature = !(this.device.oem_model || '').startsWith('AP-WB');
        const capabilityValue = this.device.getValue(PropertyKey.DeviceCapabilities);
        this.capabilities = new Capabilities(capabilityValue || 0);
        this.platform.log.debug('Device Capabilities: ' + JSON.stringify(this.capabilities, null, 2));
        const localIP = this.config.localIP || this.getIP();
        if (!localIP) {
            throw 'Could not find homebridge IP address.';
        }
        const defaultKey = this.hasCurrentTemperature ? PropertyKey.DisplayTemperature : PropertyKey.AdjustTemperature;
        this.localServer = new LocalServer(localIP, this.platform.log, defaultKey, this.updateHandler.bind(this));
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            ?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Fujitsu')
            .setCharacteristic(this.platform.Characteristic.Model, this.device.model ?? 'Default-Model')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.dsn ?? 'Default-Serial')
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.device.sw_version ?? '-');
        this.service = this.accessory.getService(this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat);
        const device_name = this.device.getValue('device_name') ?? this.device.product_name;
        this.service.setCharacteristic(this.platform.Characteristic.Name, device_name);
        this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
            .onGet(async () => this.currentStates.currentTemperature);
        this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
            .setProps({ minStep: 0.5 })
            .onGet(async () => this.currentStates.targetTemperature)
            .onSet(this.setTargetTemperature.bind(this));
        this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
            .onGet(async () => this.currentStates.targetHeatingState);
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
            .onGet(async () => 2);
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
        this.loadState();
        this.startLocalServer();
    }
    addOptionalCharacteristics() {
        if (this.capabilities.swing.horizontal || this.capabilities.swing.vertical) {
            this.fanService.getCharacteristic(this.platform.Characteristic.SwingMode)
                .onGet(() => this.currentStates.swinging)
                .onSet(this.setSwingMode.bind(this));
        }
        else if (this.fanService.testCharacteristic(this.platform.Characteristic.SwingMode)) {
            const c = this.fanService.getCharacteristic(this.platform.Characteristic.SwingMode)
                .removeAllListeners();
            this.fanService.removeCharacteristic(c);
        }
        let economyMode = this.accessory.getService('Economy Mode');
        if (this.capabilities.economyMode && this.config.economyModeSwitch) {
            economyMode = economyMode || this.accessory.addService(this.platform.Service.Switch, 'Economy Mode', 'economy_mode');
            economyMode.setCharacteristic(this.platform.Characteristic.Name, 'Economy Mode');
            economyMode.getCharacteristic(this.platform.Characteristic.On)
                .onGet(() => this.currentStates.economyMode)
                .onSet((value) => this.currentStates.economyMode = value);
            this.service.addLinkedService(economyMode);
        }
        else if (economyMode) {
            this.service.removeLinkedService(economyMode);
            this.accessory.removeService(economyMode);
        }
        let powerfulMode = this.accessory.getService('Powerful Mode');
        if (this.capabilities.powerfulMode && this.config.powerfulModeSwitch) {
            powerfulMode = powerfulMode || this.accessory.addService(this.platform.Service.Switch, 'Powerful Mode', 'powerful_mode');
            powerfulMode.setCharacteristic(this.platform.Characteristic.Name, 'Powerful Mode');
            powerfulMode.getCharacteristic(this.platform.Characteristic.On)
                .onGet(() => this.currentStates.economyMode)
                .onSet((value) => this.currentStates.economyMode = value);
            this.service.addLinkedService(powerfulMode);
        }
        else if (powerfulMode) {
            this.service.removeLinkedService(powerfulMode);
            this.accessory.removeService(powerfulMode);
        }
        let energySavingFan = this.accessory.getService('Energy Saving Fan');
        if (this.capabilities.energySavingFan && this.config.energySavingFanSwitch) {
            energySavingFan = energySavingFan || this.accessory.addService(this.platform.Service.Switch, 'Energy Saving Fan', 'energy_saving_fan');
            energySavingFan.setCharacteristic(this.platform.Characteristic.Name, 'Energy Saving Fan');
            energySavingFan.getCharacteristic(this.platform.Characteristic.On)
                .onGet(() => this.currentStates.economyMode)
                .onSet((value) => this.currentStates.economyMode = value);
            this.service.addLinkedService(energySavingFan);
        }
        else if (energySavingFan) {
            this.service.removeLinkedService(energySavingFan);
            this.accessory.removeService(energySavingFan);
        }
    }
    async startLocalServer() {
        const lanIP = await this.platform.fglair.getLanIP(this.device);
        const address = await this.localServer.start(this.device.lan_ip ?? '', lanIP);
        this.platform.log.debug(`Started server on ${address}`);
        try {
            await this.localServer.push();
        }
        catch (e) {
            if (e instanceof Error) {
                this.platform.log.error(e.message);
            }
        }
    }
    loadState() {
        for (const property of Object.values(this.device.properties)) {
            if (isNaN(property.value)) {
                continue;
            }
            this.updateHandler(property.name, property.value);
        }
    }
    toHomeKitMode(fujitsuValue) {
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
    toFujitsuMode(homekitValue) {
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
    toHomekitSpeed(fujitsuValue) {
        if (fujitsuValue == 4) {
            return 0;
        }
        return Math.round((fujitsuValue) * 3333) / 100;
    }
    async setTargetTemperature(value) {
        this.currentStates.targetTemperature = value;
        this.localServer.update(PropertyKey.AdjustTemperature, this.currentStates.targetTemperature * 10);
        if (this.hasCurrentTemperature) {
            return;
        }
        this.currentStates.currentTemperature = value;
        this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.currentStates.targetTemperature);
    }
    async setTargetHeatingCoolingState(value) {
        this.currentStates.targetHeatingState = value;
        const fujitsuValue = this.toFujitsuMode(value);
        this.localServer.update(PropertyKey.OperationMode, fujitsuValue);
    }
    async setRotationSpeed(value) {
        this.currentStates.targetRotation = value;
        const speed = Math.round(value / 33.33);
        if (this.currentStates.fanSpeedAuto) {
            return;
        }
        this.localServer.update(PropertyKey.FanSpeed, speed);
    }
    async setTargetFanState(value) {
        this.currentStates.targetFanState = value;
        const fan_speed = Math.round(this.currentStates.targetRotation / 33.33);
        this.localServer.update(PropertyKey.FanSpeed, value ? 4 : fan_speed);
    }
    async setSwingMode(value) {
        this.currentStates.swinging = value == this.platform.Characteristic.SwingMode.SWING_ENABLED;
        if (this.capabilities.swing.horizontal) {
            this.localServer.update(PropertyKey.HorizontalSwing, value);
        }
        else if (this.capabilities.swing.vertical) {
            this.localServer.update(PropertyKey.VerticalSwing, value);
        }
    }
    updateHandler(key, value) {
        if (!(typeof value === 'number')) {
            return;
        }
        const fanAuto = value === FujitsuSpeed.auto;
        const fanStates = this.platform.Characteristic.TargetFanState;
        const state = this.currentStates;
        switch (key) {
            case PropertyKey.DisplayTemperature:
                state.currentTemperature = (value - 5000) / 100;
                this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, state.currentTemperature);
                break;
            case PropertyKey.AdjustTemperature:
                state.targetTemperature = value / 10;
                this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, state.targetTemperature);
                if (!this.hasCurrentTemperature) {
                    // The device doesn't support current temperature but it's not possible to hide it in homekit.
                    state.currentTemperature = state.targetTemperature;
                    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, state.targetTemperature);
                }
                break;
            case PropertyKey.FanSpeed:
                this.currentStates.fanSpeedAuto = fanAuto ? fanStates.AUTO : fanStates.MANUAL;
                if (!fanAuto) {
                    this.currentStates.targetRotation = this.toHomekitSpeed(value);
                }
                this.fanService.updateCharacteristic(this.platform.Characteristic.TargetFanState, this.currentStates.fanSpeedAuto);
                this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.currentStates.targetRotation);
                break;
            case PropertyKey.OperationMode:
                state.targetHeatingState = this.toHomeKitMode(value);
                this.service.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, state.targetHeatingState);
                break;
            case PropertyKey.HorizontalSwing:
                if (!this.capabilities.swing.horizontal) {
                    break;
                }
                this.currentStates.swinging = value == 1;
                this.service.updateCharacteristic(this.platform.Characteristic.SwingMode, value);
                break;
            case PropertyKey.VerticalSwing:
                if (!this.capabilities.swing.vertical) {
                    break;
                }
                this.currentStates.swinging = value == 1;
                this.service.updateCharacteristic(this.platform.Characteristic.SwingMode, value);
                break;
            case PropertyKey.OpStatus:
                this.currentStates.opStatus = value;
                break;
        }
    }
    getIP() {
        const interfaces = networkInterfaces();
        for (const net of Object.values(interfaces)) {
            for (const info of (net ?? [])) {
                if (info.family !== 'IPv4' || info.internal !== false) {
                    continue;
                }
                return info.address;
            }
        }
        return;
    }
}
