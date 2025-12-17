/**
 * NFT Preview Components
 * 
 * TypeScript implementation of eStream NFT generators for mobile preview.
 * Mirrors the Rust implementation in estream-nft crate.
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Text as SvgText,
  Line,
  Circle,
  G,
} from 'react-native-svg';

// Types
export type TrustLevel = 'Software' | 'Hardware' | 'Certified';

export interface EstreamIdentityData {
  publicKey: string;
  trustLevel: TrustLevel;
  memberSince: string;
  activityScore: number; // 0-8
  anchorCount: number;
}

export interface TakeTitlePortfolioData {
  publicKey: string;
  assetsOwned: number;
  tokenBalance: number;
  activeListings: number;
  listedValueUsd: number;
}

export interface TakeTitleAssetData {
  assetId: string;
  assetName: string;
  assetType: string;
  listingStatus: 'NotListed' | 'ForSale' | 'Pending';
  tokensAvailable?: number;
  tokenPriceUsd?: number;
  viewerTokens: number;
  totalSupply: number;
  provenanceEvents: number;
  lastUpdate: string;
}

// Utilities
function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatUsd(dollars: number): string {
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars}`;
}

function getTrustColor(level: TrustLevel): string {
  switch (level) {
    case 'Software': return '#f59e0b';
    case 'Hardware': return '#22c55e';
    case 'Certified': return '#8b5cf6';
  }
}

function getTrustProgress(level: TrustLevel): number {
  switch (level) {
    case 'Software': return 0.33;
    case 'Hardware': return 0.66;
    case 'Certified': return 1.0;
  }
}

function truncateKey(key: string): string {
  if (key.length < 16) return key;
  return `${key.slice(0, 8)}...${key.slice(-8)}`;
}

// eStream Identity NFT Preview
export function EstreamIdentityNft({ data }: { data: EstreamIdentityData }) {
  const trustColor = getTrustColor(data.trustLevel);
  const trustProgress = getTrustProgress(data.trustLevel);
  const barWidth = 160 * trustProgress;

  return (
    <View style={styles.nftContainer}>
      <Svg width="100%" height="200" viewBox="0 0 400 200">
        <Defs>
          <LinearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#0f0f0f" />
            <Stop offset="100%" stopColor="#1a1a2e" />
          </LinearGradient>
        </Defs>
        
        {/* Background */}
        <Rect width="400" height="200" fill="url(#bg)" rx="12" />
        <Rect x="2" y="2" width="396" height="196" fill="none" stroke={trustColor} strokeWidth="2" rx="10" opacity="0.5" />
        
        {/* Title */}
        <SvgText x="20" y="35" fontSize="18" fontWeight="bold" fill="#ffffff">
          ⚡ eStream Identity
        </SvgText>
        
        {/* Public Key */}
        <SvgText x="20" y="55" fontSize="10" fill="#666666" fontFamily={Platform.OS === 'ios' ? 'Menlo' : 'monospace'}>
          {truncateKey(data.publicKey)}
        </SvgText>
        
        <Line x1="20" y1="65" x2="380" y2="65" stroke="#333333" strokeWidth="1" />
        
        {/* Trust Level */}
        <SvgText x="20" y="90" fontSize="12" fill="#888888">Trust Level</SvgText>
        <SvgText x="20" y="110" fontSize="14" fontWeight="600" fill={trustColor}>
          {data.trustLevel}
        </SvgText>
        
        {/* Progress bar */}
        <Rect x="150" y="95" width="160" height="10" rx="4" fill="#333333" />
        <Rect x="150" y="95" width={barWidth} height="10" rx="4" fill={trustColor} />
        
        {/* Activity dots */}
        <SvgText x="20" y="140" fontSize="12" fill="#888888">Activity</SvgText>
        <G>
          {Array.from({ length: 8 }).map((_, i) => (
            <Circle
              key={i}
              cx={150 + i * 16}
              cy="135"
              r="5"
              fill={i < data.activityScore ? '#22c55e' : '#333333'}
            />
          ))}
        </G>
        
        {/* Stats */}
        <SvgText x="20" y="175" fontSize="12" fill="#888888">Since</SvgText>
        <SvgText x="20" y="193" fontSize="14" fontWeight="600" fill="#ffffff">
          {data.memberSince}
        </SvgText>
        
        <SvgText x="150" y="175" fontSize="12" fill="#888888">Anchors</SvgText>
        <SvgText x="150" y="193" fontSize="14" fontWeight="600" fill="#ffffff">
          {formatNumber(data.anchorCount)}
        </SvgText>
        
        <SvgText x="380" y="193" fontSize="8" fill="#444444" textAnchor="end">
          estream.io
        </SvgText>
      </Svg>
    </View>
  );
}

// TakeTitle Portfolio NFT Preview
export function TakeTitlePortfolioNft({ data }: { data: TakeTitlePortfolioData }) {
  const hasListings = data.activeListings > 0;

  return (
    <View style={styles.nftContainer}>
      <Svg width="100%" height="200" viewBox="0 0 400 200">
        <Defs>
          <LinearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#0f0f0f" />
            <Stop offset="100%" stopColor="#1a1510" />
          </LinearGradient>
          <LinearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#b8860b" />
            <Stop offset="100%" stopColor="#d4a574" />
          </LinearGradient>
        </Defs>
        
        <Rect width="400" height="200" fill="url(#bg2)" rx="12" />
        <Rect x="2" y="2" width="396" height="196" fill="none" stroke="url(#gold)" strokeWidth="2" rx="10" opacity="0.6" />
        
        <SvgText x="20" y="35" fontSize="18" fontWeight="bold" fill="#ffffff">
          🏠 TakeTitle Portfolio
        </SvgText>
        
        <SvgText x="20" y="55" fontSize="10" fill="#666666" fontFamily={Platform.OS === 'ios' ? 'Menlo' : 'monospace'}>
          {truncateKey(data.publicKey)}
        </SvgText>
        
        <Line x1="20" y1="65" x2="380" y2="65" stroke="#333333" strokeWidth="1" />
        
        {/* Assets */}
        <SvgText x="20" y="90" fontSize="12" fill="#888888">Assets Owned</SvgText>
        <SvgText x="20" y="115" fontSize="22" fontWeight="bold" fill="#d4a574">
          {data.assetsOwned}
        </SvgText>
        
        {/* Tokens */}
        <SvgText x="150" y="90" fontSize="12" fill="#888888">TITLE Tokens</SvgText>
        <SvgText x="150" y="115" fontSize="22" fontWeight="bold" fill="#ffffff">
          {formatNumber(data.tokenBalance)}
        </SvgText>
        
        {/* Listings box */}
        {hasListings ? (
          <G>
            <Rect x="20" y="130" width="360" height="45" rx="6" fill="#1a2510" />
            <Rect x="20" y="130" width="360" height="45" rx="6" fill="none" stroke="#22c55e" strokeWidth="1" opacity="0.5" />
            <SvgText x="35" y="155" fontSize="14" fontWeight="600" fill="#22c55e">
              🏷️ {data.activeListings} FOR SALE
            </SvgText>
            <SvgText x="35" y="170" fontSize="11" fill="#888888">
              Listed Value: {formatUsd(data.listedValueUsd)}
            </SvgText>
          </G>
        ) : (
          <G>
            <Rect x="20" y="130" width="360" height="45" rx="6" fill="#1a1a1a" />
            <SvgText x="200" y="158" fontSize="12" fill="#666666" textAnchor="middle">
              No active listings
            </SvgText>
          </G>
        )}
        
        <SvgText x="380" y="193" fontSize="8" fill="#444444" textAnchor="end">
          taketitle.io
        </SvgText>
      </Svg>
    </View>
  );
}

// TakeTitle Asset NFT Preview  
export function TakeTitleAssetNft({ data }: { data: TakeTitleAssetData }) {
  const statusColors = {
    NotListed: '#666666',
    ForSale: '#22c55e',
    Pending: '#f59e0b',
  };
  const statusColor = statusColors[data.listingStatus];
  const ownershipPct = data.totalSupply > 0 ? (data.viewerTokens / data.totalSupply) * 100 : 0;

  return (
    <View style={styles.nftContainer}>
      <Svg width="100%" height="220" viewBox="0 0 400 220">
        <Defs>
          <LinearGradient id="bg3" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#0f0f0f" />
            <Stop offset="100%" stopColor="#1a1510" />
          </LinearGradient>
        </Defs>
        
        <Rect width="400" height="220" fill="url(#bg3)" rx="12" />
        <Rect x="2" y="2" width="396" height="216" fill="none" stroke="#d4a574" strokeWidth="2" rx="10" opacity="0.6" />
        
        <SvgText x="20" y="30" fontSize="16" fontWeight="bold" fill="#ffffff">
          📜 Title Record
        </SvgText>
        <SvgText x="380" y="30" fontSize="10" fill="#d4a574" textAnchor="end" fontFamily={Platform.OS === 'ios' ? 'Menlo' : 'monospace'}>
          #{data.assetId}
        </SvgText>
        
        <Line x1="20" y1="40" x2="380" y2="40" stroke="#333333" strokeWidth="1" />
        
        {/* Asset info */}
        <SvgText x="20" y="60" fontSize="13" fontWeight="600" fill="#ffffff">
          {data.assetName.length > 30 ? data.assetName.slice(0, 27) + '...' : data.assetName}
        </SvgText>
        <SvgText x="20" y="78" fontSize="11" fill="#888888">
          {data.assetType}
        </SvgText>
        
        {/* Status box */}
        <Rect x="20" y="90" width="360" height="55" rx="6" fill="#1a1a1a" />
        <Rect x="20" y="90" width="360" height="55" rx="6" fill="none" stroke={statusColor} strokeWidth="1" opacity="0.5" />
        <SvgText x="35" y="115" fontSize="14" fontWeight="600" fill={statusColor}>
          {data.listingStatus === 'ForSale' ? '🟢' : data.listingStatus === 'Pending' ? '🟡' : '○'} {data.listingStatus.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}
        </SvgText>
        {data.listingStatus === 'ForSale' && data.tokensAvailable && data.tokenPriceUsd && (
          <SvgText x="35" y="135" fontSize="11" fill="#888888">
            {data.tokensAvailable} tokens @ ${data.tokenPriceUsd} each
          </SvgText>
        )}
        
        {/* Ownership */}
        {data.viewerTokens > 0 && (
          <SvgText x="250" y="135" fontSize="11" fill="#d4a574">
            You own: {data.viewerTokens} ({ownershipPct.toFixed(0)}%)
          </SvgText>
        )}
        
        {/* Provenance */}
        <SvgText x="20" y="170" fontSize="12" fill="#888888">Provenance</SvgText>
        <SvgText x="20" y="188" fontSize="13" fontWeight="600" fill="#ffffff">
          {formatNumber(data.provenanceEvents)} events
        </SvgText>
        
        <SvgText x="200" y="170" fontSize="12" fill="#888888">Last Update</SvgText>
        <SvgText x="200" y="188" fontSize="13" fontWeight="600" fill="#ffffff">
          {data.lastUpdate}
        </SvgText>
        
        <SvgText x="380" y="213" fontSize="8" fill="#444444" textAnchor="end">
          taketitle.io
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  nftContainer: {
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
});

export default { EstreamIdentityNft, TakeTitlePortfolioNft, TakeTitleAssetNft };


