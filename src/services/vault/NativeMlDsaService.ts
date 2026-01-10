/**
 * Native ML-DSA-87 Service
 * 
 * Uses the QUIC native module for ML-DSA-87 operations.
 * Available on iOS via the swift-based PqCryptoModule.
 */

import { NativeModules } from 'react-native';
import { TrustLevel } from '@/types';
import {
  MlDsaVaultService,
  MlDsaSignature,
  GovernanceSignRequest,
} from './MlDsaVaultService';

// Native module interface
interface QuicClientModule {
  generateDeviceKeys(alias: string): Promise<string>;  // Returns JSON
  signMlDsa(alias: string, messageB64: string): Promise<{
    signature: string;  // Base64
    keyHash: string;    // Base64
  }>;
  getMlDsaPublicKey?(alias: string): Promise<string>;  // Base64
}

const QuicClient: QuicClientModule | null = NativeModules.QuicClient;

const DEFAULT_ALIAS = 'estream-governance';

/**
 * Native ML-DSA-87 Service Implementation
 * 
 * Uses the iOS/Android native modules for real ML-DSA-87 cryptography.
 */
export class NativeMlDsaService implements MlDsaVaultService {
  private alias: string;
  private cachedKeyHash: Uint8Array | null = null;
  private cachedPublicKey: Uint8Array | null = null;

  constructor(alias: string = DEFAULT_ALIAS) {
    this.alias = alias;
  }

  async isMlDsaAvailable(): Promise<boolean> {
    if (!QuicClient || typeof QuicClient.signMlDsa !== 'function') {
      return false;
    }
    
    // Try to ensure keys exist
    try {
      await this.ensureKeys();
      return true;
    } catch (error) {
      console.warn('[NativeMlDsa] Failed to ensure keys:', error);
      return false;
    }
  }

  /**
   * Ensure ML-DSA keys exist, generating if needed.
   */
  private async ensureKeys(): Promise<void> {
    if (this.cachedKeyHash && this.cachedPublicKey) {
      return;
    }

    if (!QuicClient) {
      throw new Error('QuicClient not available');
    }

    // Generate or retrieve existing keys
    const keysJson = await QuicClient.generateDeviceKeys(this.alias);
    const keys = JSON.parse(keysJson);

    // Parse key hash
    if (keys.key_hash) {
      this.cachedKeyHash = Uint8Array.from(keys.key_hash);
    }

    // Get public key if method exists
    if (QuicClient.getMlDsaPublicKey) {
      const pubKeyB64 = await QuicClient.getMlDsaPublicKey(this.alias);
      this.cachedPublicKey = Uint8Array.from(Buffer.from(pubKeyB64, 'base64'));
    }

    console.log(`[NativeMlDsa] Keys initialized for alias: ${this.alias}`);
  }

  async getMlDsaPublicKey(): Promise<Uint8Array> {
    await this.ensureKeys();
    
    if (!this.cachedPublicKey) {
      // If no getMlDsaPublicKey method, return placeholder
      // The actual public key is 2,592 bytes
      throw new Error('getMlDsaPublicKey not implemented in native module');
    }
    
    return this.cachedPublicKey;
  }

  async getMlDsaKeyHash(): Promise<Uint8Array> {
    await this.ensureKeys();
    
    if (!this.cachedKeyHash) {
      throw new Error('Key hash not available');
    }
    
    return this.cachedKeyHash;
  }

  async signMlDsa(message: Uint8Array): Promise<MlDsaSignature> {
    if (!QuicClient) {
      throw new Error('QuicClient not available');
    }

    await this.ensureKeys();

    // Convert message to Base64
    const messageB64 = Buffer.from(message).toString('base64');

    // Sign with native module
    const result = await QuicClient.signMlDsa(this.alias, messageB64);

    const signature = Uint8Array.from(Buffer.from(result.signature, 'base64'));
    const keyHash = Uint8Array.from(Buffer.from(result.keyHash, 'base64'));

    console.log(`[NativeMlDsa] Signed message (${signature.length} bytes)`);

    return { signature, keyHash };
  }

  async signGovernance(request: GovernanceSignRequest): Promise<MlDsaSignature> {
    console.log(`[NativeMlDsa] Signing governance: ${request.operation}`);
    console.log(`[NativeMlDsa] Description: ${request.description}`);

    // For governance operations, we sign the payload directly
    return this.signMlDsa(request.payload);
  }

  async getMlDsaTrustLevel(): Promise<TrustLevel> {
    // Native module uses device secure enclave
    return TrustLevel.HardwareBacked;
  }
}
