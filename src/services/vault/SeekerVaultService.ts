/**
 * Seeker Vault Service - Hardware-backed signing using Solana Seeker's Seed Vault.
 * 
 * The Seeker device provides:
 * - Hardware-backed Ed25519 key generation and signing
 * - Biometric/PIN unlock for signing operations
 * - Android Key Attestation for proof of hardware security
 * 
 * See: docs/specs/SEEKER_SIGNING.md
 */

import { NativeModules, Platform } from 'react-native';
import { TrustLevel } from '@/types';
import { VaultService, AttestationData } from './VaultService';
import bs58 from 'bs58';

// ============================================================================
// Biometric Types
// ============================================================================

/**
 * Biometric authentication modes
 */
export enum BiometricAuthMode {
  /** No biometric required */
  None = 0,
  /** Require biometric for every operation */
  PerOperation = 1,
  /** Biometric valid for 30 second window */
  TimeWindow = 2,
}

/**
 * Status of biometric availability
 */
export interface BiometricStatus {
  /** Whether biometric authentication is available */
  available: boolean;
  /** Numeric status code from BiometricManager */
  status: number;
  /** Human-readable status */
  statusText: 'available' | 'no_hardware' | 'hw_unavailable' | 'none_enrolled' | 'security_update_required' | 'unknown';
}

/**
 * Result of biometric key generation
 */
export interface BiometricKeyResult {
  /** Public key (Base64 encoded) */
  publicKey: string;
  /** Authentication mode the key was created with */
  authMode: BiometricAuthMode;
  /** Whether the key requires biometric auth */
  biometricProtected: boolean;
}

/**
 * Configuration for biometric prompt
 */
export interface BiometricPromptConfig {
  /** Title shown in the biometric dialog */
  title?: string;
  /** Subtitle shown in the biometric dialog */
  subtitle?: string;
}

// ============================================================================
// Native Module Interface
// ============================================================================

interface SeekerNativeModule {
  // Basic key operations
  isAvailable(): Promise<boolean>;
  generateKey(alias: string): Promise<string>;  // Returns public key base64
  hasKey(alias: string): Promise<boolean>;
  getPublicKey(alias: string): Promise<string>;  // Base64
  sign(alias: string, message: string): Promise<string>;  // Base64 in, Base64 out
  getAttestation(alias: string): Promise<{
    certificates: string[];  // Base64
    challenge: string;       // Hex
    timestamp: number;
    securityLevel: string;
    isInsideSecureHardware: boolean;
  } | null>;
  deleteKey(alias: string): Promise<boolean>;
  
  // Biometric operations
  isBiometricAvailable(): Promise<{
    available: boolean;
    status: number;
    statusText: string;
  }>;
  generateBiometricKey(alias: string, authMode: number): Promise<{
    publicKey: string;
    authMode: number;
    biometricProtected: boolean;
  }>;
  signWithBiometric(
    alias: string, 
    messageB64: string, 
    title: string, 
    subtitle: string
  ): Promise<string>;  // Returns signature Base64
}

// Get native module (will be null on iOS or non-Seeker Android)
const SeekerModule: SeekerNativeModule | null = 
  Platform.OS === 'android' ? NativeModules.SeekerModule : null;

const DEFAULT_KEY_ALIAS = 'estream-signing-key';
const DEFAULT_BIOMETRIC_KEY_ALIAS = 'estream-biometric-key';

/**
 * Seeker Vault Service Implementation
 * 
 * Uses the Seeker Seed Vault hardware secure element for key storage
 * and signing operations.
 */
export class SeekerVaultService implements VaultService {
  private keyAlias: string;
  private cachedPublicKey: Uint8Array | null = null;

  constructor(keyAlias: string = DEFAULT_KEY_ALIAS) {
    this.keyAlias = keyAlias;
  }

  /**
   * Check if Seeker Seed Vault is available.
   */
  async isAvailable(): Promise<boolean> {
    if (!SeekerModule) {
      return false;
    }
    
    try {
      return await SeekerModule.isAvailable();
    } catch (error) {
      console.warn('Seeker availability check failed:', error);
      return false;
    }
  }

  /**
   * Ensure a key exists, creating one if necessary.
   * Key generation happens in the hardware secure element.
   */
  async ensureKey(): Promise<void> {
    if (!SeekerModule) {
      throw new Error('Seeker not available');
    }

    const hasKey = await SeekerModule.hasKey(this.keyAlias);
    if (!hasKey) {
      console.log('Generating new key in Seeker Seed Vault...');
      const publicKeyB58 = await SeekerModule.generateKey(this.keyAlias);
      console.log('Key generated:', publicKeyB58.substring(0, 8) + '...');
    }
  }

  /**
   * Get the public key from the Seeker.
   * Returns cached value if available.
   */
  async getPublicKey(): Promise<Uint8Array> {
    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }

    if (!SeekerModule) {
      throw new Error('Seeker not available');
    }

    await this.ensureKey();

    const publicKeyB58 = await SeekerModule.getPublicKey(this.keyAlias);
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
   * Sign a message using the Seeker Seed Vault.
   * 
   * This will trigger a biometric/PIN prompt on the device.
   * The private key never leaves the secure element.
   */
  async sign(message: Uint8Array): Promise<Uint8Array> {
    if (!SeekerModule) {
      throw new Error('Seeker not available');
    }

    await this.ensureKey();

    // Convert message to base64 for native module
    const messageB64 = Buffer.from(message).toString('base64');
    
    // Sign in Seed Vault (user will see biometric prompt)
    const signatureB64 = await SeekerModule.sign(this.keyAlias, messageB64);
    
    // Decode signature from base64
    return Uint8Array.from(Buffer.from(signatureB64, 'base64'));
  }

  /**
   * Get the trust level for Seeker keys.
   * Seeker provides hardware-backed security.
   */
  async getTrustLevel(): Promise<TrustLevel> {
    return TrustLevel.HardwareBacked;
  }

  /**
   * Get device attestation proving key is in genuine Seeker hardware.
   * 
   * The attestation certificate chain proves:
   * 1. Key exists in genuine hardware
   * 2. Key is not extractable
   * 3. Device is in secure state
   */
  async getAttestation(): Promise<AttestationData | null> {
    if (!SeekerModule) {
      return null;
    }

    try {
      const attestation = await SeekerModule.getAttestation(this.keyAlias);
      
      if (!attestation) {
        return null;
      }

      return {
        type: 'seeker',
        certificateChain: attestation.certificates,
        challenge: attestation.challenge,
        timestamp: attestation.timestamp,
        deviceId: await this.getDeviceId(),
      };
    } catch (error) {
      console.warn('Failed to get Seeker attestation:', error);
      return null;
    }
  }

  /**
   * Get a unique device identifier.
   */
  private async getDeviceId(): Promise<string> {
    // In production, derive from hardware identifier
    // For now, use public key hash
    const publicKey = await this.getPublicKey();
    const hash = await this.sha256(publicKey);
    return bs58.encode(hash.slice(0, 16));
  }

  /**
   * Simple SHA256 implementation using SubtleCrypto if available.
   */
  private async sha256(data: Uint8Array): Promise<Uint8Array> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      return new Uint8Array(hashBuffer);
    }
    
    // Fallback: use the app's sha256 utility
    const { sha256 } = await import('@/utils/crypto');
    return sha256(data);
  }

  /**
   * Delete the key from Seeker (careful!).
   */
  async deleteKey(): Promise<boolean> {
    if (!SeekerModule) {
      return false;
    }

    try {
      const result = await SeekerModule.deleteKey(this.keyAlias);
      this.cachedPublicKey = null;
      return result;
    } catch (error) {
      console.error('Failed to delete Seeker key:', error);
      return false;
    }
  }

  // ==========================================================================
  // Biometric Authentication Methods
  // ==========================================================================

  /**
   * Check if biometric authentication is available on this device.
   * 
   * @returns BiometricStatus with availability info
   */
  async isBiometricAvailable(): Promise<BiometricStatus> {
    if (!SeekerModule) {
      return {
        available: false,
        status: -1,
        statusText: 'no_hardware',
      };
    }

    try {
      const result = await SeekerModule.isBiometricAvailable();
      return {
        available: result.available,
        status: result.status,
        statusText: result.statusText as BiometricStatus['statusText'],
      };
    } catch (error) {
      console.warn('Biometric availability check failed:', error);
      return {
        available: false,
        status: -1,
        statusText: 'unknown',
      };
    }
  }

  /**
   * Generate a new key pair with biometric protection.
   * 
   * @param authMode - Authentication mode (None, PerOperation, TimeWindow)
   * @param alias - Optional custom key alias (defaults to biometric-specific alias)
   * @returns BiometricKeyResult with public key and auth info
   */
  async generateBiometricKey(
    authMode: BiometricAuthMode = BiometricAuthMode.PerOperation,
    alias?: string
  ): Promise<BiometricKeyResult> {
    if (!SeekerModule) {
      throw new Error('Seeker not available');
    }

    const keyAlias = alias || DEFAULT_BIOMETRIC_KEY_ALIAS;

    try {
      const result = await SeekerModule.generateBiometricKey(keyAlias, authMode);
      return {
        publicKey: result.publicKey,
        authMode: result.authMode as BiometricAuthMode,
        biometricProtected: result.biometricProtected,
      };
    } catch (error) {
      console.error('Failed to generate biometric key:', error);
      throw error;
    }
  }

  /**
   * Sign a message with biometric authentication.
   * 
   * This will show a biometric prompt to the user. The signing operation
   * is bound to the biometric authentication (CryptoObject), ensuring
   * the signature is only valid if biometric auth succeeded.
   * 
   * @param message - Message to sign (Uint8Array)
   * @param prompt - Optional prompt configuration
   * @param alias - Optional custom key alias
   * @returns Signature as Uint8Array
   */
  async signWithBiometric(
    message: Uint8Array,
    prompt: BiometricPromptConfig = {},
    alias?: string
  ): Promise<Uint8Array> {
    if (!SeekerModule) {
      throw new Error('Seeker not available');
    }

    const keyAlias = alias || this.keyAlias;
    const messageB64 = Buffer.from(message).toString('base64');
    const title = prompt.title || 'Sign Transaction';
    const subtitle = prompt.subtitle || 'Authenticate to sign';

    try {
      const signatureB64 = await SeekerModule.signWithBiometric(
        keyAlias,
        messageB64,
        title,
        subtitle
      );
      return Uint8Array.from(Buffer.from(signatureB64, 'base64'));
    } catch (error) {
      console.error('Biometric signing failed:', error);
      throw error;
    }
  }

  /**
   * Check if a biometric-protected key exists.
   * 
   * @param alias - Optional custom key alias
   * @returns true if the key exists
   */
  async hasBiometricKey(alias?: string): Promise<boolean> {
    if (!SeekerModule) {
      return false;
    }

    try {
      return await SeekerModule.hasKey(alias || DEFAULT_BIOMETRIC_KEY_ALIAS);
    } catch (error) {
      console.warn('Biometric key check failed:', error);
      return false;
    }
  }
}




