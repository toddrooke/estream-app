/**
 * PaymentRequestModal - Modal for handling incoming payment requests
 * 
 * Shows payment details and allows user to pay with:
 * 1. eStream wallet (if sufficient balance)
 * 2. Solana/MWA wallet (if eStream balance insufficient)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { getNetworkEndpoints } from '@estream/react-native';
import { getMwaService, MwaService } from '@/services/solana/MwaService';
import type { EphemeralPayload } from '@/hooks/useEphemeralLinkHandler';

// ============================================================================
// Types
// ============================================================================

interface PaymentRequestModalProps {
  visible: boolean;
  payload: EphemeralPayload | null;
  isLoading: boolean;
  error: string | null;
  onComplete: () => void;
  onCancel: () => void;
}

interface WalletBalance {
  usdc: number;
  sol: number;
  ess: number;
}

type PaymentMethod = 'estream' | 'solana' | null;

// ============================================================================
// Component
// ============================================================================

export function PaymentRequestModal({
  visible,
  payload,
  isLoading,
  error,
  onComplete,
  onCancel,
}: PaymentRequestModalProps): React.JSX.Element {
  
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mwaAvailable, setMwaAvailable] = useState(false);

  const requestedAmount = parseFloat(payload?.amount || '0');
  const currency = payload?.currency || 'USDC';

  // Check MWA availability
  useEffect(() => {
    setMwaAvailable(MwaService.isAvailable());
  }, []);

  // Fetch wallet balance when modal opens
  useEffect(() => {
    if (visible && payload?.type === 'payment-request') {
      fetchWalletBalance();
    }
  }, [visible, payload]);

  // Fetch eStream wallet balance
  const fetchWalletBalance = useCallback(async () => {
    setIsLoadingBalance(true);
    
    try {
      const endpoints = getNetworkEndpoints();
      const baseUrl = endpoints.sparkLatticeUrl || 'https://edge.estream.dev';
      
      const response = await fetch(`${baseUrl}/api/tenant/balance`, {
        headers: { 'Accept': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        setWalletBalance({
          usdc: data.balance || 0,
          sol: data.sol || 0,
          ess: data.ess || 0,
        });

        // Auto-select payment method based on balance
        if (data.balance >= requestedAmount) {
          setSelectedMethod('estream');
        } else if (mwaAvailable || Platform.OS === 'ios') {
          setSelectedMethod('solana');
        }
      } else {
        // Default to showing Solana option
        setWalletBalance({ usdc: 0, sol: 0, ess: 0 });
        setSelectedMethod('solana');
      }
    } catch (err) {
      console.error('[PaymentRequest] Balance fetch error:', err);
      setWalletBalance({ usdc: 0, sol: 0, ess: 0 });
      setSelectedMethod('solana');
    } finally {
      setIsLoadingBalance(false);
    }
  }, [requestedAmount, mwaAvailable]);

  // Process payment with eStream wallet
  const processEstreamPayment = useCallback(async () => {
    setIsProcessing(true);
    
    try {
      const endpoints = getNetworkEndpoints();
      const baseUrl = endpoints.sparkLatticeUrl || 'https://edge.estream.dev';
      
      // TODO: Implement actual transfer via eStream wallet
      // This would call a circuit to transfer USDC
      const response = await fetch(`${baseUrl}/api/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: payload?.recipientKeyRef,
          amount: payload?.amount,
          currency: payload?.currency,
          memo: payload?.memo,
        }),
      });

      if (response.ok) {
        Alert.alert('Payment Sent', `Successfully sent ${payload?.amount} ${currency}`);
        onComplete();
      } else {
        throw new Error('Transfer failed');
      }
    } catch (err) {
      console.error('[PaymentRequest] eStream payment error:', err);
      Alert.alert('Payment Failed', 'Unable to process payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [payload, currency, onComplete]);

  // Process payment with Solana/MWA
  const processSolanaPayment = useCallback(async () => {
    setIsProcessing(true);
    
    try {
      if (Platform.OS === 'android') {
        // Use MWA for Android
        if (!mwaAvailable) {
          Alert.alert(
            'Wallet Not Available',
            'Mobile Wallet Adapter is not available on this device. Please install a compatible wallet like Phantom or Solflare.',
          );
          setIsProcessing(false);
          return;
        }

        const mwaService = getMwaService();
        
        // Authorize if needed
        if (!mwaService.isAuthorized()) {
          await mwaService.authorize();
        }

        // TODO: Build and sign USDC transfer transaction
        // For now, show placeholder
        Alert.alert(
          'Solana Payment',
          `This will transfer ${payload?.amount} USDC via your Solana wallet.\n\nTransaction signing coming soon.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Continue', 
              onPress: () => {
                // TODO: Build and submit transaction
                Alert.alert('Success', 'Payment initiated');
                onComplete();
              }
            },
          ]
        );
      } else {
        // iOS - use deep link to wallet app
        Alert.alert(
          'Solana Payment',
          `This will open your Solana wallet to transfer ${payload?.amount} USDC.\n\nWallet integration coming soon.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Wallet', onPress: () => onComplete() },
          ]
        );
      }
    } catch (err) {
      console.error('[PaymentRequest] Solana payment error:', err);
      Alert.alert('Payment Failed', 'Unable to connect to wallet. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [payload, mwaAvailable, onComplete]);

  // Handle pay button press
  const handlePay = useCallback(() => {
    if (selectedMethod === 'estream') {
      processEstreamPayment();
    } else if (selectedMethod === 'solana') {
      processSolanaPayment();
    }
  }, [selectedMethod, processEstreamPayment, processSolanaPayment]);

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

  const hasSufficientBalance = walletBalance && walletBalance.usdc >= requestedAmount;

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ffd5" />
          <Text style={styles.loadingText}>Loading request...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Unable to Load</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.dismissButton} onPress={onCancel}>
            <Text style={styles.dismissButtonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!payload || payload.type !== 'payment-request') {
      return null;
    }

    return (
      <View style={styles.contentContainer}>
        <Text style={styles.icon}>💵</Text>
        <Text style={styles.title}>Payment Request</Text>
        
        {/* Amount */}
        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Amount Requested</Text>
          <Text style={styles.amountValue}>
            {payload.amount} {currency}
          </Text>
          {payload.memo && (
            <Text style={styles.memo}>"{payload.memo}"</Text>
          )}
        </View>

        {/* Expiry */}
        {payload.expiresAt && (
          <View style={styles.expiryBadge}>
            <Text style={styles.expiryIcon}>⏱</Text>
            <Text style={styles.expiryText}>{getTimeRemaining()}</Text>
          </View>
        )}

        {/* Balance & Payment Method */}
        {isLoadingBalance ? (
          <View style={styles.loadingBalanceContainer}>
            <ActivityIndicator size="small" color="#888" />
            <Text style={styles.loadingBalanceText}>Checking wallet balance...</Text>
          </View>
        ) : (
          <>
            {/* eStream Wallet Option */}
            <TouchableOpacity
              style={[
                styles.paymentOption,
                selectedMethod === 'estream' && styles.paymentOptionSelected,
                !hasSufficientBalance && styles.paymentOptionDisabled,
              ]}
              onPress={() => hasSufficientBalance && setSelectedMethod('estream')}
              disabled={!hasSufficientBalance}
            >
              <View style={styles.paymentOptionHeader}>
                <Text style={styles.paymentOptionIcon}>⬡</Text>
                <View style={styles.paymentOptionInfo}>
                  <Text style={styles.paymentOptionTitle}>eStream Wallet</Text>
                  <Text style={styles.paymentOptionBalance}>
                    Balance: {walletBalance?.usdc.toFixed(2) || '0.00'} USDC
                  </Text>
                </View>
                {selectedMethod === 'estream' && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
              {!hasSufficientBalance && (
                <Text style={styles.insufficientText}>Insufficient balance</Text>
              )}
            </TouchableOpacity>

            {/* Solana Wallet Option */}
            <TouchableOpacity
              style={[
                styles.paymentOption,
                selectedMethod === 'solana' && styles.paymentOptionSelected,
              ]}
              onPress={() => setSelectedMethod('solana')}
            >
              <View style={styles.paymentOptionHeader}>
                <Text style={styles.paymentOptionIcon}>◎</Text>
                <View style={styles.paymentOptionInfo}>
                  <Text style={styles.paymentOptionTitle}>
                    {Platform.OS === 'android' ? 'Solana Wallet (MWA)' : 'Solana Wallet'}
                  </Text>
                  <Text style={styles.paymentOptionBalance}>
                    Pay with external wallet
                  </Text>
                </View>
                {selectedMethod === 'solana' && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
            </TouchableOpacity>
          </>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.payButton, (!selectedMethod || isProcessing) && styles.payButtonDisabled]} 
            onPress={handlePay}
            disabled={!selectedMethod || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.payButtonText}>
                Pay {payload.amount} {currency}
              </Text>
            )}
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
      onRequestClose={onCancel}
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
    maxWidth: 400,
    maxHeight: '85%',
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
    padding: 24,
    alignItems: 'center',
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  amountBox: {
    backgroundColor: '#0a1a0a',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#22c55e30',
  },
  amountLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#22c55e',
  },
  memo: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
    fontStyle: 'italic',
  },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2a1a0a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 20,
  },
  expiryIcon: {
    fontSize: 14,
  },
  expiryText: {
    fontSize: 12,
    color: '#f97316',
    fontWeight: '600',
  },
  loadingBalanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  loadingBalanceText: {
    fontSize: 14,
    color: '#888',
  },
  paymentOption: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentOptionSelected: {
    borderColor: '#00ffd5',
    backgroundColor: '#0a1a1a',
  },
  paymentOptionDisabled: {
    opacity: 0.5,
  },
  paymentOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentOptionIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  paymentOptionInfo: {
    flex: 1,
  },
  paymentOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  paymentOptionBalance: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  checkmark: {
    fontSize: 20,
    color: '#00ffd5',
    fontWeight: 'bold',
  },
  insufficientText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
  },
  payButton: {
    flex: 2,
    backgroundColor: '#22c55e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  payButtonDisabled: {
    opacity: 0.5,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
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

export default PaymentRequestModal;
