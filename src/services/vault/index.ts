/**
 * Vault Module - Key storage and signing abstraction.
 * 
 * Export hierarchy:
 * - VaultService interface
 * - Platform-specific implementations
 * - React context and hooks
 */

// Interface and factory
export { 
  VaultService, 
  AttestationData, 
  getVaultService 
} from './VaultService';

// Implementations
export { SeekerVaultService } from './SeekerVaultService';
export { KeychainVaultService } from './KeychainVaultService';
export { SoftwareVaultService } from './SoftwareVaultService';

// React integration
export { 
  VaultProvider, 
  useVault, 
  useSignedApi, 
  useTrustBadge 
} from './VaultContext';

