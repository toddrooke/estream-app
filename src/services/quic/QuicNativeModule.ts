/**
 * Native module bridge for QUIC client
 * 
 * This bridges TypeScript to the Rust native module (libestream_quic_native.so)
 */

import { NativeModules } from 'react-native';

interface QuicNativeModuleType {
  /**
   * Initialize the QUIC client (creates Tokio runtime)
   * @returns Handle to the native QuicConnectionManager
   */
  initialize(): Promise<number>;

  /**
   * Connect to an eStream node
   * @param handle Native manager handle from initialize()
   * @param nodeAddr Node address (e.g., "127.0.0.1:5000")
   * @returns Success boolean
   */
  connect(handle: number, nodeAddr: string): Promise<boolean>;

  /**
   * Send a message over QUIC
   * @param handle Native manager handle
   * @param message Message bytes
   * @returns Success boolean
   */
  sendMessage(handle: number, message: Uint8Array): Promise<boolean>;

  /**
   * Generate PQ device keys
   * @param appScope App scope string (e.g., "estream-app")
   * @returns Serialized DeviceKeys
   */
  generateDeviceKeys(appScope: string): Promise<Uint8Array>;

  /**
   * Dispose of the native manager
   * @param handle Native manager handle
   */
  dispose(handle: number): Promise<void>;
}

const { QuicClient } = NativeModules;

if (!QuicClient) {
  throw new Error(
    'QuicClient native module not found. ' +
    'Make sure libestream_quic_native.so is built and included in jniLibs.'
  );
}

export const QuicNativeModule: QuicNativeModuleType = QuicClient;

