/**
 * ML-DSA-87 Vault Service Interface
 * 
 * Post-Quantum Digital Signature Algorithm support for eStream governance.
 * ML-DSA-87 (Dilithium5) provides 256-bit security against quantum attacks.
 * 
 * Key Sizes:
 * - Public Key: 2,592 bytes
 * - Secret Key: 4,896 bytes
 * - Signature: 4,627 bytes
 * 
 * Implementations:
 * - SeekerMlDsaService: Hardware-backed via Seeker + native module
 * - SoftwareMlDsaService: Development/simulator fallback using WASM
 */

import { TrustLevel } from '@/types';

// ============================================================================
// Types
// ============================================================================

/**
 * ML-DSA-87 Key Pair
 */
export interface MlDsaKeyPair {
  publicKey: Uint8Array;   // 2,592 bytes
  secretKey: Uint8Array;   // 4,896 bytes
  keyHash: Uint8Array;     // 32 bytes (Blake3 hash of public key)
}

/**
 * ML-DSA-87 Signature Result
 */
export interface MlDsaSignature {
  signature: Uint8Array;   // 4,627 bytes
  keyHash: Uint8Array;     // 32 bytes (for quick key lookup)
}

/**
 * Governance signing request
 */
export interface GovernanceSignRequest {
  operation: string;
  description: string;
  payload: Uint8Array;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ML-DSA Vault Service Interface
// ============================================================================

export interface MlDsaVaultService {
  /**
   * Check if ML-DSA-87 signing is available.
   */
  isMlDsaAvailable(): Promise<boolean>;

  /**
   * Get the ML-DSA-87 public key.
   * @returns Public key as Uint8Array (2,592 bytes)
   */
  getMlDsaPublicKey(): Promise<Uint8Array>;

  /**
   * Get the ML-DSA-87 key hash (32 bytes).
   * Used for quick key identification in wire protocol.
   */
  getMlDsaKeyHash(): Promise<Uint8Array>;

  /**
   * Sign a message with ML-DSA-87.
   * @param message - Message to sign
   * @returns ML-DSA-87 signature (4,627 bytes) + key hash
   */
  signMlDsa(message: Uint8Array): Promise<MlDsaSignature>;

  /**
   * Sign a governance operation with ML-DSA-87.
   * May require biometric authentication.
   * @param request - Governance signing request
   * @returns ML-DSA-87 signature + key hash
   */
  signGovernance(request: GovernanceSignRequest): Promise<MlDsaSignature>;

  /**
   * Get the trust level for ML-DSA keys.
   */
  getMlDsaTrustLevel(): Promise<TrustLevel>;
}

// ============================================================================
// Stub ML-DSA Implementation for Simulator Testing
// ============================================================================

/**
 * Stub ML-DSA-87 signatures for simulator testing.
 * 
 * Uses deterministic pseudo-signatures that maintain the correct sizes
 * but are NOT cryptographically secure. FOR DEVELOPMENT ONLY.
 */
export class StubMlDsaService implements MlDsaVaultService {
  private stubKeyPair: MlDsaKeyPair | null = null;
  private readonly alias: string;

  constructor(alias: string = 'estream-governance') {
    this.alias = alias;
    console.warn(
      '⚠️ StubMlDsaService: Using STUB ML-DSA-87 signatures. ' +
      'These are NOT cryptographically secure - FOR SIMULATOR TESTING ONLY!'
    );
  }

  /**
   * Generate stub keypair on first use.
   */
  private async ensureKeyPair(): Promise<MlDsaKeyPair> {
    if (this.stubKeyPair) {
      return this.stubKeyPair;
    }

    // Generate deterministic stub keys based on alias
    const aliasBytes = new TextEncoder().encode(this.alias);
    
    // Stub public key (2,592 bytes) - filled with deterministic pattern
    const publicKey = new Uint8Array(2592);
    for (let i = 0; i < 2592; i++) {
      publicKey[i] = (aliasBytes[i % aliasBytes.length] + i) & 0xff;
    }
    
    // Stub secret key (4,896 bytes)
    const secretKey = new Uint8Array(4896);
    for (let i = 0; i < 4896; i++) {
      secretKey[i] = ((aliasBytes[i % aliasBytes.length] * 17) + i) & 0xff;
    }
    
    // Key hash (32 bytes) - simple hash of public key
    const keyHash = await this.simpleHash(publicKey);
    
    this.stubKeyPair = { publicKey, secretKey, keyHash };
    
    console.log(`[StubMlDsa] Generated stub keypair for alias: ${this.alias}`);
    console.log(`[StubMlDsa] Key hash: ${this.toHex(keyHash.slice(0, 8))}...`);
    
    return this.stubKeyPair;
  }

  async isMlDsaAvailable(): Promise<boolean> {
    return true;  // Stub is always available
  }

  async getMlDsaPublicKey(): Promise<Uint8Array> {
    const kp = await this.ensureKeyPair();
    return kp.publicKey;
  }

  async getMlDsaKeyHash(): Promise<Uint8Array> {
    const kp = await this.ensureKeyPair();
    return kp.keyHash;
  }

  async signMlDsa(message: Uint8Array): Promise<MlDsaSignature> {
    const kp = await this.ensureKeyPair();
    
    // Generate stub signature (4,627 bytes)
    // In real ML-DSA, this would be cryptographically derived
    const signature = new Uint8Array(4627);
    
    // Mix message into signature (deterministic but NOT secure)
    const messageHash = await this.simpleHash(message);
    for (let i = 0; i < 4627; i++) {
      signature[i] = (
        kp.secretKey[i % kp.secretKey.length] ^ 
        messageHash[i % 32] ^
        (i & 0xff)
      ) & 0xff;
    }
    
    console.log(`[StubMlDsa] Generated stub signature (${signature.length} bytes)`);
    
    return {
      signature,
      keyHash: kp.keyHash,
    };
  }

  async signGovernance(request: GovernanceSignRequest): Promise<MlDsaSignature> {
    console.log(`[StubMlDsa] Signing governance operation: ${request.operation}`);
    console.log(`[StubMlDsa] Description: ${request.description}`);
    
    // For governance, sign the payload directly
    return this.signMlDsa(request.payload);
  }

  async getMlDsaTrustLevel(): Promise<TrustLevel> {
    // Stub keys have lowest trust level
    return TrustLevel.SoftwareBacked;
  }

  // Utility functions
  
  private async simpleHash(data: Uint8Array): Promise<Uint8Array> {
    // Use SubtleCrypto if available
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      return new Uint8Array(hashBuffer);
    }
    
    // Simple XOR-based fallback (NOT cryptographically secure)
    const hash = new Uint8Array(32);
    for (let i = 0; i < data.length; i++) {
      hash[i % 32] ^= data[i];
      hash[(i + 1) % 32] = (hash[(i + 1) % 32] + data[i]) & 0xff;
    }
    return hash;
  }

  private toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let cachedMlDsaService: MlDsaVaultService | null = null;

/**
 * Get the best available ML-DSA-87 vault service.
 * 
 * Priority:
 * 1. Seeker hardware ML-DSA (Android with Seeker connected)
 * 2. QUIC native module ML-DSA (iOS)
 * 3. Stub ML-DSA (simulator/development)
 */
export async function getMlDsaVaultService(): Promise<MlDsaVaultService> {
  if (cachedMlDsaService) {
    return cachedMlDsaService;
  }

  // Try native modules first
  try {
    const { NativeModules, Platform } = await import('react-native');
    
    // Try Seeker module (Android) - FIRST priority for hardware backing
    if (Platform.OS === 'android') {
      const SeekerModule = NativeModules.SeekerModule;
      if (SeekerModule) {
        try {
          const available = await SeekerModule.isAvailable();
          if (available) {
            console.log('[MlDsa] Using SeekerMlDsaService (HardwareBacked)');
            const { SeekerMlDsaService } = await import('./SeekerMlDsaService');
            cachedMlDsaService = new SeekerMlDsaService();
            return cachedMlDsaService;
          }
        } catch (e) {
          console.warn('[MlDsa] Seeker check failed:', e);
        }
      }
    }
    
    // Try QUIC module (iOS has ML-DSA support)
    const QuicClient = NativeModules.QuicClient;
    if (QuicClient && typeof QuicClient.signMlDsa === 'function') {
      console.log('[MlDsa] Using QuicClient native ML-DSA');
      const { NativeMlDsaService } = await import('./NativeMlDsaService');
      cachedMlDsaService = new NativeMlDsaService();
      return cachedMlDsaService;
    }
  } catch (error) {
    console.warn('[MlDsa] Native module check failed:', error);
  }

  // Fallback to stub for simulator testing
  console.log('[MlDsa] Using StubMlDsaService for simulator testing');
  cachedMlDsaService = new StubMlDsaService();
  return cachedMlDsaService;
}

/**
 * Clear the cached service (for testing or when Seeker connects/disconnects)
 */
export function clearMlDsaServiceCache(): void {
  cachedMlDsaService = null;
}
