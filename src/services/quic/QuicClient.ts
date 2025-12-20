/**
 * QUIC Client - Native Module Wrapper
 * 
 * Wraps the Rust QUIC native module for React Native
 */

import { NativeModules } from 'react-native';

const { QuicClient: NativeQuicClient } = NativeModules;

if (!NativeQuicClient) {
  throw new Error('QuicClient native module not found. Did you link the native module?');
}

export interface PqWireMessage {
  sender_key_ref: string;
  recipient_key_ref: string;
  sealed_message: any;
  timestamp: number;
  expiration?: MessageExpiration;
}

export interface MessageExpiration {
  mode: 'Never' | 'AfterRead' | 'AfterSend' | 'AfterDelivery';
  duration_seconds?: number;
  expire_at?: number;
  signature?: string;
}

export interface DevicePublicKeys {
  signature_key: string;
  kem_key: string;
  key_hash: string;
  app_scope: string;
  created_at: number;
}

/**
 * High-level QUIC messaging client
 */
export class QuicMessagingClient {
  private nodeAddr: string;
  private managerPtr: number | null = null;
  
  constructor(nodeAddr: string) {
    this.nodeAddr = nodeAddr;
  }
  
  /**
   * Initialize the QUIC client
   */
  async initialize(): Promise<void> {
    try {
      this.managerPtr = await NativeQuicClient.initialize();
      console.log('[QuicClient] Initialized successfully');
    } catch (error) {
      console.error('[QuicClient] Failed to initialize:', error);
      throw error;
    }
  }
  
  /**
   * Connect to the eStream node
   */
  async connect(): Promise<void> {
    // Note: handle 0 is valid, so check for null/undefined specifically
    if (this.managerPtr === null || this.managerPtr === undefined) {
      throw new Error('QuicClient not initialized. Call initialize() first.');
    }
    
    try {
      await NativeQuicClient.connect(this.managerPtr, this.nodeAddr);
      console.log(`[QuicClient] Connected to ${this.nodeAddr}`);
    } catch (error) {
      console.error(`[QuicClient] Failed to connect to ${this.nodeAddr}:`, error);
      throw error;
    }
  }
  
  /**
   * Send a PQ wire message
   */
  async sendMessage(message: PqWireMessage): Promise<void> {
    // Note: handle 0 is valid, so check for null/undefined specifically
    if (this.managerPtr === null || this.managerPtr === undefined) {
      throw new Error('QuicClient not initialized. Call initialize() first.');
    }
    
    try {
      // Serialize message to bytes (native module expects serialized bincode)
      const messageJson = JSON.stringify(message);
      await NativeQuicClient.sendMessage(this.managerPtr, this.nodeAddr, messageJson);
      console.log('[QuicClient] Message sent successfully');
    } catch (error) {
      console.error('[QuicClient] Failed to send message:', error);
      throw error;
    }
  }
  
  /**
   * Generate PQ device keys
   */
  async generateDeviceKeys(appScope: string): Promise<DevicePublicKeys> {
    try {
      const publicKeysJson = await NativeQuicClient.generateDeviceKeys(appScope);
      const publicKeys: DevicePublicKeys = JSON.parse(publicKeysJson);
      console.log('[QuicClient] Device keys generated successfully');
      return publicKeys;
    } catch (error) {
      console.error('[QuicClient] Failed to generate device keys:', error);
      throw error;
    }
  }
  
  /**
   * Dispose of the connection manager
   */
  dispose(): void {
    if (this.managerPtr) {
      NativeQuicClient.dispose(this.managerPtr);
      this.managerPtr = null;
      console.log('[QuicClient] Disposed');
    }
  }
}

/**
 * Singleton instance for convenience
 */
let defaultClient: QuicMessagingClient | null = null;

export function getQuicClient(nodeAddr: string = 'node.estream.io:5000'): QuicMessagingClient {
  if (!defaultClient) {
    defaultClient = new QuicMessagingClient(nodeAddr);
  }
  return defaultClient;
}

