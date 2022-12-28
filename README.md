# Fujitsu HVAC for homebridge
A homebridge plugin to support devices compatible with the Fujitsu FGLAir app.

The plugin talks to the API for device info and then with the device over the local network.

```
npm install homebridge-fujitsu-hvac
```

## Configuration

```json
{
    "platforms": [
        {
            "platform": "FujitsuHVAC",
            "username": "xxxxx@example.com",
            "password": "xxxxxxxx",
            "region": "us",

            "offMode": "fan",
            "localIP": "xxx.xxx.xxx.xxx",
            "powerfulModeSwitch": false,
            "economyModeSwitch": false,
            "energySavingFanSwitch": false
        },
        ...
    ]
}
```

**username**: Username used in FGLAir app.

**password**: Password used in FGLAir app.

**region**: `eu` in Europe, `cn` in China, and `us` anywhere else.

**offMode** (optional): `fan`, `dry`, or `off`. Mode to set when selecting `OFF` in HomeKit.

**localIP** (optional): IP to use for local communication. The wifi module seems to prefer to be on the same subnet. Unless you have more than one LAN IP it should work automatically.

**localPort** (optional): Use specific port instead of randomly a assigned port.

**powerfulModeSwitch** (optional): Add a switch for Powerful Mode, if supported.

**economyModeSwitch** (optional): Add a switch for Economy Mode, if supported.

**energySavingModeSwitch** (optional): Add a switch for Energy Saving Fan, if supported.