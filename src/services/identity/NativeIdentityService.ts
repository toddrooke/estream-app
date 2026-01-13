/**
 * Native eStream Identity Service
 * 
 * Creates and manages native eStream identities stored on the lattice.
 * This is NOT a Solana NFT - it's a native eStream identity event.
 * 
 * The identity is:
 * - Stored locally in the app
 * - Synced to the eStream lattice via Console API
 * - Tied to the ML-DSA-87 public key hash from Seeker
 */

import { NativeModules, Platform } from 'react-native';

// Console URL - production
const CONSOLE_URL = 'https://console.estream.dev';

// ============================================================================
// Types
// ============================================================================

export interface NativeIdentityParams {
  /** Display name for the identity */
  displayName: string;
  /** ML-DSA-87 public key hash (hex) */
  pubkeyHash: string;
  /** Initial roles (default: ['user']) */
  roles?: string[];
}

export interface NativeIdentityResult {
  success: boolean;
  /** Identity ID (id_<hash_prefix>) */
  identityId?: string;
  /** Public key hash */
  pubkeyHash?: string;
  /** Display name */
  displayName?: string;
  /** Provider ID */
  providerId?: string;
  /** Creation timestamp */
  createdAt?: number;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Native Module Bridge
// ============================================================================

const EstreamClientModule = NativeModules.EstreamClientModule;

/**
 * Create a native eStream identity via Console API
 */
async function createIdentityNative(
  consoleUrl: string,
  displayName: string,
  pubkeyHash: string,
): Promise<NativeIdentityResult> {
  if (Platform.OS === 'android' && EstreamClientModule?.createIdentity) {
    try {
      // The native module returns a JSON string
      const resultJson = await EstreamClientModule.createIdentity(
        consoleUrl,
        displayName,
        pubkeyHash,
      );
      if (resultJson) {
        const parsed = JSON.parse(resultJson);
        return {
          success: parsed.success,
          identityId: parsed.identity_id,
          pubkeyHash: parsed.pubkey_hash,
          displayName: parsed.display_name,
          error: parsed.error,
        };
      }
    } catch (error) {
      console.error('[NativeIdentity] Native call failed:', error);
    }
  }

  // Fallback to JavaScript fetch
  return createIdentityFetch(consoleUrl, displayName, pubkeyHash);
}

/**
 * JavaScript fallback for identity creation
 */
async function createIdentityFetch(
  consoleUrl: string,
  displayName: string,
  pubkeyHash: string,
): Promise<NativeIdentityResult> {
  try {
    const response = await fetch(`${consoleUrl}/api/identity/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        display_name: displayName,
        pubkey_hash: pubkeyHash,
        provider_id: 'seeker',
        roles: ['user'],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        identityId: data.identity_id,
        pubkeyHash: data.pubkey_hash,
        displayName: data.display_name,
        providerId: data.provider_id,
        createdAt: data.created_at,
      };
    } else {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Service Class
// ============================================================================

export class NativeIdentityService {
  private consoleUrl: string;

  constructor(consoleUrl: string = CONSOLE_URL) {
    this.consoleUrl = consoleUrl;
  }

  /**
   * Create a native eStream identity
   * 
   * This creates an identity event that is stored in ESLite and synced to the lattice.
   */
  async createIdentity(params: NativeIdentityParams): Promise<NativeIdentityResult> {
    console.log('[NativeIdentity] Creating identity:', params.displayName);
    
    const result = await createIdentityNative(
      this.consoleUrl,
      params.displayName,
      params.pubkeyHash,
    );

    if (result.success) {
      console.log('[NativeIdentity] Identity created:', result.identityId);
    } else {
      console.error('[NativeIdentity] Creation failed:', result.error);
    }

    return result;
  }

  /**
   * Check if an identity exists for a pubkey hash
   */
  async getIdentity(pubkeyHash: string): Promise<NativeIdentityResult | null> {
    try {
      const identityId = `id_${pubkeyHash.slice(0, 16)}`;
      const response = await fetch(`${this.consoleUrl}/api/identity/${identityId}`);
      
      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          identityId: data.id,
          displayName: data.displayName,
          pubkeyHash: pubkeyHash,
        };
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Sync identity to the lattice (for cross-device access)
   */
  async syncToLattice(identityId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.consoleUrl}/api/identity/${identityId}/sync`, {
        method: 'POST',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: NativeIdentityService | null = null;

export function getNativeIdentityService(consoleUrl?: string): NativeIdentityService {
  if (!instance) {
    instance = new NativeIdentityService(consoleUrl);
  }
  return instance;
}

export default NativeIdentityService;
