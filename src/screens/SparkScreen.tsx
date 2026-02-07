/**
 * Spark Screen
 * 
 * Two modes:
 * 1. Render Mode - Display Spark for payments, requests, verification
 * 2. Scan Mode - Camera to scan other Sparks
 * 
 * Phase 8 redesign - replaces ScanScreen
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  Dimensions,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useSparkParams } from '@/services/account';
import { 
  isNativeSparkScannerAvailable, 
  startNativeScanning, 
  stopNativeScanning, 
  getNativeScanStatus,
  resetNativeScanner,
} from '@/services/nativeSparkScanner';
import { authenticateWithSpark, SparkAuthChallenge, SparkAuthChallengeRaw, normalizeChallenge } from '@/services/sparkAuth';
import { networkConfig } from '@estream/react-native';

// ============================================================================
// Types
// ============================================================================

type SparkMode = 'render' | 'scan';
type SparkAction = 'payment' | 'request' | 'verify' | 'sign';

interface SparkDetectionState {
  status: 'scanning' | 'detected' | 'verifying' | 'success' | 'error';
  progress: number;
  framesAnalyzed: number;
  motionScore: number;
  message: string;
}

// Camera imports (conditional)
let CameraComponent: React.ComponentType<any> | null = null;
let useCameraDeviceHook: ((position: string) => any) | null = null;
let useFrameProcessorHook: any = null;
let VisionCameraProxy: any = null;
let CameraModule: any = null;
let CAMERA_AVAILABLE = false;
let sparkPlugin: any = null;

try {
  const VisionCamera = require('react-native-vision-camera');
  CameraComponent = VisionCamera.Camera;
  useCameraDeviceHook = VisionCamera.useCameraDevice;
  useFrameProcessorHook = VisionCamera.useFrameProcessor;
  VisionCameraProxy = VisionCamera.VisionCameraProxy;
  CameraModule = VisionCamera.Camera;
  CAMERA_AVAILABLE = true;
  
  if (VisionCameraProxy) {
    sparkPlugin = VisionCameraProxy.initFrameProcessorPlugin('scanSpark', {});
  }
} catch (e) {
  CAMERA_AVAILABLE = false;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================================
// Spark Renderer
// ============================================================================

function generateSparkSVG(pubkeyHash: string, size: number): string {
  const bytes = hexToBytes(pubkeyHash.slice(0, 64));
  const baseHue = ((bytes[0] << 8) | bytes[1]) % 360;
  
  const particles = [];
  for (let i = 0; i < 12; i++) {
    const offset = i * 4;
    const radius = 0.2 + (bytes[(offset) % 32] / 255) * 0.25;
    const phase = (bytes[(offset + 1) % 32] / 255) * 2 * Math.PI;
    const hue = ((bytes[(offset + 2) % 32] << 8) | bytes[(offset + 3) % 32]) % 360;
    const saturation = 70 + (bytes[(offset + 2) % 32] / 255) * 25;
    const lightness = 50 + (bytes[(offset + 3) % 32] / 255) * 15;
    const direction = i % 2 === 0 ? 1 : -1;
    const speed = 0.3 + (bytes[(offset + 1) % 32] / 255) * 0.8;
    
    const x = 0.5 + Math.cos(phase) * radius;
    const y = 0.5 + Math.sin(phase) * radius;
    
    particles.push({ x, y, hue, saturation, lightness, radius, phase, speed, direction });
  }
  
  const center = size / 2;
  const orbitRadius = size * 0.35;
  const id = `spark-${pubkeyHash.slice(0, 8)}`;
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;
  svg += `<defs>`;
  svg += `<radialGradient id="${id}-glow">`;
  svg += `<stop offset="0%" stop-color="hsl(${baseHue}, 80%, 60%)" stop-opacity="0.8"/>`;
  svg += `<stop offset="50%" stop-color="hsl(${baseHue}, 70%, 40%)" stop-opacity="0.4"/>`;
  svg += `<stop offset="100%" stop-color="hsl(${baseHue}, 60%, 30%)" stop-opacity="0"/>`;
  svg += `</radialGradient>`;
  
  particles.forEach((p, i) => {
    svg += `<radialGradient id="${id}-p${i}">`;
    svg += `<stop offset="0%" stop-color="#fff"/>`;
    svg += `<stop offset="40%" stop-color="hsl(${p.hue}, ${p.saturation}%, ${p.lightness}%)"/>`;
    svg += `<stop offset="100%" stop-color="hsl(${p.hue}, ${p.saturation}%, ${p.lightness}%)" stop-opacity="0.3"/>`;
    svg += `</radialGradient>`;
  });
  svg += `</defs>`;
  
  svg += `<style>`;
  particles.forEach((p, i) => {
    const duration = (2 * Math.PI) / p.speed;
    svg += `@keyframes ${id}-o${i}{from{transform:rotate(${(p.phase*180/Math.PI).toFixed(1)}deg)}to{transform:rotate(${((p.phase*180/Math.PI)+360*p.direction).toFixed(1)}deg)}}`;
    svg += `.${id}-p${i}{animation:${id}-o${i} ${duration.toFixed(2)}s linear infinite;transform-origin:${center}px ${center}px}`;
  });
  svg += `@keyframes ${id}-pulse{0%,100%{transform:scale(1);opacity:0.8}50%{transform:scale(1.2);opacity:1}}`;
  svg += `.${id}-center{animation:${id}-pulse 2s ease-in-out infinite;transform-origin:${center}px ${center}px}`;
  svg += `</style>`;
  
  svg += `<rect width="${size}" height="${size}" fill="#0a0a0a"/>`;
  svg += `<circle cx="${center}" cy="${center}" r="${orbitRadius}" fill="none" stroke="hsl(${baseHue},50%,40%)" stroke-opacity="0.3" stroke-width="2"/>`;
  svg += `<circle class="${id}-center" cx="${center}" cy="${center}" r="${size*0.12}" fill="url(#${id}-glow)"/>`;
  
  particles.forEach((p, i) => {
    const screenX = p.x * size;
    const screenY = p.y * size;
    const particleSize = 4 + p.radius * 14;
    svg += `<g class="${id}-p${i}">`;
    svg += `<circle cx="${screenX.toFixed(1)}" cy="${screenY.toFixed(1)}" r="${(particleSize*2).toFixed(1)}" fill="hsl(${p.hue},${p.saturation}%,${p.lightness}%)" fill-opacity="0.3"/>`;
    svg += `<circle cx="${screenX.toFixed(1)}" cy="${screenY.toFixed(1)}" r="${particleSize.toFixed(1)}" fill="url(#${id}-p${i})"/>`;
    svg += `</g>`;
  });
  
  svg += `</svg>`;
  return svg;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ============================================================================
// Scanner Component
// ============================================================================

function ScannerView({ onComplete, onCancel }: { 
  onComplete: (success: boolean, data?: any) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const cameraRef = useRef<any>(null);
  const [sparkState, setSparkState] = useState<SparkDetectionState>({
    status: 'scanning',
    progress: 0,
    framesAnalyzed: 0,
    motionScore: 0,
    message: 'Point camera at Spark',
  });
  const captureIntervalRef = useRef<any>(null);

  const device = useCameraDeviceHook ? useCameraDeviceHook('back') : null;
  
  const frameProcessor = useFrameProcessorHook?.((frame: any) => {
    'worklet';
    if (sparkPlugin) {
      sparkPlugin.call(frame);
    }
  }, []);

  useEffect(() => {
    if (device) {
      const timer = setTimeout(() => startScanning(), 500);
      return () => clearTimeout(timer);
    }
    return () => {
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    };
  }, [device]);

  const startScanning = async () => {
    const useNative = isNativeSparkScannerAvailable();
    
    if (useNative) {
      try {
        await startNativeScanning();
        setSparkState({
          status: 'scanning',
          progress: 0,
          framesAnalyzed: 0,
          motionScore: 0,
          message: 'Native scanning active...',
        });
        
        captureIntervalRef.current = setInterval(async () => {
          try {
            const status = await getNativeScanStatus();
            setSparkState(s => ({
              ...s,
              progress: status.progress,
              framesAnalyzed: status.frameCount,
              motionScore: status.motionScore,
              message: status.motionDetected 
                ? '✓ Spark detected!' 
                : status.progress < 0.3 
                  ? 'Analyzing...' 
                  : 'Tracking motion...',
            }));
            
            if (status.progress >= 1 && status.motionDetected) {
              clearInterval(captureIntervalRef.current);
              const result = await stopNativeScanning();
              
              if (result.success) {
                setSparkState(s => ({ ...s, status: 'verifying', message: 'Verifying...' }));
                await handleSparkDetected();
              }
            }
            
            if (status.durationMs > 10000) {
              clearInterval(captureIntervalRef.current);
              await resetNativeScanner();
              startScanning();
            }
          } catch (e) {
            console.error('[Scanner] Status error:', e);
          }
        }, 100);
      } catch (e) {
        console.error('[Scanner] Native failed:', e);
      }
    }
  };

  const handleSparkDetected = async () => {
    try {
      // Use configured endpoint for current environment
      const sparkLatticeUrl = networkConfig.getEndpoints().sparkLatticeUrl;
      const serviceUrls = [sparkLatticeUrl];
      let challenges: SparkAuthChallenge[] = [];
      let consoleUrl = serviceUrls[0];
      
      for (const url of serviceUrls) {
        try {
          const res = await fetch(`${url}/api/auth/pending-challenges`);
          if (res.ok) {
            const data = await res.json() as { challenges: SparkAuthChallengeRaw[] };
            if (data.challenges?.length > 0) {
              const now = Date.now();
              challenges = data.challenges
                .filter(c => c.expires_at > now)
                .map(c => normalizeChallenge(c, url));
              if (challenges.length > 0) {
                consoleUrl = url;
                break;
              }
            }
          }
        } catch (e) {
          console.warn(`[Scanner] ${url} error:`, e);
        }
      }
      
      if (challenges.length > 0) {
        setSparkState(s => ({ ...s, message: 'Authenticating...' }));
        const result = await authenticateWithSpark({ ...challenges[0], consoleUrl });
        
        if (result.success) {
          setSparkState(s => ({ ...s, status: 'success', message: '✓ Authenticated!' }));
          onComplete(true, result);
        } else {
          setSparkState(s => ({ ...s, status: 'error', message: result.error || 'Failed' }));
          setTimeout(() => {
            resetNativeScanner().then(startScanning);
          }, 1500);
        }
      } else {
        setSparkState(s => ({ ...s, status: 'error', message: 'No pending requests' }));
        setTimeout(() => {
          resetNativeScanner().then(startScanning);
        }, 2000);
      }
    } catch (e) {
      console.error('[Scanner] Error:', e);
      setSparkState(s => ({ ...s, status: 'error', message: 'Error occurred' }));
    }
  };

  if (!device || !CameraComponent) {
    return (
      <View style={styles.cameraPlaceholder}>
        <Text style={styles.cameraIcon}>📷</Text>
        <Text style={styles.cameraText}>Camera Not Available</Text>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const progressColor = sparkState.status === 'success' ? '#00ff88' : 
                        sparkState.status === 'error' ? '#ff4444' : '#00ffd5';

  return (
    <View style={styles.scannerContainer}>
      <CameraComponent
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
        pixelFormat="yuv"
        frameProcessor={frameProcessor}
      />
      
      <View style={styles.scannerOverlay}>
        <View style={[styles.progressRing, { borderColor: progressColor }]}>
          <Text style={[styles.progressText, { color: progressColor }]}>
            {sparkState.status === 'verifying' ? '...' : `${Math.round(sparkState.progress * 100)}%`}
          </Text>
        </View>
        
        <Text style={styles.scannerMessage}>{sparkState.message}</Text>
        
        <View style={styles.scannerDebug}>
          <Text style={styles.debugText}>
            Frames: {sparkState.framesAnalyzed} | Motion: {(sparkState.motionScore * 100).toFixed(0)}%
          </Text>
        </View>
      </View>
      
      <TouchableOpacity style={styles.scannerCancelButton} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>✕ Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function SparkScreen(): React.JSX.Element {
  const sparkParams = useSparkParams();
  const [mode, setMode] = useState<SparkMode>('render');
  const [selectedAction, setSelectedAction] = useState<SparkAction>('verify');
  const [isScanning, setIsScanning] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  // Generate Spark SVG for render mode
  const sparkSvg = useMemo(() => {
    if (!sparkParams?.pubkeyHash) return null;
    return generateSparkSVG(sparkParams.pubkeyHash, SCREEN_WIDTH - 80);
  }, [sparkParams?.pubkeyHash]);

  // Check camera permission
  useEffect(() => {
    const checkPermission = async () => {
      if (!CAMERA_AVAILABLE) return;
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
          setPermissionGranted(granted);
        } else if (CameraModule) {
          const status = await CameraModule.getCameraPermissionStatus();
          setPermissionGranted(status === 'granted');
        }
      } catch (e) {
        console.log('[SparkScreen] Permission check failed:', e);
      }
    };
    checkPermission();
  }, []);

  const requestPermission = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'eStream needs camera to scan Spark patterns',
            buttonPositive: 'OK',
          }
        );
        const granted = result === PermissionsAndroid.RESULTS.GRANTED;
        setPermissionGranted(granted);
        return granted;
      } else if (CameraModule) {
        const status = await CameraModule.requestCameraPermission();
        const granted = status === 'granted';
        setPermissionGranted(granted);
        return granted;
      }
    } catch (e) {
      console.error('[SparkScreen] Permission request failed:', e);
    }
    return false;
  };

  const handleStartScan = async () => {
    if (!permissionGranted) {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert('Permission Required', 'Camera access is needed to scan Spark patterns.');
        return;
      }
    }
    setIsScanning(true);
  };

  const handleScanComplete = (success: boolean, _data?: any) => {
    if (success) {
      setTimeout(() => setIsScanning(false), 2000);
    }
  };

  const handleScanCancel = () => {
    setIsScanning(false);
  };

  const actions: { id: SparkAction; label: string; icon: string; description: string }[] = [
    { id: 'payment', label: 'Payment', icon: '💸', description: 'Send tokens to someone' },
    { id: 'request', label: 'Request', icon: '📥', description: 'Receive tokens' },
    { id: 'verify', label: 'Verify', icon: '✓', description: 'Prove your identity' },
    { id: 'sign', label: 'Sign', icon: '✍️', description: 'Sign governance action' },
  ];

  // Full screen scanner mode
  if (isScanning && CAMERA_AVAILABLE) {
    return (
      <SafeAreaView style={styles.container}>
        <ScannerView onComplete={handleScanComplete} onCancel={handleScanCancel} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Mode Toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity 
          style={[styles.modeButton, mode === 'render' && styles.modeButtonActive]}
          onPress={() => setMode('render')}
        >
          <Text style={[styles.modeButtonText, mode === 'render' && styles.modeButtonTextActive]}>
            ✦ Render
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.modeButton, mode === 'scan' && styles.modeButtonActive]}
          onPress={() => setMode('scan')}
        >
          <Text style={[styles.modeButtonText, mode === 'scan' && styles.modeButtonTextActive]}>
            📷 Scan
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'render' ? (
        // RENDER MODE
        <View style={styles.renderContainer}>
          {/* Action Selection */}
          <View style={styles.actionGrid}>
            {actions.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={[
                  styles.actionCard,
                  selectedAction === action.id && styles.actionCardActive,
                ]}
                onPress={() => setSelectedAction(action.id)}
              >
                <Text style={styles.actionIcon}>{action.icon}</Text>
                <Text style={[
                  styles.actionLabel,
                  selectedAction === action.id && styles.actionLabelActive,
                ]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Spark Visual */}
          <View style={styles.sparkRenderContainer}>
            {sparkSvg ? (
              <SvgXml xml={sparkSvg} width={SCREEN_WIDTH - 80} height={SCREEN_WIDTH - 80} />
            ) : (
              <View style={styles.sparkPlaceholder}>
                <Text style={styles.sparkPlaceholderText}>⬡</Text>
                <Text style={styles.sparkPlaceholderSubtext}>Generating Spark...</Text>
              </View>
            )}
          </View>

          {/* Action Description */}
          <View style={styles.actionDescription}>
            <Text style={styles.actionDescriptionText}>
              {actions.find(a => a.id === selectedAction)?.description}
            </Text>
            <Text style={styles.actionHint}>
              {selectedAction === 'verify' 
                ? 'Show this Spark to authenticate' 
                : 'Have recipient scan this Spark'}
            </Text>
          </View>
        </View>
      ) : (
        // SCAN MODE
        <View style={styles.scanModeContainer}>
          <View style={styles.scanInstructions}>
            <Text style={styles.scanTitle}>Scan a Spark</Text>
            <Text style={styles.scanSubtitle}>
              Point your camera at a Spark pattern to authenticate or complete an action.
            </Text>
          </View>

          <TouchableOpacity 
            style={[styles.startScanButton, !CAMERA_AVAILABLE && styles.buttonDisabled]}
            onPress={handleStartScan}
            disabled={!CAMERA_AVAILABLE}
          >
            <Text style={styles.startScanIcon}>✦</Text>
            <Text style={styles.startScanText}>
              {CAMERA_AVAILABLE ? 'Start Scanner' : 'Camera Not Available'}
            </Text>
          </TouchableOpacity>

          {/* Instructions */}
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>How to Scan</Text>
            <View style={styles.step}>
              <Text style={styles.stepNumber}>1</Text>
              <Text style={styles.stepText}>Tap Start Scanner above</Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNumber}>2</Text>
              <Text style={styles.stepText}>Point camera at Spark pattern</Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNumber}>3</Text>
              <Text style={styles.stepText}>Hold steady for 2-3 seconds</Text>
            </View>
          </View>

          {/* Permission Status */}
          <Text style={[
            styles.permissionStatus,
            permissionGranted ? styles.permissionGranted : styles.permissionPending
          ]}>
            {permissionGranted ? '✓ Camera ready' : 'Camera permission needed'}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  modeToggle: {
    flexDirection: 'row',
    margin: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#00ffd5',
  },
  modeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
  },
  modeButtonTextActive: {
    color: '#000',
  },
  renderContainer: {
    flex: 1,
    padding: 20,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  actionCardActive: {
    borderColor: '#00ffd5',
    backgroundColor: '#0a1a1a',
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  actionLabelActive: {
    color: '#00ffd5',
  },
  sparkRenderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sparkPlaceholder: {
    width: SCREEN_WIDTH - 80,
    height: SCREEN_WIDTH - 80,
    backgroundColor: '#1a1a1a',
    borderRadius: (SCREEN_WIDTH - 80) / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sparkPlaceholderText: {
    fontSize: 80,
    color: '#00ffd5',
  },
  sparkPlaceholderSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
  },
  actionDescription: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  actionDescriptionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  actionHint: {
    fontSize: 14,
    color: '#666',
  },
  scanModeContainer: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  scanInstructions: {
    alignItems: 'center',
    marginBottom: 40,
  },
  scanTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  scanSubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
  startScanButton: {
    backgroundColor: '#1a2a3a',
    borderRadius: 80,
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#00ffd5',
    marginBottom: 40,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  startScanIcon: {
    fontSize: 48,
    color: '#00ffd5',
    marginBottom: 4,
  },
  startScanText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  instructionsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 20,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00ffd5',
    marginBottom: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#00ffd5',
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: 12,
  },
  stepText: {
    fontSize: 14,
    color: '#ccc',
    flex: 1,
  },
  permissionStatus: {
    fontSize: 12,
  },
  permissionGranted: {
    color: '#22c55e',
  },
  permissionPending: {
    color: '#f97316',
  },
  // Scanner styles
  scannerContainer: {
    flex: 1,
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  cameraIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  cameraText: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 24,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  scannerMessage: {
    marginTop: 20,
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  scannerDebug: {
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  debugText: {
    fontSize: 11,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  scannerCancelButton: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  cancelButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
