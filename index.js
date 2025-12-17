/**
 * @format
 */

// MUST be first imports for polyfills (order matters!)
// 1. URL polyfill for fetch and other URL operations
import 'react-native-url-polyfill/auto';

// 2. Buffer polyfill for @solana/web3.js
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// 3. Crypto polyfill for getRandomValues
import 'react-native-get-random-values';

// 4. TextEncoder/TextDecoder polyfill (if needed)
if (typeof TextEncoder === 'undefined') {
  global.TextEncoder = require('text-encoding').TextEncoder;
}
if (typeof TextDecoder === 'undefined') {
  global.TextDecoder = require('text-encoding').TextDecoder;
}

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
