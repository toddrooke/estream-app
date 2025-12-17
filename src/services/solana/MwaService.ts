/**
 * Mobile Wallet Adapter (MWA) Service
 * 
 * Official Solana Mobile SDK integration for:
 * - Connecting to Seed Vault
 * - Signing transactions
 * - Signing messages
 * - Getting public keys
 * 
 * This replaces our custom SeekerModule with the official SDK.
 * See: https://github.com/solana-mobile/mobile-wallet-adapter
 */

import {
  transact,
  Web3MobileWallet,
} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

// App identity for MWA sessions
const APP_IDENTITY = {
  name: 'eStream',
  uri: 'https://estream.io',
  icon: 'favicon.ico', // Relative to uri
};

// Cluster configuration
export type SolanaCluster = 'mainnet-beta' | 'devnet' | 'testnet';

export interface MwaConfig {
  cluster: SolanaCluster;
  appIdentity?: typeof APP_IDENTITY;
}

export interface AuthorizationResult {
  publicKey: PublicKey;
  authToken: string;
  walletName: string;
  walletUri: string;
}

export interface SignResult {
  signature: Uint8Array;
  publicKey: PublicKey;
}

/**
 * MWA Service - Wrapper around official Solana Mobile Wallet Adapter
 */
export class MwaService {
  private config: MwaConfig;
  private cachedAuthToken: string | null = null;
  private cachedPublicKey: PublicKey | null = null;

  constructor(config: Partial<MwaConfig> = {}) {
    this.config = {
      cluster: config.cluster || 'devnet',
      appIdentity: config.appIdentity || APP_IDENTITY,
    };
  }

  /**
   * Get the RPC cluster name for MWA
   */
  private getClusterRpcName(): string {
    switch (this.config.cluster) {
      case 'mainnet-beta':
        return 'mainnet-beta';
      case 'testnet':
        return 'testnet';
      case 'devnet':
      default:
        return 'devnet';
    }
  }

  /**
   * Authorize with the wallet and get a session token.
   * This will open the wallet app for user approval.
   */
  async authorize(): Promise<AuthorizationResult> {
    const result = await transact(async (wallet: Web3MobileWallet) => {
      // Request authorization
      const authResult = await wallet.authorize({
        cluster: this.getClusterRpcName(),
        identity: this.config.appIdentity!,
      });

      return {
        publicKey: new PublicKey(authResult.accounts[0].publicKey),
        authToken: authResult.auth_token,
        walletName: authResult.wallet_uri_base ? 'Seed Vault' : 'Unknown',
        walletUri: authResult.wallet_uri_base || '',
      };
    });

    // Cache for later use
    this.cachedAuthToken = result.authToken;
    this.cachedPublicKey = result.publicKey;

    return result;
  }

  /**
   * Reauthorize using a cached auth token.
   * Faster than full authorization.
   */
  async reauthorize(): Promise<AuthorizationResult | null> {
    if (!this.cachedAuthToken) {
      return null;
    }

    try {
      const result = await transact(async (wallet: Web3MobileWallet) => {
        const authResult = await wallet.reauthorize({
          auth_token: this.cachedAuthToken!,
          identity: this.config.appIdentity!,
        });

        return {
          publicKey: new PublicKey(authResult.accounts[0].publicKey),
          authToken: authResult.auth_token,
          walletName: 'Seed Vault',
          walletUri: authResult.wallet_uri_base || '',
        };
      });

      this.cachedAuthToken = result.authToken;
      this.cachedPublicKey = result.publicKey;

      return result;
    } catch (error) {
      // Reauth failed, clear cache
      this.cachedAuthToken = null;
      this.cachedPublicKey = null;
      return null;
    }
  }

  /**
   * Deauthorize and clear the session.
   */
  async deauthorize(): Promise<void> {
    if (!this.cachedAuthToken) {
      return;
    }

    try {
      await transact(async (wallet: Web3MobileWallet) => {
        await wallet.deauthorize({ auth_token: this.cachedAuthToken! });
      });
    } finally {
      this.cachedAuthToken = null;
      this.cachedPublicKey = null;
    }
  }

  /**
   * Sign a message with the wallet.
   * Returns the signature as Uint8Array.
   */
  async signMessage(message: Uint8Array): Promise<SignResult> {
    const result = await transact(async (wallet: Web3MobileWallet) => {
      // Reauthorize or authorize
      let authToken = this.cachedAuthToken;
      let publicKey = this.cachedPublicKey;

      if (!authToken) {
        const authResult = await wallet.authorize({
          cluster: this.getClusterRpcName(),
          identity: this.config.appIdentity!,
        });
        authToken = authResult.auth_token;
        publicKey = new PublicKey(authResult.accounts[0].publicKey);
        this.cachedAuthToken = authToken;
        this.cachedPublicKey = publicKey;
      }

      // Sign the message
      const signedMessages = await wallet.signMessages({
        addresses: [publicKey!.toBase58()],
        payloads: [message],
      });

      return {
        signature: signedMessages[0],
        publicKey: publicKey!,
      };
    });

    return result;
  }

  /**
   * Sign a transaction with the wallet.
   */
  async signTransaction(transaction: Transaction | VersionedTransaction): Promise<Transaction | VersionedTransaction> {
    const result = await transact(async (wallet: Web3MobileWallet) => {
      // Reauthorize or authorize
      let authToken = this.cachedAuthToken;
      let publicKey = this.cachedPublicKey;

      if (!authToken) {
        const authResult = await wallet.authorize({
          cluster: this.getClusterRpcName(),
          identity: this.config.appIdentity!,
        });
        authToken = authResult.auth_token;
        publicKey = new PublicKey(authResult.accounts[0].publicKey);
        this.cachedAuthToken = authToken;
        this.cachedPublicKey = publicKey;
      }

      // Sign the transaction
      const signedTransactions = await wallet.signTransactions({
        transactions: [transaction],
      });

      return signedTransactions[0];
    });

    return result;
  }

  /**
   * Sign and send a transaction.
   */
  async signAndSendTransaction(
    transaction: Transaction | VersionedTransaction,
    options?: { minContextSlot?: number }
  ): Promise<string> {
    const result = await transact(async (wallet: Web3MobileWallet) => {
      // Reauthorize or authorize
      let authToken = this.cachedAuthToken;
      let publicKey = this.cachedPublicKey;

      if (!authToken) {
        const authResult = await wallet.authorize({
          cluster: this.getClusterRpcName(),
          identity: this.config.appIdentity!,
        });
        authToken = authResult.auth_token;
        publicKey = new PublicKey(authResult.accounts[0].publicKey);
        this.cachedAuthToken = authToken;
        this.cachedPublicKey = publicKey;
      }

      // Sign and send
      const signatures = await wallet.signAndSendTransactions({
        transactions: [transaction],
        minContextSlot: options?.minContextSlot,
      });

      return bs58.encode(signatures[0]);
    });

    return result;
  }

  /**
   * Get the cached public key (if authorized).
   */
  getPublicKey(): PublicKey | null {
    return this.cachedPublicKey;
  }

  /**
   * Get the cached public key as Base58 string.
   */
  getPublicKeyBase58(): string | null {
    return this.cachedPublicKey?.toBase58() || null;
  }

  /**
   * Check if we have an active session.
   */
  isAuthorized(): boolean {
    return this.cachedAuthToken !== null && this.cachedPublicKey !== null;
  }

  /**
   * Get cluster configuration.
   */
  getCluster(): SolanaCluster {
    return this.config.cluster;
  }

  /**
   * Set cluster configuration.
   */
  setCluster(cluster: SolanaCluster): void {
    this.config.cluster = cluster;
    // Clear auth when changing cluster
    this.cachedAuthToken = null;
    this.cachedPublicKey = null;
  }
}

// Singleton instance
let mwaServiceInstance: MwaService | null = null;

/**
 * Get the MWA service singleton.
 */
export function getMwaService(config?: Partial<MwaConfig>): MwaService {
  if (!mwaServiceInstance) {
    mwaServiceInstance = new MwaService(config);
  }
  return mwaServiceInstance;
}

/**
 * Reset the MWA service (for testing).
 */
export function resetMwaService(): void {
  mwaServiceInstance = null;
}

