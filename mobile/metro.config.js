// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite/web carrega wa-sqlite.wasm; o Metro precisa reconhecer .wasm.
config.resolver.assetExts.push('wasm');

module.exports = config;
