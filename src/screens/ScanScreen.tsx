/**
 * QR Scanner Screen
 * 
 * Scans QR codes from Mission Control or CLI for governance signing requests.
 * Uses react-native-vision-camera for native QR code scanning.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'react-native';
import { QrSigningService } from '@/services/governance';

// ============================================================================
// Camera Import (conditional)
// ============================================================================

let Camera: any = null;
let useCameraDevice: any = null;
let useCameraPermission: any = null;
let useCodeScanner: any = null;

try {
  const VisionCamera = require('react-native-vision-camera');
  Camera = VisionCamera.Camera;
  useCameraDevice = VisionCamera.useCameraDevice;
  useCameraPermission = VisionCamera.useCameraPermission;
  useCodeScanner = VisionCamera.useCodeScanner;
} catch (e) {
  console.log('[ScanScreen] react-native-vision-camera not available:', e);
}

const CAMERA_AVAILABLE = Camera !== null;

// ============================================================================
// Types
// ============================================================================

interface ParsedRequest {
  type: string;
  id: string;
  operation: string;
  title: string;
  callbackUrl: string;
  expiresAt: number;
}

// ============================================================================
// Main Screen
// ============================================================================

export default function ScanScreen(): React.JSX.Element {
  const [manualInput, setManualInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastScanned, setLastScanned] = useState<ParsedRequest | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const lastScannedCode = useRef<string>('');
  const scanCooldown = useRef<boolean>(false);

  // Camera hooks (only if available)
  const cameraPermission = CAMERA_AVAILABLE ? useCameraPermission() : { hasPermission: false, requestPermission: async () => false };
  const device = CAMERA_AVAILABLE ? useCameraDevice('back') : null;

  // Code scanner (only if camera available)
  const codeScanner = CAMERA_AVAILABLE ? useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes: any[]) => {
      if (codes.length > 0 && !scanCooldown.current) {
        const code = codes[0];
        if (code.value && code.value !== lastScannedCode.current) {
          lastScannedCode.current = code.value;
          scanCooldown.current = true;
          handleScannedCode(code.value);
          
          // Reset cooldown after 2 seconds
          setTimeout(() => {
            scanCooldown.current = false;
          }, 2000);
        }
      }
    },
  }) : null;

  // Request camera permission on mount
  useEffect(() => {
    if (CAMERA_AVAILABLE && !cameraPermission.hasPermission) {
      cameraPermission.requestPermission();
    }
  }, []);

  // Handle scanned QR code
  const handleScannedCode = useCallback(async (data: string) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    console.log('[ScanScreen] Scanned QR code:', data.substring(0, 50) + '...');

    try {
      await processQrCode(data);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing]);

  // Parse QR data (base64 encoded JSON from Mission Control)
  const parseQrData = useCallback((data: string): ParsedRequest | null => {
    try {
      // Try base64 decode first (Mission Control format)
      let decoded: string;
      if (typeof Buffer !== 'undefined') {
        decoded = Buffer.from(data, 'base64').toString('utf8');
      } else {
        decoded = atob(decodeURIComponent(data));
      }
      const parsed = JSON.parse(decoded);
      return parsed as ParsedRequest;
    } catch {
      // Try direct JSON parse
      try {
        const parsed = JSON.parse(data);
        return parsed as ParsedRequest;
      } catch {
        // Try estream-sign:// protocol
        if (data.startsWith('estream-sign://')) {
          return null; // Let QrSigningService handle this
        }
        return null;
      }
    }
  }, []);

  // Process scanned QR code
  const processQrCode = useCallback(async (data: string) => {
    console.log('[ScanScreen] Processing QR data:', data.substring(0, 50) + '...');

    try {
      // First try the estream-sign:// protocol
      if (data.startsWith('estream-sign://')) {
        const success = await QrSigningService.processScannedQr(data);
        if (success) {
          Alert.alert(
            '✅ Request Received',
            'Governance request added. Go to Governance tab to approve.',
            [{ text: 'OK' }]
          );
          setManualInput('');
          setCameraActive(false);
        }
        return;
      }

      // Try Mission Control format (base64 JSON)
      const parsed = parseQrData(data);
      if (parsed && parsed.type === 'governance-request') {
        setLastScanned(parsed);
        setCameraActive(false);
        
        // Show confirmation
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
        setManualInput('');
        return;
      }

      Alert.alert('Invalid QR Code', 'This QR code is not a valid governance request.');
    } catch (error) {
      console.error('[ScanScreen] Error processing QR:', error);
      Alert.alert('Error', 'Failed to process QR code: ' + String(error));
    }
  }, [parseQrData]);

  // Approve and sign the request
  const approveRequest = async (request: ParsedRequest) => {
    setIsProcessing(true);
    
    try {
      // Send approval to callback URL
      const response = await fetch(request.callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          signature: 'seeker-approved', // TODO: Use VaultContext for real signing
          pubkey: 'seeker-pubkey',
          timestamp: Date.now(),
        }),
      });

      if (response.ok) {
        Alert.alert('✅ Approved', `${request.operation} request approved and signed!`);
        setLastScanned(null);
      } else {
        const error = await response.text();
        Alert.alert('Error', 'Failed to send approval: ' + error);
      }
    } catch (error) {
      console.error('[ScanScreen] Error approving request:', error);
      Alert.alert('Error', 'Failed to send approval: ' + String(error));
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle manual input submission
  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      setIsProcessing(true);
      processQrCode(manualInput.trim()).finally(() => setIsProcessing(false));
    }
  };

  // Toggle camera
  const toggleCamera = () => {
    if (!CAMERA_AVAILABLE) {
      Alert.alert(
        'Camera Not Available',
        'react-native-vision-camera is not installed. Use manual input instead.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    if (!cameraPermission.hasPermission) {
      Linking.openSettings();
      return;
    }
    
    setCameraActive(!cameraActive);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>📷 Scan QR</Text>
          <Text style={styles.subtitle}>Scan governance requests from Mission Control</Text>
        </View>

        {/* Camera View */}
        <View style={styles.cameraContainer}>
          {cameraActive && CAMERA_AVAILABLE && device ? (
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={cameraActive}
              codeScanner={codeScanner}
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraIcon}>📷</Text>
              <Text style={styles.cameraText}>
                {CAMERA_AVAILABLE ? 'Tap to Start Camera' : 'Camera Not Available'}
              </Text>
              <Text style={styles.cameraSubtext}>
                {CAMERA_AVAILABLE 
                  ? 'Point at a governance QR code'
                  : 'Install react-native-vision-camera\nor use manual input below'}
              </Text>
              <TouchableOpacity 
                style={styles.permissionButton}
                onPress={toggleCamera}
              >
                <Text style={styles.permissionButtonText}>
                  {CAMERA_AVAILABLE 
                    ? (cameraPermission.hasPermission ? 'Start Camera' : 'Enable Camera')
                    : 'Open Settings'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Scan Frame Overlay */}
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>

          {/* Stop Camera Button */}
          {cameraActive && (
            <TouchableOpacity 
              style={styles.stopButton}
              onPress={() => setCameraActive(false)}
            >
              <Text style={styles.stopButtonText}>✕ Stop Camera</Text>
            </TouchableOpacity>
          )}

          {/* Processing Indicator */}
          {isProcessing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator color="#00ffd5" size="large" />
              <Text style={styles.processingText}>Processing...</Text>
            </View>
          )}
        </View>

        {/* Manual Input */}
        <View style={styles.manualSection}>
          <Text style={styles.sectionTitle}>Or Paste QR Data</Text>
          <Text style={styles.sectionSubtitle}>
            Copy the QR code data from Mission Control and paste here
          </Text>
          
          <TextInput
            style={styles.textInput}
            placeholder="Paste QR code data here..."
            placeholderTextColor="#666"
            value={manualInput}
            onChangeText={setManualInput}
            multiline
            numberOfLines={4}
          />
          
          <TouchableOpacity
            style={[styles.submitButton, isProcessing && styles.buttonDisabled]}
            onPress={handleManualSubmit}
            disabled={isProcessing || !manualInput.trim()}
          >
            {isProcessing ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Process QR Data</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Last Scanned */}
        {lastScanned && (
          <View style={styles.lastScannedCard}>
            <Text style={styles.lastScannedTitle}>Last Scanned Request</Text>
            <Text style={styles.lastScannedOperation}>{lastScanned.operation}</Text>
            <Text style={styles.lastScannedDetail}>{lastScanned.title}</Text>
            <Text style={styles.lastScannedId}>ID: {lastScanned.id.substring(0, 16)}...</Text>
          </View>
        )}

        {/* Instructions */}
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>How to Use</Text>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.stepText}>Click a governance action in Mission Control</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.stepText}>A QR code modal will appear</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>3</Text>
            <Text style={styles.stepText}>Scan the QR code with this screen</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>4</Text>
            <Text style={styles.stepText}>Review and approve the request</Text>
          </View>
        </View>

        {/* Camera Status */}
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Camera Status</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Library:</Text>
            <Text style={[styles.statusValue, CAMERA_AVAILABLE ? styles.statusOk : styles.statusError]}>
              {CAMERA_AVAILABLE ? '✓ Installed' : '✗ Not Installed'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Permission:</Text>
            <Text style={[styles.statusValue, cameraPermission.hasPermission ? styles.statusOk : styles.statusError]}>
              {cameraPermission.hasPermission ? '✓ Granted' : '✗ Not Granted'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Device:</Text>
            <Text style={[styles.statusValue, device ? styles.statusOk : styles.statusError]}>
              {device ? '✓ Available' : '✗ Not Found'}
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
    aspectRatio: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    position: 'relative',
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
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
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#00ffd5',
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#000',
    fontWeight: '600',
  },
  scanFrame: {
    position: 'absolute',
    top: '20%',
    left: '20%',
    right: '20%',
    bottom: '20%',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#00ffd5',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  stopButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
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
    borderRadius: 10,
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
    marginBottom: 8,
  },
  lastScannedId: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#666',
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
    marginBottom: 4,
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
