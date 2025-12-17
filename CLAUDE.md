# CLAUDE.md - eStream Mobile App Context

## Overview

The eStream mobile app is a React Native application that provides direct access to eStream network functionality. It serves as:

1. **Reference implementation** for consuming `estream-browser` in React Native
2. **Developer tool** for testing and interacting with eStream nodes
3. **Template** for downstream apps (TakeTitle, TrueResolve)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    estream-app                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │              React Native UI                     │   │
│  │   (Screens, Navigation, Components)              │   │
│  └──────────────────────┬──────────────────────────┘   │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐   │
│  │              State Management                    │   │
│  │          (Zustand, React Query)                  │   │
│  └──────────────────────┬──────────────────────────┘   │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐   │
│  │              estream-browser (WASM)              │   │
│  │   - KeyPair management                           │   │
│  │   - Estream creation & signing                   │   │
│  │   - Signed envelope generation                   │   │
│  │   - Node communication                           │   │
│  └──────────────────────┬──────────────────────────┘   │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐   │
│  │           Native Modules (Android/iOS)           │   │
│  │   - Seeker Seed Vault (Android)                  │   │
│  │   - Keychain (iOS)                               │   │
│  │   - Device Attestation                           │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │    eStream Node       │
              │    (estream-core)     │
              └───────────────────────┘
```

## Project Structure

```
estream-app/
├── android/                     # Android native code
│   └── app/src/main/java/
│       └── com/estream/
│           ├── vault/           # Seeker Seed Vault integration
│           └── attestation/     # Device attestation
├── ios/                         # iOS native code
│   └── EstreamApp/
│       ├── Vault/               # Keychain integration
│       └── Attestation/         # Device attestation
├── src/
│   ├── App.tsx                  # Root component
│   ├── api/
│   │   ├── client.ts            # API client
│   │   └── signedClient.ts      # Signed envelope client
│   ├── auth/
│   │   └── AuthContext.tsx      # Authentication state
│   ├── components/
│   │   ├── common/              # Shared components
│   │   ├── estream/             # Estream-specific components
│   │   └── security/            # Security indicators
│   ├── hooks/
│   │   ├── useEstream.ts        # Estream operations
│   │   └── useVault.ts          # Vault operations
│   ├── navigation/
│   │   └── RootNavigator.tsx    # Navigation structure
│   ├── screens/
│   │   ├── Home/                # Dashboard
│   │   ├── Streams/             # Estream browser
│   │   ├── Keys/                # Key management
│   │   ├── Nodes/               # Node connections
│   │   └── Settings/            # App settings
│   ├── services/
│   │   ├── estream/             # Estream service wrapper
│   │   └── vault/               # Native vault bridge
│   ├── store/
│   │   └── appStore.ts          # Zustand store
│   ├── types/
│   │   └── index.ts             # TypeScript types
│   └── utils/
│       └── crypto.ts            # Crypto utilities
├── scripts/
│   └── build-wasm.sh            # Build estream-browser WASM
├── package.json
├── tsconfig.json
├── babel.config.js
├── metro.config.js
└── README.md
```

## Key Dependencies

```json
{
  "dependencies": {
    "@react-navigation/native": "^6.x",
    "@react-navigation/native-stack": "^6.x",
    "@tanstack/react-query": "^5.x",
    "zustand": "^4.x",
    "estream-browser": "link:../estream/crates/estream-browser",
    "bs58": "^6.x",
    "tweetnacl": "^1.x"
  }
}
```

## Core Features

### 1. Key Management (#42) ✅
- Generate new Ed25519 keypairs
- Import/export keys (with warnings)
- View public key and trust level
- Connect to Seeker Seed Vault (Android)

### 2. Node Connection
- Connect to eStream nodes via WebSocket
- Health check and status display
- Multiple node support

### 3. Estream Operations
- Create and sign new estreams
- Browse estreams by resource
- Verify estream signatures
- View estream details and history

### 4. Signed Requests (#42) ✅
- Generate signed API envelopes
- Automatic envelope signing for privileged operations
- Nonce generation and timestamp

### 5. Developer Tools
- Raw estream inspection
- Merkle proof verification
- Hash chain visualization

### 6. Vault Service Implementations (#42) ✅

| Service | Platform | Trust Level | Features |
|---------|----------|-------------|----------|
| `SeekerVaultService` | Android (Seeker) | Hardware | Seed Vault, attestation |
| `KeychainVaultService` | iOS | Hardware* | Secure Enclave |
| `SoftwareVaultService` | All | Software | Dev/testing only |

*Hardware backing depends on device capabilities

## Security Patterns

### Vault Integration (#42) ✅
```typescript
// src/services/vault/VaultService.ts
export interface VaultService {
  isAvailable(): Promise<boolean>;
  getPublicKey(): Promise<Uint8Array>;
  getPublicKeyBase58(): Promise<string>;
  sign(message: Uint8Array): Promise<Uint8Array>;
  getTrustLevel(): Promise<TrustLevel>;
  getAttestation?(): Promise<AttestationData | null>;
}

// Implementations:
// - SeekerVaultService (Android with Seed Vault) ✅
// - KeychainVaultService (iOS Secure Enclave) ✅
// - SoftwareVaultService (Fallback, dev only) ✅

// Factory function
export async function getVaultService(): Promise<VaultService>;

// React integration
export function VaultProvider({ children, nodeUrl }): JSX.Element;
export function useVault(): VaultContextValue;
export function useSignedApi(): { api, isLoading, error };
export function useTrustBadge(): { label, color, icon };
```

### Signed Envelope Generation
```typescript
// src/api/signedClient.ts
import { signRequestEnvelope } from 'estream-browser';

export async function signedFetch(
  vault: VaultService,
  method: string,
  path: string,
  body: unknown
): Promise<Response> {
  const headers = await signRequestEnvelope(
    {
      publicKey: await vault.getPublicKey(),
      sign: (msg) => vault.sign(msg),
    },
    method,
    path,
    body
  );
  
  return fetch(`${NODE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
```

## Development Commands

```bash
# Install dependencies
npm install

# Build WASM module
npm run build:wasm

# Start Metro bundler
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Run tests
npm test

# Lint
npm run lint
```

## Relationship to Other Repos

| Repo | Relationship |
|------|--------------|
| `estream/crates/estream-browser` | WASM dependency for crypto |
| `estream/crates/estream-core` | Server this app connects to |
| `taketitle-app` | Downstream app using similar patterns |
| `trueresolve-app` (future) | Downstream app using similar patterns |

## Testing

- Unit tests for services and hooks
- Component tests for UI
- E2E tests with detox
- WASM integration tests

## Security Considerations

1. **Key Storage**: Use Seeker Seed Vault when available, otherwise iOS Keychain / Android Keystore
2. **Attestation**: Hardware-backed keys provide attestation for key registry
3. **Signed Requests**: All privileged operations require signed envelopes
4. **No Plain Secrets**: Never store unencrypted private keys

---

**Maintainer**: Todd Rooke  
**Repository**: https://github.com/toddrooke/estream-app

