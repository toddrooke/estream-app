/**
 * Unified Wallet Service
 * 
 * Combines platform-specific wallet adapters:
 * - Android: Mobile Wallet Adapter (MWA) for Solana transactions
 * - iOS: VaultService with Secure Enclave for eStream identity
 * - Both: eStream Identity NFT and Spark authentication
 * 
 * This provides a single interface for all wallet operations.
 */

import { Platform } from 'react-native';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { MwaService, getMwaService } from '../solana/MwaService';
import { VaultService, getVaultService } from '../vault/VaultService';
import { AccountService, getAccountService } from '../account/AccountService';
import { getIdentityNftService, type IdentityNftResult } from '../identity';

// ============================================================================
// Types
// ============================================================================

export interface WalletAccount {
  /** Platform identifier */
  platform: 'android' | 'ios';
  /** Solana public key (Ed25519 from MWA or derived) */
  solanaAddress?: string;
  /** eStream identity public key hash (ML-DSA-87) */
  estreamIdentity?: string;
  /** Display name */
  displayName?: string;
  /** Has identity NFT */
  hasIdentityNft: boolean;
  /** Identity NFT mint address */
  identityNftMint?: string;
  /** Trust level */
  trustLevel: 'Software' | 'Hardware' | 'Certified';
  /** Governance role */
  role?: 'Viewer' | 'Operator' | 'Admin' | 'Auditor';
}

export interface SignResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export interface SendResult {
  success: boolean;
  signature?: string;
  error?: string;
}

// ============================================================================
// Wallet Service
// ============================================================================

export class WalletService {
  private mwaService: MwaService;
  private vaultService: VaultService;
  private accountService: AccountService;

  constructor() {
    this.mwaService = getMwaService();
    this.vaultService = getVaultService();
    this.accountService = getAccountService();
  }

  /**
   * Initialize wallet - loads account state and connects to platform wallet
   */
  async initialize(): Promise<WalletAccount> {
    const account = await this.accountService.loadAccount();
    
    // Get platform-specific wallet info
    if (Platform.OS === 'android') {
      try {
        // Try to get authorized Solana address from MWA
        await this.mwaService.authorize();
        const solanaKey = this.mwaService.getPublicKey();
        
        return {
          platform: 'android',
          solanaAddress: solanaKey?.toString(),
          estreamIdentity: account.pubkeyHash,
          displayName: account.displayName,
          hasIdentityNft: !!account.identityNftMint,
          identityNftMint: account.identityNftMint,
          trustLevel: 'Hardware', // Seeker has Titan M2
          role: account.role,
        };
      } catch {
        // MWA not available, fall back to account only
      }
    }

    // iOS or Android without MWA
    return {
      platform: Platform.OS as 'android' | 'ios',
      estreamIdentity: account.pubkeyHash,
      displayName: account.displayName,
      hasIdentityNft: !!account.identityNftMint,
      identityNftMint: account.identityNftMint,
      trustLevel: this.vaultService.getSecurityLevel(),
      role: account.role,
    };
  }

  /**
   * Connect to Solana wallet (Android MWA)
   */
  async connectSolanaWallet(): Promise<string | null> {
    if (Platform.OS !== 'android') {
      console.warn('[WalletService] MWA only available on Android');
      return null;
    }

    try {
      await this.mwaService.authorize();
      const key = this.mwaService.getPublicKey();
      return key?.toString() || null;
    } catch (error) {
      console.error('[WalletService] Failed to connect MWA:', error);
      return null;
    }
  }

  /**
   * Sign a Solana transaction
   * Uses MWA on Android, not available on iOS
   */
  async signTransaction(
    transaction: Transaction | VersionedTransaction
  ): Promise<Transaction | VersionedTransaction> {
    if (Platform.OS !== 'android') {
      throw new Error('Solana transaction signing requires Android with Mobile Wallet Adapter');
    }

    return this.mwaService.signTransaction(transaction);
  }

  /**
   * Sign and send a Solana transaction
   */
  async signAndSendTransaction(
    transaction: Transaction | VersionedTransaction
  ): Promise<SendResult> {
    if (Platform.OS !== 'android') {
      return {
        success: false,
        error: 'Solana transactions require Android with Mobile Wallet Adapter',
      };
    }

    try {
      const signature = await this.mwaService.signAndSendTransaction(transaction);
      return { success: true, signature };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Sign a message with eStream identity (ML-DSA-87)
   * Available on both iOS and Android
   */
  async signMessage(message: Uint8Array): Promise<SignResult> {
    try {
      const signature = await this.vaultService.sign(message);
      return { success: true, signature };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Sign a governance action (e.g., node control, role assignment)
   * Uses biometric authentication if available
   */
  async signGovernanceAction(action: {
    type: string;
    operation: string;
    params: Record<string, unknown>;
  }): Promise<SignResult> {
    try {
      // Serialize action to bytes
      const payload = new TextEncoder().encode(JSON.stringify({
        ...action,
        timestamp: Date.now(),
        nonce: crypto.getRandomValues(new Uint8Array(16)),
      }));

      // Sign with vault (uses biometrics if configured)
      const signature = await this.vaultService.signWithBiometrics(payload);
      return { success: true, signature };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Mint Identity NFT
   */
  async mintIdentityNft(): Promise<IdentityNftResult> {
    const account = await this.accountService.loadAccount();
    
    if (!account.pubkeyHash) {
      return { success: false, error: 'No identity key generated' };
    }

    const identityService = getIdentityNftService('devnet');
    
    const result = await identityService.mintViaApi(
      account.pubkeyHash, // Use identity hash as owner for demo
      {
        pubkeyHash: account.pubkeyHash,
        displayName: account.displayName || 'eStream User',
      }
    );

    if (result.success && result.mintAddress) {
      await this.accountService.updateAccount({
        identityNftMint: result.mintAddress,
      });
    }

    return result;
  }

  /**
   * Get current account info
   */
  async getAccount(): Promise<WalletAccount> {
    return this.initialize();
  }

  /**
   * Check if Solana wallet is connected (Android only)
   */
  isSolanaWalletConnected(): boolean {
    if (Platform.OS !== 'android') {
      return false;
    }
    return this.mwaService.isConnected();
  }

  /**
   * Disconnect Solana wallet
   */
  async disconnectSolanaWallet(): Promise<void> {
    if (Platform.OS === 'android') {
      await this.mwaService.deauthorize();
    }
  }

  /**
   * Get security level description
   */
  getSecurityLevel(): string {
    const level = this.vaultService.getSecurityLevel();
    
    if (Platform.OS === 'android') {
      return `${level} (Titan M2 + Seed Vault)`;
    } else {
      return `${level} (Secure Enclave)`;
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: WalletService | null = null;

export function getWalletService(): WalletService {
  if (!instance) {
    instance = new WalletService();
  }
  return instance;
}

export default WalletService;
