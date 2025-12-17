/**
 * @format
 */

// MUST be first imports for polyfills (order matters!)
// 1. Crypto polyfill for getRandomValues - must be first
import 'react-native-get-random-values';

// 2. URL polyfill for fetch and other URL operations
import 'react-native-url-polyfill/auto';

// 3. Buffer polyfill for @solana/web3.js
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// 4. TextEncoder/TextDecoder - React Native 0.74+ includes these natively
// No polyfill needed

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
