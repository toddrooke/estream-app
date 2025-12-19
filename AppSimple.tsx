/**
 * Simple test to verify native module works
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { NativeModules } from 'react-native';

const { QuicClient } = NativeModules;

function AppSimple(): React.JSX.Element {
  const [status, setStatus] = useState('Starting...');
  const [handle, setHandle] = useState<number | null>(null);

  useEffect(() => {
    // Test module automatically on mount
    testModule();
  }, []);

  const testModule = async () => {
    try {
      setStatus('Step 1: Initialize...');
      
      if (!QuicClient) {
        setStatus('ERROR: QuicClient module not found!');
        console.error('QuicClient module not found!');
        return;
      }
      
      // Step 1: Initialize
      console.log('[AppSimple] Step 1: Calling QuicClient.initialize()...');
      const managerHandle = await QuicClient.initialize();
      console.log('[AppSimple] Initialize returned handle:', managerHandle);
      setStatus(`Step 2: Connecting to 127.0.0.1:5001...`);
      setHandle(managerHandle);
      
      // Step 2: Connect
      console.log('[AppSimple] Step 2: Calling QuicClient.connect()...');
      await QuicClient.connect(managerHandle, '127.0.0.1:5001');
      console.log('[AppSimple] Connected successfully!');
      setStatus(`Step 3: Generating device keys...`);
      
      // Step 3: Generate device keys
      console.log('[AppSimple] Step 3: Calling QuicClient.generateDeviceKeys()...');
      const keysJson = await QuicClient.generateDeviceKeys('estream-app');
      const keys = JSON.parse(keysJson);
      console.log('[AppSimple] Keys generated:', keys);
      setStatus(`SUCCESS! All tests passed!\n\nHandle: ${managerHandle}\n\nKeys generated: ${keys.key_hash.substring(0, 16)}...`);
      
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[AppSimple] Error:', errMsg);
      setStatus(`ERROR: ${errMsg}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Native QUIC Module Test</Text>
      <Text style={styles.status}>{status}</Text>
      {handle && <Text style={styles.handle}>Handle: {handle}</Text>}
      <Button title="Test Module" onPress={testModule} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  status: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  handle: {
    fontSize: 14,
    color: '#080',
    marginBottom: 20,
  },
});

export default AppSimple;

