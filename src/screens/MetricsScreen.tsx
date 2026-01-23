/**
 * Metrics Screen
 * 
 * Network health and usage metrics for operators and tenants.
 * 
 * For Operators:
 * - Network health (nodes up/down)
 * - Transaction volume
 * - Current costs
 * - TPS, active accounts
 * 
 * For Tenants:
 * - Their lattice metrics
 * - Usage vs plan limits
 * - Cost estimates
 * 
 * Phase 8 redesign - new screen
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { getNetworkEndpoints, getNetworkConfig } from '@estream/react-native';
import { useAccount } from '@/services/account';

// ============================================================================
// Types
// ============================================================================

interface NetworkHealth {
  status: 'healthy' | 'degraded' | 'down';
  nodesOnline: number;
  nodesTotal: number;
  lastUpdate: number;
}

interface MetricsData {
  tps: number;
  txVolume24h: number;
  activeAccounts: number;
  avgLatency: number;
  uptime: number;
}

interface UsageData {
  computeUnits: number;
  computeLimit: number;
  storageGb: number;
  storageLimit: number;
  bandwidthGb: number;
  bandwidthLimit: number;
  currentCost: number;
  projectedCost: number;
}

// ============================================================================
// Component
// ============================================================================

export default function MetricsScreen(): React.JSX.Element {
  const { account } = useAccount();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [networkHealth, setNetworkHealth] = useState<NetworkHealth>({
    status: 'healthy',
    nodesOnline: 0,
    nodesTotal: 0,
    lastUpdate: Date.now(),
  });
  const [metrics, setMetrics] = useState<MetricsData>({
    tps: 0,
    txVolume24h: 0,
    activeAccounts: 0,
    avgLatency: 0,
    uptime: 99.9,
  });
  const [usage, setUsage] = useState<UsageData>({
    computeUnits: 0,
    computeLimit: 100000,
    storageGb: 0,
    storageLimit: 10,
    bandwidthGb: 0,
    bandwidthLimit: 50,
    currentCost: 0,
    projectedCost: 0,
  });

  const isOperator = account?.roles?.includes('operator') || account?.roles?.includes('admin');
  const networkConfig = getNetworkConfig();

  const fetchMetrics = useCallback(async () => {
    try {
      const endpoints = getNetworkEndpoints();
      
      // Fetch network topology for node health
      try {
        const nodesRes = await fetch(`${endpoints.sparkLatticeUrl}/api/nodes`, {
          headers: { 'Accept': 'application/json' },
        });
        
        if (nodesRes.ok) {
          const data = await nodesRes.json();
          const nodes = data.nodes || [];
          const online = nodes.filter((n: any) => n.status === 'online' || n.status === 'active').length;
          
          setNetworkHealth({
            status: online === nodes.length ? 'healthy' : online > 0 ? 'degraded' : 'down',
            nodesOnline: online,
            nodesTotal: nodes.length,
            lastUpdate: Date.now(),
          });
        }
      } catch (e) {
        console.log('[MetricsScreen] Nodes fetch error:', e);
      }

      // Fetch usage data for current tenant
      try {
        const usageRes = await fetch(`${endpoints.sparkLatticeUrl}/api/tenant/usage`, {
          headers: { 'Accept': 'application/json' },
        });
        
        if (usageRes.ok) {
          const data = await usageRes.json();
          setUsage(prev => ({
            ...prev,
            computeUnits: data.compute_units || 0,
            storageGb: data.storage_gb || 0,
            bandwidthGb: data.bandwidth_gb || 0,
            currentCost: data.current_cost || 0,
            projectedCost: data.projected_cost || 0,
          }));
        }
      } catch (e) {
        console.log('[MetricsScreen] Usage fetch error:', e);
      }

      // Fetch network metrics (operator view)
      if (isOperator) {
        try {
          const metricsRes = await fetch(`${endpoints.sparkLatticeUrl}/api/metrics`, {
            headers: { 'Accept': 'application/json' },
          });
          
          if (metricsRes.ok) {
            const data = await metricsRes.json();
            setMetrics({
              tps: data.tps || 0,
              txVolume24h: data.tx_volume_24h || 0,
              activeAccounts: data.active_accounts || 0,
              avgLatency: data.avg_latency_ms || 0,
              uptime: data.uptime_percent || 99.9,
            });
          }
        } catch (e) {
          console.log('[MetricsScreen] Metrics fetch error:', e);
        }
      }
    } catch (error) {
      console.log('[MetricsScreen] Fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [isOperator]);

  useEffect(() => {
    fetchMetrics();
    // Refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMetrics();
    setRefreshing(false);
  }, [fetchMetrics]);

  const getHealthColor = (status: NetworkHealth['status']) => {
    switch (status) {
      case 'healthy': return '#22c55e';
      case 'degraded': return '#f97316';
      case 'down': return '#ef4444';
    }
  };

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(0);
  };

  const getUsagePercent = (used: number, limit: number) => {
    if (limit === 0) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return '#ef4444';
    if (percent >= 70) return '#f97316';
    return '#00ffd5';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ffd5" />
          <Text style={styles.loadingText}>Loading metrics...</Text>
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>📊 Metrics</Text>
          <Text style={styles.networkBadge}>{networkConfig.displayName}</Text>
        </View>

        {/* Network Health */}
        <View style={[styles.healthCard, { borderColor: getHealthColor(networkHealth.status) }]}>
          <View style={styles.healthHeader}>
            <View style={[styles.healthDot, { backgroundColor: getHealthColor(networkHealth.status) }]} />
            <Text style={[styles.healthStatus, { color: getHealthColor(networkHealth.status) }]}>
              {networkHealth.status === 'healthy' ? 'All Systems Operational' :
               networkHealth.status === 'degraded' ? 'Degraded Performance' : 'Network Down'}
            </Text>
          </View>
          <Text style={styles.healthNodes}>
            {networkHealth.nodesOnline} / {networkHealth.nodesTotal} nodes online
          </Text>
        </View>

        {/* Quick Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{metrics.tps.toFixed(1)}</Text>
            <Text style={styles.statLabel}>TPS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatNumber(metrics.txVolume24h)}</Text>
            <Text style={styles.statLabel}>TX (24h)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{metrics.avgLatency.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Latency (ms)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{metrics.uptime.toFixed(1)}%</Text>
            <Text style={styles.statLabel}>Uptime</Text>
          </View>
        </View>

        {/* Usage Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Usage</Text>
          
          {/* Compute Units */}
          <View style={styles.usageRow}>
            <View style={styles.usageInfo}>
              <Text style={styles.usageLabel}>Compute Units</Text>
              <Text style={styles.usageValue}>
                {formatNumber(usage.computeUnits)} / {formatNumber(usage.computeLimit)}
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: `${getUsagePercent(usage.computeUnits, usage.computeLimit)}%`,
                    backgroundColor: getUsageColor(getUsagePercent(usage.computeUnits, usage.computeLimit)),
                  }
                ]} 
              />
            </View>
          </View>

          {/* Storage */}
          <View style={styles.usageRow}>
            <View style={styles.usageInfo}>
              <Text style={styles.usageLabel}>Storage</Text>
              <Text style={styles.usageValue}>
                {usage.storageGb.toFixed(2)} / {usage.storageLimit} GB
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: `${getUsagePercent(usage.storageGb, usage.storageLimit)}%`,
                    backgroundColor: getUsageColor(getUsagePercent(usage.storageGb, usage.storageLimit)),
                  }
                ]} 
              />
            </View>
          </View>

          {/* Bandwidth */}
          <View style={styles.usageRow}>
            <View style={styles.usageInfo}>
              <Text style={styles.usageLabel}>Bandwidth</Text>
              <Text style={styles.usageValue}>
                {usage.bandwidthGb.toFixed(2)} / {usage.bandwidthLimit} GB
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: `${getUsagePercent(usage.bandwidthGb, usage.bandwidthLimit)}%`,
                    backgroundColor: getUsageColor(getUsagePercent(usage.bandwidthGb, usage.bandwidthLimit)),
                  }
                ]} 
              />
            </View>
          </View>
        </View>

        {/* Cost Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cost Estimates</Text>
          
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Current Period</Text>
            <Text style={styles.costValue}>${usage.currentCost.toFixed(2)}</Text>
          </View>
          
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Projected (Month)</Text>
            <Text style={styles.costValueProjected}>${usage.projectedCost.toFixed(2)}</Text>
          </View>

          <Text style={styles.costNote}>
            Based on current usage. See Fees tab in Console for pricing details.
          </Text>
        </View>

        {/* Operator Section */}
        {isOperator && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Operator View</Text>
            
            <View style={styles.operatorRow}>
              <Text style={styles.operatorLabel}>Active Accounts</Text>
              <Text style={styles.operatorValue}>{metrics.activeAccounts}</Text>
            </View>
            
            <View style={styles.operatorRow}>
              <Text style={styles.operatorLabel}>Network TPS</Text>
              <Text style={styles.operatorValue}>{metrics.tps.toFixed(2)}</Text>
            </View>
            
            <View style={styles.operatorRow}>
              <Text style={styles.operatorLabel}>24h Volume</Text>
              <Text style={styles.operatorValue}>{formatNumber(metrics.txVolume24h)} tx</Text>
            </View>
          </View>
        )}

        {/* Last Update */}
        <Text style={styles.lastUpdate}>
          Last updated: {new Date(networkHealth.lastUpdate).toLocaleTimeString()}
        </Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  networkBadge: {
    fontSize: 12,
    color: '#00ffd5',
    backgroundColor: '#00ffd520',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  healthCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
  },
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  healthDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  healthStatus: {
    fontSize: 18,
    fontWeight: '600',
  },
  healthNodes: {
    fontSize: 14,
    color: '#888',
    marginLeft: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00ffd5',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
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
  usageRow: {
    marginBottom: 16,
  },
  usageInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  usageLabel: {
    fontSize: 14,
    color: '#888',
  },
  usageValue: {
    fontSize: 14,
    color: '#fff',
    fontFamily: 'monospace',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  costLabel: {
    fontSize: 14,
    color: '#888',
  },
  costValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  costValueProjected: {
    fontSize: 18,
    fontWeight: '600',
    color: '#00ffd5',
  },
  costNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 12,
    textAlign: 'center',
  },
  operatorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  operatorLabel: {
    fontSize: 14,
    color: '#888',
  },
  operatorValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  lastUpdate: {
    fontSize: 12,
    color: '#444',
    textAlign: 'center',
    marginTop: 8,
  },
});
