/**
 * Native Spark Scanner
 * 
 * TypeScript wrapper for the native Kotlin SparkScannerModule.
 * Provides real frame analysis for Spark pattern detection.
 */

import { NativeModules, Platform } from 'react-native';

const { SparkScanner } = NativeModules;

export interface ScanResult {
  success: boolean;
  sparkDetected: boolean;
  framesAnalyzed: number;
  durationMs: number;
  motionScore: number;
  direction: 'cw' | 'ccw' | 'mixed' | 'insufficient' | 'no_motion' | 'scanning';
}

export interface ScanStatus {
  isScanning: boolean;
  frameCount: number;
  durationMs: number;
  progress: number;
  motionScore: number;
  motionDetected: boolean;
}

/**
 * Check if native module is available
 */
export function isNativeSparkScannerAvailable(): boolean {
  return Platform.OS === 'android' && SparkScanner != null;
}

/**
 * Start native scanning
 */
export async function startNativeScanning(): Promise<{ success: boolean; status: string }> {
  if (!isNativeSparkScannerAvailable()) {
    throw new Error('Native SparkScanner not available');
  }
  
  return SparkScanner.startScanning();
}

/**
 * Stop scanning and get results
 */
export async function stopNativeScanning(): Promise<ScanResult> {
  if (!isNativeSparkScannerAvailable()) {
    throw new Error('Native SparkScanner not available');
  }
  
  return SparkScanner.stopScanning();
}

/**
 * Get current scan status
 */
export async function getNativeScanStatus(): Promise<ScanStatus> {
  if (!isNativeSparkScannerAvailable()) {
    throw new Error('Native SparkScanner not available');
  }
  
  return SparkScanner.getStatus();
}

/**
 * Reset scanner
 */
export async function resetNativeScanner(): Promise<boolean> {
  if (!isNativeSparkScannerAvailable()) {
    return true; // No-op if not available
  }
  
  return SparkScanner.reset();
}

/**
 * Hook for using native Spark scanner
 */
export function useNativeSparkScanner() {
  const isAvailable = isNativeSparkScannerAvailable();
  
  return {
    isAvailable,
    startScanning: startNativeScanning,
    stopScanning: stopNativeScanning,
    getStatus: getNativeScanStatus,
    reset: resetNativeScanner,
  };
}
