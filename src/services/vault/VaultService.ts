/**
 * Vault Service - Abstract interface for key storage and signing.
 * 
 * Implementations:
 * - SeekerVaultService (Android with Seed Vault)
 * - KeychainVaultService (iOS Secure Enclave)
 * - SoftwareVaultService (Fallback, dev only)
 */

import { TrustLevel } from '@/types';

export interface VaultService {
  /**
   * Check if the vault is available on this device.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get the public key from the vault.
   * @returns Ed25519 public key as Uint8Array (32 bytes)
   */
  getPublicKey(): Promise<Uint8Array>;

  /**
   * Get the public key as Base58 string.
   */
  getPublicKeyBase58(): Promise<string>;

  /**
   * Sign a message with the vault's private key.
   * @param message - Message to sign
   * @returns Ed25519 signature as Uint8Array (64 bytes)
   */
  sign(message: Uint8Array): Promise<Uint8Array>;

  /**
   * Get the trust level of this vault.
   */
  getTrustLevel(): Promise<TrustLevel>;

  /**
   * Get device attestation (if available).
   * @returns Attestation data or null if not available
   */
  getAttestation?(): Promise<AttestationData | null>;
}

export interface AttestationData {
  type: 'seeker' | 'android_keystore' | 'ios_secure_enclave';
  certificateChain: string[];  // Base64 encoded
  challenge: string;           // Hex
  timestamp: number;
  deviceId: string;
}

/**
 * Factory function to get the appropriate vault service.
 */
export async function getVaultService(): Promise<VaultService> {
  // Try Seeker first (Android)
  try {
    const { SeekerVaultService } = await import('./SeekerVaultService');
    const seeker = new SeekerVaultService();
    if (await seeker.isAvailable()) {
      console.log('[VaultService] Using SeekerVaultService');
      return seeker;
    }
  } catch (e) {
    console.warn('[VaultService] Seeker check failed:', e);
  }

  // Try iOS Keychain
  try {
    const { KeychainVaultService } = await import('./KeychainVaultService');
    const keychain = new KeychainVaultService();
    if (await keychain.isAvailable()) {
      console.log('[VaultService] Using KeychainVaultService');
      return keychain;
    }
  } catch (e) {
    console.warn('[VaultService] Keychain check failed:', e);
  }

  // Fallback to software vault (dev only)
  console.warn('[VaultService] No hardware vault available, using SoftwareVaultService');
  const { SoftwareVaultService } = await import('./SoftwareVaultService');
  return new SoftwareVaultService();
}





