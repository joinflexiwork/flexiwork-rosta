// metro.config.cjs
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add react-native-url-polyfill to the resolver
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'react-native-url-polyfill': path.resolve(__dirname, 'node_modules/react-native-url-polyfill'),
};

module.exports = config;
