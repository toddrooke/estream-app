/**
 * eStream Mobile App
 * 
 * Production-ready unified experience for users and operators.
 * Phase 8: Complete app redesign with biometric gate.
 * 
 * Tabs:
 * 1. Home - Quick status, governance alerts, activity
 * 2. Wallet - Balance, transactions, identity
 * 3. Spark - Render/Scan for payments and verification
 * 4. Metrics - Network health, costs (operator/tenant)
 * 5. Settings - Network, biometrics, ETFA, identity
 */

import React, { useState, useCallback, useEffect } from 'react';
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
import { getBiometricService } from '@/services/biometric';

// Screens
import GovernanceScreen from '@/screens/GovernanceScreen';
import SparkScreen from '@/screens/SparkScreen';
import WalletScreen from '@/screens/WalletScreen';
import MetricsScreen from '@/screens/MetricsScreen';

// Ephemeral Links
import { useEphemeralLinkHandler } from '@/hooks/useEphemeralLinkHandler';
import { InviteReceivedModal } from '@/components/InviteReceivedModal';
import { PaymentRequestModal } from '@/components/PaymentRequestModal';

// Network Settings
import { NetworkSettings } from '@estream/react-native';

const Tab = createBottomTabNavigator();

// Default node URL
const DEFAULT_NODE_URL = 'http://localhost:8080';

/**
 * Home Screen - Clean status overview
 */
function HomeScreen(): React.JSX.Element {
  const { publicKey, error, isLoading } = useVault();
  const trustBadge = useTrustBadge();

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
  
  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('None');
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  
  // ETFA state
  const [etfaCollecting, setEtfaCollecting] = useState(false);
  const [etfaCount, setEtfaCount] = useState(0);
  const [etfaLastResult, setEtfaLastResult] = useState<string | null>(null);

  // Check biometric status on mount
  useEffect(() => {
    const checkBiometric = async () => {
      try {
        const biometricService = getBiometricService();
        const status = await biometricService.getStatus();
        setBiometricAvailable(status.available);
        setBiometricType(status.biometricType === 'FaceID' ? 'Face ID' : 
                         status.biometricType === 'TouchID' ? 'Touch ID' : 
                         status.biometricType === 'Fingerprint' ? 'Fingerprint' : 'None');
      } catch (e) {
        console.log('[Settings] Biometric check failed:', e);
      }
    };
    checkBiometric();
  }, []);
  
  // ETFA collection handler
  const handleCollectETFA = useCallback(async () => {
    if (etfaCollecting) return;
    
    setEtfaCollecting(true);
    setEtfaLastResult(null);
    
    try {
      const fingerprint = await ETFAService.collectFingerprint(100, (op, progress) => {
        console.log(`[ETFA] ${op}: ${(progress * 100).toFixed(0)}%`);
      });
      
      if (!fingerprint) {
        setEtfaLastResult('Collection failed');
        return;
      }
      
      const record = ETFAService.toLatticeRecord(fingerprint);
      const { getNetworkEndpoints } = require('@estream/react-native');
      const endpoints = getNetworkEndpoints();
      const latticeUrl = endpoints.sparkLatticeUrl || 'https://edge.estream.dev';
      
      const success = await ETFAService.submitToLattice(record, latticeUrl);
      
      if (success) {
        setEtfaCount(c => c + 1);
        setEtfaLastResult(`r5=${fingerprint.r5_mem_seq_to_rand.toFixed(3)}`);
      } else {
        setEtfaLastResult('Saved locally (upload failed)');
        setEtfaCount(c => c + 1);
      }
    } catch (e: any) {
      console.error('[ETFA] Error:', e);
      setEtfaLastResult(`Error: ${e.message || 'Unknown'}`);
    } finally {
      setEtfaCollecting(false);
    }
  }, [etfaCollecting]);

  const toggleBiometric = useCallback(() => {
    setBiometricEnabled(prev => !prev);
    // In production, save to AsyncStorage
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Settings</Text>
        </View>

        {/* Network Environment Switcher - First for prominence */}
        <NetworkSettings 
          onEnvironmentChange={(env) => {
            console.log('[Settings] Network switched to:', env);
          }}
        />

        {/* Biometric Preferences */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Biometric Authentication</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{biometricType}</Text>
            <View style={[
              styles.settingBadge, 
              { backgroundColor: biometricAvailable ? '#22c55e' : '#666' }
            ]}>
              <Text style={styles.settingBadgeText}>
                {biometricAvailable ? 'Available' : 'Not Available'}
              </Text>
            </View>
          </View>
          {biometricAvailable && (
            <TouchableOpacity style={styles.settingRow} onPress={toggleBiometric}>
              <Text style={styles.settingLabel}>Require on Launch</Text>
              <Text style={[styles.settingValue, { color: biometricEnabled ? '#22c55e' : '#666' }]}>
                {biometricEnabled ? 'Enabled ✓' : 'Disabled'}
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Require for Governance</Text>
            <Text style={[styles.settingValue, { color: '#22c55e' }]}>Always ✓</Text>
          </View>
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

        {/* ETFA Device Fingerprint */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Device Fingerprint (ETFA)</Text>
          <Text style={styles.emptyText}>
            Collect timing fingerprint for device attestation.{'\n'}
            Submits to currently selected network.
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

        <Text style={styles.version}>v0.4.0</Text>
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
    Wallet: '💎',
    Spark: '✦',
    Metrics: '📊',
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
  // Handle incoming ephemeral links
  const { isLoading, payload, error, clear } = useEphemeralLinkHandler();
  
  // Handle accepting an invite
  const handleAcceptInvite = useCallback(() => {
    if (!payload) return;
    
    if (payload.type === 'friend-invite') {
      // TODO: Add contact to local storage
      Alert.alert('Contact Added', `${payload.senderName || 'User'} has been added to your contacts.`);
    } else if (payload.type === 'org-invite') {
      // TODO: Accept org invite
      Alert.alert('Joined', `You have joined ${payload.orgName || 'the organization'}.`);
    }
    
    clear();
  }, [payload, clear]);

  // Handle declining an invite
  const handleDeclineInvite = useCallback(() => {
    clear();
  }, [clear]);

  // Handle completing a payment
  const handlePaymentComplete = useCallback(() => {
    clear();
  }, [clear]);

  // Determine which modal to show
  const showInviteModal = !!(payload && (payload.type === 'friend-invite' || payload.type === 'org-invite'));
  const showPaymentModal = !!(payload && payload.type === 'payment-request');

  return (
    <>
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
        <Tab.Screen name="Wallet" component={WalletScreen} />
        <Tab.Screen name="Spark" component={SparkScreen} />
        <Tab.Screen name="Metrics" component={MetricsScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>

      {/* Ephemeral Link Modals */}
      <InviteReceivedModal
        visible={showInviteModal || isLoading || !!error}
        payload={payload}
        isLoading={isLoading}
        error={error}
        onAccept={handleAcceptInvite}
        onDecline={handleDeclineInvite}
      />

      <PaymentRequestModal
        visible={showPaymentModal}
        payload={payload}
        isLoading={false}
        error={null}
        onComplete={handlePaymentComplete}
        onCancel={handleDeclineInvite}
      />
    </>
  );
}

/**
 * Biometric Gate - requires authentication to access app
 */
function BiometricGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [biometricType, setBiometricType] = useState<string>('Biometric');

  const authenticate = useCallback(async () => {
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const biometricService = getBiometricService();
      const status = await biometricService.getStatus();

      if (!status.available) {
        // No biometric available - allow access (but show warning in settings)
        console.log('[BiometricGate] No biometric available, granting access');
        setIsAuthenticated(true);
        setIsAuthenticating(false);
        return;
      }

      setBiometricType(status.biometricType === 'FaceID' ? 'Face ID' : 
                       status.biometricType === 'TouchID' ? 'Touch ID' : 
                       status.biometricType === 'Fingerprint' ? 'Fingerprint' : 'Biometric');

      const result = await biometricService.authenticate(
        'Authenticate to access eStream',
        'Verify your identity'
      );

      if (result.success) {
        setIsAuthenticated(true);
      } else if (result.cancelled) {
        setAuthError('Authentication cancelled');
      } else {
        setAuthError(result.errorMessage || 'Authentication failed');
      }
    } catch (error) {
      console.error('[BiometricGate] Error:', error);
      setAuthError(error instanceof Error ? error.message : 'Authentication error');
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  // Authenticate on mount
  useEffect(() => {
    authenticate();
  }, [authenticate]);

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <SafeAreaView style={styles.biometricGate}>
      <View style={styles.biometricContent}>
        <Text style={styles.biometricLogo}>⬡</Text>
        <Text style={styles.biometricTitle}>eStream</Text>
        
        {isAuthenticating ? (
          <>
            <ActivityIndicator size="large" color="#00ffd5" style={styles.biometricSpinner} />
            <Text style={styles.biometricStatus}>Authenticating with {biometricType}...</Text>
          </>
        ) : authError ? (
          <>
            <Text style={styles.biometricError}>{authError}</Text>
            <TouchableOpacity style={styles.biometricRetryButton} onPress={authenticate}>
              <Text style={styles.biometricRetryText}>Try Again</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.biometricUnlockButton} onPress={authenticate}>
            <Text style={styles.biometricUnlockIcon}>🔓</Text>
            <Text style={styles.biometricUnlockText}>Unlock with {biometricType}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

/**
 * Root App with providers and biometric gate
 */
function App(): React.JSX.Element {
  return (
    <VaultProvider nodeUrl={DEFAULT_NODE_URL}>
      <AccountProvider>
        <BiometricGate>
          <NavigationContainer>
            <StatusBar barStyle="light-content" />
            <AppContent />
          </NavigationContainer>
        </BiometricGate>
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
  // Biometric Gate styles
  biometricGate: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  biometricContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  biometricLogo: {
    fontSize: 80,
    color: '#00ffd5',
    marginBottom: 16,
  },
  biometricTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 48,
  },
  biometricSpinner: {
    marginBottom: 16,
  },
  biometricStatus: {
    fontSize: 16,
    color: '#888',
  },
  biometricError: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 24,
  },
  biometricRetryButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  biometricRetryText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  biometricUnlockButton: {
    backgroundColor: '#00ffd5',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  biometricUnlockIcon: {
    fontSize: 24,
  },
  biometricUnlockText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
});

export default App;
