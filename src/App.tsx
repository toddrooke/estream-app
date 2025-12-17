/**
 * eStream Mobile App
 * 
 * React Native client for the eStream network.
 */

import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';

function App(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <Text style={styles.title}>eStream</Text>
        <Text style={styles.subtitle}>Verifiable Data Streaming</Text>
        <Text style={styles.version}>v0.1.0</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#888888',
    marginBottom: 24,
  },
  version: {
    fontSize: 14,
    color: '#666666',
  },
});

export default App;

