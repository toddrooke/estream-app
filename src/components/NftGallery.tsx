/**
 * NFT Gallery Component
 * 
 * Displays eStream NFTs for the current user.
 * NFTs are fetched from the eStream API and rendered with their SVG images.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SvgXml } from 'react-native-svg';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

interface EstreamNft {
  nft_id: string;
  estream_id: string;
  nft_type: 'identity' | 'provenance' | 'ceremony' | 'genesis' | 'epoch';
  name: string;
  description: string;
  image_svg?: string;
  image_base64?: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
  minted_at: number;
}

interface NftGalleryProps {
  ownerPublicKey: string;
  onNftPress?: (nft: EstreamNft) => void;
  estreamApiUrl?: string;
}

export const NftGallery: React.FC<NftGalleryProps> = ({
  ownerPublicKey,
  onNftPress,
  estreamApiUrl = 'http://10.0.0.120:8090',
}) => {
  const [nfts, setNfts] = useState<EstreamNft[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNfts = async () => {
    try {
      setError(null);
      const response = await fetch(
        `${estreamApiUrl}/api/v1/nft/owner/${ownerPublicKey}`,
        {
          headers: {
            'Authorization': 'Bearer dev-seeker-user',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setNfts(data.nfts || []);
      } else if (response.status === 404) {
        // No NFTs found - that's okay
        setNfts([]);
      } else {
        throw new Error(`Failed to fetch NFTs: ${response.status}`);
      }
    } catch (e: any) {
      console.error('[NftGallery] Fetch error:', e);
      setError(e.message);
      // Show demo NFT for testing
      setNfts([createDemoNft(ownerPublicKey)]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNfts();
  }, [ownerPublicKey]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNfts();
  };

  const renderNftCard = ({ item }: { item: EstreamNft }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onNftPress?.(item)}
      activeOpacity={0.8}
    >
      <View style={styles.imageContainer}>
        {item.image_svg ? (
          <SvgXml xml={item.image_svg} width="100%" height="100%" />
        ) : item.image_base64 ? (
          <Image
            source={{ uri: item.image_base64 }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>🎨</Text>
          </View>
        )}
      </View>
      
      <View style={styles.cardContent}>
        <Text style={styles.nftName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.nftType}>
          {item.nft_type.toUpperCase()}
        </Text>
        <Text style={styles.nftId} numberOfLines={1}>
          {item.nft_id.substring(0, 8)}...
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00D9FF" />
        <Text style={styles.loadingText}>Loading NFTs...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My eStream NFTs</Text>
        <Text style={styles.count}>{nfts.length} NFT{nfts.length !== 1 ? 's' : ''}</Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ Using demo data: {error}</Text>
        </View>
      )}

      {nfts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🖼️</Text>
          <Text style={styles.emptyTitle}>No NFTs Yet</Text>
          <Text style={styles.emptySubtitle}>
            Mint your first eStream NFT from DevTools
          </Text>
        </View>
      ) : (
        <FlatList
          data={nfts}
          renderItem={renderNftCard}
          keyExtractor={(item) => item.nft_id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#00D9FF"
            />
          }
        />
      )}
    </View>
  );
};

// Demo NFT for when API is unavailable
function createDemoNft(owner: string): EstreamNft {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#1a1a2e"/>
          <stop offset="100%" style="stop-color:#16213e"/>
        </linearGradient>
      </defs>
      <rect fill="url(#bg)" width="400" height="400" rx="20"/>
      <circle cx="200" cy="140" r="60" fill="#00D9FF" opacity="0.2"/>
      <circle cx="200" cy="140" r="40" fill="#00D9FF" opacity="0.4"/>
      <circle cx="200" cy="140" r="20" fill="#00D9FF"/>
      <text x="200" y="230" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">eStream Identity</text>
      <text x="200" y="260" text-anchor="middle" fill="#00D9FF" font-size="14">HARDWARE VERIFIED</text>
      <text x="200" y="320" text-anchor="middle" fill="#666" font-size="12">${owner.substring(0, 16)}...</text>
      <text x="200" y="360" text-anchor="middle" fill="#00D9FF" font-size="10">Powered by eStream</text>
    </svg>
  `;
  
  return {
    nft_id: 'demo-' + Date.now().toString(16),
    estream_id: 'demo-estream-id',
    nft_type: 'identity',
    name: 'eStream Identity',
    description: 'Your verified identity on the eStream network',
    image_svg: svg,
    attributes: [
      { trait_type: 'Trust Level', value: 'Hardware' },
      { trait_type: 'Member Since', value: 'Jan 2026' },
      { trait_type: 'Activity Score', value: 100 },
      { trait_type: 'Anchors', value: 1 },
    ],
    minted_at: Date.now(),
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  count: {
    fontSize: 14,
    color: '#00D9FF',
    backgroundColor: '#00D9FF20',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  grid: {
    padding: 12,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    margin: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#0f0f1a',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 48,
  },
  cardContent: {
    padding: 12,
  },
  nftName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  nftType: {
    fontSize: 10,
    color: '#00D9FF',
    fontWeight: '500',
    marginBottom: 4,
  },
  nftId: {
    fontSize: 10,
    color: '#666',
    fontFamily: 'monospace',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0f',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: '#FF6B3520',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FF6B35',
  },
  errorText: {
    color: '#FF6B35',
    fontSize: 12,
  },
});

export default NftGallery;

