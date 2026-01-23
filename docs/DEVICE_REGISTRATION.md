# Mobile Device Registration Flow

This document describes how mobile devices register with the eStream network as governance key holders.

## Overview

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Mobile Device  │       │  Edge Proxy     │       │  Governance     │
│  (Seeker/iOS)   │       │  (alpha-devnet) │       │  Lattice        │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         │ 1. Generate ML-DSA Key  │                         │
         │ (Hardware Secure Elem)  │                         │
         │                         │                         │
         │ 2. POST /api/v1/devices/register                  │
         │ ───────────────────────>│                         │
         │                         │ 3. Submit to lattice    │
         │                         │ ───────────────────────>│
         │                         │                         │
         │                         │ 4. Registration event   │
         │                         │ <───────────────────────│
         │ 5. Device ID + Status   │                         │
         │ <───────────────────────│                         │
         │                         │                         │
```

## Step 1: Key Generation (Seeker/Hardware)

The mobile device generates an ML-DSA-87 keypair in the Seeker Seed Vault (Android) or Secure Enclave (iOS).

### Seeker (Android)

```typescript
import { SeekerMlDsaService } from '@/services/vault/SeekerMlDsaService';

const seeker = new SeekerMlDsaService();

// Check if hardware is available
const available = await seeker.isMlDsaAvailable();

// Get (or generate) public key
const publicKey = await seeker.getMlDsaPublicKey();  // 2592 bytes for ML-DSA-87

// Get key hash (32 bytes, used as device identity)
const keyHash = await seeker.getMlDsaKeyHash();
```

### Key Format

| Field | Size | Description |
|-------|------|-------------|
| Public Key | 2592 bytes | ML-DSA-87 public key |
| Key Hash | 32 bytes | Blake3/SHA-256 hash of public key |
| Signature | 4627 bytes | ML-DSA-87 signature |

**Note:** Current Seeker uses Ed25519 via Android Keystore. ML-DSA-87 JNI integration is pending.

## Step 2: Registration Request

The device sends a registration request to the edge proxy API:

```typescript
import { DeviceRegistryService } from '@/services/device/DeviceRegistryService';

const registry = new DeviceRegistryService({
  baseUrl: 'https://api.alpha-devnet.estream.io',
});

const result = await registry.registerDevice({
  appId: 'io.estream.app',
  namespace: 'alpha-devnet',
  publicKey: base64Encode(publicKey),
  deviceFingerprint: base64Encode(blindFingerprint),
  metadata: {
    securityLevel: 'strongbox',  // or 'tee', 'software'
    deviceClass: 'seeker',       // or 'android_mobile', 'ios_mobile'
    appVersion: '1.0.0',
    nickname: 'My Seeker',
  },
  attestation: {
    certificates: [...],  // Android Key Attestation chain
    challenge: '...',
    timestamp: Date.now(),
  },
  signature: base64Encode(signature),
});

console.log('Device ID:', result.deviceId);
console.log('Trust Level:', result.trustLevel);
```

## Step 3: Spark-Based Registration (Alternative)

Devices can also register by scanning a Spark pattern from Mission Control:

1. Open Console → Governance → Add Key Holder
2. Console displays Spark pattern containing registration challenge
3. Mobile app scans pattern via camera
4. App signs the challenge and submits to API

```typescript
// ScanScreen.tsx handles this flow
if (parsed.type === 'device-registration') {
  await completeRegistration(parsed);
}
```

## Step 4: Becoming a Key Holder

After registration, the device can be promoted to governance key holder:

1. **Genesis Key Holder**: Included in initial genesis configuration
2. **Post-Genesis**: Added via governance circuit (requires existing key holder approval)

### Adding as Key Holder (Post-Genesis)

```yaml
circuit: estream.governance.add_key_holder.v1
environment: alpha-devnet
inputs:
  key_hash: "abc123..."  # Device's key hash (from registration)
  role: "key_holder"
  weight: 1
```

## Step 5: Signing Governance Requests

Once registered as a key holder, the device can sign governance requests:

```typescript
import { SeekerMlDsaService } from '@/services/vault/SeekerMlDsaService';

const seeker = new SeekerMlDsaService();

const signature = await seeker.signGovernance({
  operation: 'circuit_approve',
  description: 'Approve DNS update for alpha-devnet',
  circuitId: 'acfbe5c4...',
  circuitType: 'estream.ops.cloudflare.dns.v1',
  payload: circuitHashBytes,
});
```

## Trust Levels

| Level | Description | Key Storage |
|-------|-------------|-------------|
| `Certified` | Hardware attestation verified | Seeker StrongBox |
| `HardwareBacked` | Hardware secure element | Android TEE / iOS SE |
| `Software` | Software-only storage | Keychain (fallback) |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/devices/register` | Register new device |
| GET | `/api/v1/devices/{id}` | Get device status |
| POST | `/api/v1/devices/{id}/revoke` | Revoke device |
| GET | `/api/v1/devices` | List all devices |

## Network Configuration

The mobile app connects to the network selected in Settings:

```typescript
// NetworkConfig.ts
export const NETWORKS = {
  'alpha-devnet': {
    api: 'https://api.alpha-devnet.estream.io',
    governance: 'https://governance.alpha-devnet.estream.io',
    ws: 'wss://api.alpha-devnet.estream.io/ws',
  },
  // ... other networks
};
```

## Files

| File | Purpose |
|------|---------|
| `services/vault/SeekerMlDsaService.ts` | ML-DSA signing via Seeker |
| `services/vault/SeekerVaultService.ts` | Ed25519 + biometrics |
| `services/device/DeviceRegistryService.ts` | Registration API client |
| `screens/ScanScreen.tsx` | Spark-based registration flow |
| `services/governance/GovernanceSigningService.ts` | Governance signing |

## Testing

1. Build app in debug mode
2. Select "alpha-devnet" in Settings → Network
3. Go to Account → Register Device
4. Verify registration in Console → Governance → Key Holders
