/**
 * Account Screen
 * 
 * Displays the user's eStream identity with Spark visual.
 * Allows editing display name and shows account status.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useAccount, useSparkParams } from '@/services/account';
import { useVault, useTrustBadge } from '@/services/vault';

// ============================================================================
// Spark SVG Renderer (inline for React Native)
// ============================================================================

/**
 * Generate Spark SVG from pubkey hash
 * Simplified version for React Native - matches estream-sdk output
 */
function generateSparkSVG(pubkeyHash: string, size: number = 160): string {
  // Parse hash to derive parameters
  const bytes = hexToBytes(pubkeyHash.slice(0, 64));
  
  // Derive base hue from first 2 bytes
  const baseHue = ((bytes[0] << 8) | bytes[1]) % 360;
  
  // Generate 12 particles with derived positions
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
    
    // Calculate position at t=0
    const x = 0.5 + Math.cos(phase) * radius;
    const y = 0.5 + Math.sin(phase) * radius;
    
    particles.push({ x, y, hue, saturation, lightness, radius, phase, speed, direction });
  }
  
  const center = size / 2;
  const orbitRadius = size * 0.35;
  const id = `spark-${pubkeyHash.slice(0, 8)}`;
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;
  
  // Defs
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
  
  // Animation styles
  svg += `<style>`;
  particles.forEach((p, i) => {
    const duration = (2 * Math.PI) / p.speed;
    svg += `
      @keyframes ${id}-orbit-${i} {
        from { transform: rotate(${(p.phase * 180 / Math.PI).toFixed(1)}deg); }
        to { transform: rotate(${((p.phase * 180 / Math.PI) + 360 * p.direction).toFixed(1)}deg); }
      }
      .${id}-particle-${i} {
        animation: ${id}-orbit-${i} ${duration.toFixed(2)}s linear infinite;
        transform-origin: ${center}px ${center}px;
      }
    `;
  });
  svg += `
    @keyframes ${id}-pulse {
      0%, 100% { transform: scale(1); opacity: 0.8; }
      50% { transform: scale(1.15); opacity: 1; }
    }
    .${id}-center {
      animation: ${id}-pulse 2s ease-in-out infinite;
      transform-origin: ${center}px ${center}px;
    }
    @keyframes ${id}-ring-rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .${id}-ring {
      animation: ${id}-ring-rotate 8s linear infinite;
      transform-origin: ${center}px ${center}px;
    }
  `;
  svg += `</style>`;
  
  // Background
  svg += `<rect width="${size}" height="${size}" fill="#0a0a0f"/>`;
  
  // Orbit ring with markers
  svg += `<g class="${id}-ring">`;
  svg += `<circle cx="${center}" cy="${center}" r="${orbitRadius}" fill="none" stroke="hsl(${baseHue}, 50%, 40%)" stroke-opacity="0.2" stroke-width="1.5"/>`;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const x = center + Math.cos(angle) * orbitRadius;
    const y = center + Math.sin(angle) * orbitRadius;
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="hsl(${baseHue}, 60%, 50%)" fill-opacity="0.5"/>`;
  }
  svg += `</g>`;
  
  // Center glow
  svg += `<circle class="${id}-center" cx="${center}" cy="${center}" r="${size * 0.12}" fill="url(#${id}-center-glow)"/>`;
  
  // Particles
  particles.forEach((p, i) => {
    const screenX = p.x * size;
    const screenY = p.y * size;
    const particleSize = 4 + p.radius * 12;
    
    svg += `<g class="${id}-particle-${i}">`;
    svg += `<circle cx="${screenX.toFixed(1)}" cy="${screenY.toFixed(1)}" r="${(particleSize * 2.5).toFixed(1)}" fill="hsl(${p.hue}, ${p.saturation}%, ${p.lightness}%)" fill-opacity="0.3"/>`;
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
// Account Screen Component
// ============================================================================

export default function AccountScreen(): React.JSX.Element {
  const { account, updateAccount, isLoading } = useAccount();
  const { publicKey } = useVault();
  const trustBadge = useTrustBadge();
  const sparkParams = useSparkParams();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  
  // Generate Spark SVG
  const sparkSvg = useMemo(() => {
    if (!sparkParams?.pubkeyHash) return null;
    return generateSparkSVG(sparkParams.pubkeyHash, 160);
  }, [sparkParams?.pubkeyHash]);
  
  const handleEditName = useCallback(() => {
    setEditName(account?.displayName || '');
    setIsEditing(true);
  }, [account]);
  
  const handleSaveName = useCallback(async () => {
    if (editName.trim()) {
      await updateAccount({ displayName: editName.trim() });
    }
    setIsEditing(false);
  }, [editName, updateAccount]);
  
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditName('');
  }, []);
  
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading account...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Identity</Text>
        </View>
        
        {/* Spark Visual */}
        <View style={styles.sparkContainer}>
          {sparkSvg ? (
            <SvgXml xml={sparkSvg} width={160} height={160} />
          ) : (
            <View style={styles.sparkPlaceholder}>
              <Text style={styles.sparkPlaceholderText}>⬡</Text>
            </View>
          )}
        </View>
        
        {/* Display Name */}
        <View style={styles.nameSection}>
          {isEditing ? (
            <View style={styles.editNameContainer}>
              <TextInput
                style={styles.nameInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter display name"
                placeholderTextColor="#666"
                autoFocus
                maxLength={32}
              />
              <View style={styles.editButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancelEdit}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveName}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.nameDisplay} onPress={handleEditName}>
              <Text style={styles.displayName}>{account?.displayName || 'Unnamed'}</Text>
              <Text style={styles.editHint}>tap to edit</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Trust Badge */}
        <View style={[styles.trustBadge, { backgroundColor: getBadgeColor(trustBadge.color) }]}>
          <Text style={styles.trustIcon}>{trustBadge.icon}</Text>
          <Text style={styles.trustLabel}>{trustBadge.label}</Text>
        </View>
        
        {/* Identity Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Identity</Text>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Public Key Hash</Text>
            <Text style={styles.detailValueMono}>
              {account?.pubkeyHash 
                ? `${account.pubkeyHash.slice(0, 8)}...${account.pubkeyHash.slice(-8)}`
                : '—'
              }
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Created</Text>
            <Text style={styles.detailValue}>
              {account?.createdAt 
                ? new Date(account.createdAt).toLocaleDateString()
                : '—'
              }
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Identity NFT</Text>
            <Text style={[styles.detailValue, !account?.identityNftMint && styles.notMinted]}>
              {account?.identityNftMint ? 'Minted ✓' : 'Not minted'}
            </Text>
          </View>
        </View>
        
        {/* Roles Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Roles</Text>
          {account?.roles && account.roles.length > 0 ? (
            <View style={styles.rolesContainer}>
              {account.roles.map((role, i) => (
                <View key={i} style={styles.roleBadge}>
                  <Text style={styles.roleText}>{role}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No roles assigned</Text>
          )}
        </View>
        
        {/* Organization Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Organization</Text>
          <Text style={styles.emptyText}>
            {account?.organizationId || 'Not linked to an organization'}
          </Text>
        </View>
        
        {/* Actions */}
        {!account?.identityNftMint && (
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => Alert.alert('Coming Soon', 'Identity NFT minting will be available in a future update.')}
          >
            <Text style={styles.actionButtonText}>Mint Identity NFT</Text>
          </TouchableOpacity>
        )}
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
    marginBottom: 20,
    marginTop: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  sparkContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  sparkPlaceholder: {
    width: 160,
    height: 160,
    backgroundColor: '#1a1a1a',
    borderRadius: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sparkPlaceholderText: {
    fontSize: 64,
    color: '#00ffd5',
  },
  nameSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  nameDisplay: {
    alignItems: 'center',
  },
  displayName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  editHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  editNameContainer: {
    width: '100%',
    maxWidth: 300,
  },
  nameInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  saveButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#00ffd5',
  },
  saveButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
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
  notMinted: {
    color: '#666',
  },
  rolesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleBadge: {
    backgroundColor: '#00ffd520',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00ffd540',
  },
  roleText: {
    color: '#00ffd5',
    fontSize: 12,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  actionButton: {
    backgroundColor: '#00ffd5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  actionButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
