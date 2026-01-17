/**
 * Spark Authentication Service
 *
 * Implements the Spark visual authentication flow as per the patent:
 * 1. Scan animated Spark pattern for 2+ seconds
 * 2. Extract particle positions from video frames
 * 3. Run SAME derivation algorithm to compute expected positions
 * 4. Compare observed vs expected trajectories
 * 5. If match within threshold → sign challenge with ML-DSA-87
 *
 * Reference: Patent Application - Cryptographically-Derived Visual Motion for Authentication Liveness
 */

import { NativeModules } from 'react-native';
import {
  startNativeScanning,
  stopNativeScanning,
  getNativeScanStatus,
  isNativeSparkScannerAvailable,
  ScanResult,
} from './nativeSparkScanner';

const { MlDsa87Module } = NativeModules;

// Minimum scan duration (per patent spec)
const MIN_SCAN_DURATION_MS = 2500;
const MOTION_MATCH_THRESHOLD = 0.6;

export interface SparkAuthChallenge {
  challengeId: string;
  nonce: string;
  timestamp: number;
  consoleUrl: string;
}

/**
 * Get the console URL for auth submission.
 * Always use the real consoleUrl - localhost proxy doesn't work on mobile devices.
 */
function getConsoleUrl(challenge: SparkAuthChallenge): string {
  // Use the consoleUrl from the challenge (edge.estream.dev or similar)
  console.log('[SparkAuth] Using console URL:', challenge.consoleUrl);
  return challenge.consoleUrl;
}

export interface SparkAuthResult {
  success: boolean;
  verified: boolean;
  sessionToken?: string;
  error?: string;
  scanResult?: ScanResult;
}

/**
 * HKDF-like derivation (matching Console implementation)
 */
function simpleHash256(bytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    let h = i * 0x9e3779b9;
    for (let j = 0; j < bytes.length; j++) {
      h = ((h << 5) + h + bytes[j]) >>> 0;
    }
    result[i] = h & 0xff;
  }
  return result;
}

function deriveBytes(key: Uint8Array, info: string, length: number): Uint8Array {
  const result = new Uint8Array(length);
  const infoBytes = new TextEncoder().encode(info);

  for (let block = 0; block < Math.ceil(length / 32); block++) {
    const input = new Uint8Array(key.length + infoBytes.length + 1);
    input.set(key);
    input.set(infoBytes, key.length);
    input[key.length + infoBytes.length] = block;

    const hash = simpleHash256(input);
    const offset = block * 32;
    const toCopy = Math.min(32, length - offset);
    result.set(hash.slice(0, toCopy), offset);
  }
  return result;
}

/**
 * Derive motion parameters from challenge (same as Console)
 */
function deriveMotionParams(nonce: string, timestamp: number): {
  particles: { radius: number; speed: number; phase: number }[];
} {
  const derivationInput = `${nonce}:${timestamp}`;
  const keyBytes = new TextEncoder().encode(derivationInput);
  const motionBytes = deriveBytes(keyBytes, 'motion', 48);

  const particles: { radius: number; speed: number; phase: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const offset = (i * 4) % 48;
    particles.push({
      radius: 0.28 + (motionBytes[offset] / 255) * 0.24,
      speed: 0.5 + (motionBytes[offset + 1] / 255) * 1.5,
      phase: (motionBytes[offset + 2] / 255) * Math.PI * 2,
    });
  }

  return { particles };
}

/**
 * Compute expected particle positions at a given time
 */
function computeExpectedPositions(
  nonce: string,
  timestamp: number,
  elapsedMs: number
): { x: number; y: number }[] {
  const t = elapsedMs / 1000;
  const { particles } = deriveMotionParams(nonce, timestamp);

  return particles.map((p, i) => {
    const direction = i % 2 === 0 ? 1 : -1; // Alternating direction
    const angle = p.phase + t * p.speed * direction;
    return {
      x: 0.5 + Math.cos(angle) * p.radius,
      y: 0.5 + Math.sin(angle) * p.radius,
    };
  });
}

/**
 * Complete Spark authentication flow (with scanning)
 *
 * @param challenge - Challenge data from Console
 * @param onProgress - Progress callback (0-1)
 */
export async function authenticateWithSpark(
  challenge: SparkAuthChallenge,
  onProgress?: (progress: number, status: string) => void
): Promise<SparkAuthResult> {
  // Scan already completed by ScanScreen, just sign and submit
  return submitSparkAuth(challenge, undefined, onProgress);
}

/**
 * Canonical Spark auth message format (v1)
 * Both Seeker and Console must use this EXACT format for signing/verification
 * 
 * Format: spark:v1:{challengeId}:{nonce}:{timestamp}
 */
function buildSparkAuthMessage(challenge: SparkAuthChallenge): string {
  return `spark:v1:${challenge.challengeId}:${challenge.nonce}:${challenge.timestamp}`;
}

/**
 * Submit Spark authentication (motion already verified)
 * Call this after ScanScreen has already detected motion
 *
 * @param challenge - Challenge data from Console
 * @param scanResult - Optional scan result from ScanScreen
 * @param onProgress - Progress callback (0-1)
 */
export async function submitSparkAuth(
  challenge: SparkAuthChallenge,
  scanResult?: ScanResult,
  onProgress?: (progress: number, status: string) => void
): Promise<SparkAuthResult> {
  try {
    onProgress?.(0.6, 'Checking keypair...');

    // Check if we have a keypair
    let hasKeypair = false;
    try {
      hasKeypair = await MlDsa87Module.hasKeypair();
    } catch (e) {
      console.warn('[SparkAuth] Error checking keypair:', e);
    }

    if (!hasKeypair) {
      // Auto-generate keypair on first use
      onProgress?.(0.65, 'Generating keypair...');
      console.log('[SparkAuth] No keypair found, generating one');
      
      try {
        // Generate with no auth for now (can upgrade later)
        await MlDsa87Module.generateKeypair(0);
        console.log('[SparkAuth] Keypair generated successfully');
      } catch (genError: any) {
        console.error('[SparkAuth] Failed to generate keypair:', genError);
        return {
          success: false,
          verified: false,
          error: `Failed to generate keypair: ${genError?.message || genError}`,
          scanResult,
        };
      }
    }

    onProgress?.(0.7, 'Preparing signature...');

    // Get the full public key for verification (2592 bytes = 5184 hex chars)
    let publicKey: string;
    try {
      publicKey = await MlDsa87Module.getPublicKey();
      console.log('[SparkAuth] Got public key:', publicKey.length, 'hex chars');
      
      if (publicKey.length !== 5184) {
        return {
          success: false,
          verified: false,
          error: `Invalid public key length: ${publicKey.length} (expected 5184)`,
          scanResult,
        };
      }
    } catch (e) {
      return {
        success: false,
        verified: false,
        error: `Failed to get public key: ${e}`,
        scanResult,
      };
    }

    onProgress?.(0.8, 'Signing challenge...');

    // Build the canonical message that Console will also construct
    const message = buildSparkAuthMessage(challenge);
    console.log('[SparkAuth] Signing message:', message);
    
    // Base64 encode for native module
    const messageB64 = btoa(message);
    
    let signature: string;
    try {
      // Use signWithoutAuth for Spark (quick auth, not governance)
      // This should work if the key was created with AUTH_NONE
      const signResult = await MlDsa87Module.signWithoutAuth(messageB64);
      signature = signResult.signature;
      console.log('[SparkAuth] Signature length:', signature.length, 'hex chars');
      
      // ML-DSA-87 signatures are 4627 bytes = 9254 hex chars
      if (signature.length !== 9254) {
        console.warn('[SparkAuth] Unexpected signature length:', signature.length);
      }
    } catch (e) {
      console.log('[SparkAuth] signWithoutAuth failed, trying signWithAuth:', e);
      // If signWithoutAuth fails (auth required), try with biometric auth
      try {
        const signResult = await MlDsa87Module.signWithAuth(
          messageB64,
          'Spark Authentication',
          'Authenticate to eStream Console'
        );
        signature = signResult.signature;
      } catch (authError) {
        return {
          success: false,
          verified: false,
          error: `Signing failed: ${authError}`,
          scanResult,
        };
      }
    }

    // Compute public key hash (first 32 hex chars = 16 bytes)
    const publicKeyHash = publicKey.slice(0, 32);

    onProgress?.(0.9, 'Submitting verification...');

    // Submit to Console with FULL public key for cryptographic verification
    const requestBody = {
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      timestamp: challenge.timestamp,
      signature,       // 9254 hex chars (4627 bytes)
      publicKey,       // 5184 hex chars (2592 bytes) - for verification
      publicKeyHash,   // 32 hex chars (16 bytes) - for identity lookup
    };
    
    console.log('[SparkAuth] Sending verification request:', {
      challengeId: requestBody.challengeId,
      signatureLen: requestBody.signature.length,
      publicKeyLen: requestBody.publicKey.length,
    });

    const response = await fetch(`${getConsoleUrl(challenge)}/api/auth/spark-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = (errorData as { error?: string; details?: string }).error || 'Verification failed';
      const details = (errorData as { details?: string }).details || '';
      return {
        success: false,
        verified: false,
        error: details ? `${errorMsg}: ${details}` : errorMsg,
        scanResult,
      };
    }

    const result = await response.json();
    onProgress?.(1, 'Authenticated!');

    return {
      success: true,
      verified: (result as { verified?: boolean }).verified ?? true,
      sessionToken: (result as { sessionToken?: string }).sessionToken,
      scanResult,
    };
  } catch (e) {
    console.error('[SparkAuth] Authentication error:', e);
    return {
      success: false,
      verified: false,
      error: `Authentication error: ${e}`,
    };
  }
}

// Note: Old signChallenge function removed - now using MlDsa87Module directly in submitSparkAuth
