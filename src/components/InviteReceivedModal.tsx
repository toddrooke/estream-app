/**
 * InviteReceivedModal - Modal shown when user opens an ephemeral link
 * 
 * Displays the invite details and allows user to accept or decline.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { EphemeralPayload } from '@/hooks/useEphemeralLinkHandler';

// ============================================================================
// Types
// ============================================================================

interface InviteReceivedModalProps {
  visible: boolean;
  payload: EphemeralPayload | null;
  isLoading: boolean;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function InviteReceivedModal({
  visible,
  payload,
  isLoading,
  error,
  onAccept,
  onDecline,
}: InviteReceivedModalProps): React.JSX.Element {
  
  // Calculate time remaining
  const getTimeRemaining = () => {
    if (!payload?.expiresAt) return null;
    
    const now = Date.now();
    const remaining = payload.expiresAt - now;
    
    if (remaining <= 0) return 'Expired';
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s remaining`;
    }
    return `${seconds}s remaining`;
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ffd5" />
          <Text style={styles.loadingText}>Loading invite...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Unable to Load</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.dismissButton} onPress={onDecline}>
            <Text style={styles.dismissButtonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!payload) {
      return null;
    }

    if (payload.type === 'friend-invite') {
      return (
        <View style={styles.contentContainer}>
          <Text style={styles.icon}>👤</Text>
          <Text style={styles.title}>Friend Invite</Text>
          <Text style={styles.subtitle}>
            {payload.senderName || 'Someone'} wants to connect with you
          </Text>
          
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>From</Text>
            <Text style={styles.infoValue}>
              {payload.senderName || 'Anonymous User'}
            </Text>
          </View>

          {payload.expiresAt && (
            <View style={styles.expiryBadge}>
              <Text style={styles.expiryIcon}>⏱</Text>
              <Text style={styles.expiryText}>{getTimeRemaining()}</Text>
            </View>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.declineButton} onPress={onDecline}>
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptButton} onPress={onAccept}>
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (payload.type === 'org-invite') {
      return (
        <View style={styles.contentContainer}>
          <Text style={styles.icon}>🏢</Text>
          <Text style={styles.title}>Organization Invite</Text>
          <Text style={styles.subtitle}>
            You've been invited to join
          </Text>
          
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Organization</Text>
            <Text style={styles.infoValue}>{payload.orgName || 'Unknown'}</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={styles.infoValue}>{payload.role || 'Member'}</Text>
          </View>

          {payload.expiresAt && (
            <View style={styles.expiryBadge}>
              <Text style={styles.expiryIcon}>⏱</Text>
              <Text style={styles.expiryText}>{getTimeRemaining()}</Text>
            </View>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.declineButton} onPress={onDecline}>
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptButton} onPress={onAccept}>
              <Text style={styles.acceptButtonText}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Default/unknown type
    return (
      <View style={styles.contentContainer}>
        <Text style={styles.icon}>🔗</Text>
        <Text style={styles.title}>Invite Received</Text>
        <Text style={styles.subtitle}>Type: {payload.type}</Text>
        
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.dismissButton} onPress={onDecline}>
            <Text style={styles.dismissButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {renderContent()}
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    width: '100%',
    maxWidth: 360,
    overflow: 'hidden',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
    marginTop: 16,
  },
  errorContainer: {
    padding: 32,
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  contentContainer: {
    padding: 32,
    alignItems: 'center',
  },
  icon: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  infoBox: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2a1a0a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 24,
  },
  expiryIcon: {
    fontSize: 14,
  },
  expiryText: {
    fontSize: 12,
    color: '#f97316',
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#00ffd5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  dismissButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  dismissButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default InviteReceivedModal;
