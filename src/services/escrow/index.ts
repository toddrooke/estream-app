/**
 * Escrow Services
 * 
 * Multi-Party Computation (MPC) escrow functionality for secure key sharding.
 */

export {
  MpcEscrowService,
  getMpcEscrowService,
  type EscrowConfig,
  type KeyShard,
  type ShardHolderId,
  type ShardingResult,
  type VerificationData,
  type TimeLock,
  type SignatureShare,
  EscrowStatus,
  MIN_THRESHOLD,
  MAX_SHARDS,
  EPOCH_DURATION_SECS,
} from './MpcEscrowService';


