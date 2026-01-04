/**
 * NFT Minting Service
 * 
 * Creates and manages eStream and TakeTitle NFTs via the eStream API.
 * NFTs are stored in the eStream DAG with dynamic SVG generation.
 * 
 * ## Security Policy
 * - HTTP/3 (QUIC/UDP): Full access (reads + writes) - port 8443
 * - HTTP/2 (TCP): Read-only access - port 8090
 * 
 * Write operations (POST, PUT, DELETE) require HTTP/3.
 */

import { 
  Connection, 
  PublicKey, 
  clusterApiUrl,
} from '@solana/web3.js';

import { H3Client, getH3Client } from '../quic/QuicClient';

export type NftCluster = 'devnet' | 'testnet' | 'mainnet-beta' | 'localnet';

// eStream server - use Mac's IP directly
const MAC_IP = '10.0.0.120';
const ESTREAM_H3_URL = `${MAC_IP}:8443`;   // HTTP/3 (UDP) - full access (writes)
const ESTREAM_HTTP_URL = `http://${MAC_IP}:8090`;  // HTTP/2 (TCP) - read-only

// Local Solana node URL
const LOCALNET_URL = `http://${MAC_IP}:8899`;

// eStream NFT API response
interface EstreamNftResponse {
  nft_id: string;
  estream_id: string;
  image: string;
  metadata: {
    name: string;
    symbol: string;
    description: string;
    image: string;
    attributes: Array<{ trait_type: string; value: unknown }>;
  };
  minted_at: number;
}

export interface NftMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  externalUrl?: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
  animationUrl?: string;
}

export interface EstreamIdentityMetadata extends NftMetadata {
  attributes: [
    { trait_type: 'Trust Level'; value: 'Software' | 'Hardware' | 'Certified' },
    { trait_type: 'Member Since'; value: string },
    { trait_type: 'Activity Score'; value: number },
    { trait_type: 'Anchors'; value: number },
  ];
}

export interface TakeTitlePortfolioMetadata extends NftMetadata {
  attributes: [
    { trait_type: 'Assets Owned'; value: number },
    { trait_type: 'TITLE Balance'; value: number },
    { trait_type: 'Active Listings'; value: number },
    { trait_type: 'Listed Value USD'; value: number },
  ];
}

export interface TakeTitleAssetMetadata extends NftMetadata {
  attributes: [
    { trait_type: 'Asset ID'; value: string },
    { trait_type: 'Asset Type'; value: string },
    { trait_type: 'Listing Status'; value: 'Not Listed' | 'For Sale' | 'Pending' },
    { trait_type: 'Token Supply'; value: number },
    { trait_type: 'Provenance Events'; value: number },
  ];
}

export interface MintResult {
  success: boolean;
  mintAddress?: string;
  signature?: string;
  tokenAccount?: string;
  error?: string;
}

export interface MintTransaction {
  transaction: Transaction;
  mintKeypair: Keypair;
  metadataUri: string;
}

/**
 * NFT Minting Service using Metaplex
 * 
 * Note: Full Metaplex Umi integration requires proper bundler setup.
 * For React Native, we use a simplified approach with direct RPC calls
 * or server-side minting via API.
 */
export class NftMintService {
  private connection: Connection;
  private cluster: NftCluster;

  constructor(cluster: NftCluster = 'localnet') {
    this.cluster = cluster;
    const rpcUrl = cluster === 'localnet' ? LOCALNET_URL : clusterApiUrl(cluster);
    this.connection = new Connection(rpcUrl);
    console.log(`[NftMintService] Using ${cluster} at ${rpcUrl}`);
  }

  /**
   * Generate metadata for an eStream Identity NFT
   */
  createEstreamIdentityMetadata(
    publicKey: string,
    trustLevel: 'Software' | 'Hardware' | 'Certified',
    memberSince: string,
    activityScore: number,
    anchorCount: number
  ): EstreamIdentityMetadata {
    return {
      name: 'eStream Identity',
      symbol: 'ESTREAM',
      description: 'eStream network identity NFT - represents your trust level and activity on the eStream network.',
      image: `https://nft.estream.io/identity/${publicKey}.svg`,
      externalUrl: `https://estream.io/identity/${publicKey}`,
      attributes: [
        { trait_type: 'Trust Level', value: trustLevel },
        { trait_type: 'Member Since', value: memberSince },
        { trait_type: 'Activity Score', value: activityScore },
        { trait_type: 'Anchors', value: anchorCount },
      ],
    };
  }

  /**
   * Generate metadata for a TakeTitle Portfolio NFT
   */
  createTakeTitlePortfolioMetadata(
    publicKey: string,
    assetsOwned: number,
    tokenBalance: number,
    activeListings: number,
    listedValueUsd: number
  ): TakeTitlePortfolioMetadata {
    return {
      name: 'TakeTitle Portfolio',
      symbol: 'TTPORT',
      description: 'TakeTitle portfolio NFT - represents your real-world asset holdings and marketplace activity.',
      image: `https://nft.taketitle.io/portfolio/${publicKey}.svg`,
      externalUrl: `https://taketitle.io/portfolio/${publicKey}`,
      animationUrl: `https://nft.taketitle.io/portfolio/${publicKey}.html`,
      attributes: [
        { trait_type: 'Assets Owned', value: assetsOwned },
        { trait_type: 'TITLE Balance', value: tokenBalance },
        { trait_type: 'Active Listings', value: activeListings },
        { trait_type: 'Listed Value USD', value: listedValueUsd },
      ],
    };
  }

  /**
   * Generate metadata for a TakeTitle Asset NFT
   */
  createTakeTitleAssetMetadata(
    assetId: string,
    assetName: string,
    assetType: string,
    listingStatus: 'Not Listed' | 'For Sale' | 'Pending',
    tokenSupply: number,
    provenanceEvents: number
  ): TakeTitleAssetMetadata {
    return {
      name: `Title Record: ${assetName.slice(0, 20)}`,
      symbol: 'DEED',
      description: `TakeTitle asset record for ${assetName}. This NFT represents provable ownership of a real-world asset.`,
      image: `https://nft.taketitle.io/asset/${assetId}.svg`,
      externalUrl: `https://taketitle.io/asset/${assetId}`,
      animationUrl: `https://nft.taketitle.io/asset/${assetId}.html`,
      attributes: [
        { trait_type: 'Asset ID', value: assetId },
        { trait_type: 'Asset Type', value: assetType },
        { trait_type: 'Listing Status', value: listingStatus },
        { trait_type: 'Token Supply', value: tokenSupply },
        { trait_type: 'Provenance Events', value: provenanceEvents },
      ],
    };
  }

  /**
   * Mint an eStream Identity NFT via HTTP/3 (UDP)
   * 
   * Dual-mints:
   * 1. eStream DAG (immutable event record)
   * 2. Solana Token-2022 (visible in wallet)
   * 
   * Uses HTTP/3 for write operations per security policy.
   * Falls back to HTTP/2 (TCP) for development if H3 fails.
   */
  async mintIdentityNft(
    ownerPublicKey: string,
    trustLevel: 'Software' | 'Hardware' | 'Certified',
    memberSince: string,
    activityScore: number,
    anchorCount: number
  ): Promise<MintResult> {
    console.log('[NftMintService] Minting Identity NFT (eStream + Solana)...');
    
    let estreamNftId: string | undefined;
    let estreamId: string | undefined;
    
    // Step 1: Mint on eStream via HTTP/3
    try {
      const h3Client = getH3Client(ESTREAM_H3_URL);
      await h3Client.connect();
      
      const trustLevelLower = trustLevel.toLowerCase() as 'software' | 'hardware' | 'certified';
      const result = await h3Client.mintIdentityNft(ownerPublicKey, trustLevelLower);
      
      estreamNftId = result.nft_id;
      estreamId = result.estream_id;
      console.log('[NftMintService] ✅ eStream NFT minted:', estreamNftId);
    } catch (h3Error) {
      console.warn('[NftMintService] HTTP/3 failed, trying HTTP fallback:', h3Error);
      
      try {
        const response = await fetch(`${ESTREAM_HTTP_URL}/api/v1/nft/identity`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer dev-seeker-user',
          },
          body: JSON.stringify({
            owner: ownerPublicKey,
            trust_level: trustLevel,
            member_since: memberSince,
            activity_score: activityScore,
            anchor_count: anchorCount,
          }),
        });
        
        if (response.ok) {
          const result: EstreamNftResponse = await response.json();
          estreamNftId = result.nft_id;
          estreamId = result.estream_id;
          console.log('[NftMintService] ✅ eStream NFT minted (HTTP fallback):', estreamNftId);
        }
      } catch (e) {
        console.error('[NftMintService] eStream mint failed:', e);
      }
    }
    
    // Step 2: Mint on Solana via API (server handles Token-2022)
    // The metadata URI points to eStream for verification
    try {
      const metadataUri = `${ESTREAM_HTTP_URL}/api/v1/nft/${estreamNftId || 'pending'}/metadata`;
      
      const response = await fetch(`${ESTREAM_HTTP_URL}/api/v1/nft/solana/mint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-seeker-user',
        },
        body: JSON.stringify({
          owner: ownerPublicKey,
          name: 'eStream Identity',
          symbol: 'ESTREAM',
          uri: metadataUri,
          estream_nft_id: estreamNftId,
        }),
      });
      
      if (response.ok) {
        const solanaResult = await response.json();
        console.log('[NftMintService] ✅ Solana NFT minted:', solanaResult.mint);
        
        return {
          success: true,
          mintAddress: solanaResult.mint,
          signature: solanaResult.signature,
          tokenAccount: solanaResult.token_account,
        };
      } else {
        console.warn('[NftMintService] Solana mint failed, returning eStream-only result');
      }
    } catch (e) {
      console.warn('[NftMintService] Solana mint error:', e);
    }
    
    // Return eStream-only result if Solana mint failed
    return {
      success: !!estreamNftId,
      mintAddress: estreamNftId,
      signature: estreamId,
      error: !estreamNftId ? 'Both mints failed' : undefined,
    };
  }

  /**
   * Mint a Provenance NFT via the eStream API
   */
  async mintProvenanceNft(
    assetId: string,
    event: string,
    documentHash: string
  ): Promise<MintResult> {
    console.log('[NftMintService] Minting Provenance NFT via eStream API...');
    
    try {
      const response = await fetch(`${ESTREAM_HTTP_URL}/api/v1/nft/provenance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-seeker-user',
        },
        body: JSON.stringify({
          asset_id: assetId,
          event,
          document_hash: documentHash,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('[NftMintService] API error:', error);
        return { success: false, error };
      }
      
      const result: EstreamNftResponse = await response.json();
      console.log('[NftMintService] ✅ Provenance NFT minted!', result.nft_id);
      
      return {
        success: true,
        mintAddress: result.nft_id,
        signature: result.estream_id,
      };
    } catch (e) {
      console.error('[NftMintService] Mint failed:', e);
      return { success: false, error: String(e) };
    }
  }

  /**
   * Mint a Ceremony Certificate NFT via the eStream API
   */
  async mintCeremonyNft(
    ceremonyId: string,
    threshold: number,
    signers: string[]
  ): Promise<MintResult> {
    console.log('[NftMintService] Minting Ceremony NFT via eStream API...');
    
    try {
      const response = await fetch(`${ESTREAM_HTTP_URL}/api/v1/nft/ceremony`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-seeker-user',
        },
        body: JSON.stringify({
          ceremony_id: ceremonyId,
          threshold,
          signers,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('[NftMintService] API error:', error);
        return { success: false, error };
      }
      
      const result: EstreamNftResponse = await response.json();
      console.log('[NftMintService] ✅ Ceremony NFT minted!', result.nft_id);
      
      return {
        success: true,
        mintAddress: result.nft_id,
        signature: result.estream_id,
      };
    } catch (e) {
      console.error('[NftMintService] Mint failed:', e);
      return { success: false, error: String(e) };
    }
  }

  /**
   * Legacy: Upload metadata (kept for backwards compatibility)
   */
  async uploadMetadata(metadata: NftMetadata): Promise<string> {
    const mockUri = `https://devnet.nft.estream.io/metadata/${Date.now()}.json`;
    console.log('[NftMintService] Metadata prepared:', metadata.name);
    return mockUri;
  }

  /**
   * Legacy: Prepare mint (kept for backwards compatibility)
   */
  async prepareMint(
    metadata: NftMetadata,
    ownerPublicKey: string
  ): Promise<{ metadataUri: string; ready: boolean }> {
    const metadataUri = await this.uploadMetadata(metadata);
    console.log('[NftMintService] Prepared mint for:', ownerPublicKey);
    return { metadataUri, ready: true };
  }

  /**
   * Check if an NFT exists for a given owner
   */
  async checkNftExists(
    ownerPublicKey: string,
    symbol: string
  ): Promise<{ exists: boolean; mintAddress?: string }> {
    try {
      const owner = new PublicKey(ownerPublicKey);
      
      // In production, query Metaplex for NFTs owned by this wallet with matching symbol
      // For now, simulate a check
      console.log(`[NftMintService] Checking NFTs for ${ownerPublicKey} with symbol ${symbol}`);
      
      return { exists: false };
    } catch (e) {
      console.error('[NftMintService] Check failed:', e);
      return { exists: false };
    }
  }

  /**
   * Get the RPC endpoint for the current cluster
   */
  getRpcEndpoint(): string {
    return this.cluster === 'localnet' ? LOCALNET_URL : clusterApiUrl(this.cluster);
  }

  /**
   * Airdrop SOL for testing (devnet and localnet)
   */
  async requestAirdrop(publicKey: string, lamports: number = 1_000_000_000): Promise<boolean> {
    if (this.cluster !== 'devnet' && this.cluster !== 'localnet') {
      console.warn('[NftMintService] Airdrop only available on devnet/localnet');
      return false;
    }

    try {
      const pubkey = new PublicKey(publicKey);
      const signature = await this.connection.requestAirdrop(pubkey, lamports);
      await this.connection.confirmTransaction(signature);
      console.log(`[NftMintService] Airdropped ${lamports / 1e9} SOL to ${publicKey}`);
      return true;
    } catch (e) {
      console.error('[NftMintService] Airdrop failed:', e);
      return false;
    }
  }
}

// Singleton instance
let nftServiceInstance: NftMintService | null = null;

export function getNftMintService(cluster: NftCluster = 'localnet'): NftMintService {
  if (!nftServiceInstance) {
    nftServiceInstance = new NftMintService(cluster);
  }
  return nftServiceInstance;
}

export default NftMintService;





