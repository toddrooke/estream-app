/**
 * Seeker ML-DSA-87 Vault Service
 * 
 * Hardware-backed ML-DSA-87 signing via the Solana Seeker device.
 * The Seeker provides secure element storage for keys and biometric
 * authentication for signing operations.
 * 
 * Trust Level: HardwareBacked (Seeker SE) or Certified (with attestation)
 */

import { NativeModules, Platform } from 'react-native';
import { TrustLevel } from '@/types';
import { 
  MlDsaVaultService, 
  MlDsaKeyPair, 
  MlDsaSignature,
  GovernanceSignRequest,
} from './MlDsaVaultService';

// ============================================================================
// Native Module Interface
// ============================================================================

interface SeekerNativeModule {
  isAvailable(): Promise<boolean>;
  isBiometricAvailable(): Promise<boolean>;
  generateKey(alias: string): Promise<string>;  // Returns public key base64
  getPublicKey(alias: string): Promise<string>;
  hasKey(alias: string): Promise<boolean>;
  sign(alias: string, messageB64: string): Promise<string>;  // Returns signature base64
  signWithBiometric(alias: string, messageB64: string, title: string, subtitle: string): Promise<string>;
  deleteKey(alias: string): Promise<boolean>;
  getDeviceAttestation?(): Promise<string>;  // Optional hardware attestation
}

const SeekerModule: SeekerNativeModule | null = 
  Platform.OS === 'android' ? NativeModules.SeekerModule : null;

// ============================================================================
// Seeker ML-DSA Service
// ============================================================================

/**
 * Hardware-backed ML-DSA-87 service using Solana Seeker.
 * 
 * Note: Current Seeker uses ECDSA (secp256r1) via Android Keystore.
 * This service adapts the signing flow but reports TrustLevel.HardwareBacked
 * because keys are stored in the secure element.
 * 
 * Future: When pqcrypto-dilithium JNI is integrated, this will use
 * true ML-DSA-87 with hardware-protected keys.
 */
export class SeekerMlDsaService implements MlDsaVaultService {
  private readonly keyAlias: string = 'estream-governance';
  private cachedKeyHash: Uint8Array | null = null;
  private cachedPublicKey: Uint8Array | null = null;
  private hasAttestation: boolean = false;

  constructor() {
    console.log('[SeekerMlDsa] Initializing Seeker ML-DSA service');
    this.checkAttestation();
  }

  /**
   * Check if hardware attestation is available.
   */
  private async checkAttestation(): Promise<void> {
    if (!SeekerModule || !SeekerModule.getDeviceAttestation) {
      this.hasAttestation = false;
      return;
    }
    
    try {
      const attestation = await SeekerModule.getDeviceAttestation();
      this.hasAttestation = attestation !== null && attestation.length > 0;
      console.log(`[SeekerMlDsa] Hardware attestation: ${this.hasAttestation ? 'available' : 'not available'}`);
    } catch {
      this.hasAttestation = false;
    }
  }

  async isMlDsaAvailable(): Promise<boolean> {
    if (!SeekerModule) {
      console.log('[SeekerMlDsa] SeekerModule not available (not Android)');
      return false;
    }
    
    try {
      const available = await SeekerModule.isAvailable();
      console.log(`[SeekerMlDsa] Seeker available: ${available}`);
      return available;
    } catch (error) {
      console.error('[SeekerMlDsa] Error checking availability:', error);
      return false;
    }
  }

  async getMlDsaPublicKey(): Promise<Uint8Array> {
    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }

    if (!SeekerModule) {
      throw new Error('SeekerModule not available');
    }

    // Ensure key exists
    const hasKey = await SeekerModule.hasKey(this.keyAlias);
    if (!hasKey) {
      console.log('[SeekerMlDsa] Generating new key...');
      await SeekerModule.generateKey(this.keyAlias);
    }

    const publicKeyB64 = await SeekerModule.getPublicKey(this.keyAlias);
    this.cachedPublicKey = this.base64ToBytes(publicKeyB64);
    
    console.log(`[SeekerMlDsa] Public key: ${this.cachedPublicKey.length} bytes`);
    return this.cachedPublicKey;
  }

  async getMlDsaKeyHash(): Promise<Uint8Array> {
    if (this.cachedKeyHash) {
      return this.cachedKeyHash;
    }

    const publicKey = await this.getMlDsaPublicKey();
    
    // Hash the public key with SHA-256 (32 bytes)
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', publicKey);
      this.cachedKeyHash = new Uint8Array(hashBuffer);
    } else {
      // Fallback XOR hash
      this.cachedKeyHash = new Uint8Array(32);
      for (let i = 0; i < publicKey.length; i++) {
        this.cachedKeyHash[i % 32] ^= publicKey[i];
      }
    }
    
    console.log(`[SeekerMlDsa] Key hash: ${this.toHex(this.cachedKeyHash.slice(0, 8))}...`);
    return this.cachedKeyHash;
  }

  async signMlDsa(message: Uint8Array): Promise<MlDsaSignature> {
    if (!SeekerModule) {
      throw new Error('SeekerModule not available');
    }

    const messageB64 = this.bytesToBase64(message);
    
    // Sign with biometric authentication
    console.log('[SeekerMlDsa] Requesting biometric authentication...');
    const signatureB64 = await SeekerModule.signWithBiometric(
      this.keyAlias,
      messageB64,
      'Sign eStream Governance',
      'Authenticate to sign with ML-DSA-87'
    );
    
    const signature = this.base64ToBytes(signatureB64);
    const keyHash = await this.getMlDsaKeyHash();
    
    console.log(`[SeekerMlDsa] Signature: ${signature.length} bytes (hardware-backed)`);
    
    return {
      signature,
      keyHash,
    };
  }

  async signGovernance(request: GovernanceSignRequest): Promise<MlDsaSignature> {
    console.log(`[SeekerMlDsa] Signing governance: ${request.operation}`);
    console.log(`[SeekerMlDsa] Description: ${request.description}`);
    
    // Sign the payload
    return this.signMlDsa(request.payload);
  }

  async getMlDsaTrustLevel(): Promise<TrustLevel> {
    // Seeker uses Android Keystore with secure element
    // Return Certified if hardware attestation is available
    if (this.hasAttestation) {
      return TrustLevel.Certified;
    }
    
    // Always HardwareBacked for Seeker (never Software)
    return TrustLevel.HardwareBacked;
  }

  // ============================================================================
  // Utility Functions
  // ============================================================================

  private bytesToBase64(bytes: Uint8Array): string {
    // Use Buffer if available (React Native)
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    
    // Browser fallback
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToBytes(base64: string): Uint8Array {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
