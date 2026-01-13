/**
 * Account Service
 * 
 * Manages the local eStream account, including:
 * - Display name
 * - Account creation timestamp
 * - Identity NFT status
 * - Linked organization
 * 
 * Account is tied to the ML-DSA-87 keypair in the vault.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// Types
// ============================================================================

export interface Account {
  /** Display name chosen by user */
  displayName: string;
  
  /** ML-DSA-87 public key hash (hex) - identity anchor */
  pubkeyHash: string;
  
  /** Account creation timestamp (ISO string) */
  createdAt: string;
  
  /** Last active timestamp */
  lastActiveAt: string;
  
  /** Identity NFT mint address (Solana) if minted */
  identityNftMint?: string;
  
  /** Linked organization ID */
  organizationId?: string;
  
  /** Governance roles */
  roles: string[];
  
  /** Whether onboarding has been completed */
  onboardingComplete: boolean;
}

export interface AccountUpdate {
  displayName?: string;
  identityNftMint?: string;
  organizationId?: string;
  roles?: string[];
  onboardingComplete?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = '@estream/account';

// ============================================================================
// Account Service
// ============================================================================

class AccountServiceImpl {
  private account: Account | null = null;
  private listeners: Set<(account: Account | null) => void> = new Set();

  /**
   * Load account from storage
   */
  async load(): Promise<Account | null> {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (json) {
        this.account = JSON.parse(json);
        // Update last active time
        if (this.account) {
          this.account.lastActiveAt = new Date().toISOString();
          await this.save();
        }
      }
      return this.account;
    } catch (error) {
      console.error('[Account] Failed to load:', error);
      return null;
    }
  }

  /**
   * Save account to storage
   */
  private async save(): Promise<void> {
    if (this.account) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.account));
    }
  }

  /**
   * Get current account
   */
  get(): Account | null {
    return this.account;
  }

  /**
   * Create a new account for a pubkey hash
   */
  async create(pubkeyHash: string): Promise<Account> {
    const now = new Date().toISOString();
    
    // Generate a friendly default name
    const shortHash = pubkeyHash.slice(0, 8);
    
    this.account = {
      displayName: `Spark ${shortHash}`,
      pubkeyHash,
      createdAt: now,
      lastActiveAt: now,
      roles: [],
      onboardingComplete: false,
    };
    
    await this.save();
    this.notifyListeners();
    
    console.log('[Account] Created new account:', this.account.displayName);
    return this.account;
  }

  /**
   * Update account fields
   */
  async update(updates: AccountUpdate): Promise<Account | null> {
    if (!this.account) {
      console.warn('[Account] Cannot update: no account exists');
      return null;
    }

    this.account = {
      ...this.account,
      ...updates,
      lastActiveAt: new Date().toISOString(),
    };

    await this.save();
    this.notifyListeners();
    
    return this.account;
  }

  /**
   * Check if account exists for a pubkey hash
   */
  async exists(pubkeyHash: string): Promise<boolean> {
    await this.load();
    return this.account?.pubkeyHash === pubkeyHash;
  }

  /**
   * Get or create account for pubkey hash
   */
  async getOrCreate(pubkeyHash: string): Promise<Account> {
    await this.load();
    
    if (this.account?.pubkeyHash === pubkeyHash) {
      return this.account;
    }
    
    // Different pubkey - create new account
    // (This handles key rotation or new device scenarios)
    if (this.account && this.account.pubkeyHash !== pubkeyHash) {
      console.log('[Account] Pubkey changed, creating new account');
    }
    
    return this.create(pubkeyHash);
  }

  /**
   * Delete account (for reset/testing)
   */
  async delete(): Promise<void> {
    this.account = null;
    await AsyncStorage.removeItem(STORAGE_KEY);
    this.notifyListeners();
    console.log('[Account] Account deleted');
  }

  /**
   * Subscribe to account changes
   */
  subscribe(listener: (account: Account | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.account));
  }
}

// Singleton instance
export const AccountService = new AccountServiceImpl();

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate pubkey hash from raw public key bytes
 */
export function hashPubkey(pubkey: Uint8Array): string {
  const { sha256 } = require('@/utils/crypto');
  const hashArray = sha256(pubkey);
  return Array.from(hashArray).map(b => (b as number).toString(16).padStart(2, '0')).join('');
}
