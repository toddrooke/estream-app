/**
 * Signing Request Modal
 * 
 * Displays transaction signing requests from the eStream platform
 * Integrates with Mobile Wallet Adapter for transaction signing
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { transact } from '@solana-mobile/mobile-wallet-adapter-walletlib';

interface SigningRequestProps {
  visible: boolean;
  message: any;
  onApprove: (signature: string) => void;
  onReject: () => void;
}

export function SigningRequestModal({ visible, message, onApprove, onReject }: SigningRequestProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  if (!message) return null;
  
  const data = message.data;
  
  const handleApprove = async () => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Use MWA to sign transaction
      const result = await transact(async (wallet) => {
        // Authorize wallet
        const authResult = await wallet.authorize({
          cluster: 'mainnet-beta',
          identity: { name: 'eStream', uri: 'https://estream.io' },
        });
        
        console.log('Wallet authorized:', authResult);
        
        // Build transaction from data
        const tx = buildTransactionFromData(data);
        
        // Sign with MWA
        const signedTxs = await wallet.signTransactions({
          transactions: [tx],
        });
        
        return signedTxs[0];
      });
      
      // Convert to base64 signature
      const signature = Buffer.from(result).toString('base64');
      
      onApprove(signature);
      
    } catch (err) {
      console.error('Signing failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign transaction');
    } finally {
      setIsProcessing(false);
    }
  };
  
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>🔐 Signing Request</Text>
          <Text style={styles.subtitle}>Review and approve this transaction</Text>
        </View>
        
        <ScrollView style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.label}>Transaction Type</Text>
            <Text style={styles.value}>{data.transaction_type || 'Unknown'}</Text>
          </View>
          
          <View style={styles.section}>
            <Text style={styles.label}>Description</Text>
            <Text style={styles.value}>{data.description || 'No description provided'}</Text>
          </View>
          
          {data.amount_tokens && (
            <View style={styles.section}>
              <Text style={styles.label}>Amount</Text>
              <Text style={[styles.value, styles.valueHighlight]}>
                {data.amount_tokens} eSTREAM
              </Text>
            </View>
          )}
          
          {data.recipient && (
            <View style={styles.section}>
              <Text style={styles.label}>Recipient</Text>
              <Text style={[styles.value, styles.valueMonospace]}>
                {data.recipient}
              </Text>
            </View>
          )}
          
          <View style={styles.section}>
            <Text style={styles.label}>Transaction Details</Text>
            <View style={styles.detailsBox}>
              <Text style={styles.detailsJson}>
                {JSON.stringify(data.details || data, null, 2)}
              </Text>
            </View>
          </View>
          
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>❌ {error}</Text>
            </View>
          )}
        </ScrollView>
        
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.buttonReject]}
            onPress={onReject}
            disabled={isProcessing}
          >
            <Text style={styles.buttonText}>Reject</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.buttonApprove, isProcessing && styles.buttonDisabled]}
            onPress={handleApprove}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Approve & Sign</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function buildTransactionFromData(data: any): Uint8Array {
  // In production, this would build a proper Solana transaction
  // For now, return a placeholder
  return new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  value: {
    fontSize: 16,
    color: '#FFF',
    lineHeight: 22,
  },
  valueHighlight: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  valueMonospace: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  detailsBox: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  detailsJson: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
  },
  button: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonReject: {
    backgroundColor: '#1C1C1E',
  },
  buttonApprove: {
    backgroundColor: '#007AFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});

