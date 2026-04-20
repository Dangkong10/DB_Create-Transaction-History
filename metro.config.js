const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

/**
 * Metro configuration for Expo with NativeWind
 * 
 * NativeWind v4 requires wrapping the Metro config with withNativeWind()
 * to enable Tailwind CSS processing for React Native.
 * 
 * @see https://www.nativewind.dev/v4/getting-started/metro
 * @see https://docs.expo.dev/guides/customizing-metro
 */
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
