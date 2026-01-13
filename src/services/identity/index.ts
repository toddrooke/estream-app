/**
 * Identity Service exports
 */

// Native eStream Identity (lattice-based, recommended)
export {
  NativeIdentityService,
  getNativeIdentityService,
} from './NativeIdentityService';

export type {
  NativeIdentityParams,
  NativeIdentityResult,
} from './NativeIdentityService';

// Solana NFT Identity (optional, for on-chain visibility)
export {
  IdentityNftService,
  getIdentityNftService,
} from './IdentityNftService';

export type {
  SolanaCluster,
  IdentityNftParams,
  IdentityNftResult,
  IdentityInfo,
} from './IdentityNftService';
