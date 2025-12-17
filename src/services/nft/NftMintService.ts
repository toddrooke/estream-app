/**
 * NFT Minting Service
 * 
 * Creates and manages eStream and TakeTitle NFTs using Metaplex.
 * Uses devnet for testing, mainnet-beta for production.
 */

import { Connection, PublicKey, Keypair, clusterApiUrl } from '@solana/web3.js';

export type NftCluster = 'devnet' | 'testnet' | 'mainnet-beta';

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
  error?: string;
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

  constructor(cluster: NftCluster = 'devnet') {
    this.cluster = cluster;
    this.connection = new Connection(clusterApiUrl(cluster));
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
   * Upload metadata to a decentralized storage (simulated for devnet)
   * 
   * In production, this would upload to Arweave via Bundlr/Irys
   * For devnet testing, we use a mock endpoint
   */
  async uploadMetadata(metadata: NftMetadata): Promise<string> {
    // For devnet testing, return a mock URI
    // In production, upload to Arweave
    const mockUri = `https://devnet.nft.estream.io/metadata/${Date.now()}.json`;
    
    console.log('[NftMintService] Metadata prepared:', metadata.name);
    console.log('[NftMintService] Mock URI:', mockUri);
    
    // In production:
    // const uri = await bundlr.upload(JSON.stringify(metadata));
    
    return mockUri;
  }

  /**
   * Mint an NFT (requires server-side signing or MWA integration)
   * 
   * For React Native, we need to either:
   * 1. Call a backend API that handles minting
   * 2. Use MWA to sign the mint transaction
   * 
   * This method prepares the mint but requires a signer.
   */
  async prepareMint(
    metadata: NftMetadata,
    ownerPublicKey: string
  ): Promise<{ metadataUri: string; ready: boolean }> {
    const metadataUri = await this.uploadMetadata(metadata);
    
    console.log('[NftMintService] Prepared mint for:', ownerPublicKey);
    console.log('[NftMintService] Metadata URI:', metadataUri);
    
    return {
      metadataUri,
      ready: true,
    };
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
    return clusterApiUrl(this.cluster);
  }

  /**
   * Airdrop SOL for testing (devnet only)
   */
  async requestAirdrop(publicKey: string, lamports: number = 1_000_000_000): Promise<boolean> {
    if (this.cluster !== 'devnet') {
      console.warn('[NftMintService] Airdrop only available on devnet');
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

export function getNftMintService(cluster: NftCluster = 'devnet'): NftMintService {
  if (!nftServiceInstance) {
    nftServiceInstance = new NftMintService(cluster);
  }
  return nftServiceInstance;
}

export default NftMintService;


