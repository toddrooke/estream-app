/**
 * Keychain Vault Service - iOS Secure Enclave backed signing.
 * 
 * Uses iOS Secure Enclave for hardware-backed key storage.
 * Falls back to Keychain Services if Secure Enclave is unavailable.
 * 
 * See: docs/specs/SEEKER_SIGNING.md
 */

import { NativeModules, Platform } from 'react-native';
import { TrustLevel } from '@/types';
import { VaultService, AttestationData } from './VaultService';
import bs58 from 'bs58';

// Native module interface
interface KeychainNativeModule {
  isSecureEnclaveAvailable(): Promise<boolean>;
  generateKey(alias: string, useSecureEnclave: boolean): Promise<string>;  // Returns public key base58
  hasKey(alias: string): Promise<boolean>;
  getPublicKey(alias: string): Promise<string>;  // Base58
  sign(alias: string, message: string): Promise<string>;  // Base64 in, Base64 out
  deleteKey(alias: string): Promise<boolean>;
  getSecurityLevel(alias: string): Promise<'software' | 'secure_enclave'>;
}

// Get native module (will be null on Android)
const KeychainModule: KeychainNativeModule | null = 
  Platform.OS === 'ios' ? NativeModules.KeychainModule : null;

const DEFAULT_KEY_ALIAS = 'estream-signing-key';

/**
 * iOS Keychain Vault Service Implementation
 * 
 * Uses Secure Enclave when available for hardware-backed security,
 * falls back to software Keychain otherwise.
 */
export class KeychainVaultService implements VaultService {
  private keyAlias: string;
  private cachedPublicKey: Uint8Array | null = null;
  private cachedSecurityLevel: 'software' | 'secure_enclave' | null = null;

  constructor(keyAlias: string = DEFAULT_KEY_ALIAS) {
    this.keyAlias = keyAlias;
  }

  /**
   * Check if Keychain is available (iOS only).
   */
  async isAvailable(): Promise<boolean> {
    return Platform.OS === 'ios' && KeychainModule !== null;
  }

  /**
   * Check if Secure Enclave is available on this device.
   */
  async isSecureEnclaveAvailable(): Promise<boolean> {
    if (!KeychainModule) {
      return false;
    }
    
    try {
      return await KeychainModule.isSecureEnclaveAvailable();
    } catch (error) {
      console.warn('Secure Enclave check failed:', error);
      return false;
    }
  }

  /**
   * Ensure a key exists, creating one if necessary.
   * Prefers Secure Enclave, falls back to software.
   */
  async ensureKey(): Promise<void> {
    if (!KeychainModule) {
      throw new Error('Keychain not available');
    }

    const hasKey = await KeychainModule.hasKey(this.keyAlias);
    if (!hasKey) {
      const useSecureEnclave = await this.isSecureEnclaveAvailable();
      console.log(`Generating key in ${useSecureEnclave ? 'Secure Enclave' : 'Keychain'}...`);
      const publicKeyB58 = await KeychainModule.generateKey(this.keyAlias, useSecureEnclave);
      console.log('Key generated:', publicKeyB58.substring(0, 8) + '...');
    }
  }

  /**
   * Get the public key.
   */
  async getPublicKey(): Promise<Uint8Array> {
    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }

    if (!KeychainModule) {
      throw new Error('Keychain not available');
    }

    await this.ensureKey();

    const publicKeyB58 = await KeychainModule.getPublicKey(this.keyAlias);
    this.cachedPublicKey = bs58.decode(publicKeyB58);
    
    return this.cachedPublicKey;
  }

  /**
   * Get the public key as Base58 string.
   */
  async getPublicKeyBase58(): Promise<string> {
    const publicKey = await this.getPublicKey();
    return bs58.encode(publicKey);
  }

  /**
   * Sign a message using Keychain/Secure Enclave.
   * 
   * For Secure Enclave keys, this may trigger biometric authentication.
   */
  async sign(message: Uint8Array): Promise<Uint8Array> {
    if (!KeychainModule) {
      throw new Error('Keychain not available');
    }

    await this.ensureKey();

    const messageB64 = Buffer.from(message).toString('base64');
    const signatureB64 = await KeychainModule.sign(this.keyAlias, messageB64);
    
    return Uint8Array.from(Buffer.from(signatureB64, 'base64'));
  }

  /**
   * Get the trust level based on security backing.
   */
  async getTrustLevel(): Promise<TrustLevel> {
    if (this.cachedSecurityLevel === null) {
      if (!KeychainModule) {
        return TrustLevel.SoftwareBacked;
      }
      
      await this.ensureKey();
      this.cachedSecurityLevel = await KeychainModule.getSecurityLevel(this.keyAlias);
    }
    
    return this.cachedSecurityLevel === 'secure_enclave' 
      ? TrustLevel.HardwareBacked 
      : TrustLevel.SoftwareBacked;
  }

  /**
   * iOS does not provide the same attestation as Android.
   * App Attest is available but works differently.
   */
  async getAttestation(): Promise<AttestationData | null> {
    // iOS App Attest requires separate implementation
    // For now, return null
    return null;
  }

  /**
   * Delete the key from Keychain.
   */
  async deleteKey(): Promise<boolean> {
    if (!KeychainModule) {
      return false;
    }

    try {
      const result = await KeychainModule.deleteKey(this.keyAlias);
      this.cachedPublicKey = null;
      this.cachedSecurityLevel = null;
      return result;
    } catch (error) {
      console.error('Failed to delete Keychain key:', error);
      return false;
    }
  }
}


