/**
 * eStream Mobile App
 * 
 * React Native client for the eStream network.
 * 
 * On startup, shows the DevTools screen for self-verification.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import DevTools from './src/screens/DevTools';
import { QuicMessagingClient } from './src/services/quic/QuicClient';

function App(): React.JSX.Element {
  const [quicReady, setQuicReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializeQuic();
  }, []);

  const initializeQuic = async () => {
    try {
      console.log('[App] Starting complete QUIC + PQC test...');
      setError('Step 1/4: Initializing...');
      
      // Create QUIC client
      // Use localhost:5000 which is forwarded via adb reverse to Mac's estream backend
      // The port forwarding is: Seeker:5000 -> Mac:5001 (QUIC node1)
      const client = new QuicMessagingClient('127.0.0.1:5000');
      
      // Step 1: Initialize (creates Tokio runtime)
      console.log('[App] Step 1: Initialize()...');
      await client.initialize();
      console.log('[App] ✅ QUIC client initialized');
      setError('Step 2/4: Generating PQ device keys first...');
      
      // Step 2: Generate device keys FIRST (more stable, no network)
      // This tests the PQ crypto without network dependency
      console.log('[App] Step 2: GenerateDeviceKeys()...');
      const publicKeys = await client.generateDeviceKeys('estream-app');
      console.log('[App] ✅ Device keys generated:', publicKeys);
      setError('Step 3/4: Connecting to eStream node...');
      
      // Step 3: QUIC Connect is DISABLED due to native module bug
      // The Rust code crashes with SIGSEGV when backend is unreachable
      // This needs to be fixed in the estream-quic-native Rust crate
      console.log('[App] ⚠️ QUIC Connect disabled (native module bug)');
      
      // key_hash is a byte array, convert to hex for display
      const keyHashHex = publicKeys.key_hash 
        ? Array.from(publicKeys.key_hash as number[]).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16)
        : 'N/A';
      
      const status = 'SUCCESS! 🎉\n\n' +
        '✅ Tokio runtime initialized\n' +
        '✅ PQ keys generated (Kyber1024 + Dilithium5)\n' +
        '⚠️ QUIC connect disabled (native bug)\n\n' +
        `Key Hash: ${keyHashHex}...`;
      
      setError(status);
      setQuicReady(true);
      console.log('[App] ✅ QUIC/PQ initialization complete!');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[App] Test failed:', errorMsg);
      setError('❌ ERROR: ' + errorMsg);
      setQuicReady(true); // Continue anyway for DevTools
    }
  };

  if (!quicReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>Initializing QUIC...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>QUIC Error: {error}</Text>
        <DevTools />
      </View>
    );
  }

  return <DevTools />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  container: {
    flex: 1,
  },
  error: {
    padding: 16,
    backgroundColor: '#fee',
    color: '#c00',
    fontSize: 12,
  },
});

export default App;
