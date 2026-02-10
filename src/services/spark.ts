/**
 * Spark Service
 * 
 * eStream-native Spark scanner and verifier.
 * Uses deterministic derivation matching Mission Control's spark.ts.
 * 
 * Note: Uses simpler hash implementation for React Native compatibility.
 * The derivation must match Mission Control exactly for liveness verification.
 */

const PI = Math.PI;
const PARTICLE_COUNT = 12;
const MIN_CAPTURE_DURATION_MS = 2000;
const MIN_CAPTURE_FRAMES = 60;
const LIVENESS_THRESHOLD = 0.80;

// ============================================================================
// Types
// ============================================================================

export interface Point {
  x: number;
  y: number;
}

export interface CapturedFrame {
  timestamp: number;
  particles: Point[];
  hue: number;
  brightness: number;
}

export interface SparkResolution {
  version: number;
  code: string;
  pubkey: string;
  payload: {
    type: string;
    inviteCode?: string;
    orgId?: string;
    [key: string]: any;
  };
  createdAt: number;
  expiresAt: number;
}

export interface VerificationResult {
  valid: boolean;
  livenessScore: number;
  trajectoryScore: number;
  frameCount: number;
  durationMs: number;
  errors: string[];
}

interface ParticleParams {
  radius: number;
  speed: number;
  phase: number;
  wobble: number;
  direction: number;
}

// ============================================================================
// Motion Derivation (matches Mission Control's spark.ts)
// ============================================================================

/**
 * Derive motion seed from public key and timestamp
 * This mirrors the Mission Control renderer
 */
export function deriveMotionSeed(pubkeyBytes: Uint8Array, timestamp: number): Uint8Array {
  // Use the same deriveBytes function as Mission Control
  return deriveBytes(pubkeyBytes.slice(0, 64), 'spark-motion-' + timestamp, 64);
}

/**
 * Simple hash for deterministic derivation (matches Mission Control)
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

/**
 * Derive bytes using HKDF-like expansion (matches Mission Control)
 */
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
 * Derive parameters for a specific particle
 */
export function deriveParticleParams(motionKey: Uint8Array, particleId: number): ParticleParams {
  const offset = (particleId * 5) % 60;
  
  return {
    radius: 60 + (motionKey[offset] / 255) * 50,
    speed: 0.3 + (motionKey[offset + 1] / 255) * 0.8,
    phase: (motionKey[offset + 2] / 255) * PI * 2,
    wobble: (motionKey[offset + 4] / 255) * 0.3,
    direction: particleId % 2 === 0 ? 1 : -1,
  };
}

/**
 * Get expected particle position at time t (normalized 0-1)
 */
export function getExpectedPosition(params: ParticleParams, elapsedMs: number): Point {
  const t = elapsedMs / 1000;
  const angle = params.phase + t * params.speed * params.direction;
  
  // Add subtle wobble (matches Mission Control)
  const wobbleX = Math.sin(t * 2.3) * params.wobble * 10;
  const wobbleY = Math.cos(t * 1.7) * params.wobble * 10;
  
  // Center is at 150 (half of 300px canvas), normalize to 0-1
  const centerX = 150 + Math.cos(angle) * params.radius + wobbleX;
  const centerY = 150 + Math.sin(angle) * params.radius + wobbleY;
  
  return {
    x: centerX / 300,
    y: centerY / 300,
  };
}

// ============================================================================
// Spark Resolver
// ============================================================================

/**
 * Resolve a Spark code from the eStream server
 */
export async function resolveSparkCode(
  code: string,
  serverUrl: string = 'https://edge.estream.dev'
): Promise<SparkResolution | null> {
  try {
    const response = await fetch(`${serverUrl}/spark/${code}`);
    if (!response.ok) {
      console.warn('[SparkService] Resolution failed:', response.status);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('[SparkService] Resolution error:', error);
    return null;
  }
}

// ============================================================================
// Liveness Verification
// ============================================================================

/**
 * Verify liveness by comparing observed motion to expected
 */
export function verifyLiveness(
  frames: CapturedFrame[],
  pubkeyBase64: string,
  timestamp: number
): VerificationResult {
  const errors: string[] = [];
  
  // Decode pubkey
  const pubkeyBytes = base64ToBytes(pubkeyBase64);
  
  // Derive motion key (matching Mission Control's createParticles)
  const motionKey = deriveBytes(pubkeyBytes.slice(0, 64), 'spark-motion-' + timestamp, 64);
  
  // Get particle params
  const particles: ParticleParams[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(deriveParticleParams(motionKey, i));
  }
  
  // Check frame count
  if (frames.length < MIN_CAPTURE_FRAMES) {
    errors.push(`Insufficient frames: ${frames.length} < ${MIN_CAPTURE_FRAMES}`);
  }
  
  // Check duration
  const duration = frames.length > 1
    ? frames[frames.length - 1].timestamp - frames[0].timestamp
    : 0;
  
  if (duration < MIN_CAPTURE_DURATION_MS) {
    errors.push(`Capture too short: ${duration}ms < ${MIN_CAPTURE_DURATION_MS}ms`);
  }
  
  // Calculate trajectory match score
  let matches = 0;
  let total = 0;
  
  const startTime = frames[0]?.timestamp || 0;
  
  for (const frame of frames) {
    const elapsed = frame.timestamp - startTime;
    
    for (let i = 0; i < Math.min(frame.particles.length, PARTICLE_COUNT); i++) {
      const observed = frame.particles[i];
      const expected = getExpectedPosition(particles[i], elapsed);
      
      const distance = Math.sqrt(
        (observed.x - expected.x) ** 2 +
        (observed.y - expected.y) ** 2
      );
      
      // Match if within 10% of canvas
      if (distance < 0.1) {
        matches++;
      }
      total++;
    }
  }
  
  const trajectoryScore = total > 0 ? matches / total : 0;
  
  if (trajectoryScore < LIVENESS_THRESHOLD) {
    errors.push(`Trajectory mismatch: ${(trajectoryScore * 100).toFixed(1)}% < ${LIVENESS_THRESHOLD * 100}%`);
  }
  
  return {
    valid: errors.length === 0,
    livenessScore: trajectoryScore,
    trajectoryScore,
    frameCount: frames.length,
    durationMs: duration,
    errors,
  };
}

// ============================================================================
// Device Registration
// ============================================================================

/**
 * Complete device registration after scanning Spark
 */
export async function completeDeviceRegistration(
  resolution: SparkResolution,
  devicePubkey: string,
  deviceName?: string,
  serverUrl: string = 'https://edge.estream.dev'
): Promise<{ success: boolean; deviceId?: string; error?: string }> {
  try {
    const response = await fetch(`${serverUrl}/api/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inviteCode: resolution.payload.inviteCode,
        devicePubkey,
        deviceName,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }
    
    const data = await response.json();
    return { success: true, deviceId: data.deviceId };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const SparkService = {
  resolveSparkCode,
  verifyLiveness,
  completeDeviceRegistration,
  deriveMotionSeed,
  deriveParticleParams,
  getExpectedPosition,
};
