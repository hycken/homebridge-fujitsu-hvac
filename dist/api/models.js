export class Capabilities {
    modes;
    fanSpeed;
    swing;
    economyMode;
    minimumHeat;
    energySavingFan;
    powerfulMode;
    outdoorLowNoise;
    coilDry;
    constructor(capabilities) {
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
    allOperation;
    timerOperation;
    settingTemperatureOperation;
    operationMode;
    operationStartStop;
    operationStart;
    filterSignReset;
    operation;
    settingTemperature;
    currentOperationMode;
    level1AirConditioningOperation;
    level1OperationStartStop;
    level2AirConditioningOperation;
    level2_timer_operation;
    level2LocalSettingOperation;
    defrostOrOilRecoveryOrDifferentMode;
    maintenance;
    defrost;
    differentMode;
    pilRecovery;
    pumpDown;
    checkOperation;
    constructor(opStatus) {
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
        };
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
var Regions;
(function (Regions) {
    Regions["Europe"] = "eu";
    Regions["China"] = "cn";
    Regions["USA"] = "us";
    Regions["Other"] = "other";
})(Regions || (Regions = {}));
// 'adjust_temperature',
// 'af_horizontal_direction',
// 'af_horizontal_num_dir',
// 'af_horizontal_swing',
// 'af_vertical_direction',
// 'af_vertical_num_dir',
// 'af_vertical_swing',
// 'auto_off_time',
// 'auto_on_off_set_time',
// 'auto_on_off_time',
// 'auto_save_set_time',
// 'auto_save_time',
// 'building_name',
// 'child_lock_mode',
// 'child_lock_pin',
// 'coil_dry_mode',
// 'comm_version',
// 'demand_control',
// 'device_capabilities',
// 'device_name',
// 'display_temperature',
// 'economy_mode',
// 'error_code',
// 'fan_speed',
// 'filter_sign_reset_display',
// 'get_prop',
// 'human_det',
// 'human_det_auto_off',
// 'human_det_auto_on_off',
// 'human_det_auto_save',
// 'indoor_fan_control',
// 'master_timer_on_off_1',
// 'master_timer_on_off_2',
// 'mcu_error',
// 'mcu_fw_version',
// 'min_heat',
// 'model_name',
// 'operation_mode',
// 'op_status',
// 'outdoor_low_noise',
// 'outdoor_temperature',
// 'powerful_mode',
// 'rc_prohibition',
// 'reboot_range',
// 'reboot_start',
// 'refresh',
// 'service_contact_email',
// 'service_contact_name',
// 'service_contact_phone',
// 'service_function_address',
// 'service_function_number',
// 'service_function_setting',
// 'service_mode',
// 'system_type',
// 'test_run',
// 'wifi_led_enable',
// 'zone_1_num_outlets',
// 'zone_2_num_outlets',
// 'zone_3_num_outlets',
// 'zone_4_num_outlets',
// 'zone_5_num_outlets',
// 'zone_6_num_outlets',
// 'zone_7_num_outlets',
// 'zone_8_num_outlets',
// 'zone_function_setting',
// 'zone_setting',
// 'zone_temp_sensor_mode',
// 'zone_temp_sensor_select',
// 'zone_use_opt_sensor_1',
// 'zone_use_opt_sensor_2'
export var PropertyKey;
(function (PropertyKey) {
    PropertyKey["AdjustTemperature"] = "adjust_temperature";
    PropertyKey["DisplayTemperature"] = "display_temperature";
    PropertyKey["FanSpeed"] = "fan_speed";
    PropertyKey["OperationMode"] = "operation_mode";
    PropertyKey["HorizontalSwing"] = "af_horizontal_swing";
    PropertyKey["VerticalSwing"] = "af_vertical_swing";
    PropertyKey["OpStatus"] = "op_status";
    PropertyKey["DeviceCapabilities"] = "device_capabilities";
})(PropertyKey || (PropertyKey = {}));
export class Region {
    appID;
    appSecret;
    authHostname;
    hostname;
    constructor(appID, secret, auth, hostname) {
        this.appID = appID;
        this.appSecret = secret;
        this.authHostname = auth;
        this.hostname = hostname;
    }
    static getRegion(name) {
        switch (name) {
            case Regions.Europe:
                return new Region("FGLair-eu-id", "FGLair-eu-gpFbVBRoiJ8E3QWJ-QRULLL3j3U", "user-field-eu.aylanetworks.com", "ads-field-eu.aylanetworks.com");
            case Regions.China:
                return new Region("FGLairField-cn-id", "FGLairField-cn-zezg7Y60YpAvy3HPwxvWLnd4Oh4", "user-field.ayla.com.cn", "ads-field.ayla.com.cn");
            default:
                return new Region("CJIOSP-id", "CJIOSP-Vb8MQL_lFiYQ7DKjN0eCFXznKZE", "user-field.aylanetworks.com", "ads-field.aylanetworks.com");
        }
    }
}
export class DeviceResponse {
    device;
}
export class Device {
    dsn = '';
    product_name = 'Product name';
    model;
    oem_model;
    sw_version;
    template_id;
    mac;
    hwsig;
    lan_ip;
    connected_at;
    key;
    lan_enabled;
    has_properties;
    product_class;
    connection_status;
    lat;
    lng;
    locality;
    properties = {};
    async updateAllProperties(api) {
        this.properties = await api.getProperties(this);
    }
    async setProperty(api, propertyKey, value) {
        const property = this.properties[propertyKey];
        if (!property) {
            return;
        }
        property.value = value;
        api.setProperty(property, value);
    }
    getValue(name) {
        const property = this.properties[name];
        if (!property) {
            return;
        }
        return property.value;
    }
}
export class PropertyResponse {
    property;
}
export class Property {
    type = '';
    name = '';
    base_type = '';
    read_only = false;
    direction;
    scope;
    data_updated_at;
    key = -1;
    device_key = -1;
    product_name = '';
    track_only_changes = false;
    display_name = '';
    host_sw_version = false;
    time_series = false;
    derived = false;
    app_type;
    recipe;
    value;
    generated_from = '';
    generated_at = null;
    denied_roles = null;
    ack_enabled = false;
    retention_days = 0;
}
export class User {
    username;
    password;
    constructor(username, password) {
        this.username = username;
        this.password = password;
    }
}
export class LanIPResponse {
    lanip;
}
export class LanIP {
    lanip_key_id = 0;
    lanip_key = '';
    keep_alive = 0;
    auto_sync = 0;
    status = '';
}
