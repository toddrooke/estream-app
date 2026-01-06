/**
 * eStream Test App
 * 
 * Simplified version for testing native estream support without vault dependencies.
 */

import React, { useState, useCallback } from 'react';
import { 
  SafeAreaView, 
  StatusBar, 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { EstreamEventLog } from '@/components/EstreamEventLog';
import { EstreamService } from '@/services/estream';

// Estream types for the app
const ESTREAM_TYPES = {
  MESSAGE: 0x0001,
  NFT: 0x0002,
  MEDIA: 0x0003,
  STATUS: 0x0010,
  DEBUG: 0x00FF,
};

/**
 * Test Panel for creating and viewing estreams
 */
function EstreamTestPanel(): React.JSX.Element {
  const [resource, setResource] = useState('test:demo');
  const [payload, setPayload] = useState('Hello from eStream app!');
  const [isCreating, setIsCreating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const handleCreate = useCallback(async (typeNum: number, typeName: string) => {
    setIsCreating(true);
    setLastResult(null);
    
    try {
      const estream = await EstreamService.create(
        'io.estream.app',
        typeNum,
        resource,
        payload
      );
      
      // Get info
      const info = await EstreamService.parse(estream);
      setLastResult(`Created ${typeName}: ${info.content_id?.substring(0, 16) || 'pending'}...`);
      
    } catch (error: any) {
      setLastResult(`Error: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  }, [resource, payload]);

  const handleTestRoundtrip = useCallback(async () => {
    setIsCreating(true);
    setLastResult(null);
    
    try {
      // 1. Create
      console.log('[Test] Creating estream...');
      const estream = await EstreamService.create(
        'io.estream.app',
        ESTREAM_TYPES.DEBUG,
        'test:roundtrip',
        JSON.stringify({ timestamp: Date.now(), test: true })
      );
      
      // 2. Sign
      console.log('[Test] Signing...');
      const signed = await EstreamService.sign(estream);
      
      // 3. Verify
      console.log('[Test] Verifying...');
      const valid = await EstreamService.verify(signed);
      
      // 4. Convert to msgpack
      console.log('[Test] Converting to msgpack...');
      const msgpack = await EstreamService.toMsgpack(signed);
      
      // 5. Parse from msgpack
      console.log('[Test] Parsing from msgpack...');
      const parsed = await EstreamService.fromMsgpack(msgpack);
      
      // 6. Get info
      const info = await EstreamService.parse(parsed);
      
      setLastResult(
        `✅ Roundtrip complete!\n` +
        `Signature: ${valid ? 'VALID' : 'INVALID'}\n` +
        `MsgPack: ${msgpack.length} chars\n` +
        `ID: ${info.content_id?.substring(0, 16) || 'unknown'}...`
      );
      
    } catch (error: any) {
      setLastResult(`Error: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  }, []);

  return (
    <View style={styles.testPanel}>
      <Text style={styles.panelTitle}>🔧 Native Estream Test</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Resource</Text>
        <TextInput
          style={styles.input}
          value={resource}
          onChangeText={setResource}
          placeholder="resource:id"
          placeholderTextColor="#666"
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Payload</Text>
        <TextInput
          style={[styles.input, styles.payloadInput]}
          value={payload}
          onChangeText={setPayload}
          placeholder="Enter payload..."
          placeholderTextColor="#666"
          multiline
        />
      </View>
      
      <View style={styles.buttonRow}>
        <TouchableOpacity 
          style={[styles.button, styles.messageBtn]}
          onPress={() => handleCreate(ESTREAM_TYPES.MESSAGE, 'Message')}
          disabled={isCreating}
        >
          <Text style={styles.buttonText}>📨 Message</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.nftBtn]}
          onPress={() => handleCreate(ESTREAM_TYPES.NFT, 'NFT')}
          disabled={isCreating}
        >
          <Text style={styles.buttonText}>🎨 NFT</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.debugBtn]}
          onPress={() => handleCreate(ESTREAM_TYPES.DEBUG, 'Debug')}
          disabled={isCreating}
        >
          <Text style={styles.buttonText}>🔍 Debug</Text>
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity 
        style={[styles.button, styles.testBtn]}
        onPress={handleTestRoundtrip}
        disabled={isCreating}
      >
        <Text style={styles.buttonText}>
          {isCreating ? '⏳ Testing...' : '🔄 Full Roundtrip Test (Create → Sign → Verify → MsgPack)'}
        </Text>
      </TouchableOpacity>
      
      {isCreating && (
        <ActivityIndicator style={styles.spinner} color="#4a9eff" />
      )}
      
      {lastResult && (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>{lastResult}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Main Test App
 */
function AppTest(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>eStream</Text>
          <Text style={styles.subtitle}>Native Estream Test Mode</Text>
          
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🧪 Test Mode</Text>
          </View>
        </View>
        
        {/* Test Panel */}
        <EstreamTestPanel />
        
        {/* Event Log */}
        <View style={styles.eventLogContainer}>
          <EstreamEventLog maxHeight={350} />
        </View>
        
        <Text style={styles.version}>v0.2.0 - Native Estream SDK</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 12,
  },
  badge: {
    backgroundColor: '#f97316',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  version: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'center',
    marginTop: 20,
  },
  // Test Panel
  testPanel: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 10,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333333',
  },
  payloadInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  messageBtn: {
    backgroundColor: '#22c55e',
  },
  nftBtn: {
    backgroundColor: '#a855f7',
  },
  debugBtn: {
    backgroundColor: '#64748b',
  },
  testBtn: {
    backgroundColor: '#3b82f6',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  spinner: {
    marginTop: 12,
  },
  resultBox: {
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  resultText: {
    color: '#4ade80',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  eventLogContainer: {
    marginBottom: 16,
  },
});

export default AppTest;

