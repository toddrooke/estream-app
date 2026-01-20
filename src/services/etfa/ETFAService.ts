/**
 * ETFA Service
 * 
 * Embedded Timing Fingerprint Authentication service.
 * Collects device timing fingerprints and submits to ETFA lattice
 * for persistent tracking and device verification.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

// Native module
const NativeETFA = NativeModules.ETFAModule;

// Event emitter for progress updates
const etfaEmitter = NativeETFA ? new NativeEventEmitter(NativeETFA) : null;

/**
 * ETFA Fingerprint result from native collection
 */
export interface ETFAFingerprint {
  id: string;
  phase: number;
  platform: 'android' | 'ios';
  platformVersion: string;
  deviceModel: string;
  sampleCount: number;
  timestamp: number;
  
  // Stable ratios (used for device identification)
  r5_mem_seq_to_rand: number;
  r6_mem_copy_to_seq: number;
  r7_int_to_float: number;
  r9_float_to_matrix: number;
  r10_seq_4k_to_64k: number;
  r11_seq_64k_to_1m: number;
  r12_seq_1m_to_4m: number;
  r13_rand_4k_to_64k: number;
  r14_rand_64k_to_1m: number;
  r18_int_mul_32_to_64: number;
  r19_int_div_32_to_64: number;
  r22_int_mul_to_div: number;
  r24_add_chain_to_parallel: number;
  r25_int_to_bitwise: number;
  r28_gpu_vertex_to_fragment: number;
  r29_gpu_compile_to_link: number;
  
  // All stable ratios as array
  stableRatios: number[];
  
  // Hash of stable ratios for quick comparison
  fingerprintHash: string;
}

/**
 * ETFA Lattice record for persistent storage
 */
export interface ETFALatticeRecord {
  // Record metadata
  recordId: string;
  recordType: 'etfa_fingerprint';
  schemaVersion: '1.0.0';
  
  // Device identification
  deviceId: string;           // Hash of stable fingerprint
  deviceModel: string;
  platform: 'android' | 'ios';
  platformVersion: string;
  
  // Collection metadata
  collectedAt: string;        // ISO8601
  sampleCount: number;
  phase: number;
  
  // Fingerprint data
  stableRatios: {
    r5: number;
    r6: number;
    r7: number;
    r9: number;
    r10: number;
    r11: number;
    r12: number;
    r13: number;
    r14: number;
    r18: number;
    r19: number;
    r22: number;
    r24: number;
    r25: number;
    r28: number;
    r29: number;
  };
  
  // Context (for tracking stability over conditions)
  context?: {
    batteryLevel?: number;
    isCharging?: boolean;
    thermalState?: string;
    appVersion?: string;
  };
}

/**
 * Progress callback type
 */
export type ETFAProgressCallback = (operation: string, progress: number) => void;

/**
 * ETFA Service class
 */
class ETFAServiceClass {
  private progressListeners: Set<ETFAProgressCallback> = new Set();
  private eventSubscription: any = null;
  
  constructor() {
    this.setupEventListeners();
  }
  
  private setupEventListeners() {
    if (!etfaEmitter) return;
    
    this.eventSubscription = etfaEmitter.addListener('onETFAProgress', (event) => {
      this.progressListeners.forEach(listener => {
        listener(event.operation, event.progress);
      });
    });
  }
  
  /**
   * Check if ETFA is available on this device
   */
  async isAvailable(): Promise<boolean> {
    if (!NativeETFA) {
      console.log('[ETFA] Native module not available');
      return false;
    }
    try {
      return await NativeETFA.isSupported();
    } catch (e) {
      console.error('[ETFA] Error checking support:', e);
      return false;
    }
  }
  
  /**
   * Get device info without full fingerprint collection
   */
  async getDeviceInfo(): Promise<{
    platform: string;
    platformVersion: string;
    deviceModel: string;
    deviceName: string;
    isEmulator: boolean;
  } | null> {
    if (!NativeETFA) return null;
    try {
      return await NativeETFA.getDeviceInfo();
    } catch (e) {
      console.error('[ETFA] Error getting device info:', e);
      return null;
    }
  }
  
  /**
   * Collect a timing fingerprint
   * @param sampleCount Number of samples per operation (100-1000 recommended)
   * @param onProgress Optional progress callback
   */
  async collectFingerprint(
    sampleCount: number = 100,
    onProgress?: ETFAProgressCallback
  ): Promise<ETFAFingerprint | null> {
    if (!NativeETFA) {
      console.log('[ETFA] Native module not available, using mock');
      return this.mockFingerprint();
    }
    
    // Register progress listener
    if (onProgress) {
      this.progressListeners.add(onProgress);
    }
    
    try {
      const result = await NativeETFA.collectFingerprint(sampleCount);
      return result as ETFAFingerprint;
    } catch (e) {
      console.error('[ETFA] Error collecting fingerprint:', e);
      return null;
    } finally {
      if (onProgress) {
        this.progressListeners.delete(onProgress);
      }
    }
  }
  
  /**
   * Convert fingerprint to lattice record format
   */
  toLatticeRecord(
    fingerprint: ETFAFingerprint,
    context?: ETFALatticeRecord['context']
  ): ETFALatticeRecord {
    return {
      recordId: fingerprint.id,
      recordType: 'etfa_fingerprint',
      schemaVersion: '1.0.0',
      
      deviceId: fingerprint.fingerprintHash,
      deviceModel: fingerprint.deviceModel,
      platform: fingerprint.platform,
      platformVersion: fingerprint.platformVersion,
      
      collectedAt: new Date(fingerprint.timestamp).toISOString(),
      sampleCount: fingerprint.sampleCount,
      phase: fingerprint.phase,
      
      stableRatios: {
        r5: fingerprint.r5_mem_seq_to_rand,
        r6: fingerprint.r6_mem_copy_to_seq,
        r7: fingerprint.r7_int_to_float,
        r9: fingerprint.r9_float_to_matrix,
        r10: fingerprint.r10_seq_4k_to_64k,
        r11: fingerprint.r11_seq_64k_to_1m,
        r12: fingerprint.r12_seq_1m_to_4m,
        r13: fingerprint.r13_rand_4k_to_64k,
        r14: fingerprint.r14_rand_64k_to_1m,
        r18: fingerprint.r18_int_mul_32_to_64,
        r19: fingerprint.r19_int_div_32_to_64,
        r22: fingerprint.r22_int_mul_to_div,
        r24: fingerprint.r24_add_chain_to_parallel,
        r25: fingerprint.r25_int_to_bitwise,
        r28: fingerprint.r28_gpu_vertex_to_fragment,
        r29: fingerprint.r29_gpu_compile_to_link,
      },
      
      context,
    };
  }
  
  /**
   * Submit fingerprint to ETFA lattice
   * @param record Lattice record to submit
   * @param latticeEndpoint URL of the ETFA lattice endpoint
   */
  async submitToLattice(
    record: ETFALatticeRecord,
    latticeEndpoint: string
  ): Promise<boolean> {
    try {
      const response = await fetch(`${latticeEndpoint}/etfa/fingerprints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(record),
      });
      
      if (!response.ok) {
        console.error('[ETFA] Lattice submission failed:', response.status);
        return false;
      }
      
      console.log('[ETFA] Fingerprint submitted to lattice:', record.recordId);
      return true;
    } catch (e) {
      console.error('[ETFA] Error submitting to lattice:', e);
      return false;
    }
  }
  
  /**
   * Compare two fingerprints for similarity
   * Returns a score 0-1 where 1 is identical
   */
  compareFingerprints(a: ETFAFingerprint, b: ETFAFingerprint): number {
    if (!a.stableRatios || !b.stableRatios) return 0;
    if (a.stableRatios.length !== b.stableRatios.length) return 0;
    
    let totalDiff = 0;
    for (let i = 0; i < a.stableRatios.length; i++) {
      const ra = a.stableRatios[i];
      const rb = b.stableRatios[i];
      if (ra === 0 && rb === 0) continue;
      const avg = (ra + rb) / 2;
      const diff = Math.abs(ra - rb) / avg;
      totalDiff += diff;
    }
    
    const avgDiff = totalDiff / a.stableRatios.length;
    // Convert to similarity score (0% diff = 1.0, 50% diff = 0.5, etc.)
    return Math.max(0, 1 - avgDiff);
  }
  
  /**
   * Mock fingerprint for development/testing
   */
  private mockFingerprint(): ETFAFingerprint {
    const mockRatios = [
      0.47, 0.23, 0.56, 1.29, 0.063, 0.062, 0.25, 0.061, 0.030,
      1.0, 0.74, 0.70, 1.0, 1.31, 0.99, 0.51
    ];
    
    return {
      id: `mock-${Date.now()}`,
      phase: 4,
      platform: Platform.OS as 'android' | 'ios',
      platformVersion: Platform.Version.toString(),
      deviceModel: 'MockDevice',
      sampleCount: 0,
      timestamp: Date.now(),
      
      r5_mem_seq_to_rand: mockRatios[0],
      r6_mem_copy_to_seq: mockRatios[1],
      r7_int_to_float: mockRatios[2],
      r9_float_to_matrix: mockRatios[3],
      r10_seq_4k_to_64k: mockRatios[4],
      r11_seq_64k_to_1m: mockRatios[5],
      r12_seq_1m_to_4m: mockRatios[6],
      r13_rand_4k_to_64k: mockRatios[7],
      r14_rand_64k_to_1m: mockRatios[8],
      r18_int_mul_32_to_64: mockRatios[9],
      r19_int_div_32_to_64: mockRatios[10],
      r22_int_mul_to_div: mockRatios[11],
      r24_add_chain_to_parallel: mockRatios[12],
      r25_int_to_bitwise: mockRatios[13],
      r28_gpu_vertex_to_fragment: mockRatios[14],
      r29_gpu_compile_to_link: mockRatios[15],
      
      stableRatios: mockRatios,
      fingerprintHash: 'mock-hash-' + Date.now().toString(16),
    };
  }
  
  /**
   * Cleanup
   */
  destroy() {
    this.eventSubscription?.remove();
    this.progressListeners.clear();
  }
}

// Export singleton instance
export const ETFAService = new ETFAServiceClass();

// Export for direct module access
export { NativeETFA };
