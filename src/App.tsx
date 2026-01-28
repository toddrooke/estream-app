/**
 * eStream Mobile App
 * 
 * Clean, production-ready UI with tabbed navigation.
 * Developer tools moved to dedicated tab.
 */

import React, { useState, useCallback } from 'react';
import { 
  SafeAreaView, 
  StatusBar, 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { VaultProvider, useVault, useTrustBadge } from '@/services/vault';
import { AccountProvider, useAccount } from '@/services/account';
import { ETFAService } from '@/services/etfa';

// Screens
import DevTools from '@/screens/DevTools';
import GovernanceScreen from '@/screens/GovernanceScreen';
import ScanScreen from '@/screens/ScanScreen';
import AccountScreen from '@/screens/AccountScreen';

// Network Settings
import { NetworkSettings, networkConfig } from '@estream/react-native';

const Tab = createBottomTabNavigator();

// Get API endpoint from network config (changes based on selected environment)
const getApiEndpoint = () => networkConfig.getEndpoints().apiEndpoint;

/**
 * Home Screen - Clean status overview
 */
function HomeScreen(): React.JSX.Element {
  const { publicKey, error, isLoading } = useVault();
  const trustBadge = useTrustBadge();
  
  // ETFA state
  const [etfaCollecting, setEtfaCollecting] = useState(false);
  const [etfaCount, setEtfaCount] = useState(0);
  const [etfaLastResult, setEtfaLastResult] = useState<string | null>(null);
  
  // ETFA collection handler
  const handleCollectETFA = useCallback(async () => {
    if (etfaCollecting) return;
    
    setEtfaCollecting(true);
    setEtfaLastResult(null);
    
    try {
      // Collect fingerprint (100 samples)
      const fingerprint = await ETFAService.collectFingerprint(100, (op, progress) => {
        console.log(`[ETFA] ${op}: ${(progress * 100).toFixed(0)}%`);
      });
      
      if (!fingerprint) {
        setEtfaLastResult('❌ Collection failed');
        return;
      }
      
      // Convert to lattice record
      const record = ETFAService.toLatticeRecord(fingerprint);
      
      // Submit to lattice using configured API endpoint
      const success = await ETFAService.submitToLattice(
        record,
        networkConfig.getEndpoints().apiEndpoint
      );
      
      if (success) {
        setEtfaCount(c => c + 1);
        setEtfaLastResult(`✓ r5=${fingerprint.r5_mem_seq_to_rand.toFixed(3)}`);
      } else {
        setEtfaLastResult('⚠️ Saved locally (upload failed)');
        setEtfaCount(c => c + 1);
      }
    } catch (e: any) {
      console.error('[ETFA] Error:', e);
      setEtfaLastResult(`❌ ${e.message || 'Unknown error'}`);
    } finally {
      setEtfaCollecting(false);
    }
  }, [etfaCollecting]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>⬡</Text>
          <Text style={styles.title}>eStream</Text>
          <Text style={styles.subtitle}>Verifiable Data Streaming</Text>
        </View>

        {/* Error Display */}
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>⚠️ Vault Error</Text>
            <Text style={styles.errorText}>{error.message}</Text>
          </View>
        )}

        {/* Trust Badge */}
        <View style={[styles.trustBadge, { backgroundColor: getBadgeColor(trustBadge.color) }]}>
          <Text style={styles.trustIcon}>{trustBadge.icon}</Text>
          <Text style={styles.trustLabel}>{isLoading ? 'Loading...' : trustBadge.label}</Text>
        </View>

        {/* ETFA Collection Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Device Fingerprint (ETFA)</Text>
          <Text style={styles.emptyText}>
            Tap to collect timing fingerprint.{'\n'}
            Test in different battery/thermal conditions.
          </Text>
          <TouchableOpacity
            style={[styles.etfaButton, etfaCollecting && styles.etfaButtonDisabled]}
            onPress={handleCollectETFA}
            disabled={etfaCollecting}
          >
            {etfaCollecting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.etfaButtonText}>Collect Fingerprint</Text>
            )}
          </TouchableOpacity>
          <View style={styles.etfaStats}>
            <Text style={styles.etfaStatText}>Collected: {etfaCount}</Text>
            {etfaLastResult && (
              <Text style={styles.etfaLastResult}>{etfaLastResult}</Text>
            )}
          </View>
        </View>

        {/* Identity Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Identity</Text>
          {publicKey ? (
            <View style={styles.keyDisplay}>
              <Text style={styles.keyLabel}>Public Key</Text>
              <Text style={styles.keyValue}>
                {publicKey.substring(0, 12)}...{publicKey.substring(publicKey.length - 8)}
              </Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>Initializing...</Text>
          )}
        </View>

        {/* Status Cards */}
        <View style={styles.statusGrid}>
          <View style={styles.statusCard}>
            <Text style={styles.statusValue}>0</Text>
            <Text style={styles.statusLabel}>Pending Requests</Text>
          </View>
          <View style={styles.statusCard}>
            <Text style={styles.statusValue}>—</Text>
            <Text style={styles.statusLabel}>Network Status</Text>
          </View>
        </View>

        {/* Governance Actions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Governance</Text>
          <Text style={styles.emptyText}>
            No pending signing requests.{'\n'}
            Requests from the CLI will appear here.
          </Text>
        </View>

        {/* Recent Activity */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Activity</Text>
          <Text style={styles.emptyText}>No recent activity</Text>
        </View>

        <Text style={styles.version}>v0.3.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// GovernanceScreen is imported from @/screens/GovernanceScreen

/**
 * Settings Screen
 */
function SettingsScreen(): React.JSX.Element {
  const { publicKey } = useVault();
  const trustBadge = useTrustBadge();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>⚙️ Settings</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Security</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Trust Level</Text>
            <View style={[styles.settingBadge, { backgroundColor: getBadgeColor(trustBadge.color) }]}>
              <Text style={styles.settingBadgeText}>{trustBadge.label}</Text>
            </View>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Signing Algorithm</Text>
            <Text style={styles.settingValue}>ML-DSA-87</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Identity</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Public Key</Text>
            <Text style={styles.settingValueMono}>
              {publicKey ? `${publicKey.substring(0, 8)}...` : '—'}
            </Text>
          </View>
        </View>

        {/* Network Environment Switcher */}
        <NetworkSettings 
          onEnvironmentChange={(env) => {
            console.log('[Settings] Network switched to:', env);
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Tab Navigator with icons
 */
function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '⬡',
    Account: '✦',
    Scan: '📷',
    Governance: '🔐',
    Developer: '🔧',
    Settings: '⚙️',
  };
  
  return (
    <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      {icons[name] || '○'}
    </Text>
  );
}

/**
 * Main App with Navigation
 */
function AppContent(): React.JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#00ffd5',
        tabBarInactiveTintColor: '#666',
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarLabelStyle: styles.tabLabel,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
      <Tab.Screen name="Scan" component={ScanScreen} />
      <Tab.Screen name="Governance" component={GovernanceScreen} />
      <Tab.Screen name="Developer" component={DevTools} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

/**
 * Root App with providers
 */
function App(): React.JSX.Element {
  return (
    <VaultProvider nodeUrl={DEFAULT_NODE_URL}>
      <AccountProvider>
        <NavigationContainer>
          <StatusBar barStyle="light-content" />
          <AppContent />
        </NavigationContainer>
      </AccountProvider>
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
  logo: {
    fontSize: 48,
    color: '#00ffd5',
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
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
    color: '#fff',
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  keyDisplay: {
    backgroundColor: '#0f0f0f',
    borderRadius: 12,
    padding: 16,
  },
  keyLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  keyValue: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#00ffd5',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorCard: {
    backgroundColor: '#2a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#f87171',
    fontFamily: 'monospace',
  },
  statusGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statusCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  statusValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#00ffd5',
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  stepList: {
    gap: 12,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00ffd5',
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 28,
  },
  stepText: {
    fontSize: 14,
    color: '#ccc',
    flex: 1,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  settingLabel: {
    fontSize: 14,
    color: '#888',
  },
  settingValue: {
    fontSize: 14,
    color: '#fff',
  },
  settingValueMono: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#00ffd5',
  },
  settingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  settingBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  version: {
    fontSize: 12,
    color: '#444',
    textAlign: 'center',
    marginTop: 24,
  },
  tabBar: {
    backgroundColor: '#0f0f0f',
    borderTopColor: '#1a1a1a',
    height: 80,
    paddingBottom: 20,
  },
  tabIcon: {
    fontSize: 24,
  },
  tabIconFocused: {
    transform: [{ scale: 1.1 }],
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  // ETFA styles
  etfaButton: {
    backgroundColor: '#00ffd5',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 12,
  },
  etfaButtonDisabled: {
    opacity: 0.6,
  },
  etfaButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  etfaStats: {
    marginTop: 12,
    alignItems: 'center',
  },
  etfaStatText: {
    fontSize: 12,
    color: '#666',
  },
  etfaLastResult: {
    fontSize: 12,
    color: '#00ffd5',
    marginTop: 4,
    fontFamily: 'monospace',
  },
});

export default App;
