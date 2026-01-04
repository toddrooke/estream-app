/**
 * QUIC Client - Native Module Wrapper
 * 
 * Wraps the Rust QUIC native module for React Native.
 * Falls back to PqCryptoModule for PQ crypto when QUIC is unavailable.
 */

import { NativeModules, Platform } from 'react-native';

const { QuicClient: NativeQuicClient, PqCryptoModule } = NativeModules;

// QUIC native module is optional - PQ crypto can work without it
const QUIC_AVAILABLE = !!NativeQuicClient;
const PQ_AVAILABLE = !!PqCryptoModule;

if (!QUIC_AVAILABLE && !PQ_AVAILABLE) {
  console.warn('[QuicClient] Neither QuicClient nor PqCryptoModule found. Native modules not linked.');
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

// ============================================================================
// HTTP/3 Client (UDP-based write operations)
// ============================================================================

export interface H3Response {
  status: number;
  body: string;
}

export interface NftMintResult {
  nft_id: string;
  estream_id: string;
  image: string;
  metadata: {
    name: string;
    symbol: string;
    description: string;
    attributes: Array<{ trait_type: string; value: string | number }>;
  };
  minted_at: number;
}

/**
 * HTTP/3 Client for write operations.
 * HTTP/TCP is read-only per security policy; writes require UDP.
 */
export class H3Client {
  private serverAddr: string;
  
  constructor(serverAddr: string) {
    this.serverAddr = serverAddr;
  }
  
  /**
   * Connect to the HTTP/3 server
   */
  async connect(): Promise<void> {
    if (!QUIC_AVAILABLE) {
      throw new Error('QuicClient native module not available');
    }
    
    try {
      await NativeQuicClient.h3Connect(this.serverAddr);
      console.log(`[H3Client] Connected to ${this.serverAddr}`);
    } catch (error) {
      console.error(`[H3Client] Failed to connect:`, error);
      throw error;
    }
  }
  
  /**
   * POST request over HTTP/3
   */
  async post(path: string, body: object): Promise<H3Response> {
    if (!QUIC_AVAILABLE) {
      throw new Error('QuicClient native module not available');
    }
    
    try {
      const result = await NativeQuicClient.h3Post(path, JSON.stringify(body));
      return JSON.parse(result);
    } catch (error) {
      console.error(`[H3Client] POST ${path} failed:`, error);
      throw error;
    }
  }
  
  /**
   * GET request over HTTP/3
   */
  async get(path: string): Promise<H3Response> {
    if (!QUIC_AVAILABLE) {
      throw new Error('QuicClient native module not available');
    }
    
    try {
      const result = await NativeQuicClient.h3Get(path);
      return JSON.parse(result);
    } catch (error) {
      console.error(`[H3Client] GET ${path} failed:`, error);
      throw error;
    }
  }
  
  /**
   * Mint an eStream Identity NFT
   */
  async mintIdentityNft(owner: string, trustLevel: 'software' | 'hardware' | 'certified'): Promise<NftMintResult> {
    if (!QUIC_AVAILABLE) {
      throw new Error('QuicClient native module not available');
    }
    
    try {
      const result = await NativeQuicClient.h3MintIdentityNft(owner, trustLevel);
      console.log(`[H3Client] Identity NFT minted`);
      return JSON.parse(result);
    } catch (error) {
      console.error(`[H3Client] Mint failed:`, error);
      throw error;
    }
  }
  
  /**
   * Check if connected
   */
  async isConnected(): Promise<boolean> {
    if (!QUIC_AVAILABLE) {
      return false;
    }
    
    return await NativeQuicClient.h3IsConnected();
  }
  
  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    if (QUIC_AVAILABLE) {
      await NativeQuicClient.h3Disconnect();
      console.log('[H3Client] Disconnected');
    }
  }
}

/**
 * Get HTTP/3 client for the local eStream server
 */
export function getH3Client(serverAddr: string = '10.0.0.120:8443'): H3Client {
  return new H3Client(serverAddr);
}

