/**
 * Keychain Vault Service - iOS Secure Enclave backed signing.
 * 
 * Uses iOS Secure Enclave for hardware-backed key storage.
 * Falls back to Keychain Services if Secure Enclave is unavailable.
 * 
 * ## iOS Premium Features
 * - Secure Enclave P-256 key generation
 * - Face ID / Touch ID for signing
 * - Per-operation biometric for governance
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

// Biometric module interface (iOS only)
interface BiometricNativeModule {
  getBiometricStatus(): Promise<{
    available: boolean;
    biometricType: string;
    secureEnclaveAvailable: boolean;
  }>;
  authenticate(reason: string, subtitle: string | null): Promise<{
    success: boolean;
    method?: string;
    cancelled?: boolean;
  }>;
  generateBiometricProtectedKey(alias: string, requireBiometric: boolean): Promise<{
    publicKey: string;
    secureEnclave: boolean;
  }>;
  signWithBiometricKey(alias: string, dataBase64: string, reason: string): Promise<{
    success: boolean;
    signature?: string;
    cancelled?: boolean;
  }>;
  hasBiometricKey(alias: string): Promise<boolean>;
  signGovernanceAction(alias: string, actionJson: string): Promise<{
    success: boolean;
    signature?: string;
    actionHash?: string;
  }>;
}

// Get native modules (will be null on Android)
const KeychainModule: KeychainNativeModule | null = 
  Platform.OS === 'ios' ? NativeModules.KeychainModule : null;

const BiometricModule: BiometricNativeModule | null =
  Platform.OS === 'ios' ? NativeModules.BiometricModule : null;

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

  // ============================================================================
  // iOS Premium: Face ID / Touch ID Integration
  // ============================================================================

  /**
   * Check if Face ID / Touch ID is available
   */
  async isBiometricAvailable(): Promise<boolean> {
    if (!BiometricModule) {
      return false;
    }
    
    try {
      const status = await BiometricModule.getBiometricStatus();
      return status.available;
    } catch {
      return false;
    }
  }

  /**
   * Get biometric type (FaceID, TouchID, etc.)
   */
  async getBiometricType(): Promise<'FaceID' | 'TouchID' | 'None'> {
    if (!BiometricModule) {
      return 'None';
    }
    
    try {
      const status = await BiometricModule.getBiometricStatus();
      if (status.biometricType === 'FaceID') return 'FaceID';
      if (status.biometricType === 'TouchID') return 'TouchID';
      return 'None';
    } catch {
      return 'None';
    }
  }

  /**
   * Authenticate with Face ID / Touch ID
   */
  async authenticateWithBiometrics(
    reason: string = 'Authenticate to eStream'
  ): Promise<boolean> {
    if (!BiometricModule) {
      return false;
    }
    
    try {
      const result = await BiometricModule.authenticate(reason, null);
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Generate a biometric-protected Secure Enclave key
   * This key requires Face ID for every signing operation
   */
  async generateBiometricKey(): Promise<string | null> {
    if (!BiometricModule) {
      return null;
    }
    
    try {
      const result = await BiometricModule.generateBiometricProtectedKey(
        this.keyAlias + '-biometric',
        true
      );
      return result.publicKey;
    } catch (error) {
      console.error('Failed to generate biometric key:', error);
      return null;
    }
  }

  /**
   * Sign with biometric authentication (Face ID required)
   */
  async signWithBiometrics(
    message: Uint8Array,
    reason: string = 'Sign with eStream'
  ): Promise<Uint8Array> {
    if (!BiometricModule) {
      // Fall back to regular sign
      return this.sign(message);
    }
    
    // Check if biometric key exists
    const hasBioKey = await BiometricModule.hasBiometricKey(
      this.keyAlias + '-biometric'
    );
    
    if (!hasBioKey) {
      // Generate biometric key if needed
      await this.generateBiometricKey();
    }
    
    const messageB64 = Buffer.from(message).toString('base64');
    const result = await BiometricModule.signWithBiometricKey(
      this.keyAlias + '-biometric',
      messageB64,
      reason
    );
    
    if (!result.success) {
      if (result.cancelled) {
        throw new Error('Biometric authentication cancelled');
      }
      throw new Error('Biometric signing failed');
    }
    
    return Uint8Array.from(Buffer.from(result.signature!, 'base64'));
  }

  /**
   * Sign a governance action with Face ID (always required)
   */
  async signGovernanceAction(action: {
    type: string;
    operation: string;
    params: Record<string, unknown>;
  }): Promise<{ signature: Uint8Array; actionHash: string }> {
    if (!BiometricModule) {
      throw new Error('Biometric module not available');
    }
    
    // Check if biometric key exists
    const hasBioKey = await BiometricModule.hasBiometricKey(
      this.keyAlias + '-biometric'
    );
    
    if (!hasBioKey) {
      await this.generateBiometricKey();
    }
    
    const actionJson = JSON.stringify({
      ...action,
      timestamp: Date.now(),
    });
    
    const result = await BiometricModule.signGovernanceAction(
      this.keyAlias + '-biometric',
      actionJson
    );
    
    if (!result.success) {
      throw new Error('Governance signing failed or cancelled');
    }
    
    return {
      signature: Uint8Array.from(Buffer.from(result.signature!, 'base64')),
      actionHash: result.actionHash!,
    };
  }

  /**
   * Get security level description for display
   */
  getSecurityLevelDescription(): string {
    if (this.cachedSecurityLevel === 'secure_enclave') {
      return 'Secure Enclave (Hardware)';
    }
    return 'Software';
  }
}





