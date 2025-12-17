/**
 * eStream Mobile App
 * 
 * React Native client for the eStream network.
 */

import React from 'react';
import { 
  SafeAreaView, 
  StatusBar, 
  StyleSheet, 
  Text, 
  View, 
  ActivityIndicator 
} from 'react-native';
import { VaultProvider, useVault, useTrustBadge } from '@/services/vault';

// Default node URL (can be overridden via config)
const DEFAULT_NODE_URL = 'http://localhost:8080';

/**
 * Main app content with vault integration
 */
function AppContent(): React.JSX.Element {
  const { isLoading, isAvailable, publicKey, error } = useVault();
  const trustBadge = useTrustBadge();

  if (isLoading) {
    return (
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#4a9eff" />
        <Text style={styles.loadingText}>Initializing vault...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.content}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>Vault Error</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <Text style={styles.title}>eStream</Text>
      <Text style={styles.subtitle}>Verifiable Data Streaming</Text>
      
      {/* Trust Badge */}
      <View style={[styles.trustBadge, { backgroundColor: getBadgeColor(trustBadge.color) }]}>
        <Text style={styles.trustIcon}>{trustBadge.icon}</Text>
        <Text style={styles.trustLabel}>{trustBadge.label}</Text>
      </View>
      
      {/* Public Key */}
      {publicKey && (
        <View style={styles.keySection}>
          <Text style={styles.keyLabel}>Public Key</Text>
          <Text style={styles.keyValue}>
            {publicKey.substring(0, 8)}...{publicKey.substring(publicKey.length - 8)}
          </Text>
        </View>
      )}
      
      <Text style={styles.version}>v0.1.0</Text>
    </View>
  );
}

/**
 * Root app component with providers
 */
function App(): React.JSX.Element {
  return (
    <VaultProvider nodeUrl={DEFAULT_NODE_URL}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <AppContent />
      </SafeAreaView>
    </VaultProvider>
  );
}

/**
 * Map badge color names to actual colors
 */
function getBadgeColor(color: string): string {
  switch (color) {
    case 'gold': return '#d4af37';
    case 'green': return '#22c55e';
    case 'orange': return '#f97316';
    case 'red': return '#ef4444';
    default: return '#6b7280';
  }
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
    marginTop: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#888888',
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ef4444',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 24,
  },
  trustIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  trustLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  keySection: {
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  keyLabel: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 4,
  },
  keyValue: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#4a9eff',
  },
});

export default App;
