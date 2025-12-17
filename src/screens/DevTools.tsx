/**
 * Developer Tools Screen
 * 
 * Self-verifying diagnostic panel for:
 * - Device info and capabilities
 * - Vault detection and status
 * - Key generation and display
 * - Signing tests
 * - Attestation verification
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  NativeModules,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';

// Types
interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'pass' | 'fail' | 'skip';
  message: string;
  details?: string;
  timestamp?: number;
  duration?: number;
}

interface DeviceInfo {
  platform: string;
  version: string;
  model: string;
  isSeeker: boolean;
  hasSecureHardware: boolean;
}

// Utility functions
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function sha256Simple(data: Uint8Array): Uint8Array {
  // Simple hash for testing (not crypto-grade, just for demo)
  // In production, use proper crypto
  const hash = new Uint8Array(32);
  for (let i = 0; i < data.length; i++) {
    hash[i % 32] ^= data[i];
  }
  return hash;
}

function generateNonce(): Uint8Array {
  const nonce = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    nonce[i] = Math.floor(Math.random() * 256);
  }
  return nonce;
}

// Components
function StatusBadge({ status }: { status: TestResult['status'] }) {
  const colors: Record<TestResult['status'], string> = {
    pending: '#6b7280',
    running: '#3b82f6',
    pass: '#22c55e',
    fail: '#ef4444',
    skip: '#f59e0b',
  };
  
  const icons: Record<TestResult['status'], string> = {
    pending: '○',
    running: '◐',
    pass: '✓',
    fail: '✗',
    skip: '⊘',
  };
  
  return (
    <View style={[styles.badge, { backgroundColor: colors[status] }]}>
      <Text style={styles.badgeText}>{icons[status]}</Text>
    </View>
  );
}

function TestResultRow({ result }: { result: TestResult }) {
  return (
    <View style={styles.testRow}>
      <StatusBadge status={result.status} />
      <View style={styles.testContent}>
        <Text style={styles.testName}>{result.name}</Text>
        <Text style={styles.testMessage}>{result.message}</Text>
        {result.details && (
          <Text style={styles.testDetails}>{result.details}</Text>
        )}
        {result.duration !== undefined && (
          <Text style={styles.testDuration}>{result.duration}ms</Text>
        )}
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// Main Component
export default function DevTools() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [tests, setTests] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [keyPair, setKeyPair] = useState<nacl.SignKeyPair | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Logging helper
  const log = useCallback((message: string) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 99)]);
  }, []);

  // Update a test result
  const updateTest = useCallback((name: string, update: Partial<TestResult>) => {
    setTests(prev => prev.map(t => 
      t.name === name ? { ...t, ...update, timestamp: Date.now() } : t
    ));
  }, []);

  // Initialize device info
  useEffect(() => {
    const info: DeviceInfo = {
      platform: Platform.OS,
      version: Platform.Version.toString(),
      model: Platform.OS === 'android' 
        ? (NativeModules.PlatformConstants?.Model || 'Unknown')
        : 'iOS Device',
      isSeeker: Platform.OS === 'android' && 
        (NativeModules.PlatformConstants?.Model?.toLowerCase().includes('seeker') || false),
      hasSecureHardware: false, // Will be detected
    };
    
    // Check for Seeker module
    if (NativeModules.SeekerModule) {
      info.hasSecureHardware = true;
      log('✓ SeekerModule detected');
    } else {
      log('⚠ SeekerModule not available');
    }
    
    setDeviceInfo(info);
    log(`Device: ${info.platform} ${info.version} (${info.model})`);
    log(`isSeeker: ${info.isSeeker}, hasSecureHardware: ${info.hasSecureHardware}`);
  }, [log]);

  // Initialize test list
  useEffect(() => {
    setTests([
      { name: 'AsyncStorage', status: 'pending', message: 'Storage access' },
      { name: 'Key Generation', status: 'pending', message: 'Ed25519 keypair' },
      { name: 'Signing', status: 'pending', message: 'Message signature' },
      { name: 'Verification', status: 'pending', message: 'Signature verify' },
      { name: 'Nonce Generation', status: 'pending', message: 'Random nonce' },
      { name: 'Envelope Building', status: 'pending', message: 'Signed envelope' },
      { name: 'Key Persistence', status: 'pending', message: 'Save/load key' },
      { name: 'Seeker Detection', status: 'pending', message: 'Hardware vault' },
      { name: 'Seeker Signing', status: 'pending', message: 'Hardware sign' },
      { name: 'Attestation', status: 'pending', message: 'Device attestation' },
      { name: 'Biometric Check', status: 'pending', message: 'Biometric availability' },
      { name: 'Biometric Key', status: 'pending', message: 'Biometric-protected key' },
    ]);
    
    // Auto-run tests on startup (for dev mode)
    setTimeout(() => {
      log('Auto-starting tests...');
      // Will call runTests once tests array is populated
    }, 1000);
  }, [log]);
  
  // Auto-run tests effect
  useEffect(() => {
    if (tests.length > 0 && !isRunning && tests.every(t => t.status === 'pending')) {
      log('Auto-running tests on startup...');
      runTests();
    }
  }, [tests, isRunning, runTests, log]);

  // Run all tests
  const runTests = useCallback(async () => {
    setIsRunning(true);
    log('=== Starting test suite ===');
    
    // Local keypair reference for use within this test run
    let localKeyPair: nacl.SignKeyPair | null = null;

    // Test 1: AsyncStorage
    const startStorage = Date.now();
    updateTest('AsyncStorage', { status: 'running', message: 'Testing...' });
    try {
      const testKey = 'estream:test:' + Date.now();
      await AsyncStorage.setItem(testKey, 'test-value');
      const retrieved = await AsyncStorage.getItem(testKey);
      await AsyncStorage.removeItem(testKey);
      
      if (retrieved === 'test-value') {
        updateTest('AsyncStorage', { 
          status: 'pass', 
          message: 'Read/write working',
          duration: Date.now() - startStorage
        });
        log('✓ AsyncStorage working');
      } else {
        throw new Error('Value mismatch');
      }
    } catch (e) {
      updateTest('AsyncStorage', { 
        status: 'fail', 
        message: 'Storage failed',
        details: String(e),
        duration: Date.now() - startStorage
      });
      log('✗ AsyncStorage failed: ' + e);
    }

    // Test 2: Key Generation
    const startKeyGen = Date.now();
    updateTest('Key Generation', { status: 'running', message: 'Generating...' });
    try {
      const kp = nacl.sign.keyPair();
      localKeyPair = kp;
      setKeyPair(kp);
      
      const pubKeyB58 = bs58.encode(kp.publicKey);
      updateTest('Key Generation', { 
        status: 'pass', 
        message: 'Generated Ed25519 keypair',
        details: `Public: ${pubKeyB58.substring(0, 12)}...`,
        duration: Date.now() - startKeyGen
      });
      log('✓ Key generated: ' + pubKeyB58.substring(0, 12) + '...');
    } catch (e) {
      updateTest('Key Generation', { 
        status: 'fail', 
        message: 'Generation failed',
        details: String(e),
        duration: Date.now() - startKeyGen
      });
      log('✗ Key generation failed: ' + e);
    }

    // Test 3: Signing
    const startSign = Date.now();
    updateTest('Signing', { status: 'running', message: 'Signing...' });
    try {
      if (!localKeyPair) throw new Error('No keypair');
      
      const message = new TextEncoder().encode('Test message for signing');
      const signature = nacl.sign.detached(message, localKeyPair.secretKey);
      
      updateTest('Signing', { 
        status: 'pass', 
        message: 'Signed 24-byte message',
        details: `Sig: ${toHex(signature).substring(0, 24)}...`,
        duration: Date.now() - startSign
      });
      log('✓ Signed message, sig=' + toHex(signature).substring(0, 16) + '...');
    } catch (e) {
      updateTest('Signing', { 
        status: 'fail', 
        message: 'Signing failed',
        details: String(e),
        duration: Date.now() - startSign
      });
      log('✗ Signing failed: ' + e);
    }

    // Test 4: Verification
    const startVerify = Date.now();
    updateTest('Verification', { status: 'running', message: 'Verifying...' });
    try {
      if (!localKeyPair) throw new Error('No keypair');
      
      const message = new TextEncoder().encode('Test message for signing');
      const signature = nacl.sign.detached(message, localKeyPair.secretKey);
      const valid = nacl.sign.detached.verify(message, signature, localKeyPair.publicKey);
      
      if (valid) {
        updateTest('Verification', { 
          status: 'pass', 
          message: 'Signature verified',
          duration: Date.now() - startVerify
        });
        log('✓ Signature verified successfully');
      } else {
        throw new Error('Verification returned false');
      }
    } catch (e) {
      updateTest('Verification', { 
        status: 'fail', 
        message: 'Verification failed',
        details: String(e),
        duration: Date.now() - startVerify
      });
      log('✗ Verification failed: ' + e);
    }

    // Test 5: Nonce Generation
    const startNonce = Date.now();
    updateTest('Nonce Generation', { status: 'running', message: 'Generating...' });
    try {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      
      // Check they're different
      const same = toHex(nonce1) === toHex(nonce2);
      if (same) throw new Error('Nonces are identical!');
      
      updateTest('Nonce Generation', { 
        status: 'pass', 
        message: 'Generated unique nonces',
        details: `N1: ${toHex(nonce1).substring(0, 16)}...`,
        duration: Date.now() - startNonce
      });
      log('✓ Nonce generation working');
    } catch (e) {
      updateTest('Nonce Generation', { 
        status: 'fail', 
        message: 'Nonce failed',
        details: String(e),
        duration: Date.now() - startNonce
      });
      log('✗ Nonce generation failed: ' + e);
    }

    // Test 6: Envelope Building
    const startEnvelope = Date.now();
    updateTest('Envelope Building', { status: 'running', message: 'Building...' });
    try {
      if (!localKeyPair) throw new Error('No keypair');
      
      const method = 'POST';
      const path = '/api/v1/estreams';
      const body = JSON.stringify({ test: 'data' });
      const nonce = generateNonce();
      const timestamp = Date.now();
      const bodyHash = sha256Simple(new TextEncoder().encode(body));
      
      const payload = `${method}.${path}.${toHex(bodyHash)}.${timestamp}.${toHex(nonce)}`;
      const signature = nacl.sign.detached(new TextEncoder().encode(payload), localKeyPair.secretKey);
      
      const envelope = {
        publicKey: bs58.encode(localKeyPair.publicKey),
        signature: bs58.encode(signature),
        timestamp: timestamp.toString(),
        nonce: toHex(nonce),
        bodyHash: toHex(bodyHash),
      };
      
      updateTest('Envelope Building', { 
        status: 'pass', 
        message: 'Built signed envelope',
        details: `Headers: 5 fields, payload=${payload.length} bytes`,
        duration: Date.now() - startEnvelope
      });
      log('✓ Envelope built: ' + JSON.stringify(Object.keys(envelope)));
    } catch (e) {
      updateTest('Envelope Building', { 
        status: 'fail', 
        message: 'Envelope failed',
        details: String(e),
        duration: Date.now() - startEnvelope
      });
      log('✗ Envelope building failed: ' + e);
    }

    // Test 7: Key Persistence
    const startPersist = Date.now();
    updateTest('Key Persistence', { status: 'running', message: 'Testing...' });
    try {
      if (!localKeyPair) throw new Error('No keypair');
      
      const storageKey = 'estream:devtools:key';
      await AsyncStorage.setItem(storageKey, bs58.encode(localKeyPair.secretKey));
      const loaded = await AsyncStorage.getItem(storageKey);
      
      if (!loaded) throw new Error('Key not found');
      
      const loadedSecret = bs58.decode(loaded);
      const restoredKp = nacl.sign.keyPair.fromSecretKey(loadedSecret);
      
      if (bs58.encode(restoredKp.publicKey) !== bs58.encode(localKeyPair.publicKey)) {
        throw new Error('Restored key mismatch');
      }
      
      await AsyncStorage.removeItem(storageKey);
      
      updateTest('Key Persistence', { 
        status: 'pass', 
        message: 'Save/load working',
        duration: Date.now() - startPersist
      });
      log('✓ Key persistence verified');
    } catch (e) {
      updateTest('Key Persistence', { 
        status: 'fail', 
        message: 'Persistence failed',
        details: String(e),
        duration: Date.now() - startPersist
      });
      log('✗ Key persistence failed: ' + e);
    }

    // Test 8: Seeker Detection
    const startSeeker = Date.now();
    updateTest('Seeker Detection', { status: 'running', message: 'Checking...' });
    try {
      const SeekerModule = NativeModules.SeekerModule;
      
      if (!SeekerModule) {
        updateTest('Seeker Detection', { 
          status: 'skip', 
          message: 'SeekerModule not available',
          details: 'Native module not linked',
          duration: Date.now() - startSeeker
        });
        log('⊘ SeekerModule not available (expected on first run)');
      } else {
        const available = await SeekerModule.isAvailable();
        updateTest('Seeker Detection', { 
          status: available ? 'pass' : 'skip', 
          message: available ? 'Seeker Seed Vault detected' : 'Not a Seeker device',
          duration: Date.now() - startSeeker
        });
        log(available ? '✓ Seeker detected!' : '⊘ Not a Seeker device');
      }
    } catch (e) {
      updateTest('Seeker Detection', { 
        status: 'skip', 
        message: 'Detection error',
        details: String(e),
        duration: Date.now() - startSeeker
      });
      log('⊘ Seeker detection error: ' + e);
    }

    // Test 9: Seeker Signing (if available)
    const startSeekerSign = Date.now();
    updateTest('Seeker Signing', { status: 'running', message: 'Testing...' });
    try {
      const SeekerModule = NativeModules.SeekerModule;
      
      if (!SeekerModule) {
        updateTest('Seeker Signing', { 
          status: 'skip', 
          message: 'No SeekerModule',
          duration: Date.now() - startSeekerSign
        });
        log('⊘ Seeker signing skipped (no module)');
      } else {
        const available = await SeekerModule.isAvailable();
        if (!available) {
          updateTest('Seeker Signing', { 
            status: 'skip', 
            message: 'Seeker not available',
            duration: Date.now() - startSeekerSign
          });
          log('⊘ Seeker signing skipped (not available)');
        } else {
          // Try to sign with Seeker
          const alias = 'estream-devtools-test';
          const hasKey = await SeekerModule.hasKey(alias);
          
          if (!hasKey) {
            const pubKey = await SeekerModule.generateKey(alias);
            log('Generated Seeker key: ' + pubKey.substring(0, 12) + '...');
          }
          
          const testMessage = btoa('Test message'); // Base64
          const signature = await SeekerModule.sign(alias, testMessage);
          
          updateTest('Seeker Signing', { 
            status: 'pass', 
            message: 'Signed with Seed Vault!',
            details: `Sig: ${signature.substring(0, 24)}...`,
            duration: Date.now() - startSeekerSign
          });
          log('✓ SEEKER SIGNING SUCCESS!');
        }
      }
    } catch (e) {
      updateTest('Seeker Signing', { 
        status: 'fail', 
        message: 'Seeker signing failed',
        details: String(e),
        duration: Date.now() - startSeekerSign
      });
      log('✗ Seeker signing failed: ' + e);
    }

    // Test 10: Attestation
    const startAttest = Date.now();
    updateTest('Attestation', { status: 'running', message: 'Checking...' });
    try {
      const SeekerModule = NativeModules.SeekerModule;
      
      if (!SeekerModule) {
        updateTest('Attestation', { 
          status: 'skip', 
          message: 'No SeekerModule',
          duration: Date.now() - startAttest
        });
        log('⊘ Attestation skipped (no module)');
      } else {
        const available = await SeekerModule.isAvailable();
        if (!available) {
          updateTest('Attestation', { 
            status: 'skip', 
            message: 'Seeker not available',
            duration: Date.now() - startAttest
          });
          log('⊘ Attestation skipped (not available)');
        } else {
          const attestation = await SeekerModule.getAttestation('estream-devtools-test');
          
          if (attestation && attestation.certificates) {
            updateTest('Attestation', { 
              status: 'pass', 
              message: 'Got attestation chain',
              details: `${attestation.certificates.length} certs`,
              duration: Date.now() - startAttest
            });
            log('✓ Attestation: ' + attestation.certificates.length + ' certificates');
          } else {
            updateTest('Attestation', { 
              status: 'skip', 
              message: 'No attestation available',
              duration: Date.now() - startAttest
            });
            log('⊘ No attestation available');
          }
        }
      }
    } catch (e) {
      updateTest('Attestation', { 
        status: 'fail', 
        message: 'Attestation failed',
        details: String(e),
        duration: Date.now() - startAttest
      });
      log('✗ Attestation failed: ' + e);
    }

    // Test 11: Biometric Check
    const startBiometric = Date.now();
    updateTest('Biometric Check', { status: 'running', message: 'Checking...' });
    try {
      const SeekerModule = NativeModules.SeekerModule;
      
      if (!SeekerModule || !SeekerModule.isBiometricAvailable) {
        updateTest('Biometric Check', { 
          status: 'skip', 
          message: 'Method not available',
          duration: Date.now() - startBiometric
        });
        log('⊘ Biometric check skipped (no method)');
      } else {
        const biometricStatus = await SeekerModule.isBiometricAvailable();
        
        updateTest('Biometric Check', { 
          status: biometricStatus.available ? 'pass' : 'skip', 
          message: biometricStatus.statusText,
          details: `Status: ${biometricStatus.status}`,
          duration: Date.now() - startBiometric
        });
        log(`${biometricStatus.available ? '✓' : '⊘'} Biometric: ${biometricStatus.statusText}`);
      }
    } catch (e) {
      updateTest('Biometric Check', { 
        status: 'fail', 
        message: 'Biometric check failed',
        details: String(e),
        duration: Date.now() - startBiometric
      });
      log('✗ Biometric check failed: ' + e);
    }

    // Test 12: Biometric Key Generation
    const startBioKey = Date.now();
    updateTest('Biometric Key', { status: 'running', message: 'Generating...' });
    try {
      const SeekerModule = NativeModules.SeekerModule;
      
      if (!SeekerModule || !SeekerModule.generateBiometricKey) {
        updateTest('Biometric Key', { 
          status: 'skip', 
          message: 'Method not available',
          duration: Date.now() - startBioKey
        });
        log('⊘ Biometric key skipped (no method)');
      } else {
        // Generate with time-window auth (30s)
        const result = await SeekerModule.generateBiometricKey('estream-bio-test', 2);
        
        updateTest('Biometric Key', { 
          status: 'pass', 
          message: 'Generated biometric key',
          details: `AuthMode: ${result.authMode}, Protected: ${result.biometricProtected}`,
          duration: Date.now() - startBioKey
        });
        log(`✓ Biometric key generated (mode=${result.authMode})`);
        
        // Clean up
        await SeekerModule.deleteKey('estream-bio-test');
      }
    } catch (e) {
      updateTest('Biometric Key', { 
        status: 'fail', 
        message: 'Biometric key failed',
        details: String(e),
        duration: Date.now() - startBioKey
      });
      log('✗ Biometric key failed: ' + e);
    }

    log('=== Test suite complete ===');
    setIsRunning(false);
  }, [keyPair, updateTest, log]);

  // Summary stats
  const stats = tests.reduce(
    (acc, t) => {
      acc[t.status]++;
      return acc;
    },
    { pending: 0, running: 0, pass: 0, fail: 0, skip: 0 }
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🔧 eStream DevTools</Text>
          <Text style={styles.subtitle}>Self-Verification Panel</Text>
        </View>

        {/* Device Info */}
        <Section title="Device Info">
          {deviceInfo && (
            <View style={styles.infoGrid}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Platform:</Text>
                <Text style={styles.infoValue}>{deviceInfo.platform} {deviceInfo.version}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Model:</Text>
                <Text style={styles.infoValue}>{deviceInfo.model}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Is Seeker:</Text>
                <Text style={[styles.infoValue, { color: deviceInfo.isSeeker ? '#22c55e' : '#6b7280' }]}>
                  {deviceInfo.isSeeker ? '✓ Yes' : 'No'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Secure HW:</Text>
                <Text style={[styles.infoValue, { color: deviceInfo.hasSecureHardware ? '#22c55e' : '#6b7280' }]}>
                  {deviceInfo.hasSecureHardware ? '✓ Available' : 'Not detected'}
                </Text>
              </View>
            </View>
          )}
        </Section>

        {/* Key Info */}
        {keyPair && (
          <Section title="Current Key">
            <View style={styles.keyBox}>
              <Text style={styles.keyLabel}>Public Key (Base58)</Text>
              <Text style={styles.keyValue} selectable>
                {bs58.encode(keyPair.publicKey)}
              </Text>
            </View>
          </Section>
        )}

        {/* Test Summary */}
        <Section title="Test Results">
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: '#22c55e' }]}>{stats.pass}</Text>
              <Text style={styles.statLabel}>Pass</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: '#ef4444' }]}>{stats.fail}</Text>
              <Text style={styles.statLabel}>Fail</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: '#f59e0b' }]}>{stats.skip}</Text>
              <Text style={styles.statLabel}>Skip</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: '#6b7280' }]}>{stats.pending}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.runButton, isRunning && styles.runButtonDisabled]}
            onPress={runTests}
            disabled={isRunning}
          >
            {isRunning ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.runButtonText}>▶ Run All Tests</Text>
            )}
          </TouchableOpacity>

          {tests.map((test, i) => (
            <TestResultRow key={i} result={test} />
          ))}
        </Section>

        {/* Logs */}
        <Section title="Console Log">
          <View style={styles.logBox}>
            {logs.length === 0 ? (
              <Text style={styles.logEmpty}>Run tests to see output...</Text>
            ) : (
              logs.map((log, i) => (
                <Text key={i} style={styles.logLine}>{log}</Text>
              ))
            )}
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888888',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 8,
  },
  infoGrid: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLabel: {
    color: '#888888',
    fontSize: 14,
  },
  infoValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  keyBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
  },
  keyLabel: {
    color: '#888888',
    fontSize: 12,
    marginBottom: 4,
  },
  keyValue: {
    color: '#4a9eff',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  stat: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
  runButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  runButtonDisabled: {
    backgroundColor: '#1e3a5f',
  },
  runButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  testRow: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  testContent: {
    flex: 1,
  },
  testName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  testMessage: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  testDetails: {
    color: '#4a9eff',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 4,
  },
  testDuration: {
    color: '#666666',
    fontSize: 10,
    marginTop: 2,
  },
  logBox: {
    backgroundColor: '#0f0f0f',
    borderRadius: 8,
    padding: 12,
    maxHeight: 200,
  },
  logEmpty: {
    color: '#666666',
    fontStyle: 'italic',
  },
  logLine: {
    color: '#22c55e',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
});

