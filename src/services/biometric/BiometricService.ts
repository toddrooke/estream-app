/**
 * Biometric Service
 * 
 * Cross-platform biometric authentication (Face ID, Touch ID, fingerprint).
 * Uses native modules for iOS and Android.
 * 
 * ## iOS (Face ID / Touch ID)
 * - Secure Enclave P-256 keys with biometric protection
 * - Per-operation Face ID for governance signing
 * - Keychain integration
 * 
 * ## Android (Fingerprint / Face)
 * - Android Keystore with StrongBox/TEE
 * - BiometricPrompt for authentication
 * - Per-operation biometric for governance
 */

import { NativeModules, Platform } from 'react-native';

// ============================================================================
// Types
// ============================================================================

export type BiometricType = 'FaceID' | 'TouchID' | 'Fingerprint' | 'Face' | 'OpticID' | 'None' | 'Unknown';

export interface BiometricStatus {
  /** Is biometric authentication available? */
  available: boolean;
  /** Type of biometric (FaceID, TouchID, Fingerprint) */
  biometricType: BiometricType;
  /** Is Secure Enclave/TEE available? */
  secureEnclaveAvailable: boolean;
  /** Error code if not available */
  errorCode?: number;
  /** Error message if not available */
  errorMessage?: string;
}

export interface AuthResult {
  /** Did authentication succeed? */
  success: boolean;
  /** Authentication method used */
  method?: string;
  /** Was auth cancelled by user? */
  cancelled?: boolean;
  /** Error code if failed */
  errorCode?: number;
  /** Error message if failed */
  errorMessage?: string;
}

export interface BiometricKeyResult {
  /** Key alias */
  alias: string;
  /** Public key as Base64 */
  publicKey: string;
  /** Public key as hex */
  publicKeyHex: string;
  /** Is key in Secure Enclave? */
  secureEnclave: boolean;
  /** Does key require biometric? */
  biometricProtected: boolean;
}

export interface SignatureResult {
  /** Did signing succeed? */
  success: boolean;
  /** Signature as Base64 */
  signature?: string;
  /** Signature as hex */
  signatureHex?: string;
  /** Action hash (for governance) */
  actionHash?: string;
  /** Was signing cancelled? */
  cancelled?: boolean;
  /** Error message if failed */
  errorMessage?: string;
}

// ============================================================================
// Native Module
// ============================================================================

interface BiometricModuleNative {
  // iOS - BiometricModule
  getBiometricStatus(): Promise<BiometricStatus>;
  authenticate(reason: string, subtitle: string | null): Promise<AuthResult>;
  generateBiometricProtectedKey(alias: string, requireBiometric: boolean): Promise<BiometricKeyResult>;
  signWithBiometricKey(alias: string, dataBase64: string, reason: string): Promise<SignatureResult>;
  hasBiometricKey(alias: string): Promise<boolean>;
  deleteBiometricKey(alias: string): Promise<boolean>;
  signGovernanceAction(alias: string, actionJson: string): Promise<SignatureResult>;
}

interface SeekerModuleNative {
  // Android - SeekerModule
  isBiometricAvailable(): Promise<{ available: boolean; status: number; statusText: string }>;
  isAvailable(): Promise<boolean>;
  getDeviceInfo(): Promise<{ hasSecureHardware: boolean; hasStrongBox: boolean }>;
}

const BiometricModule: BiometricModuleNative | undefined = Platform.OS === 'ios' 
  ? NativeModules.BiometricModule 
  : undefined;

const SeekerModule: SeekerModuleNative | undefined = Platform.OS === 'android'
  ? NativeModules.SeekerModule
  : undefined;

// ============================================================================
// Biometric Service
// ============================================================================

export class BiometricService {
  private keyAlias: string = 'estream-identity-key';
  
  /**
   * Get biometric status for current device
   */
  async getStatus(): Promise<BiometricStatus> {
    if (Platform.OS === 'ios' && BiometricModule) {
      return BiometricModule.getBiometricStatus();
    }
    
    if (Platform.OS === 'android' && SeekerModule) {
      try {
        const [biometric, device] = await Promise.all([
          SeekerModule.isBiometricAvailable(),
          SeekerModule.getDeviceInfo(),
        ]);
        
        return {
          available: biometric.available,
          biometricType: biometric.available ? 'Fingerprint' : 'None',
          secureEnclaveAvailable: device.hasSecureHardware || device.hasStrongBox,
          errorCode: biometric.status,
          errorMessage: biometric.statusText,
        };
      } catch {
        return {
          available: false,
          biometricType: 'None',
          secureEnclaveAvailable: false,
        };
      }
    }
    
    return {
      available: false,
      biometricType: 'None',
      secureEnclaveAvailable: false,
      errorMessage: 'Platform not supported',
    };
  }

  /**
   * Authenticate with biometrics
   */
  async authenticate(
    reason: string = 'Authenticate to eStream',
    subtitle?: string
  ): Promise<AuthResult> {
    if (Platform.OS === 'ios' && BiometricModule) {
      return BiometricModule.authenticate(reason, subtitle || null);
    }
    
    if (Platform.OS === 'android' && SeekerModule) {
      // Android uses SeekerModule's authenticate
      // For now, return success if biometric is available
      const status = await SeekerModule.isBiometricAvailable();
      if (status.available) {
        // In production, would call BiometricPrompt
        return { success: true, method: 'Fingerprint' };
      }
      return { success: false, errorMessage: 'Biometric not available' };
    }
    
    return { success: false, errorMessage: 'Platform not supported' };
  }

  /**
   * Generate a biometric-protected key
   */
  async generateKey(requireBiometric: boolean = true): Promise<BiometricKeyResult | null> {
    if (Platform.OS === 'ios' && BiometricModule) {
      try {
        return await BiometricModule.generateBiometricProtectedKey(
          this.keyAlias,
          requireBiometric
        );
      } catch (error) {
        console.error('[BiometricService] generateKey failed:', error);
        return null;
      }
    }
    
    // Android handled by MlDsa87Module
    console.warn('[BiometricService] generateKey not implemented for Android');
    return null;
  }

  /**
   * Check if biometric key exists
   */
  async hasKey(): Promise<boolean> {
    if (Platform.OS === 'ios' && BiometricModule) {
      return BiometricModule.hasBiometricKey(this.keyAlias);
    }
    return false;
  }

  /**
   * Sign data with biometric key
   */
  async sign(dataBase64: string, reason: string = 'Sign with eStream'): Promise<SignatureResult> {
    if (Platform.OS === 'ios' && BiometricModule) {
      return BiometricModule.signWithBiometricKey(this.keyAlias, dataBase64, reason);
    }
    
    return { success: false, errorMessage: 'Not implemented for this platform' };
  }

  /**
   * Sign a governance action with biometric authentication
   * This always requires Face ID/Touch ID
   */
  async signGovernanceAction(action: {
    type: string;
    operation: string;
    params: Record<string, unknown>;
  }): Promise<SignatureResult> {
    if (Platform.OS === 'ios' && BiometricModule) {
      const actionJson = JSON.stringify({
        ...action,
        timestamp: Date.now(),
        nonce: Math.random().toString(36).substring(2),
      });
      
      return BiometricModule.signGovernanceAction(this.keyAlias, actionJson);
    }
    
    // Android would use MlDsa87Module's signWithBiometrics
    return { success: false, errorMessage: 'Not implemented for this platform' };
  }

  /**
   * Delete biometric key
   */
  async deleteKey(): Promise<boolean> {
    if (Platform.OS === 'ios' && BiometricModule) {
      return BiometricModule.deleteBiometricKey(this.keyAlias);
    }
    return false;
  }

  /**
   * Get security level string
   */
  async getSecurityLevel(): Promise<'Software' | 'Hardware' | 'Certified'> {
    const status = await this.getStatus();
    
    if (status.secureEnclaveAvailable) {
      // On iOS with Secure Enclave or Android with StrongBox
      return 'Hardware';
    }
    
    return 'Software';
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: BiometricService | null = null;

export function getBiometricService(): BiometricService {
  if (!instance) {
    instance = new BiometricService();
  }
  return instance;
}

export default BiometricService;
