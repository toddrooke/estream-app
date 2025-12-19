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
      console.log('[App] Initializing native QUIC client...');
      
      // Create QUIC client (connects to localhost for E2E tests)
      const client = new QuicMessagingClient('127.0.0.1:5000');
      
      // Initialize (creates Tokio runtime)
      await client.initialize();
      console.log('[App] QUIC client initialized');
      
      // Connect to eStream node
      await client.connect();
      console.log('[App] QUIC connected successfully');
      
      // Generate device keys
      const publicKeys = await client.generateDeviceKeys('estream-app');
      console.log('[App] Device keys generated:', publicKeys);
      
      setQuicReady(true);
      console.log('[App] Native QUIC module ready!');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[App] Failed to initialize QUIC:', errorMsg);
      setError(errorMsg);
      setQuicReady(true); // Continue anyway for testing
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
