/**
 * Software Vault Service - Development/Testing fallback.
 * 
 * WARNING: This vault stores keys in AsyncStorage which is NOT secure!
 * Only use for development and testing purposes.
 * 
 * For production, use:
 * - SeekerVaultService (Android with Seeker)
 * - KeychainVaultService (iOS)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrustLevel } from '@/types';
import { VaultService, AttestationData } from './VaultService';
import bs58 from 'bs58';
import * as nacl from 'tweetnacl';

const STORAGE_PREFIX = 'estream:vault:software:';
const DEFAULT_KEY_ALIAS = 'estream-signing-key';

/**
 * Software Vault Service Implementation
 * 
 * Uses tweetnacl for Ed25519 operations and AsyncStorage for persistence.
 * NOT SECURE - development only!
 */
export class SoftwareVaultService implements VaultService {
  private keyAlias: string;
  private cachedKeyPair: nacl.SignKeyPair | null = null;

  constructor(keyAlias: string = DEFAULT_KEY_ALIAS) {
    this.keyAlias = keyAlias;
    
    // Log warning in development
    if (__DEV__) {
      console.warn(
        '⚠️ SoftwareVaultService: Using insecure software key storage. ' +
        'Only use for development!'
      );
    }
  }

  /**
   * Software vault is always available.
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Get storage key for this alias.
   */
  private getStorageKey(): string {
    return `${STORAGE_PREFIX}${this.keyAlias}`;
  }

  /**
   * Load or generate the keypair.
   */
  private async loadOrGenerateKeyPair(): Promise<nacl.SignKeyPair> {
    if (this.cachedKeyPair) {
      return this.cachedKeyPair;
    }

    const storageKey = this.getStorageKey();
    
    try {
      const stored = await AsyncStorage.getItem(storageKey);
      
      if (stored) {
        const secretKey = bs58.decode(stored);
        this.cachedKeyPair = nacl.sign.keyPair.fromSecretKey(secretKey);
        return this.cachedKeyPair;
      }
    } catch (error) {
      console.warn('Failed to load keypair:', error);
    }

    // Generate new keypair
    console.log('Generating new software keypair...');
    this.cachedKeyPair = nacl.sign.keyPair();
    
    // Store secret key
    await AsyncStorage.setItem(storageKey, bs58.encode(this.cachedKeyPair.secretKey));
    console.log('Keypair stored:', bs58.encode(this.cachedKeyPair.publicKey).substring(0, 8) + '...');
    
    return this.cachedKeyPair;
  }

  /**
   * Get the public key.
   */
  async getPublicKey(): Promise<Uint8Array> {
    const keyPair = await this.loadOrGenerateKeyPair();
    return keyPair.publicKey;
  }

  /**
   * Get the public key as Base58 string.
   */
  async getPublicKeyBase58(): Promise<string> {
    const publicKey = await this.getPublicKey();
    return bs58.encode(publicKey);
  }

  /**
   * Sign a message with the software key.
   */
  async sign(message: Uint8Array): Promise<Uint8Array> {
    const keyPair = await this.loadOrGenerateKeyPair();
    
    // nacl.sign returns detached signature
    const signature = nacl.sign.detached(message, keyPair.secretKey);
    
    return signature;
  }

  /**
   * Software keys have lowest trust level.
   */
  async getTrustLevel(): Promise<TrustLevel> {
    return TrustLevel.SoftwareBacked;
  }

  /**
   * No attestation available for software keys.
   */
  async getAttestation(): Promise<AttestationData | null> {
    return null;
  }

  /**
   * Delete the key from storage.
   */
  async deleteKey(): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(this.getStorageKey());
      this.cachedKeyPair = null;
      return true;
    } catch (error) {
      console.error('Failed to delete software key:', error);
      return false;
    }
  }

  /**
   * Export secret key (for backup/migration).
   * WARNING: Handle with extreme care!
   */
  async exportSecretKey(): Promise<string> {
    const keyPair = await this.loadOrGenerateKeyPair();
    return bs58.encode(keyPair.secretKey);
  }

  /**
   * Import secret key (for restore).
   */
  async importSecretKey(secretKeyB58: string): Promise<void> {
    const secretKey = bs58.decode(secretKeyB58);
    
    if (secretKey.length !== 64) {
      throw new Error('Invalid secret key length');
    }
    
    this.cachedKeyPair = nacl.sign.keyPair.fromSecretKey(secretKey);
    await AsyncStorage.setItem(this.getStorageKey(), secretKeyB58);
  }
}




