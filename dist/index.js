import { PLATFORM_NAME } from './settings.js';
import { FujitsuHVACPlatform } from './platform.js';
export default (api) => {
    api.registerPlatform(PLATFORM_NAME, FujitsuHVACPlatform);
};
