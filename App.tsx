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
      
      // Create QUIC client (connects via WiFi to Mac)
      // Mac IP on WiFi: 172.26.43.211
      const client = new QuicMessagingClient('172.26.43.211:5001');
      
      // Step 1: Initialize (creates Tokio runtime)
      console.log('[App] Step 1: Initialize()...');
      await client.initialize();
      console.log('[App] ✅ QUIC client initialized');
      setError('Step 2/4: Connecting to eStream node...');
      
      // Step 2: Connect to eStream node
      console.log('[App] Step 2: Connect()...');
      await client.connect();
      console.log('[App] ✅ QUIC connected successfully!');
      setError('Step 3/4: Generating PQ device keys...');
      
      // Step 3: Generate device keys (Kyber1024 + Dilithium5)
      console.log('[App] Step 3: GenerateDeviceKeys()...');
      const publicKeys = await client.generateDeviceKeys('estream-cipher');
      console.log('[App] ✅ Device keys generated:', publicKeys);
      
      setError('SUCCESS! 🎉\n\n' +
        '✅ Tokio runtime initialized\n' +
        '✅ QUIC connection established\n' +
        '✅ PQ keys generated (Kyber1024 + Dilithium5)\n\n' +
        `Key Hash: ${publicKeys.key_hash?.substring(0, 16)}...`
      );
      
      setQuicReady(true);
      console.log('[App] ✅ All tests passed! Native QUIC + PQC working!');
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
