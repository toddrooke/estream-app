const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

// Path to the linked @estream/react-native package
const estreamSdkPath = path.resolve(__dirname, '../estream-io/packages/mobile-sdk/react-native');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [estreamSdkPath],
  resolver: {
    // Make sure Metro can resolve modules from the linked package
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(estreamSdkPath, 'node_modules'),
    ],
    // Ensure symlinks are followed
    unstable_enableSymlinks: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
