/**
 * MPC Escrow Service
 * 
 * TypeScript wrapper for the native MPC escrow functionality in estream-quic-native.
 * Provides Shamir Secret Sharing and threshold operations for Seeker devices.
 * 
 * ## Security Note
 * 
 * All cryptographic operations are performed in native Rust code.
 * This TypeScript layer is only for orchestration and UI integration.
 */

import { NativeModules, Platform } from 'react-native';
import { TrustLevel } from '@/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Unique identifier for a shard holder (e.g., Seeker device)
 */
export interface ShardHolderId {
  /** 32-byte identifier (hex encoded) */
  id: string;
}

/**
 * A single shard of a secret
 */
export interface KeyShard {
  /** Unique shard identifier (hex) */
  shardId: string;
  /** Index in the polynomial (1-indexed) */
  index: number;
  /** Encrypted shard data (base64) */
  encryptedData: string;
  /** KEM ciphertext for decryption (base64) */
  kemCiphertext: string;
  /** Commitment to the shard (hex) */
  commitment: string;
  /** ID of the intended holder */
  holderId: ShardHolderId;
}

/**
 * Configuration for MPC escrow
 */
export interface EscrowConfig {
  /** Number of shards required to reconstruct (k) */
  threshold: number;
  /** Total number of shards (n) */
  totalShards: number;
  /** Time-lock release timestamp (0 = no time lock) */
  timeLockUntil?: number;
  /** Epoch for key rotation */
  epoch?: number;
  /** Purpose/label for the escrow */
  label?: string;
}

/**
 * Result of shard generation
 */
export interface ShardingResult {
  /** The generated shards */
  shards: KeyShard[];
  /** Escrow ID for tracking (hex) */
  escrowId: string;
  /** Public verification data */
  verificationData: VerificationData;
}

/**
 * Data used to verify shard validity
 */
export interface VerificationData {
  /** Commitments to polynomial coefficients (hex array) */
  coefficientCommitments: string[];
  /** Hash of the original secret (hex) */
  secretHash: string;
  /** Threshold required */
  threshold: number;
}

/**
 * Time-lock parameters
 */
export interface TimeLock {
  /** Release timestamp (Unix seconds) */
  releaseAt: number;
  /** Time-lock puzzle difficulty */
  puzzleDifficulty: number;
  /** Encrypted key (base64) */
  timeLockedKey: string;
}

/**
 * Threshold signature share from a participant
 */
export interface SignatureShare {
  /** Shard holder who created this share */
  holderId: ShardHolderId;
  /** The partial signature (base64) */
  partialSignature: string;
  /** Proof of correct computation (base64) */
  proof: string;
}

/**
 * Escrow operation status
 */
export enum EscrowStatus {
  Created = 'created',
  ShardsDistributed = 'shards_distributed',
  ReconstructionPending = 'reconstruction_pending',
  Reconstructed = 'reconstructed',
  TimeLocked = 'time_locked',
  Expired = 'expired',
}

// ============================================================================
// Native Module Interface
// ============================================================================

interface MpcEscrowNativeModule {
  // Shard creation
  createShards(
    secretB64: string,
    config: string,          // JSON EscrowConfig
    holderPublicKeys: string // JSON { [holderId]: publicKeyB64 }
  ): Promise<string>;        // JSON ShardingResult

  // Shard decryption (for this device)
  decryptShard(
    shardJson: string,       // JSON KeyShard
    secretKeyB64: string     // Device's Kyber secret key
  ): Promise<string>;        // Base64 decrypted shard data

  // Secret reconstruction
  reconstruct(
    decryptedShardsJson: string,  // JSON Array<{ index: number, data: string }>
    verificationDataJson: string, // JSON VerificationData
    config: string                // JSON EscrowConfig
  ): Promise<string>;             // Base64 reconstructed secret

  // Time-lock operations
  createTimeLock(
    secretB64: string,
    releaseAt: number,
    puzzleDifficulty: number
  ): Promise<string>;        // JSON TimeLock

  isTimeLockExpired(
    timeLockJson: string,    // JSON TimeLock
    currentTime: number
  ): Promise<boolean>;

  // Threshold signing
  createSignatureShare(
    shardData: string,       // Base64 decrypted shard
    messageB64: string       // Message to sign
  ): Promise<string>;        // JSON SignatureShare

  combineSignatureShares(
    sharesJson: string,      // JSON Array<SignatureShare>
    messageB64: string,
    threshold: number
  ): Promise<string>;        // Base64 combined signature
}

// Get native module
const MpcEscrowModule: MpcEscrowNativeModule | null =
  Platform.OS === 'android' ? NativeModules.MpcEscrowModule : null;

// ============================================================================
// Constants
// ============================================================================

/** Minimum threshold (k) for shard reconstruction */
export const MIN_THRESHOLD = 2;

/** Maximum number of total shards */
export const MAX_SHARDS = 7;

/** Default epoch duration in seconds (24 hours) */
export const EPOCH_DURATION_SECS = 86400;

// ============================================================================
// MPC Escrow Service
// ============================================================================

/**
 * MPC Escrow Service for managing key sharding on Seeker devices.
 * 
 * This service orchestrates multi-party computation for:
 * - Splitting secrets into shards for distribution
 * - Threshold reconstruction requiring k-of-n shards
 * - Time-locked release mechanisms
 * - Threshold signature coordination
 */
export class MpcEscrowService {
  private isAvailable: boolean = false;

  constructor() {
    this.isAvailable = MpcEscrowModule !== null;
  }

  /**
   * Check if MPC escrow functionality is available.
   */
  async checkAvailability(): Promise<boolean> {
    if (!MpcEscrowModule) {
      console.warn('[MpcEscrow] Native module not available');
      return false;
    }
    return true;
  }

  /**
   * Create shards from a secret for distribution to holders.
   * 
   * @param secret - The secret to shard (Uint8Array)
   * @param config - Escrow configuration
   * @param holderPublicKeys - Map of holder IDs to their Kyber1024 public keys
   * @returns ShardingResult with encrypted shards for each holder
   */
  async createShards(
    secret: Uint8Array,
    config: EscrowConfig,
    holderPublicKeys: Map<string, Uint8Array>
  ): Promise<ShardingResult> {
    if (!MpcEscrowModule) {
      throw new Error('MPC escrow not available');
    }

    // Validate config
    this.validateConfig(config);

    if (holderPublicKeys.size !== config.totalShards) {
      throw new Error(`Expected ${config.totalShards} holder keys, got ${holderPublicKeys.size}`);
    }

    // Convert to base64/JSON for native
    const secretB64 = Buffer.from(secret).toString('base64');
    const configJson = JSON.stringify(config);
    
    const holdersObj: Record<string, string> = {};
    holderPublicKeys.forEach((pk, id) => {
      holdersObj[id] = Buffer.from(pk).toString('base64');
    });
    const holdersJson = JSON.stringify(holdersObj);

    try {
      const resultJson = await MpcEscrowModule.createShards(
        secretB64,
        configJson,
        holdersJson
      );
      return JSON.parse(resultJson) as ShardingResult;
    } catch (error) {
      console.error('[MpcEscrow] Failed to create shards:', error);
      throw error;
    }
  }

  /**
   * Decrypt a shard using this device's secret key.
   * 
   * @param shard - The encrypted shard
   * @param secretKey - This device's Kyber1024 secret key
   * @returns Decrypted shard data
   */
  async decryptShard(
    shard: KeyShard,
    secretKey: Uint8Array
  ): Promise<Uint8Array> {
    if (!MpcEscrowModule) {
      throw new Error('MPC escrow not available');
    }

    const shardJson = JSON.stringify(shard);
    const skB64 = Buffer.from(secretKey).toString('base64');

    try {
      const dataB64 = await MpcEscrowModule.decryptShard(shardJson, skB64);
      return Uint8Array.from(Buffer.from(dataB64, 'base64'));
    } catch (error) {
      console.error('[MpcEscrow] Failed to decrypt shard:', error);
      throw error;
    }
  }

  /**
   * Reconstruct a secret from decrypted shards.
   * 
   * @param decryptedShards - Array of (index, data) pairs
   * @param verificationData - Verification data from shard creation
   * @param config - Original escrow configuration
   * @returns The reconstructed secret
   */
  async reconstruct(
    decryptedShards: Array<{ index: number; data: Uint8Array }>,
    verificationData: VerificationData,
    config: EscrowConfig
  ): Promise<Uint8Array> {
    if (!MpcEscrowModule) {
      throw new Error('MPC escrow not available');
    }

    if (decryptedShards.length < verificationData.threshold) {
      throw new Error(
        `Insufficient shards: got ${decryptedShards.length}, need ${verificationData.threshold}`
      );
    }

    // Convert to JSON
    const shardsJson = JSON.stringify(
      decryptedShards.map(s => ({
        index: s.index,
        data: Buffer.from(s.data).toString('base64'),
      }))
    );
    const verificationJson = JSON.stringify(verificationData);
    const configJson = JSON.stringify(config);

    try {
      const secretB64 = await MpcEscrowModule.reconstruct(
        shardsJson,
        verificationJson,
        configJson
      );
      return Uint8Array.from(Buffer.from(secretB64, 'base64'));
    } catch (error) {
      console.error('[MpcEscrow] Failed to reconstruct secret:', error);
      throw error;
    }
  }

  /**
   * Create a time-locked escrow.
   * 
   * @param secret - The secret to time-lock
   * @param releaseAt - Unix timestamp when lock expires
   * @param puzzleDifficulty - Computational difficulty (higher = more secure)
   * @returns TimeLock parameters
   */
  async createTimeLock(
    secret: Uint8Array,
    releaseAt: number,
    puzzleDifficulty: number = 1000
  ): Promise<TimeLock> {
    if (!MpcEscrowModule) {
      throw new Error('MPC escrow not available');
    }

    const secretB64 = Buffer.from(secret).toString('base64');

    try {
      const resultJson = await MpcEscrowModule.createTimeLock(
        secretB64,
        releaseAt,
        puzzleDifficulty
      );
      return JSON.parse(resultJson) as TimeLock;
    } catch (error) {
      console.error('[MpcEscrow] Failed to create time lock:', error);
      throw error;
    }
  }

  /**
   * Check if a time lock has expired.
   * 
   * @param timeLock - The time lock to check
   * @param currentTime - Current Unix timestamp (defaults to now)
   * @returns true if the lock has expired
   */
  async isTimeLockExpired(
    timeLock: TimeLock,
    currentTime?: number
  ): Promise<boolean> {
    if (!MpcEscrowModule) {
      throw new Error('MPC escrow not available');
    }

    const now = currentTime ?? Math.floor(Date.now() / 1000);
    const timeLockJson = JSON.stringify(timeLock);

    try {
      return await MpcEscrowModule.isTimeLockExpired(timeLockJson, now);
    } catch (error) {
      console.error('[MpcEscrow] Failed to check time lock:', error);
      throw error;
    }
  }

  /**
   * Create a signature share using a decrypted shard.
   * 
   * @param shardData - Decrypted shard data
   * @param message - Message to sign
   * @returns SignatureShare for combining
   */
  async createSignatureShare(
    shardData: Uint8Array,
    message: Uint8Array
  ): Promise<SignatureShare> {
    if (!MpcEscrowModule) {
      throw new Error('MPC escrow not available');
    }

    const shardB64 = Buffer.from(shardData).toString('base64');
    const messageB64 = Buffer.from(message).toString('base64');

    try {
      const resultJson = await MpcEscrowModule.createSignatureShare(
        shardB64,
        messageB64
      );
      return JSON.parse(resultJson) as SignatureShare;
    } catch (error) {
      console.error('[MpcEscrow] Failed to create signature share:', error);
      throw error;
    }
  }

  /**
   * Combine signature shares into a final signature.
   * 
   * @param shares - Collected signature shares
   * @param message - Original message that was signed
   * @param threshold - Required number of shares
   * @returns Combined signature
   */
  async combineSignatureShares(
    shares: SignatureShare[],
    message: Uint8Array,
    threshold: number
  ): Promise<Uint8Array> {
    if (!MpcEscrowModule) {
      throw new Error('MPC escrow not available');
    }

    if (shares.length < threshold) {
      throw new Error(
        `Insufficient shares: got ${shares.length}, need ${threshold}`
      );
    }

    const sharesJson = JSON.stringify(shares);
    const messageB64 = Buffer.from(message).toString('base64');

    try {
      const signatureB64 = await MpcEscrowModule.combineSignatureShares(
        sharesJson,
        messageB64,
        threshold
      );
      return Uint8Array.from(Buffer.from(signatureB64, 'base64'));
    } catch (error) {
      console.error('[MpcEscrow] Failed to combine signature shares:', error);
      throw error;
    }
  }

  /**
   * Validate escrow configuration.
   */
  private validateConfig(config: EscrowConfig): void {
    if (config.threshold < MIN_THRESHOLD) {
      throw new Error(`Threshold must be at least ${MIN_THRESHOLD}`);
    }
    if (config.totalShards > MAX_SHARDS) {
      throw new Error(`Total shards cannot exceed ${MAX_SHARDS}`);
    }
    if (config.threshold > config.totalShards) {
      throw new Error('Threshold cannot exceed total shards');
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _escrowService: MpcEscrowService | null = null;

/**
 * Get the MPC escrow service instance.
 */
export function getMpcEscrowService(): MpcEscrowService {
  if (!_escrowService) {
    _escrowService = new MpcEscrowService();
  }
  return _escrowService;
}


