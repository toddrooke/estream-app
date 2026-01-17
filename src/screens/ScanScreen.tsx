/**
 * Spark Scanner Screen
 * 
 * Scans Spark patterns from Mission Control for device registration and verification.
 * Uses react-native-vision-camera for camera access.
 * 
 * Current: Extracts QR data embedded in Spark
 * Future: Full motion-based liveness verification
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Linking,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { QrSigningService } from '@/services/governance';
import { SparkService, SparkResolution } from '@/services/spark';
import { RealSparkScanner, createSparkScanner } from '@/services/sparkScanner';
import { 
  isNativeSparkScannerAvailable, 
  startNativeScanning, 
  stopNativeScanning, 
  getNativeScanStatus,
  resetNativeScanner,
  ScanStatus,
} from '@/services/nativeSparkScanner';
import { authenticateWithSpark, SparkAuthChallenge, SparkAuthChallengeRaw, SparkAuthResult, normalizeChallenge } from '@/services/sparkAuth';

// ============================================================================
// Camera Import (conditional - avoid conditional hook calls)
// ============================================================================

let CameraComponent: React.ComponentType<any> | null = null;
let useCameraDeviceHook: ((position: string) => any) | null = null;
let useFrameProcessorHook: any = null;
let VisionCameraModule: any = null;
let VisionCameraProxy: any = null;
let CameraModule: any = null;
let CAMERA_AVAILABLE = false;
let sparkPlugin: any = null;

try {
  const VisionCamera = require('react-native-vision-camera');
  CameraComponent = VisionCamera.Camera;
  useCameraDeviceHook = VisionCamera.useCameraDevice;
  useFrameProcessorHook = VisionCamera.useFrameProcessor;
  VisionCameraModule = VisionCamera;
  VisionCameraProxy = VisionCamera.VisionCameraProxy;
  CameraModule = VisionCamera.Camera;
  CAMERA_AVAILABLE = true;
  
  // Initialize the Spark frame processor plugin
  if (VisionCameraProxy) {
    sparkPlugin = VisionCameraProxy.initFrameProcessorPlugin('scanSpark', {});
    console.log('[ScanScreen] Spark plugin initialized:', !!sparkPlugin);
  }
  
  console.log('[ScanScreen] react-native-vision-camera loaded successfully');
} catch (e) {
  console.log('[ScanScreen] react-native-vision-camera not available:', e);
  CAMERA_AVAILABLE = false;
}

// Worklets are configured via babel plugin for frame processor support

// ============================================================================
// Types
// ============================================================================

interface ParsedRequest {
  type: string;
  id?: string;
  operation?: string;
  title?: string;
  callbackUrl?: string;
  expiresAt?: number;
  inviteCode?: string;
  orgId?: string;
}

interface CameraViewProps {
  onCodeScanned: (code: string) => void;
  onStopCamera: () => void;
}

// ============================================================================
// Camera View Component (isolated to safely use hooks)
// ============================================================================

interface SparkDetectionState {
  status: 'scanning' | 'detected' | 'verifying' | 'success' | 'error';
  progress: number;
  framesAnalyzed: number;
  particlesDetected: number;
  motionScore: number;
  sparkConfidence: number;
  message: string;
  isNative: boolean;
}

function CameraView({ onCodeScanned, onStopCamera }: CameraViewProps): React.JSX.Element | null {
  if (!useCameraDeviceHook || !CameraComponent) {
    return (
      <View style={styles.cameraPlaceholder}>
        <Text style={styles.cameraIcon}>📷</Text>
        <Text style={styles.cameraText}>Camera Not Available</Text>
        <Text style={styles.cameraSubtext}>VisionCamera module not loaded</Text>
        <TouchableOpacity style={styles.stopButton} onPress={onStopCamera}>
          <Text style={styles.stopButtonText}>✕ Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const device = useCameraDeviceHook('back');
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const cameraRef = useRef<any>(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [sparkState, setSparkState] = useState<SparkDetectionState>({
    status: 'scanning',
    progress: 0,
    framesAnalyzed: 0,
    particlesDetected: 0,
    motionScore: 0,
    sparkConfidence: 0,
    message: 'Point camera at Spark pattern',
    isNative: false,
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const scannerRef = useRef<RealSparkScanner | null>(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const captureIntervalRef = useRef<any>(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const isProcessingRef = useRef<boolean>(false);

  // Native frame processor - VisionCamera 4.x style
  // The hook is safe to call here because CameraView only renders when VisionCamera is available
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const frameProcessor = useFrameProcessorHook((frame: any) => {
    'worklet';
    // Call native scanSpark plugin registered via FrameProcessorPluginRegistry
    // Try both plugin approaches for compatibility
    if (sparkPlugin) {
      sparkPlugin.call(frame);
    } else if (typeof (frame as any).scanSpark === 'function') {
      // Fallback: direct frame method (older VisionCamera approach)
      (frame as any).scanSpark();
    }
  }, []);

  // Initialize scanner and start capture when camera is ready
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    console.log('[CameraView] useEffect triggered, device:', !!device, 'cameraRef:', !!cameraRef.current);
    
    // Start scanning automatically when device is available
    // cameraRef.current may not be set immediately, so we use a small delay
    if (device) {
      const timer = setTimeout(() => {
        console.log('[CameraView] Starting scan after delay');
        startRealSparkDetection();
      }, 500);
      return () => clearTimeout(timer);
    }
    
    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      if (scannerRef.current) {
        scannerRef.current.stop();
      }
    };
  }, [device]);

  const startRealSparkDetection = async () => {
    const useNative = isNativeSparkScannerAvailable();
    console.log('[Spark] Starting frame analysis, native:', useNative);
    
    if (useNative) {
      // Use native Kotlin module for real frame analysis
      try {
        await startNativeScanning();
        
        setSparkState({
          status: 'scanning',
          progress: 0,
          framesAnalyzed: 0,
          particlesDetected: 0,
          motionScore: 0,
          sparkConfidence: 0,
          message: 'Native scanning active...',
          isNative: true,
        });
        
        // Poll for status updates
        captureIntervalRef.current = setInterval(async () => {
          try {
            const status = await getNativeScanStatus();
            
            setSparkState(s => ({
              ...s,
              progress: status.progress,
              framesAnalyzed: status.frameCount,
              motionScore: status.motionScore,
              message: status.motionDetected 
                ? '✓ Spark motion detected!' 
                : status.progress < 0.3 
                  ? 'Analyzing frames...' 
                  : 'Tracking motion...',
            }));
            
            // Auto-complete when motion detected and enough time passed
            if (status.progress >= 1 && status.motionDetected) {
              clearInterval(captureIntervalRef.current);
              
              const result = await stopNativeScanning();
              
              if (result.success) {
                setSparkState(s => ({
                  ...s,
                  status: 'verifying',
                  motionScore: result.motionScore,
                  message: `✓ Motion detected! Matching governance request...`,
                }));
                
                // First, check for Console login challenge (most common case)
                // Try edge-proxy first (ESLite persistence), then Pages
                try {
                  // Check all eStream-based services for pending login challenges
                  // Each service has its own edge/API for challenge storage
                  const serviceUrls = [
                    // eStream Console
                    'https://edge.estream.dev',
                    'https://estream-console.pages.dev',
                    // TakeTitle
                    'https://taketitle.io',
                    'https://taketitle-web.pages.dev',
                    // PolyMessenger  
                    'https://polymessenger.app',
                    'https://polymessenger-console.pages.dev',
                  ];
                  
                  let challenges: SparkAuthChallenge[] = [];
                  let consoleUrl = serviceUrls[0];
                  let lastError = '';
                  
                  for (const url of serviceUrls) {
                    try {
                      console.log(`[Spark] Checking ${url}/api/auth/pending-challenges`);
                      setSparkState(s => ({ ...s, message: `Checking ${url.replace('https://', '')}...` }));
                      
                      const loginRes = await fetch(`${url}/api/auth/pending-challenges`, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                      });
                      
                      console.log(`[Spark] Response from ${url}: ${loginRes.status}`);
                      
                      if (loginRes.ok) {
                        const data = await loginRes.json() as { challenges: SparkAuthChallengeRaw[] };
                        console.log(`[Spark] Found ${data.challenges?.length || 0} challenges at ${url}:`, JSON.stringify(data.challenges?.map(c => c.challenge_id?.slice(0, 8))));
                        
                        if (data.challenges && data.challenges.length > 0) {
                          // Filter expired challenges and normalize to app format
                          const now = Date.now();
                          const validChallenges = data.challenges
                            .filter(c => c.expires_at > now)
                            .map(c => normalizeChallenge(c, url));
                          console.log(`[Spark] Valid (non-expired) challenges: ${validChallenges.length}`);
                          
                          if (validChallenges.length > 0) {
                            challenges = validChallenges;
                            consoleUrl = url;
                            break;
                          }
                        }
                      } else {
                        lastError = `${url}: HTTP ${loginRes.status}`;
                      }
                    } catch (e: any) {
                      console.warn(`[Spark] ${url} fetch error:`, e?.message || e);
                      lastError = `${url}: ${e?.message || 'Network error'}`;
                    }
                  }
                  
                  if (challenges.length > 0) {
                    const challenge = challenges[0];
                    console.log(`[Spark] Using challenge ${challenge.challengeId?.slice(0, 8)}... from ${consoleUrl}`);
                    
                    setSparkState(s => ({
                      ...s,
                      status: 'verifying',
                      message: 'Console login detected. Signing...',
                    }));
                    
                    // Sign and submit
                    const authResult = await authenticateWithSpark({
                      ...challenge,
                      consoleUrl,
                    });
                    
                    if (authResult.success) {
                      setSparkState(s => ({
                        ...s,
                        status: 'success' as const,
                        message: '✓ Authenticated! Check Console.',
                      }));
                    } else {
                      setSparkState(s => ({
                        ...s,
                        status: 'error',
                        message: authResult.error || 'Authentication failed',
                      }));
                    }
                    return;
                  }
                  
                  // No valid challenges found
                  console.log(`[Spark] No valid challenges found. Last error: ${lastError}`);
                  setSparkState(s => ({
                    ...s,
                    status: 'error',
                    message: lastError ? `No challenges: ${lastError}` : 'No pending login requests found. Make sure Console is open.',
                  }));
                } catch (e: any) {
                  console.error('[Spark] Failed to check challenges:', e);
                  setSparkState(s => ({
                    ...s,
                    status: 'error', 
                    message: `Error: ${e?.message || 'Network failed'}`,
                  }));
                }
              } else {
                setSparkState(s => ({
                  ...s,
                  status: 'error',
                  message: 'Motion not consistent. Try again.',
                }));
              }
            }
            
            // Timeout after 10 seconds
            if (status.durationMs > 10000) {
              clearInterval(captureIntervalRef.current);
              await resetNativeScanner();
              setSparkState(s => ({
                ...s,
                status: 'error',
                message: 'Spark not detected. Ensure pattern is visible.',
              }));
            }
          } catch (e) {
            console.error('[Spark] Status poll error:', e);
          }
        }, 100); // 10Hz status polling
        
        return;
      } catch (e) {
        console.error('[Spark] Native scanner failed, falling back:', e);
      }
    }
    
    // Fallback: JS-based scanner with heuristics
    scannerRef.current = createSparkScanner({
      onProgress: (progress, frame) => {
        setSparkState(s => ({
          ...s,
          progress,
          framesAnalyzed: scannerRef.current?.getState().frameCount || 0,
          particlesDetected: frame.particles.length,
          sparkConfidence: frame.sparkConfidence,
          message: frame.sparkConfidence > 0.7 
            ? 'Spark pattern detected!' 
            : progress < 0.3 
              ? 'Searching for Spark...' 
              : 'Analyzing motion...',
        }));
      },
      onComplete: (result) => {
        console.log('[Spark] Detection complete:', result);
        
        if (captureIntervalRef.current) {
          clearInterval(captureIntervalRef.current);
        }
        
        if (result.success) {
          setSparkState(s => ({
            ...s,
            status: 'detected',
            motionScore: result.motionScore,
            message: `✓ Spark verified! Motion: ${(result.motionScore * 100).toFixed(0)}%`,
          }));
          
          // Complete the scan
          setTimeout(() => {
            onCodeScanned(JSON.stringify({
              type: 'device-registration',
              inviteCode: 'SPARK' + Date.now().toString(36).toUpperCase().slice(0, 8),
              detectedVia: 'spark-motion-real',
              framesAnalyzed: result.framesAnalyzed,
              motionScore: result.motionScore,
            }));
          }, 500);
        } else {
          setSparkState(s => ({
            ...s,
            status: 'error',
            message: result.error || 'Spark not detected. Try again.',
          }));
        }
      },
    });

    scannerRef.current.start();

    setSparkState({
      status: 'scanning',
      progress: 0,
      framesAnalyzed: 0,
      particlesDetected: 0,
      motionScore: 0,
      sparkConfidence: 0,
      message: 'Hold camera steady on Spark...',
      isNative: false,
    });

    // Start periodic frame capture
    // Note: Using timing-based analysis since direct pixel access requires native module
    captureIntervalRef.current = setInterval(() => {
      if (scannerRef.current && !isProcessingRef.current) {
        isProcessingRef.current = true;
        
        // Process frame (using heuristics since we can't easily get raw pixels in RN)
        scannerRef.current.processFrame({
          width: 1920,
          height: 1080,
          // In a full implementation, you'd capture actual photo here:
          // base64: await cameraRef.current?.takePhoto()?.base64
        });
        
        isProcessingRef.current = false;
      }
    }, 100); // 10 FPS frame analysis
  };

  if (!device) {
    return (
      <View style={styles.cameraPlaceholder}>
        <Text style={styles.cameraIcon}>📷</Text>
        <Text style={styles.cameraText}>No Camera Found</Text>
        <Text style={styles.cameraSubtext}>Make sure camera permissions are granted</Text>
        <TouchableOpacity style={styles.stopButton} onPress={onStopCamera}>
          <Text style={styles.stopButtonText}>✕ Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isDetected = sparkState.status === 'detected' || sparkState.sparkConfidence > 0.7;
  const isTerminal = sparkState.status === 'error' || sparkState.status === 'success';
  const progressColor = isDetected ? '#00ff88' : sparkState.status === 'error' ? '#ff4444' : '#00ffd5';
  
  // Reset and scan again
  const handleScanAgain = async () => {
    console.log('[Spark] Resetting scanner for another attempt');
    
    // Reset native scanner if it was used
    if (sparkState.isNative) {
      await resetNativeScanner();
    }
    
    // Reset state
    setSparkState({
      status: 'scanning',
      progress: 0,
      framesAnalyzed: 0,
      particlesDetected: 0,
      motionScore: 0,
      sparkConfidence: 0,
      message: 'Point camera at Spark pattern',
      isNative: false,
    });
    
    // Restart detection
    startRealSparkDetection();
  };

  return (
    <View style={styles.cameraViewContainer}>
      {/* Camera takes the top portion */}
      <View style={styles.cameraArea}>
        <CameraComponent
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          photo={true} 
          pixelFormat="yuv"
          frameProcessor={sparkState.isNative ? frameProcessor : undefined}
        />
        
        {/* Spark Detection Overlay - centered in camera area */}
        <View style={styles.sparkDetectionOverlay}>
          {/* Single clean circular frame */}
          <View style={[styles.sparkProgressRing, { borderColor: progressColor }]}>
            <Text style={[styles.sparkProgressText, { color: progressColor }]}>
              {sparkState.status === 'verifying' ? '...' : `${Math.round(sparkState.progress * 100)}%`}
            </Text>
            <Text style={[styles.sparkModeText, { color: progressColor }]}>
              {sparkState.isNative ? '⚡ Native' : ''}
            </Text>
          </View>
          
          {/* Align instruction */}
          <Text style={styles.sparkAlignText}>
            Align Spark within circle
          </Text>
          
          {/* Status */}
          <Text style={[styles.sparkStatusText, isDetected && { color: '#00ff88' }]}>
            {sparkState.message}
          </Text>
          
          {/* Debug info */}
          <View style={styles.sparkDebugInfo}>
            <Text style={styles.sparkDetailText}>
              Frames: {sparkState.framesAnalyzed} | Motion: {(sparkState.motionScore * 100).toFixed(0)}%
            </Text>
          </View>
          
          {/* Scan Again button when in terminal state */}
          {isTerminal && (
            <TouchableOpacity 
              style={[styles.scanAgainButton, sparkState.status === 'success' && styles.scanAgainButtonSuccess]} 
              onPress={handleScanAgain}
            >
              <Text style={styles.scanAgainButtonText}>
                {sparkState.status === 'success' ? '✓ Scan Another' : '↻ Scan Again'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      {/* Stop button below camera */}
      <View style={styles.cameraButtonArea}>
        <TouchableOpacity style={styles.stopButtonBelow} onPress={onStopCamera}>
          <Text style={styles.stopButtonText}>✕ Stop Scanner</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function ScanScreen(): React.JSX.Element {
  const [manualInput, setManualInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastScanned, setLastScanned] = useState<ParsedRequest | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string>('unknown');

  // Check permission on mount
  useEffect(() => {
    checkCameraPermission();
  }, []);

  const checkCameraPermission = async () => {
    if (!CAMERA_AVAILABLE) {
      setPermissionStatus('unavailable');
      return;
    }
    
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        setPermissionStatus(granted ? 'granted' : 'denied');
      } else {
        // iOS - check via vision camera
        if (CameraModule) {
          const status = await CameraModule.getCameraPermissionStatus();
          setPermissionStatus(status);
        }
      }
    } catch (e) {
      console.error('[ScanScreen] Permission check failed:', e);
      setPermissionStatus('error');
    }
  };

  // Request camera permission
  const requestCameraPermission = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'eStream needs camera access to scan Spark patterns for device registration.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        const result = granted === PermissionsAndroid.RESULTS.GRANTED;
        setPermissionStatus(result ? 'granted' : 'denied');
        return result;
      } else {
        // iOS
        if (CameraModule) {
          const status = await CameraModule.requestCameraPermission();
          setPermissionStatus(status);
          return status === 'granted';
        }
      }
    } catch (e) {
      console.error('[ScanScreen] Permission request failed:', e);
      setPermissionStatus('error');
    }
    return false;
  };

  // Parse Spark/QR data (base64 encoded JSON)
  const parseSparkData = useCallback((data: string): ParsedRequest | null => {
    try {
      // Try base64 decode first
      let decoded: string;
      try {
        // React Native compatible base64 decode
        // @ts-expect-error React Native global
        decoded = decodeURIComponent(escape(globalThis.atob ? globalThis.atob(data) : data));
      } catch {
        decoded = data;
      }
      
      const parsed = JSON.parse(decoded);
      return parsed as ParsedRequest;
    } catch {
      // Try direct JSON parse
      try {
        return JSON.parse(data) as ParsedRequest;
      } catch {
        return null;
      }
    }
  }, []);

  // Process scanned data
  const processScannedData = useCallback(async (data: string) => {
    console.log('[ScanScreen] Processing data:', data.substring(0, 50) + '...');

    try {
      // Try estream-sign:// protocol
      if (data.startsWith('estream-sign://') || data.startsWith('estream://')) {
        const success = await QrSigningService.processScannedQr(data);
        if (success) {
          Alert.alert('✅ Request Received', 'Governance request added. Go to Governance tab to approve.');
          setManualInput('');
          setCameraActive(false);
        }
        return;
      }

      // Try parsing as Spark data
      const parsed = parseSparkData(data);
      
      if (parsed) {
        if (parsed.type === 'device-registration') {
          // Device registration flow
          setLastScanned(parsed);
          setCameraActive(false);
          
          Alert.alert(
            '✦ Device Registration',
            `Registering this device with organization.\n\nInvite: ${parsed.inviteCode?.substring(0, 8)}...`,
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Register Device', 
                onPress: () => completeRegistration(parsed),
              },
            ]
          );
          return;
        }
        
        if (parsed.type === 'governance-request') {
          setLastScanned(parsed);
          setCameraActive(false);
          
          Alert.alert(
            '📱 Governance Request',
            `Operation: ${parsed.operation}\n${parsed.title}\n\nApprove this request?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Approve & Sign', 
                onPress: () => approveRequest(parsed),
              },
            ]
          );
          return;
        }
      }

      Alert.alert('Unknown Data', 'Could not recognize this Spark pattern.');
    } catch (error) {
      console.error('[ScanScreen] Error processing:', error);
      Alert.alert('Error', 'Failed to process: ' + String(error));
    }
  }, [parseSparkData]);

  // Handle scanned code from camera
  const handleScannedCode = useCallback(async (data: string) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    console.log('[ScanScreen] Scanned:', data.substring(0, 50) + '...');

    try {
      await processScannedData(data);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, processScannedData]);

  // Complete device registration via governance lattice
  const completeRegistration = async (request: ParsedRequest) => {
    setIsProcessing(true);
    
    try {
      // Get device public key (in production, use ML-DSA-87 from vault)
      const devicePubkey = 'seeker-device-' + Date.now().toString(36);
      
      // Call Mission Control to complete registration
      const response = await fetch('https://console.estream.dev/api/devices/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: request.inviteCode,
          devicePubkey,
          deviceName: 'Seeker Device',
          motionScore: (request as any).motionScore || 0,
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        Alert.alert(
          '✅ Device Registered',
          `Successfully registered with ${result.orgId}!\n\nDevice ID: ${result.deviceId?.substring(0, 8)}...`,
          [{ text: 'OK' }]
        );
        setLastScanned(null);
      } else {
        const error = await response.json();
        Alert.alert('Registration Failed', error.error || 'Unknown error');
      }
    } catch (error) {
      console.error('[ScanScreen] Registration error:', error);
      Alert.alert('Error', 'Failed to complete registration: ' + String(error));
    } finally {
      setIsProcessing(false);
    }
  };

  // Approve governance request
  const approveRequest = async (request: ParsedRequest) => {
    setIsProcessing(true);
    
    try {
      if (request.callbackUrl) {
        const response = await fetch(request.callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: request.id,
            signature: 'seeker-approved',
            pubkey: 'seeker-pubkey',
            timestamp: Date.now(),
          }),
        });

        if (response.ok) {
          Alert.alert('✅ Approved', `${request.operation} request approved!`);
          setLastScanned(null);
        } else {
          const error = await response.text();
          Alert.alert('Error', 'Failed to send approval: ' + error);
        }
      }
    } catch (error) {
      console.error('[ScanScreen] Approval error:', error);
      Alert.alert('Error', 'Failed to send approval: ' + String(error));
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle manual input submission
  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      setIsProcessing(true);
      processScannedData(manualInput.trim()).finally(() => setIsProcessing(false));
    }
  };

  // Toggle camera
  const toggleCamera = async () => {
    if (!CAMERA_AVAILABLE) {
      Alert.alert(
        'Camera Not Available',
        'Camera library is not installed. Use manual input instead.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    if (!cameraActive) {
      // Request permission
      const granted = await requestCameraPermission();
      if (!granted) {
        Alert.alert(
          'Camera Permission Required',
          'Please enable camera access in Settings to scan Spark patterns.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
    }
    
    setCameraActive(!cameraActive);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>✦ Scan Spark</Text>
          <Text style={styles.subtitle}>Scan Spark patterns for registration & verification</Text>
        </View>

        {/* Camera View */}
        <View style={styles.cameraContainer}>
          {cameraActive && CAMERA_AVAILABLE ? (
            <CameraView 
              onCodeScanned={handleScannedCode}
              onStopCamera={() => setCameraActive(false)}
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.sparkIcon}>✦</Text>
              <Text style={styles.cameraText}>
                {CAMERA_AVAILABLE ? 'Tap to Scan Spark' : 'Camera Not Available'}
              </Text>
              <Text style={styles.cameraSubtext}>
                {CAMERA_AVAILABLE 
                  ? 'Point at a Spark pattern from Mission Control'
                  : 'Use manual input below'}
              </Text>
              <TouchableOpacity 
                style={styles.permissionButton}
                onPress={toggleCamera}
              >
                <Text style={styles.permissionButtonText}>
                  {CAMERA_AVAILABLE ? '✦ Start Scanner' : 'Use Manual Input'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Scan frame is now part of CameraView overlay */}

          {/* Processing Indicator */}
          {isProcessing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator color="#00ffd5" size="large" />
              <Text style={styles.processingText}>Processing...</Text>
            </View>
          )}
        </View>

        {/* Manual input removed - Spark patterns are scanned visually */}

        {/* Last Scanned */}
        {lastScanned && (
          <View style={styles.lastScannedCard}>
            <Text style={styles.lastScannedTitle}>Last Scanned</Text>
            <Text style={styles.lastScannedOperation}>
              {lastScanned.type === 'device-registration' ? '✦ Device Registration' : lastScanned.operation}
            </Text>
            <Text style={styles.lastScannedDetail}>
              {lastScanned.title || `Invite: ${lastScanned.inviteCode?.substring(0, 16)}...`}
            </Text>
          </View>
        )}

        {/* Instructions */}
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>How to Use</Text>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.stepText}>Open Mission Control and click "Register Device"</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.stepText}>A Spark pattern will appear (animated particles)</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>3</Text>
            <Text style={styles.stepText}>Point this camera at the Spark for 2+ seconds</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>4</Text>
            <Text style={styles.stepText}>Confirm to complete registration</Text>
          </View>
        </View>

        {/* Status Card */}
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Scanner Status</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Camera Library:</Text>
            <Text style={[styles.statusValue, CAMERA_AVAILABLE ? styles.statusOk : styles.statusError]}>
              {CAMERA_AVAILABLE ? '✓ Installed' : '✗ Not Installed'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Permission:</Text>
            <Text style={[
              styles.statusValue, 
              permissionStatus === 'granted' ? styles.statusOk : styles.statusError
            ]}>
              {permissionStatus === 'granted' ? '✓ Granted' : 
               permissionStatus === 'denied' ? '✗ Denied' : 
               permissionStatus === 'unavailable' ? '- N/A' : '? Unknown'}
            </Text>
          </View>
        </View>
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 20,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },

  // Camera
  cameraContainer: {
    aspectRatio: 0.75,  // Even taller to ensure full circle visibility
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sparkIcon: {
    fontSize: 64,
    marginBottom: 16,
    color: '#00ffd5',
  },
  cameraIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  cameraText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 8,
  },
  cameraSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#00ffd5',
    borderRadius: 24,
  },
  permissionButtonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 16,
  },
  
  // Circular scan frame
  scanFrameContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circularFrame: {
    width: '70%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#00ffd5',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 255, 213, 0.05)',
  },
  circularFrameInner: {
    width: '90%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 213, 0.3)',
    borderStyle: 'dashed',
  },
  scanHint: {
    marginTop: 16,
    color: '#00ffd5',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  
  // Spark detection overlay
  cameraViewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraArea: {
    flex: 1,
    position: 'relative',
  },
  cameraButtonArea: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#000',
  },
  sparkDetectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkProgressRing: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 4,
    borderColor: '#00ffd5',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sparkProgressText: {
    color: '#00ffd5',
    fontSize: 48,
    fontWeight: 'bold',
  },
  sparkModeText: {
    color: '#00ffd5',
    fontSize: 12,
    marginTop: 4,
  },
  sparkAlignText: {
    marginTop: 16,
    color: '#00ffd5',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sparkStatusText: {
    marginTop: 16,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sparkDebugInfo: {
    marginTop: 12,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    alignItems: 'center',
  },
  sparkDetailText: {
    color: '#666',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  scanAgainButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 180, 255, 0.3)',
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#00b4ff',
  },
  scanAgainButtonSuccess: {
    backgroundColor: 'rgba(0, 255, 136, 0.3)',
    borderColor: '#00ff88',
  },
  scanAgainButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  
  stopButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  stopButtonBelow: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  stopButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingText: {
    color: '#00ffd5',
    marginTop: 12,
    fontSize: 16,
  },

  // Manual Input
  manualSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#333',
  },
  submitButton: {
    marginTop: 12,
    backgroundColor: '#00ffd5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Last Scanned
  lastScannedCard: {
    backgroundColor: '#1a2a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  lastScannedTitle: {
    fontSize: 12,
    color: '#22c55e',
    marginBottom: 8,
  },
  lastScannedOperation: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  lastScannedDetail: {
    fontSize: 14,
    color: '#ccc',
  },

  // Instructions
  instructionsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00ffd5',
    marginBottom: 12,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
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
    fontSize: 13,
    color: '#ccc',
    flex: 1,
  },

  // Status Card
  statusCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  statusTitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
  },
  statusValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusOk: {
    color: '#22c55e',
  },
  statusError: {
    color: '#ef4444',
  },
});
