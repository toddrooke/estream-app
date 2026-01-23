/**
 * Wallet Screen
 * 
 * Unified wallet experience showing:
 * - Balance(s) in tokens and USD
 * - Transaction history
 * - Spark visual as identity
 * - Token transfer capability
 * 
 * Phase 8 redesign - replaces AccountScreen
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useAccount, useSparkParams } from '@/services/account';
import { useVault, useTrustBadge } from '@/services/vault';
import { getNetworkEndpoints } from '@estream/react-native';

// ============================================================================
// Types
// ============================================================================

interface TokenBalance {
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  icon: string;
}

interface Transaction {
  id: string;
  type: 'send' | 'receive' | 'governance' | 'stake';
  amount: string;
  symbol: string;
  from?: string;
  to?: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  description?: string;
}

// ============================================================================
// Spark SVG Renderer
// ============================================================================

function generateSparkSVG(pubkeyHash: string, size: number = 120): string {
  const bytes = hexToBytes(pubkeyHash.slice(0, 64));
  const baseHue = ((bytes[0] << 8) | bytes[1]) % 360;
  
  const particles = [];
  for (let i = 0; i < 12; i++) {
    const offset = i * 4;
    const radius = 0.2 + (bytes[(offset) % 32] / 255) * 0.25;
    const phase = (bytes[(offset + 1) % 32] / 255) * 2 * Math.PI;
    const hue = ((bytes[(offset + 2) % 32] << 8) | bytes[(offset + 3) % 32]) % 360;
    const saturation = 70 + (bytes[(offset + 2) % 32] / 255) * 25;
    const lightness = 50 + (bytes[(offset + 3) % 32] / 255) * 15;
    const direction = i % 2 === 0 ? 1 : -1;
    const speed = 0.3 + (bytes[(offset + 1) % 32] / 255) * 0.8;
    
    const x = 0.5 + Math.cos(phase) * radius;
    const y = 0.5 + Math.sin(phase) * radius;
    
    particles.push({ x, y, hue, saturation, lightness, radius, phase, speed, direction });
  }
  
  const center = size / 2;
  const orbitRadius = size * 0.35;
  const id = `spark-${pubkeyHash.slice(0, 8)}`;
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;
  svg += `<defs>`;
  svg += `<radialGradient id="${id}-center-glow">`;
  svg += `<stop offset="0%" stop-color="hsl(${baseHue}, 80%, 60%)" stop-opacity="0.8"/>`;
  svg += `<stop offset="50%" stop-color="hsl(${baseHue}, 70%, 40%)" stop-opacity="0.4"/>`;
  svg += `<stop offset="100%" stop-color="hsl(${baseHue}, 60%, 30%)" stop-opacity="0"/>`;
  svg += `</radialGradient>`;
  
  particles.forEach((p, i) => {
    svg += `<radialGradient id="${id}-p${i}">`;
    svg += `<stop offset="0%" stop-color="#fff"/>`;
    svg += `<stop offset="40%" stop-color="hsl(${p.hue}, ${p.saturation}%, ${p.lightness}%)"/>`;
    svg += `<stop offset="100%" stop-color="hsl(${p.hue}, ${p.saturation}%, ${p.lightness}%)" stop-opacity="0.3"/>`;
    svg += `</radialGradient>`;
  });
  svg += `</defs>`;
  
  svg += `<style>`;
  particles.forEach((p, i) => {
    const duration = (2 * Math.PI) / p.speed;
    svg += `@keyframes ${id}-orbit-${i} { from { transform: rotate(${(p.phase * 180 / Math.PI).toFixed(1)}deg); } to { transform: rotate(${((p.phase * 180 / Math.PI) + 360 * p.direction).toFixed(1)}deg); } }`;
    svg += `.${id}-particle-${i} { animation: ${id}-orbit-${i} ${duration.toFixed(2)}s linear infinite; transform-origin: ${center}px ${center}px; }`;
  });
  svg += `@keyframes ${id}-pulse { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.15); opacity: 1; } }`;
  svg += `.${id}-center { animation: ${id}-pulse 2s ease-in-out infinite; transform-origin: ${center}px ${center}px; }`;
  svg += `</style>`;
  
  svg += `<rect width="${size}" height="${size}" fill="#0a0a0f"/>`;
  svg += `<circle cx="${center}" cy="${center}" r="${orbitRadius}" fill="none" stroke="hsl(${baseHue}, 50%, 40%)" stroke-opacity="0.2" stroke-width="1"/>`;
  svg += `<circle class="${id}-center" cx="${center}" cy="${center}" r="${size * 0.1}" fill="url(#${id}-center-glow)"/>`;
  
  particles.forEach((p, i) => {
    const screenX = p.x * size;
    const screenY = p.y * size;
    const particleSize = 3 + p.radius * 10;
    svg += `<g class="${id}-particle-${i}">`;
    svg += `<circle cx="${screenX.toFixed(1)}" cy="${screenY.toFixed(1)}" r="${particleSize.toFixed(1)}" fill="url(#${id}-p${i})"/>`;
    svg += `</g>`;
  });
  
  svg += `</svg>`;
  return svg;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ============================================================================
// Component
// ============================================================================

export default function WalletScreen(): React.JSX.Element {
  const { account, isLoading: accountLoading } = useAccount();
  const { publicKey } = useVault();
  const trustBadge = useTrustBadge();
  const sparkParams = useSparkParams();
  
  const [refreshing, setRefreshing] = useState(false);
  const [balances, setBalances] = useState<TokenBalance[]>([
    { symbol: 'USDC', name: 'USD Coin', balance: '0.00', usdValue: '$0.00', icon: '💵' },
    { symbol: 'ESS', name: 'eStream Token', balance: '0', usdValue: '$0.00', icon: '⬡' },
  ]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalUsdValue, setTotalUsdValue] = useState('$0.00');

  // Generate Spark SVG
  const sparkSvg = useMemo(() => {
    if (!sparkParams?.pubkeyHash) return null;
    return generateSparkSVG(sparkParams.pubkeyHash, 100);
  }, [sparkParams?.pubkeyHash]);

  // Fetch balances and transactions
  const fetchWalletData = useCallback(async () => {
    try {
      const endpoints = getNetworkEndpoints();
      
      // Fetch balance from edge-proxy (placeholder - will be real API)
      const balanceRes = await fetch(`${endpoints.sparkLatticeUrl}/api/tenant/balance`, {
        headers: { 'Accept': 'application/json' },
      });
      
      if (balanceRes.ok) {
        const data = await balanceRes.json();
        if (data.balance) {
          setBalances(prev => prev.map(b => 
            b.symbol === 'USDC' 
              ? { ...b, balance: data.balance.toFixed(2), usdValue: `$${data.balance.toFixed(2)}` }
              : b
          ));
          setTotalUsdValue(`$${data.balance.toFixed(2)}`);
        }
      }

      // Fetch transactions (placeholder)
      // In production, fetch from edge-proxy /api/tenant/transactions
    } catch (error) {
      console.log('[WalletScreen] Fetch error:', error);
    }
  }, []);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchWalletData();
    setRefreshing(false);
  }, [fetchWalletData]);

  const handleSend = useCallback(() => {
    Alert.alert('Send', 'Token transfer coming soon.\n\nUse Spark tab to send via QR code.');
  }, []);

  const handleReceive = useCallback(() => {
    Alert.alert('Receive', 'Share your Spark to receive tokens.\n\nGo to Spark tab → Render → Request.');
  }, []);

  const handleDeposit = useCallback(() => {
    Alert.alert(
      'Deposit USDC',
      'Connect your Solana wallet to deposit USDC for compute credits.\n\nWallet connection coming soon.',
      [{ text: 'OK' }]
    );
  }, []);

  if (accountLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ffd5" />
          <Text style={styles.loadingText}>Loading wallet...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00ffd5" />
        }
      >
        {/* Header with Spark Identity */}
        <View style={styles.header}>
          <View style={styles.sparkIdentity}>
            {sparkSvg ? (
              <View style={styles.sparkWrapper}>
                <SvgXml xml={sparkSvg} width={100} height={100} />
              </View>
            ) : (
              <View style={styles.sparkPlaceholder}>
                <Text style={styles.sparkPlaceholderText}>⬡</Text>
              </View>
            )}
            <View style={styles.identityInfo}>
              <Text style={styles.displayName}>{account?.displayName || 'eStream Wallet'}</Text>
              <View style={[styles.trustBadge, { backgroundColor: getBadgeColor(trustBadge.color) }]}>
                <Text style={styles.trustLabel}>{trustBadge.label}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Total Balance */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={styles.balanceValue}>{totalUsdValue}</Text>
          
          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.actionButton} onPress={handleSend}>
              <Text style={styles.actionIcon}>↑</Text>
              <Text style={styles.actionText}>Send</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleReceive}>
              <Text style={styles.actionIcon}>↓</Text>
              <Text style={styles.actionText}>Receive</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.depositButton]} onPress={handleDeposit}>
              <Text style={styles.actionIcon}>+</Text>
              <Text style={styles.actionText}>Deposit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Token Balances */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tokens</Text>
          {balances.map((token, index) => (
            <View key={token.symbol} style={[styles.tokenRow, index > 0 && styles.tokenRowBorder]}>
              <View style={styles.tokenInfo}>
                <Text style={styles.tokenIcon}>{token.icon}</Text>
                <View>
                  <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                  <Text style={styles.tokenName}>{token.name}</Text>
                </View>
              </View>
              <View style={styles.tokenBalance}>
                <Text style={styles.tokenAmount}>{token.balance}</Text>
                <Text style={styles.tokenUsd}>{token.usdValue}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Transaction History */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Activity</Text>
          {transactions.length > 0 ? (
            transactions.slice(0, 5).map((tx) => (
              <View key={tx.id} style={styles.txRow}>
                <View style={styles.txInfo}>
                  <Text style={styles.txIcon}>
                    {tx.type === 'receive' ? '↓' : tx.type === 'send' ? '↑' : '⚡'}
                  </Text>
                  <View>
                    <Text style={styles.txType}>
                      {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                    </Text>
                    <Text style={styles.txTime}>
                      {new Date(tx.timestamp).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                <Text style={[
                  styles.txAmount,
                  tx.type === 'receive' && styles.txAmountPositive,
                ]}>
                  {tx.type === 'receive' ? '+' : '-'}{tx.amount} {tx.symbol}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No transactions yet</Text>
          )}
        </View>

        {/* Identity Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Identity</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Public Key</Text>
            <Text style={styles.detailValueMono}>
              {account?.pubkeyHash 
                ? `${account.pubkeyHash.slice(0, 8)}...${account.pubkeyHash.slice(-6)}`
                : '—'
              }
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Network Identity</Text>
            <Text style={[styles.detailValue, !account?.identityNftMint && styles.notRegistered]}>
              {account?.identityNftMint ? 'Registered ✓' : 'Not registered'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getBadgeColor(color: string): string {
  switch (color) {
    case 'gold': return '#d4af37';
    case 'green': return '#22c55e';
    case 'orange': return '#f97316';
    case 'red': return '#ef4444';
    default: return '#6b7280';
  }
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#666',
    fontSize: 16,
    marginTop: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  sparkIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  sparkWrapper: {
    borderRadius: 50,
    overflow: 'hidden',
  },
  sparkPlaceholder: {
    width: 100,
    height: 100,
    backgroundColor: '#1a1a1a',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sparkPlaceholderText: {
    fontSize: 40,
    color: '#00ffd5',
  },
  identityInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  trustBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trustLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  balanceCard: {
    backgroundColor: '#1a2a2a',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#00ffd530',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#00ffd5',
    marginBottom: 24,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  depositButton: {
    backgroundColor: '#00ffd520',
    borderColor: '#00ffd5',
  },
  actionIcon: {
    fontSize: 20,
    color: '#fff',
    marginBottom: 4,
  },
  actionText: {
    fontSize: 12,
    color: '#888',
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
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  tokenRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  tokenInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tokenIcon: {
    fontSize: 28,
  },
  tokenSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  tokenName: {
    fontSize: 12,
    color: '#666',
  },
  tokenBalance: {
    alignItems: 'flex-end',
  },
  tokenAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  tokenUsd: {
    fontSize: 12,
    color: '#666',
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  txInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  txIcon: {
    fontSize: 20,
    color: '#888',
  },
  txType: {
    fontSize: 14,
    color: '#fff',
  },
  txTime: {
    fontSize: 12,
    color: '#666',
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  txAmountPositive: {
    color: '#22c55e',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  detailLabel: {
    fontSize: 14,
    color: '#888',
  },
  detailValue: {
    fontSize: 14,
    color: '#fff',
  },
  detailValueMono: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#00ffd5',
  },
  notRegistered: {
    color: '#666',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
