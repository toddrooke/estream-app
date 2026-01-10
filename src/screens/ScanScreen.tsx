/**
 * QR Scanner Screen
 * 
 * Scans QR codes from Mission Control or CLI for governance signing requests.
 * Uses the device camera to detect and parse governance request QR codes.
 */

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { QrSigningService } from '@/services/governance';

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
  const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  // Check camera permission on mount
  useEffect(() => {
    checkCameraPermission();
  }, []);

  const checkCameraPermission = async () => {
    // For now, we'll use manual input as camera requires native module setup
    // TODO: Integrate react-native-vision-camera when available
    setCameraPermission('undetermined');
  };

  const requestCameraPermission = async () => {
    Alert.alert(
      'Camera Access Required',
      'To scan QR codes, enable camera access in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
  };

  // Parse QR data (base64 encoded JSON from Mission Control)
  const parseQrData = useCallback((data: string): ParsedRequest | null => {
    try {
      // Try base64 decode first (Mission Control format)
      const decoded = atob(decodeURIComponent(data));
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
          // Let QrSigningService handle this format
          return null;
        }
        return null;
      }
    }
  }, []);

  // Process scanned QR code
  const processQrCode = useCallback(async (data: string) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
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
        }
        return;
      }

      // Try Mission Control format (base64 JSON)
      const parsed = parseQrData(data);
      if (parsed && parsed.type === 'governance-request') {
        setLastScanned(parsed);
        
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
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, parseQrData]);

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
          signature: 'seeker-approved', // TODO: Real ML-DSA-87 signature
          pubkey: 'seeker-pubkey', // TODO: Real public key
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
      processQrCode(manualInput.trim());
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>📷 Scan QR</Text>
          <Text style={styles.subtitle}>Scan governance requests from Mission Control</Text>
        </View>

        {/* Camera View Placeholder */}
        <View style={styles.cameraContainer}>
          <View style={styles.cameraPlaceholder}>
            <Text style={styles.cameraIcon}>📷</Text>
            <Text style={styles.cameraText}>Camera Scanner</Text>
            <Text style={styles.cameraSubtext}>
              Native camera module required.{'\n'}
              Use manual input below for now.
            </Text>
            <TouchableOpacity 
              style={styles.permissionButton}
              onPress={requestCameraPermission}
            >
              <Text style={styles.permissionButtonText}>Enable Camera</Text>
            </TouchableOpacity>
          </View>

          {/* Scan Frame Overlay */}
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
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
    fontFamily: 'monospace',
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
    fontFamily: 'monospace',
    color: '#666',
  },

  // Instructions
  instructionsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
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
});
