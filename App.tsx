/**
 * eStream Mobile App
 * 
 * React Native client for the eStream network.
 * 
 * On startup, shows the DevTools screen for self-verification.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform, NativeModules, TouchableOpacity } from 'react-native';
import DevTools from './src/screens/DevTools';
import NftGallery from './src/components/NftGallery';

// Get native modules - may be undefined on iOS until properly linked
const { QuicClient: NativeQuicClient, PqCryptoModule } = NativeModules;

type TabType = 'devtools' | 'nfts';

function App(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('devtools');
  const [ownerKey, setOwnerKey] = useState<string>('');

  useEffect(() => {
    initializeCrypto();
  }, []);

  const initializeCrypto = async () => {
    const isAndroid = Platform.OS === 'android';
    const hasQuicClient = !!NativeQuicClient;
    const hasPqCrypto = !!PqCryptoModule;
    
    console.log(`[App] Platform: ${Platform.OS}`);
    console.log(`[App] QuicClient available: ${hasQuicClient}`);
    console.log(`[App] PqCryptoModule available: ${hasPqCrypto}`);
    
    // On iOS, native modules require more setup - skip for now
    if (Platform.OS === 'ios' && !hasQuicClient && !hasPqCrypto) {
      setStatus('iOS: Native modules loading...\nDevTools available below.');
      setReady(true);
      return;
    }
    
    try {
      if (isAndroid && hasQuicClient) {
        // Android with full QUIC support
        console.log('[App] Starting Android QUIC + PQC...');
        setStatus('Initializing QUIC (Android)...');
        
        const handle = await NativeQuicClient.initialize();
        console.log('[App] ✅ QUIC initialized, handle:', handle);
        
        const keysJson = await NativeQuicClient.generateDeviceKeys('estream-app');
        const keys = JSON.parse(keysJson);
        console.log('[App] ✅ PQ keys generated');
        
        // Store owner key for NFT gallery
        const keyHash = typeof keys.key_hash === 'string' 
          ? keys.key_hash
          : Array.isArray(keys.key_hash)
            ? keys.key_hash.map((b: number) => b.toString(16).padStart(2, '0')).join('')
            : '';
        setOwnerKey(keyHash);
        
        const keyHashDisplay = keyHash.substring(0, 16) || 'generated';
        
        // Connect via HTTP/3 (QUIC/UDP) to Mac's IP - writes require HTTP/3
        const MAC_IP = '10.0.0.120';
        const ESTREAM_H3 = `${MAC_IP}:8443`;   // HTTP/3 (UDP) - full access
        const ESTREAM_HTTP = `http://${MAC_IP}:8090`;  // HTTP/2 (TCP) - read-only
        
        setStatus(`Connecting to eStream...\nHTTP/3: ${ESTREAM_H3}`);
        
        try {
          // HTTP/3 first - required for write operations (NFT minting)
          console.log(`[App] Connecting via HTTP/3 to ${ESTREAM_H3}...`);
          await NativeQuicClient.h3Connect(ESTREAM_H3);
          console.log('[App] ✅ HTTP/3 connected!');
          
          // Also verify HTTP for read-only operations
          console.log(`[App] Verifying HTTP at ${ESTREAM_HTTP}...`);
          const response = await fetch(`${ESTREAM_HTTP}/health`, { method: 'GET' });
          const health = await response.text();
          console.log('[App] ✅ HTTP health:', health);
          
          setStatus(`✅ Connected via HTTP/3!\n\nHTTP/3 (UDP): ${ESTREAM_H3}\nHTTP (TCP): ${ESTREAM_HTTP}\nKey: ${keyHashDisplay}...\n\n🔐 Ready for NFT minting`);
        } catch (h3Err: any) {
          console.warn('[App] HTTP/3 connection failed:', h3Err?.message);
          
          // Fallback to HTTP (read-only)
          try {
            console.log(`[App] Fallback to HTTP: ${ESTREAM_HTTP}...`);
            const response = await fetch(`${ESTREAM_HTTP}/health`, { method: 'GET' });
            const health = await response.text();
            console.log('[App] ✅ HTTP connected (read-only):', health);
            setStatus(`⚠️ HTTP only (read-only)\n\nHTTP/3 failed: ${h3Err?.message}\nHTTP: ${ESTREAM_HTTP}\n\n📖 Writes require HTTP/3`);
          } catch (httpErr: any) {
            console.warn('[App] HTTP also failed:', httpErr?.message);
            setStatus(`❌ Connection failed\n\nHTTP/3: ${h3Err?.message}\nHTTP: ${httpErr?.message}`);
          }
        }
      } else if (hasPqCrypto) {
        // iOS with PQ crypto only
        console.log('[App] Starting iOS PQ crypto...');
        setStatus('Initializing PQ Crypto (iOS)...');
        
        const result = await PqCryptoModule.generateDeviceKeys('estream-app');
        console.log('[App] ✅ PQ keys generated');
        
        setStatus(`✅ PQ Crypto Ready (iOS)\n\nKyber1024 + Dilithium5`);
      } else {
        setStatus('Native modules not available.\nCheck Xcode integration.');
      }
      
      setReady(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[App] Init failed:', errorMsg);
      setStatus(`⚠️ ${errorMsg}`);
      setReady(true);
    }
  };

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>Initializing...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {status && <Text style={styles.status}>{status}</Text>}
      
      {/* Tab Content */}
      <View style={styles.content}>
        {activeTab === 'devtools' && <DevTools />}
        {activeTab === 'nfts' && (
          <NftGallery 
            ownerPublicKey={ownerKey || 'demo-user'} 
            onNftPress={(nft) => console.log('[App] NFT pressed:', nft.nft_id)}
          />
        )}
      </View>
      
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'devtools' && styles.tabActive]}
          onPress={() => setActiveTab('devtools')}
        >
          <Text style={[styles.tabText, activeTab === 'devtools' && styles.tabTextActive]}>
            🛠️ DevTools
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'nfts' && styles.tabActive]}
          onPress={() => setActiveTab('nfts')}
        >
          <Text style={[styles.tabText, activeTab === 'nfts' && styles.tabTextActive]}>
            🖼️ NFTs
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#888',
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
  },
  status: {
    padding: 12,
    backgroundColor: '#1a1a2e',
    color: '#4ade80',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0, // Safe area
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderTopWidth: 2,
    borderTopColor: '#00D9FF',
  },
  tabText: {
    color: '#666',
    fontSize: 14,
  },
  tabTextActive: {
    color: '#00D9FF',
    fontWeight: '600',
  },
});

export default App;
