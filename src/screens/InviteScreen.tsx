/**
 * Invite Screen
 * 
 * Create and share ephemeral links for:
 * - Friend invites (add contact)
 * - Payment requests
 * 
 * Uses the Ephemeral Links SDK from @estream/react-native
 */

import React, { useState, useCallback } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { EphemeralLink } from '@estream/react-native';
import { useAccount } from '@/services/account';

// ============================================================================
// Types
// ============================================================================

type InviteType = 'friend' | 'payment';

interface CreatedLink {
  shareUrl: string;
  lookupKey: string;
  expiresIn: number;
  type: InviteType;
}

// ============================================================================
// Component
// ============================================================================

export default function InviteScreen(): React.JSX.Element {
  const { account } = useAccount();
  
  const [inviteType, setInviteType] = useState<InviteType>('friend');
  const [isCreating, setIsCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<CreatedLink | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Payment request fields
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');

  // Create invite link
  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    setCopied(false);
    
    try {
      let result;
      
      if (inviteType === 'friend') {
        result = await EphemeralLink.createFriendInvite({
          name: account?.displayName || undefined,
        });
      } else {
        if (!amount || parseFloat(amount) <= 0) {
          Alert.alert('Invalid Amount', 'Please enter a valid amount.');
          setIsCreating(false);
          return;
        }
        
        result = await EphemeralLink.createPaymentRequest({
          amount,
          currency: 'USDC',
          memo: memo || undefined,
        });
      }
      
      if (result.success) {
        setCreatedLink({
          shareUrl: result.shareUrl,
          lookupKey: result.lookupKey,
          expiresIn: result.expiresIn,
          type: inviteType,
        });
      } else {
        Alert.alert('Error', result.error || 'Failed to create link');
      }
    } catch (error) {
      console.error('[InviteScreen] Create error:', error);
      Alert.alert('Error', 'Failed to create invite link');
    } finally {
      setIsCreating(false);
    }
  }, [inviteType, account, amount, memo]);

  // Share link
  const handleShare = useCallback(async () => {
    if (!createdLink) return;
    
    const message = inviteType === 'friend'
      ? `Join me on eStream! ${createdLink.shareUrl}`
      : `Pay me $${amount} USDC on eStream: ${createdLink.shareUrl}`;
    
    try {
      await Share.share({
        message,
        url: createdLink.shareUrl,
      });
    } catch (error) {
      console.error('[InviteScreen] Share error:', error);
    }
  }, [createdLink, inviteType, amount]);

  // Copy to clipboard
  const handleCopy = useCallback(() => {
    if (!createdLink) return;
    
    Clipboard.setString(createdLink.shareUrl);
    setCopied(true);
    
    setTimeout(() => setCopied(false), 2000);
  }, [createdLink]);

  // Reset to create new
  const handleReset = useCallback(() => {
    setCreatedLink(null);
    setAmount('');
    setMemo('');
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Invite</Text>
          <Text style={styles.subtitle}>
            Share a secure link that expires in 5 minutes
          </Text>
        </View>

        {!createdLink ? (
          <>
            {/* Invite Type Selector */}
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeButton, inviteType === 'friend' && styles.typeButtonActive]}
                onPress={() => setInviteType('friend')}
              >
                <Text style={styles.typeIcon}>👤</Text>
                <Text style={[styles.typeText, inviteType === 'friend' && styles.typeTextActive]}>
                  Friend Invite
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.typeButton, inviteType === 'payment' && styles.typeButtonActive]}
                onPress={() => setInviteType('payment')}
              >
                <Text style={styles.typeIcon}>💵</Text>
                <Text style={[styles.typeText, inviteType === 'payment' && styles.typeTextActive]}>
                  Payment Request
                </Text>
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View style={styles.card}>
              {inviteType === 'friend' ? (
                <>
                  <Text style={styles.cardTitle}>Friend Invite</Text>
                  <Text style={styles.description}>
                    Share a link to add you as a contact.{'\n'}
                    Your display name will be included.
                  </Text>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Your Name</Text>
                    <Text style={styles.infoValue}>{account?.displayName || 'Anonymous'}</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.cardTitle}>Payment Request</Text>
                  <Text style={styles.description}>
                    Request a payment via shareable link.
                  </Text>
                  
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Amount (USDC)</Text>
                    <TextInput
                      style={styles.input}
                      value={amount}
                      onChangeText={setAmount}
                      placeholder="0.00"
                      placeholderTextColor="#666"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Memo (optional)</Text>
                    <TextInput
                      style={styles.input}
                      value={memo}
                      onChangeText={setMemo}
                      placeholder="What's this for?"
                      placeholderTextColor="#666"
                    />
                  </View>
                </>
              )}
            </View>

            {/* Create Button */}
            <TouchableOpacity
              style={[styles.createButton, isCreating && styles.createButtonDisabled]}
              onPress={handleCreate}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.createButtonText}>Create Link</Text>
              )}
            </TouchableOpacity>

            {/* Security Info */}
            <View style={styles.securityInfo}>
              <Text style={styles.securityIcon}>🔒</Text>
              <Text style={styles.securityText}>
                Links are encrypted with ML-KEM-1024{'\n'}
                and expire after 5 minutes
              </Text>
            </View>
          </>
        ) : (
          /* Link Created View */
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Link Created!</Text>
            <Text style={styles.successSubtitle}>
              {inviteType === 'friend' ? 'Friend Invite' : `$${amount} USDC Request`}
            </Text>
            
            <View style={styles.linkBox}>
              <Text style={styles.linkText} numberOfLines={2}>
                {createdLink.shareUrl}
              </Text>
            </View>
            
            <View style={styles.expiryInfo}>
              <Text style={styles.expiryIcon}>⏱</Text>
              <Text style={styles.expiryText}>
                Expires in {Math.floor(createdLink.expiresIn / 60)} minutes
              </Text>
            </View>
            
            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
                <Text style={styles.shareButtonText}>Share</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.copyButton, copied && styles.copyButtonSuccess]} 
                onPress={handleCopy}
              >
                <Text style={styles.copyButtonText}>
                  {copied ? 'Copied!' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.newLinkButton} onPress={handleReset}>
              <Text style={styles.newLinkText}>Create Another</Text>
            </TouchableOpacity>
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
    marginBottom: 24,
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  typeButton: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeButtonActive: {
    borderColor: '#00ffd5',
    backgroundColor: '#0a1a1a',
  },
  typeIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  typeText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '600',
  },
  typeTextActive: {
    color: '#00ffd5',
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: '#888',
    lineHeight: 22,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  infoLabel: {
    fontSize: 14,
    color: '#888',
  },
  infoValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  createButton: {
    backgroundColor: '#00ffd5',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginBottom: 24,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  securityIcon: {
    fontSize: 16,
  },
  securityText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  successCard: {
    backgroundColor: '#1a2a2a',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#00ffd530',
  },
  successIcon: {
    fontSize: 48,
    color: '#00ffd5',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
  },
  linkBox: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 16,
  },
  linkText: {
    fontSize: 14,
    color: '#00ffd5',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  expiryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  expiryIcon: {
    fontSize: 16,
  },
  expiryText: {
    fontSize: 14,
    color: '#f97316',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  shareButton: {
    flex: 1,
    backgroundColor: '#00ffd5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  copyButton: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  copyButtonSuccess: {
    backgroundColor: '#22c55e20',
    borderColor: '#22c55e',
  },
  copyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  newLinkButton: {
    paddingVertical: 12,
  },
  newLinkText: {
    fontSize: 14,
    color: '#888',
  },
});
