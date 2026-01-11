/**
 * Identity NFT Service
 * 
 * Mints eStream Identity NFTs on Solana using the estream-identity Anchor program.
 * 
 * The Identity NFT contains:
 * - ML-DSA-87 public key hash
 * - Spark visual seed
 * - Governance role
 * - Display name
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Keypair,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getMint,
} from '@solana/spl-token';
import { BN } from 'bn.js';

// ============================================================================
// Types
// ============================================================================

export type SolanaCluster = 'devnet' | 'testnet' | 'mainnet-beta' | 'localnet';

export interface IdentityNftParams {
  /** ML-DSA-87 public key hash (32 bytes as hex) */
  pubkeyHash: string;
  /** Display name (max 32 chars) */
  displayName: string;
  /** Spark visual seed (16 bytes as hex, derived from pubkey) */
  latticeSeed?: string;
}

export interface IdentityNftResult {
  success: boolean;
  /** NFT mint address */
  mintAddress?: string;
  /** Identity account PDA */
  identityPda?: string;
  /** Transaction signature */
  signature?: string;
  error?: string;
}

export interface IdentityInfo {
  pubkeyHash: string;
  displayName: string;
  role: 'Viewer' | 'Operator' | 'Admin' | 'Auditor';
  createdAt: number;
  organization?: string;
  nftMint: string;
}

// ============================================================================
// Constants
// ============================================================================

// Program ID - replace with actual deployed program ID
const IDENTITY_PROGRAM_ID = new PublicKey('EstrMidNfT1111111111111111111111111111111111');

// Metaplex Token Metadata Program
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Default RPC endpoints
const RPC_ENDPOINTS: Record<SolanaCluster, string> = {
  'devnet': 'https://api.devnet.solana.com',
  'testnet': 'https://api.testnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  'localnet': 'http://localhost:8899',
};

// ============================================================================
// Identity NFT Service
// ============================================================================

export class IdentityNftService {
  private connection: Connection;
  private cluster: SolanaCluster;

  constructor(cluster: SolanaCluster = 'devnet') {
    this.cluster = cluster;
    this.connection = new Connection(RPC_ENDPOINTS[cluster], 'confirmed');
    console.log(`[IdentityNft] Using ${cluster}`);
  }

  /**
   * Get Identity account PDA for a wallet
   */
  getIdentityPda(owner: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('identity'), owner.toBuffer()],
      IDENTITY_PROGRAM_ID
    );
  }

  /**
   * Get metadata account PDA
   */
  getMetadataPda(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    );
  }

  /**
   * Get master edition PDA
   */
  getMasterEditionPda(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from('edition'),
      ],
      METADATA_PROGRAM_ID
    );
  }

  /**
   * Check if an identity NFT already exists for a wallet
   */
  async hasIdentityNft(owner: PublicKey): Promise<boolean> {
    try {
      const [identityPda] = this.getIdentityPda(owner);
      const accountInfo = await this.connection.getAccountInfo(identityPda);
      return accountInfo !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get identity info for a wallet
   */
  async getIdentityInfo(owner: PublicKey): Promise<IdentityInfo | null> {
    try {
      const [identityPda] = this.getIdentityPda(owner);
      const accountInfo = await this.connection.getAccountInfo(identityPda);
      
      if (!accountInfo) {
        return null;
      }

      // Parse the account data (simplified - in production use Anchor's coder)
      const data = accountInfo.data;
      
      // Skip 8-byte discriminator and 1-byte bump
      let offset = 9;
      
      // ML-DSA pubkey hash (32 bytes)
      const pubkeyHash = Buffer.from(data.slice(offset, offset + 32)).toString('hex');
      offset += 32;
      
      // Lattice seed (16 bytes) - skip
      offset += 16;
      
      // Role (1 byte)
      const roleValue = data[offset];
      const roles = ['Viewer', 'Operator', 'Admin', 'Auditor'] as const;
      const role = roles[roleValue] || 'Viewer';
      offset += 1;
      
      // Created at (8 bytes, i64)
      const createdAt = new BN(data.slice(offset, offset + 8), 'le').toNumber();
      offset += 8;
      
      // Skip updated_at
      offset += 8;
      
      // Organization (1 + 32 bytes optional)
      const hasOrg = data[offset] === 1;
      offset += 1;
      const organization = hasOrg 
        ? new PublicKey(data.slice(offset, offset + 32)).toString()
        : undefined;
      offset += 32;
      
      // Display name (32 bytes)
      const displayNameBytes = data.slice(offset, offset + 32);
      const displayName = Buffer.from(displayNameBytes)
        .toString('utf8')
        .replace(/\0+$/, '');
      offset += 32;
      
      // NFT mint (32 bytes)
      const nftMint = new PublicKey(data.slice(offset, offset + 32)).toString();
      
      return {
        pubkeyHash,
        displayName,
        role,
        createdAt,
        organization,
        nftMint,
      };
    } catch (error) {
      console.error('[IdentityNft] Failed to get identity:', error);
      return null;
    }
  }

  /**
   * Create the mint instruction for Identity NFT
   * 
   * Note: Full implementation requires Anchor client library.
   * This provides the transaction structure for integration.
   */
  async createMintTransaction(
    owner: PublicKey,
    params: IdentityNftParams
  ): Promise<{ transaction: Transaction; mint: Keypair }> {
    const mint = Keypair.generate();
    const [identityPda, bump] = this.getIdentityPda(owner);
    const [metadataPda] = this.getMetadataPda(mint.publicKey);
    const [masterEditionPda] = this.getMasterEditionPda(mint.publicKey);
    const tokenAccount = await getAssociatedTokenAddress(mint.publicKey, owner);

    // Convert params to on-chain format
    const pubkeyHashBytes = Buffer.from(params.pubkeyHash.slice(0, 64), 'hex');
    const displayNameBytes = Buffer.alloc(32);
    Buffer.from(params.displayName.slice(0, 32)).copy(displayNameBytes);
    
    const latticeSeed = params.latticeSeed 
      ? Buffer.from(params.latticeSeed.slice(0, 32), 'hex')
      : pubkeyHashBytes.slice(0, 16);

    // Build transaction
    // Note: In production, use Anchor's Program class for proper instruction encoding
    const transaction = new Transaction();
    
    // The actual Anchor instruction would be added here
    // For now, we log what would be called
    console.log('[IdentityNft] Would call create_identity with:', {
      owner: owner.toString(),
      identity: identityPda.toString(),
      mint: mint.publicKey.toString(),
      pubkeyHash: params.pubkeyHash.slice(0, 16) + '...',
      displayName: params.displayName,
    });

    return { transaction, mint };
  }

  /**
   * Mint an Identity NFT via API (for clients without wallet signing)
   * 
   * In production, this calls a server endpoint that handles the Anchor transaction.
   */
  async mintViaApi(
    ownerPubkey: string,
    params: IdentityNftParams
  ): Promise<IdentityNftResult> {
    console.log('[IdentityNft] Minting via API for:', ownerPubkey.slice(0, 8));
    
    try {
      // Call eStream API to mint
      const response = await fetch('https://api.estream.io/identity/mint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          owner: ownerPubkey,
          pubkey_hash: params.pubkeyHash,
          display_name: params.displayName,
          lattice_seed: params.latticeSeed || params.pubkeyHash.slice(0, 32),
          cluster: this.cluster,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      const result = await response.json();
      
      return {
        success: true,
        mintAddress: result.mint,
        identityPda: result.identity_pda,
        signature: result.signature,
      };
    } catch (error) {
      console.error('[IdentityNft] API mint failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get SOL balance for a wallet
   */
  async getBalance(owner: PublicKey): Promise<number> {
    try {
      const balance = await this.connection.getBalance(owner);
      return balance / 1e9; // Convert lamports to SOL
    } catch {
      return 0;
    }
  }

  /**
   * Request airdrop (devnet only)
   */
  async requestAirdrop(owner: PublicKey, sol: number = 1): Promise<boolean> {
    if (this.cluster !== 'devnet' && this.cluster !== 'localnet') {
      console.warn('[IdentityNft] Airdrop only available on devnet/localnet');
      return false;
    }

    try {
      const sig = await this.connection.requestAirdrop(owner, sol * 1e9);
      await this.connection.confirmTransaction(sig);
      console.log('[IdentityNft] Airdropped', sol, 'SOL');
      return true;
    } catch (error) {
      console.error('[IdentityNft] Airdrop failed:', error);
      return false;
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: IdentityNftService | null = null;

export function getIdentityNftService(cluster: SolanaCluster = 'devnet'): IdentityNftService {
  if (!instance) {
    instance = new IdentityNftService(cluster);
  }
  return instance;
}

export default IdentityNftService;
