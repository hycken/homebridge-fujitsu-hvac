import { FGLAir } from "./fglair";

export class Capabilities {
    modes: {
        cool: boolean
        dry: boolean
        fan: boolean
        heat: boolean
        auto: boolean
    }
    fanSpeed: {
        auto: boolean
        high: boolean
        medium: boolean
        low: boolean
        quiet: boolean
    }
    swing: {
        vertical: boolean
        horizontal: boolean
    }
    economyMode: boolean
    minimumHeat: boolean
    energySavingFan: boolean
    powerfulMode: boolean
    outdoorLowNoise: boolean
    coilDry: boolean

    constructor(capabilities: number) {
        this.modes = {
            cool: 0 != (1 << 0 & capabilities),
            dry: 0 != (1 << 1 & capabilities),
            fan: 0 != (1 << 2 & capabilities),
            heat: 0 != (1 << 3 & capabilities),
            auto: 0 != (1 << 4 & capabilities)
        };
        this.fanSpeed = {
            auto: 0 != (1 << 5 & capabilities),
            high: 0 != (1 << 6 & capabilities),
            medium: 0 != (1 << 7 & capabilities),
            low: 0 != (1 << 8 & capabilities),
            quiet: 0 != (1 << 9 & capabilities),
        };
        this.swing = {
            vertical: 0 != (1 << 10 & capabilities),
            horizontal: 0 != (1 << 11 & capabilities)
        };
        this.economyMode = 0 != (1 << 12 & capabilities);
        this.minimumHeat = 0 != (1 << 13 & capabilities);
        this.energySavingFan = 0 != (1 << 14 & capabilities);
        this.powerfulMode = 0 != (1 << 16 & capabilities);
        this.outdoorLowNoise = 0 != (1 << 17 & capabilities);
        this.coilDry = 0 != (1 << 18 & capabilities);
    }
}

export class OpStatus {
    allOperation: number
    timerOperation: number
    settingTemperatureOperation: number
    operationMode: number
    operationStartStop: number
    operationStart: number
    filterSignReset: number
    operation: number
    settingTemperature: number
    currentOperationMode: {
        auto: number
        cool: number
        dry: number
        heat: number
        fan: number
    }
    level1AirConditioningOperation: number
    level1OperationStartStop: number
    level2AirConditioningOperation: number
    level2_timer_operation: number
    level2LocalSettingOperation: number
    defrostOrOilRecoveryOrDifferentMode: number
    maintenance: number
    defrost: number
    differentMode: number
    pilRecovery: number
    pumpDown: number
    checkOperation: number

    constructor(opStatus: number) {
        this.allOperation = 1 << 0 & opStatus;
        this.timerOperation = 1 << 1 & opStatus;
        this.settingTemperatureOperation = 1 << 2 & opStatus;
        this.operationMode = 1 << 3 & opStatus;
        this.operationStartStop = 1 << 4 & opStatus;
        this.operationStart = 1 << 5 & opStatus;
        this.filterSignReset = 1 << 6 & opStatus;
        this.operation = 1 << 7 & opStatus;
        this.settingTemperature = 1 << 8 & opStatus;
        this.currentOperationMode = {
            auto: 1 << 9 & opStatus,
            cool: 1 << 10 & opStatus,
            dry: 1 << 11 & opStatus,
            heat: 1 << 12 & opStatus,
            fan: 1 << 13 & opStatus
        }
        this.level1AirConditioningOperation = 1 << 14 & opStatus;
        this.level1OperationStartStop = 1 << 15 & opStatus;
        this.level2AirConditioningOperation = 1 << 16 & opStatus;
        this.level2_timer_operation = 1 << 17 & opStatus;
        this.level2LocalSettingOperation = 1 << 18 & opStatus;
        this.defrostOrOilRecoveryOrDifferentMode = 1 << 21 & opStatus;
        this.maintenance = 1 << 22 & opStatus;
        this.defrost = 1 << 24 & opStatus;
        this.differentMode = 1 << 25 & opStatus;
        this.pilRecovery = 1 << 28 & opStatus;
        this.pumpDown = 1 << 29 & opStatus;
        this.checkOperation = 1 << 30 & opStatus;
    }
}

enum Regions {
    Europe = "eu",
    China = "cn",
    USA = "us",
    Other = "other"
}

export enum PropertyKey {
    AdjustTemperature = 'adjust_temperature',
    DisplayTemperature = 'display_temperature',
    FanSpeed = 'fan_speed',
    OperationMode = 'operation_mode',
    HorizontalSwing = 'af_horizontal_swing',
    VerticalSwing = 'af_vertical_swing',
    OpStatus = 'op_status',
    DeviceCapabilities = 'device_capabilities'
}

export class Region {
    appID: string
    appSecret: string

    authHostname: string
    hostname: string


    constructor(appID: string, secret: string, auth: string, hostname: string) {
        this.appID = appID;
        this.appSecret = secret;
        this.authHostname = auth;
        this.hostname = hostname;
    }

    static getRegion(name: string | undefined): Region {
        switch (name) {
            case Regions.Europe:
                return new Region("FGLair-eu-id",
                    "FGLair-eu-gpFbVBRoiJ8E3QWJ-QRULLL3j3U",
                    "user-field-eu.aylanetworks.com",
                    "ads-field-eu.aylanetworks.com");
            case Regions.China:
                return new Region("FGLairField-cn-id",
                    "FGLairField-cn-zezg7Y60YpAvy3HPwxvWLnd4Oh4",
                    "user-field.ayla.com.cn",
                    "ads-field.ayla.com.cn");
            default:
                return new Region("CJIOSP-id",
                    "CJIOSP-Vb8MQL_lFiYQ7DKjN0eCFXznKZE",
                    "user-field.aylanetworks.com",
                    "ads-field.aylanetworks.com");
        }
    }
}

export class DeviceResponse {
    device: Device | undefined
}

export class Device {
    dsn: string = ''
    product_name: string = 'Product name'
    model: string | undefined
    oem_model: string | undefined
    sw_version: string | undefined
    template_id: number | undefined
    mac: string | undefined
    hwsig: string | undefined
    lan_ip: string | undefined
    connected_at: string | undefined
    key: number | undefined
    lan_enabled: boolean | undefined
    has_properties: boolean | undefined
    product_class: string | undefined
    connection_status: string | undefined
    lat: string | undefined
    lng: string | undefined
    locality: string | undefined
    properties: { [name: string]: Property } = {}

    async updateAllProperties(api: FGLAir) {
        this.properties = await api.getProperties(this);
    }

    async setProperty(api: FGLAir, propertyKey: PropertyKey, value: string | number | boolean) {
        const property = this.properties[propertyKey];
        if (!property) { return; }
        property.value = value;
        api.setProperty(property, value);
    }

    getValue<T extends string | number | boolean>(name: string): T | undefined {
        const property = this.properties[name];
        if (!property) { return; }
        return property.value as T;
    }
}

export class PropertyResponse {
    property: Property | undefined
}

export class Property {
    type: string = ''
    name: string = ''
    base_type: string = ''
    read_only: boolean = false
    direction: string | undefined
    scope: string | undefined
    data_updated_at: string | undefined
    key: number = -1
    device_key: number = -1
    product_name: string = ''
    track_only_changes: boolean = false
    display_name: string = ''
    host_sw_version: boolean = false
    time_series: boolean = false
    derived: boolean = false
    app_type: string | undefined
    recipe: string | undefined
    value: any
    generated_from: string = ''
    generated_at: string | null = null
    denied_roles: string[] | null = null
    ack_enabled: boolean = false
    retention_days: number = 0
}

export interface Token {
    access_token: string
    refresh_token: string
    expires_in: number
    role: string
    role_tags: string[]
    date?: Date
}


export class User {
    username: string
    password: string

    constructor(username: string, password: string) {
        this.username = username;
        this.password = password;
    }
}

export class LanIPResponse {
    lanip?: LanIP
}

export class LanIP {
    lanip_key_id: number = 0
    lanip_key: string = ''
    keep_alive: number = 0
    auto_sync: number = 0
    status: string = ''
}
