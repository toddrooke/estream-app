/**
 * Governance Screen
 * 
 * Displays pending signing requests from the CLI and allows
 * users to approve or reject them with ML-DSA-87 signatures.
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
  Alert,
  RefreshControl,
} from 'react-native';
import {
  GovernanceSigningService,
  GovernanceRequest,
  SigningResult,
  SigningServer,
} from '@/services/governance';
import { TrustLevel } from '@/types';
import bs58 from 'bs58';

// ============================================================================
// Components
// ============================================================================

function TrustBadge({ level }: { level: TrustLevel | null }) {
  const config = {
    [TrustLevel.Certified]: { label: 'Certified', color: '#d4af37', icon: '🛡️' },
    [TrustLevel.HardwareBacked]: { label: 'Hardware', color: '#22c55e', icon: '🔒' },
    [TrustLevel.SoftwareBacked]: { label: 'Software', color: '#f97316', icon: '⚠️' },
  };
  
  const { label, color, icon } = level !== null 
    ? config[level] || { label: 'Unknown', color: '#6b7280', icon: '❓' }
    : { label: 'Loading...', color: '#6b7280', icon: '⏳' };
  
  return (
    <View style={[styles.trustBadge, { backgroundColor: color }]}>
      <Text style={styles.trustIcon}>{icon}</Text>
      <Text style={styles.trustLabel}>{label}</Text>
    </View>
  );
}

interface RequestCardProps {
  request: GovernanceRequest;
  onSign: () => void;
  onReject: () => void;
  isSigning: boolean;
}

function RequestCard({ request, onSign, onReject, isSigning }: RequestCardProps) {
  const isCircuit = !!request.metadata?.circuitId;
  const circuitType = request.metadata?.circuitType as string | undefined;
  
  // Get icon based on circuit type
  const getCircuitIcon = (type: string | undefined): string => {
    if (!type) return '📋';
    if (type.includes('vpc')) return '🌐';
    if (type.includes('firewall')) return '🔥';
    if (type.includes('sa') || type.includes('account')) return '👤';
    if (type.includes('ip')) return '📍';
    if (type.includes('deploy') || type.includes('node')) return '🖥️';
    if (type.includes('tunnel') || type.includes('cloudflare')) return '🚇';
    return '⚙️';
  };
  
  const icon = isCircuit ? getCircuitIcon(circuitType) : GovernanceSigningService.getOperationIcon(request.operation);
  const timeRemaining = Math.max(0, request.expiresAt - Date.now());
  const minutes = Math.floor(timeRemaining / 60000);
  const seconds = Math.floor((timeRemaining % 60000) / 1000);
  
  // Format circuit type for display
  const formatCircuitType = (type: string | undefined): string => {
    if (!type) return 'CIRCUIT';
    // estream.ops.create.vpc.v1 -> VPC
    const parts = type.split('.');
    if (parts.length >= 4) {
      return parts[3].toUpperCase();
    }
    return type.toUpperCase();
  };
  
  return (
    <View style={styles.requestCard}>
      {/* Header */}
      <View style={styles.requestHeader}>
        <Text style={styles.requestIcon}>{icon}</Text>
        <View style={styles.requestTitleContainer}>
          <Text style={styles.requestOperation}>
            {isCircuit ? formatCircuitType(circuitType) : request.operation.toUpperCase()}
          </Text>
          <Text style={styles.requestExpiry}>
            Expires in {minutes}:{seconds.toString().padStart(2, '0')}
          </Text>
        </View>
      </View>
      
      {/* Description - prominently displayed */}
      <Text style={styles.requestDescription}>
        {request.description || 'No description'}
      </Text>
      
      {/* Circuit-specific metadata */}
      {isCircuit && (
        <View style={styles.metadataContainer}>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Circuit:</Text>
            <Text style={styles.metadataValue}>{request.metadata?.circuitId}</Text>
          </View>
          {request.metadata?.environment && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Environment:</Text>
              <Text style={styles.metadataValue}>{request.metadata.environment}</Text>
            </View>
          )}
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Signatures:</Text>
            <Text style={styles.metadataValue}>
              {request.metadata?.currentSignatures || 0} / {request.metadata?.requiredSignatures || 1}
            </Text>
          </View>
        </View>
      )}
      
      {/* Legacy metadata for non-circuit requests */}
      {!isCircuit && request.metadata && Object.keys(request.metadata).length > 0 && (
        <View style={styles.metadataContainer}>
          {request.metadata.estimatedCost && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Est. Cost:</Text>
              <Text style={styles.metadataValue}>{request.metadata.estimatedCost}</Text>
            </View>
          )}
          {request.metadata.region && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Region:</Text>
              <Text style={styles.metadataValue}>{request.metadata.region}</Text>
            </View>
          )}
          {request.metadata.nodeCount && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Nodes:</Text>
              <Text style={styles.metadataValue}>{request.metadata.nodeCount}</Text>
            </View>
          )}
        </View>
      )}
      
      {/* Payload Hash */}
      <View style={styles.payloadContainer}>
        <Text style={styles.payloadLabel}>Payload Hash</Text>
        <Text style={styles.payloadHash}>
          {bs58.encode(request.payload).substring(0, 24)}...
        </Text>
      </View>
      
      {/* Actions */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          onPress={onReject}
          disabled={isSigning}
        >
          <Text style={styles.rejectButtonText}>✗ Reject</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.signButton, isSigning && styles.buttonDisabled]}
          onPress={onSign}
          disabled={isSigning}
        >
          {isSigning ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.signButtonText}>✓ Sign</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface SignatureCardProps {
  result: SigningResult;
}

function SignatureCard({ result }: SignatureCardProps) {
  const date = new Date(result.timestamp);
  const timeStr = date.toLocaleTimeString();
  
  return (
    <View style={styles.signatureCard}>
      <View style={styles.signatureHeader}>
        <Text style={styles.signatureIcon}>✓</Text>
        <View style={styles.signatureInfo}>
          <Text style={styles.signatureId}>
            {result.requestId.substring(0, 16)}...
          </Text>
          <Text style={styles.signatureTime}>{timeStr}</Text>
        </View>
      </View>
      <Text style={styles.signatureAlgo}>{result.algorithm}</Text>
    </View>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function GovernanceScreen(): React.JSX.Element {
  const [pendingRequests, setPendingRequests] = useState<GovernanceRequest[]>([]);
  const [recentSignatures, setRecentSignatures] = useState<SigningResult[]>([]);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [keyHash, setKeyHash] = useState<string | null>(null);
  const [trustLevel, setTrustLevel] = useState<TrustLevel | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  // Load initial state and start server
  useEffect(() => {
    console.log('[GovernanceScreen] useEffect starting...');
    
    // Clear cached service to pick up Seeker if available
    const { clearMlDsaServiceCache } = require('@/services/vault');
    clearMlDsaServiceCache();
    
    loadState();
    startListening();
    
    // Poll for pending requests every 2 seconds
    const pollInterval = setInterval(() => {
      const requests = GovernanceSigningService.getPendingRequests();
      console.log('[GovernanceScreen] Polling, found', requests.length, 'requests');
      setPendingRequests(requests);
    }, 2000);
    
    // Start the SigningServer for CLI communication
    console.log('[GovernanceScreen] About to call SigningServer.start()...');
    SigningServer.start().then((started) => {
      console.log('[GovernanceScreen] SigningServer.start() returned:', started);
      if (started) {
        console.log('[GovernanceScreen] SigningServer started successfully');
      } else {
        console.warn('[GovernanceScreen] Failed to start SigningServer');
      }
    }).catch((error: unknown) => {
      console.error('[GovernanceScreen] SigningServer.start() threw error:', error);
    });
    
    // Subscribe to events
    const handleRequest = () => loadState();
    const handleSigned = () => loadState();
    const handleRejected = () => loadState();
    const handleExpired = () => loadState();
    
    GovernanceSigningService.on('request', handleRequest);
    GovernanceSigningService.on('signed', handleSigned);
    GovernanceSigningService.on('rejected', handleRejected);
    GovernanceSigningService.on('expired', handleExpired);
    
    return () => {
      clearInterval(pollInterval);
      GovernanceSigningService.off('request', handleRequest);
      GovernanceSigningService.off('signed', handleSigned);
      GovernanceSigningService.off('rejected', handleRejected);
      GovernanceSigningService.off('expired', handleExpired);
    };
  }, []);
  
  const loadState = useCallback(async () => {
    setPendingRequests(GovernanceSigningService.getPendingRequests());
    setRecentSignatures(GovernanceSigningService.getRecentSignatures(5));
    
    const hash = await GovernanceSigningService.getKeyHash();
    setKeyHash(hash);
    
    const level = await GovernanceSigningService.getTrustLevel();
    setTrustLevel(level);
  }, []);
  
  const startListening = useCallback(async () => {
    await GovernanceSigningService.startListening();
    setIsListening(true);
  }, []);
  
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadState();
    setIsRefreshing(false);
  }, [loadState]);
  
  const handleSign = useCallback(async (requestId: string) => {
    setSigningId(requestId);
    
    try {
      await GovernanceSigningService.signRequest(requestId);
      Alert.alert('✓ Signed', 'Governance operation signed successfully with ML-DSA-87.');
    } catch (error) {
      Alert.alert('Signing Failed', String(error));
    } finally {
      setSigningId(null);
      loadState();
    }
  }, [loadState]);
  
  const handleReject = useCallback((requestId: string) => {
    Alert.alert(
      'Reject Request?',
      'Are you sure you want to reject this governance request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () => {
            GovernanceSigningService.rejectRequest(requestId, 'User rejected');
            loadState();
          },
        },
      ]
    );
  }, [loadState]);
  
  // Simulate adding a test request (for development)
  const addTestRequest = useCallback(() => {
    const testRequest: GovernanceRequest = {
      id: `test-${Date.now()}`,
      operation: 'provision',
      description: 'Provision 2 edge nodes in us-central1',
      timestamp: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      payload: new Uint8Array(32).map((_, i) => i),
      metadata: {
        nodeType: 'edge',
        nodeCount: 2,
        region: 'us-central1',
        estimatedCost: '$0.05/hr',
      },
    };
    
    GovernanceSigningService.addRequest(testRequest);
    loadState();
  }, [loadState]);
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#00ffd5"
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>🔐 Governance</Text>
          <Text style={styles.subtitle}>ML-DSA-87 Post-Quantum Signing</Text>
        </View>
        
        {/* Key Info */}
        <View style={styles.keyInfoCard}>
          <View style={styles.keyInfoRow}>
            <Text style={styles.keyInfoLabel}>Signing Key</Text>
            <TrustBadge level={trustLevel} />
          </View>
          <Text style={styles.keyHash}>
            {keyHash ? `${keyHash.substring(0, 16)}...` : 'Loading...'}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, isListening ? styles.statusOnline : styles.statusOffline]} />
            <Text style={styles.statusText}>
              {isListening ? 'Listening for CLI requests' : 'Not connected'}
            </Text>
          </View>
        </View>
        
        {/* Pending Requests */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Pending Requests ({pendingRequests.length})
          </Text>
          
          {pendingRequests.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>No pending signing requests</Text>
              <Text style={styles.emptySubtext}>
                Run governance commands from the CLI{'\n'}and they will appear here
              </Text>
              
              {/* Dev mode: Add test request */}
              {__DEV__ && (
                <TouchableOpacity
                  style={styles.testButton}
                  onPress={addTestRequest}
                >
                  <Text style={styles.testButtonText}>+ Add Test Request</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            pendingRequests.map(request => (
              <RequestCard
                key={request.id}
                request={request}
                onSign={() => handleSign(request.id)}
                onReject={() => handleReject(request.id)}
                isSigning={signingId === request.id}
              />
            ))
          )}
        </View>
        
        {/* How It Works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.stepsCard}>
            <View style={styles.step}>
              <Text style={styles.stepNumber}>1</Text>
              <Text style={styles.stepText}>Run a governance command from CLI</Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNumber}>2</Text>
              <Text style={styles.stepText}>Request appears here for approval</Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNumber}>3</Text>
              <Text style={styles.stepText}>Review details and tap Sign</Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNumber}>4</Text>
              <Text style={styles.stepText}>ML-DSA-87 signature sent to CLI</Text>
            </View>
          </View>
        </View>
        
        {/* Recent Signatures */}
        {recentSignatures.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Signatures</Text>
            {recentSignatures.map(sig => (
              <SignatureCard key={sig.requestId} result={sig} />
            ))}
          </View>
        )}
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
  
  // Key Info
  keyInfoCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  keyInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  keyInfoLabel: {
    fontSize: 14,
    color: '#888',
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trustIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  trustLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  keyHash: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#00ffd5',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusOnline: {
    backgroundColor: '#22c55e',
  },
  statusOffline: {
    backgroundColor: '#ef4444',
  },
  statusText: {
    fontSize: 12,
    color: '#888',
  },
  
  // Sections
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  
  // Request Card
  requestCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  requestIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  requestTitleContainer: {
    flex: 1,
  },
  requestOperation: {
    fontSize: 14,
    fontWeight: '700',
    color: '#00ffd5',
    letterSpacing: 1,
  },
  requestExpiry: {
    fontSize: 12,
    color: '#f97316',
    marginTop: 2,
  },
  requestDescription: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 12,
    lineHeight: 20,
  },
  metadataContainer: {
    backgroundColor: '#0f0f0f',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metadataLabel: {
    fontSize: 12,
    color: '#666',
  },
  metadataValue: {
    fontSize: 12,
    color: '#aaa',
  },
  payloadContainer: {
    marginBottom: 16,
  },
  payloadLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  payloadHash: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#888',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButton: {
    backgroundColor: '#2a1a1a',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  rejectButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  signButton: {
    backgroundColor: '#00ffd5',
  },
  signButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  
  // Empty State
  emptyCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  testButton: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1a3a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  testButtonText: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600',
  },
  
  // Steps
  stepsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
    marginRight: 12,
  },
  stepText: {
    fontSize: 14,
    color: '#ccc',
    flex: 1,
  },
  
  // Signature Card
  signatureCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  signatureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  signatureIcon: {
    fontSize: 16,
    color: '#22c55e',
    marginRight: 12,
  },
  signatureInfo: {
    flex: 1,
  },
  signatureId: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#888',
  },
  signatureTime: {
    fontSize: 11,
    color: '#666',
  },
  signatureAlgo: {
    fontSize: 10,
    color: '#00ffd5',
    fontWeight: '600',
  },
});
