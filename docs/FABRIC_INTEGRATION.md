# estream Fabric Integration Guide

**Version**: 1.0  
**Last Updated**: December 2024

---

## Overview

This guide describes how to integrate mobile applications with the **estream Fabric** using the `estream-react-native` module.

---

## Key Concepts

### Fabric
The **estream Fabric** is a binary, event-based activity layer that records cryptographically secured interactions in a globally visible structure while preserving participant privacy.

### Lattice
A **Lattice** is a scoped consensus surface within the Fabric that defines trust, consensus, and privacy boundaries for a set of related events.

> **Fabric is where activity lives. Lattice is how agreement happens.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Mobile Application                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                TypeScript / React                    │   │
│  │  • UI Components                                     │   │
│  │  • Business Logic                                    │   │
│  │  • State Management                                  │   │
│  └────────────────────────┬────────────────────────────┘   │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────┐   │
│  │              FabricClient Service                    │   │
│  │  • DHT Discovery                                     │   │
│  │  • Node Selection                                    │   │
│  │  • Estream Emission                                  │   │
│  └────────────────────────┬────────────────────────────┘   │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────┐   │
│  │           estream-react-native                       │   │
│  │  • PQ Cryptography (Dilithium5, Kyber1024)          │   │
│  │  • QUIC Transport (IPv6-native)                      │   │
│  │  • MPC Escrow                                        │   │
│  └────────────────────────┬────────────────────────────┘   │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                     estream Fabric                           │
│  • Lattice Consensus                                         │
│  • Merkle Anchoring (Solana)                                │
│  • Gossip Protocol                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Installation

### 1. Add estream-react-native

```bash
# Copy native library to your project
cp path/to/libestream_react_native.so android/app/src/main/jniLibs/arm64-v8a/
```

### 2. Configure Android

Add the native module to your `MainApplication.kt`:

```kotlin
import app.polymessenger.QuicClientPackage  // Adjust package name

override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
        add(QuicClientPackage())
    }
```

### 3. Create TypeScript Wrapper

```typescript
// src/services/fabric/FabricClient.ts
import { NativeModules } from 'react-native';

const { QuicClient } = NativeModules;

export class FabricClient {
  private handle: number | null = null;

  async initialize(): Promise<void> {
    this.handle = await QuicClient.initialize();
  }

  async generateKeys(appScope: string): Promise<DevicePublicKeys> {
    const json = await QuicClient.generateDeviceKeys(appScope);
    return JSON.parse(json);
  }

  async connect(nodeAddr: string): Promise<void> {
    if (!this.handle) throw new Error('Not initialized');
    await QuicClient.connect(this.handle, nodeAddr);
  }

  dispose(): void {
    if (this.handle) {
      QuicClient.dispose(this.handle);
      this.handle = null;
    }
  }
}
```

---

## DHT Discovery

### Finding Nodes

```typescript
interface DiscoveryOptions {
  locality?: string[];      // Preferred locality
  preferPq?: boolean;       // Prefer PQ-capable nodes
  maxLatencyMs?: number;    // Maximum latency
}

interface NodeInfo {
  nodeId: string;
  address: string;
  reputation: number;
  capacity: number;
  latency: number;
  pqLevel: 'full' | 'proxied' | 'classical';
}

async function discoverNodes(options: DiscoveryOptions): Promise<NodeInfo[]> {
  // 1. Query bootstrap nodes
  // 2. Perform iterative DHT lookup
  // 3. Score and rank results
  return nodes;
}
```

### Weighted Selection

Nodes are selected based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| Reputation | 30% | Historical behavior score |
| Capacity | 20% | Available capacity ratio |
| Latency | 20% | Network round-trip time |
| Stake | 15% | Economic commitment |
| PQ Level | 15% | Post-quantum capability |

---

## Emitting Estreams

### Basic Emission

```typescript
interface Estream {
  resource: string;
  locality: Locality;
  payload: Uint8Array;
  scope?: Scope;
}

interface EmitResult {
  estreamId: string;
  sequence: number;
  timestamp: number;
}

async function emit(estream: Estream): Promise<EmitResult> {
  // 1. Generate PQ signature
  const signature = await fabric.sign(estream.payload);
  
  // 2. Connect to best node
  const node = await selectBestNode();
  await fabric.connect(node.address);
  
  // 3. Emit to Fabric
  return await fabric.emit({
    ...estream,
    signature,
  });
}
```

### With Locality Constraints

```typescript
const estream: Estream = {
  resource: 'document://contract-123',
  locality: {
    origin: ['us', 'tx', 'austin'],
    ceiling: ['us'],  // Data stays in US
  },
  payload: documentBytes,
};

await emit(estream);
```

---

## Security Best Practices

### Key Management

```typescript
// Generate keys on first launch
const keys = await fabric.generateKeys('my-app');

// Store securely
await SecureStore.setItem('pq_keys', JSON.stringify(keys));

// Never expose secret keys to JavaScript
// They remain in the native module
```

### Signature Verification

```typescript
// All incoming data should be verified
const isValid = await fabric.verify(
  data,
  signature,
  senderPublicKey
);

if (!isValid) {
  throw new Error('Invalid signature');
}
```

### Error Handling

```typescript
try {
  await fabric.connect(nodeAddr);
} catch (error) {
  // Fail closed - don't proceed without connection
  console.error('Connection failed:', error);
  throw error;
}
```

---

## Testing

### Using estream-test Fixtures

```typescript
import { TEST_NODE_IDS, TEST_ADDRESSES } from 'estream-test';

describe('FabricClient', () => {
  it('should connect to node', async () => {
    const client = new FabricClient();
    await client.initialize();
    
    // Use test fixtures, not hardcoded values
    await client.connect(TEST_ADDRESSES.LOCAL_NODE);
  });
});
```

### Mock Native Module

```typescript
jest.mock('react-native', () => ({
  NativeModules: {
    QuicClient: {
      initialize: jest.fn().mockResolvedValue(1),
      generateDeviceKeys: jest.fn().mockResolvedValue('{}'),
      connect: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn(),
    },
  },
}));
```

---

## References

- [FABRIC_SPECIFICATION.md](https://github.com/toddrooke/estream/blob/pq-dlt-exploration/docs/specs/FABRIC_SPECIFICATION.md)
- [LATTICE_CONSENSUS.md](https://github.com/toddrooke/estream/blob/pq-dlt-exploration/docs/specs/LATTICE_CONSENSUS.md)
- [CLIENT_ROUTING.md](https://github.com/toddrooke/estream/blob/pq-dlt-exploration/docs/specs/CLIENT_ROUTING.md)
- [estream-react-native SPEC.md](https://github.com/toddrooke/estream-quic-native/blob/pq-dlt-exploration/SPEC.md)

