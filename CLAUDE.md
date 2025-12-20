# CLAUDE.md - eStream Mobile App Context

## Overview

The eStream mobile app is a React Native application that provides direct access to eStream network functionality. It serves as:

1. **Reference implementation** for consuming vault services in React Native
2. **Developer tool** for testing and interacting with eStream nodes
3. **Template** for downstream apps (TakeTitle, TrueResolve)

**Current Status**: Early development - VaultProvider and trust badge implemented

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    estream-app                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │              React Native UI                     │   │
│  │   (App.tsx - VaultProvider integration)          │   │
│  └──────────────────────┬──────────────────────────┘   │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐   │
│  │              VaultProvider Context               │   │
│  │   - isLoading, isAvailable, error               │   │
│  │   - publicKey, trustLevel                        │   │
│  │   - sign() method                                │   │
│  └──────────────────────┬──────────────────────────┘   │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐   │
│  │           Vault Service Implementations          │   │
│  │   - SeekerVaultService (Android + Seed Vault)   │   │
│  │   - KeychainVaultService (iOS Secure Enclave)   │   │
│  │   - SoftwareVaultService (Dev/testing fallback) │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │    eStream Node       │
              │    (estream-core)     │
              └───────────────────────┘
```

---

## Project Structure (Actual)

```
estream-app/
├── android/                     # Android native code
│   └── app/src/main/java/...
├── ios/                         # iOS native code
│   └── EstreamApp/
├── src/
│   ├── App.tsx                  # Root component with VaultProvider
│   ├── api/
│   │   └── signedClient.ts      # Signed envelope API client
│   ├── components/
│   │   └── NftPreview.tsx       # NFT image preview component
│   ├── screens/
│   │   └── DevTools.tsx         # Developer tools screen
│   ├── services/
│   │   ├── nft/
│   │   │   ├── index.ts
│   │   │   └── NftMintService.ts
│   │   ├── solana/
│   │   │   ├── index.ts
│   │   │   └── MwaService.ts    # Mobile Wallet Adapter
│   │   └── vault/
│   │       ├── index.ts         # Exports
│   │       ├── VaultService.ts  # Interface definition
│   │       ├── VaultContext.tsx # React context/provider
│   │       ├── SeekerVaultService.ts
│   │       ├── KeychainVaultService.ts
│   │       └── SoftwareVaultService.ts
│   ├── types/
│   │   └── index.ts             # TypeScript types
│   └── utils/
│       └── crypto.ts            # Crypto utilities
├── docs/
│   ├── IDENTITY_NFT_DESIGN.md   # NFT specification
│   └── SEEKER_SECURITY_DESIGN.md
├── screenshots/                  # Development screenshots
├── package.json
├── tsconfig.json
├── babel.config.js
└── metro.config.js
```

---

## Key Components

### PqVaultService Interface (PQ-First)

```typescript
// src/services/vault/PqVaultService.ts
export interface PqVaultService {
  isAvailable(): Promise<boolean>;
  
  // PQ Public Keys (Dilithium5 + Kyber1024)
  getPublicKeys(): Promise<DevicePublicKeys>;
  getPublicKeyRef(): Promise<PqKeyReference>;  // 32-byte hash
  
  // PQ Signing (Dilithium5)
  signDilithium(message: Uint8Array): Promise<PqSignature>;
  signWithBiometric(message: Uint8Array, prompt: string): Promise<PqSignature>;
  
  // PQ Key Exchange (Kyber1024)
  encapsulateKyber(publicKey: Uint8Array): Promise<{ ciphertext: Uint8Array, sharedSecret: Uint8Array }>;
  
  // Trust & Attestation
  getTrustLevel(): Promise<TrustLevel>;
  getPqAttestation?(challenge: Uint8Array): Promise<PqAttestationData | null>;
}

export interface DevicePublicKeys {
  signing: Uint8Array;    // Dilithium5 public key (~2.5KB)
  kem: Uint8Array;        // Kyber1024 public key (~1.5KB)
}

export enum TrustLevel {
  Untrusted = 0,      // No security
  Software = 1,       // Encrypted storage
  Hardware = 2,       // TEE
  SecureElement = 3,  // Seeker Secure Enclave (PQ)
  Certified = 4,      // HSM with PQ attestation
}
```

### VaultProvider Context

```typescript
// src/services/vault/VaultContext.tsx
export interface VaultContextValue {
  isLoading: boolean;
  isAvailable: boolean;
  error: Error | null;
  publicKey: string | null;
  trustLevel: TrustLevel;
  sign: (message: Uint8Array) => Promise<Uint8Array>;
}

export function VaultProvider({ children, nodeUrl }): JSX.Element;
export function useVault(): VaultContextValue;
export function useTrustBadge(): { label: string; color: string; icon: string };
```

### Vault Implementations

| Service | Platform | Trust Level | Description |
|---------|----------|-------------|-------------|
| `SeekerVaultService` | Android (Seeker) | Hardware | Seed Vault, attestation |
| `KeychainVaultService` | iOS | Hardware* | Secure Enclave |
| `SoftwareVaultService` | All | Software | Dev/testing only |

*Hardware backing depends on device capabilities

---

## Security Posture

### Core Principles (from estream)

1. **Fail Closed, Never Fail Open** - On any error, deny access
2. **Validate All Inputs** - Never trust any input
3. **Explicit Over Implicit** - Security requirements must be explicit
4. **Hardware-First** - Prefer hardware-backed keys when available

### PQ Wire Protocol Client (Production)

```typescript
// src/api/pqClient.ts
import { QuicClient, PqWireMessage } from '@estream/quic-native';

export class PqEstreamClient {
  private quic: QuicClient;
  private vault: PqVaultService;
  
  async connect(serverUrl: string): Promise<void> {
    this.quic = await QuicClient.connect(serverUrl);
    
    // Announce our public keys
    const publicKeys = await this.vault.getPublicKeys();
    await this.quic.send(PqWireMessage.keyAnnouncement(publicKeys));
  }
  
  async emitEstream(estream: Estream): Promise<void> {
    const payload = serializeEstream(estream);
    
    // Sign with Dilithium5
    const signature = await this.vault.signDilithium(payload);
    
    await this.quic.send(PqWireMessage.emitEstream(estream, signature));
  }
}
```

### HTTP Signed Envelopes (Legacy Compatibility)

```typescript
// src/api/signedClient.ts
export async function signedFetch(
  vault: PqVaultService,
  method: string,
  path: string,
  body: unknown
): Promise<Response> {
  const publicKeyRef = await vault.getPublicKeyRef();
  const timestamp = Date.now().toString();
  const nonce = generateNonce();
  const bodyHash = computeBodyHash(body);
  
  // Build signing payload
  const payload = `${method}.${path}.${bodyHash}.${timestamp}.${nonce}`;
  
  // Sign with Dilithium5
  const signature = await vault.signDilithium(new TextEncoder().encode(payload));
  
  return fetch(`${NODE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Public-Key': encodeBase58(publicKeyRef),
      'X-Device-Signature': encodeBase58(signature),
      'X-Device-Timestamp': timestamp,
      'X-Device-Nonce': nonce,
      'X-Body-Hash': bodyHash,
    },
    body: JSON.stringify(body),
  });
}
```

### TypeScript Security Patterns

```typescript
// ✅ Input Validation - EVERY endpoint uses Zod or similar
const schema = z.object({
  titleId: z.string().uuid(),
  name: z.string().min(1).max(200),
});
const result = schema.safeParse(req.body);

// ✅ Type-Safe Error Handling
catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('Operation failed', { error: message });
}

// ❌ NEVER: Trust unvalidated input
JSON.parse(untrustedString)  // Without validation

// ❌ NEVER: Use eval or dynamic code execution
eval(anything)
new Function(string)
```

---

## Implementation Status

### Implemented ✅

| Component | Description |
|-----------|-------------|
| VaultService interface | Abstract vault operations |
| VaultProvider context | React context for vault access |
| SeekerVaultService | Android Seeker Seed Vault |
| KeychainVaultService | iOS Keychain/Secure Enclave |
| SoftwareVaultService | Development fallback |
| Trust badge display | Visual security indicator |
| App shell | Basic UI with vault integration |

### Planned ⏳

| Component | Description |
|-----------|-------------|
| Node connection | WebSocket to eStream nodes |
| Estream operations | Create, sign, browse, verify |
| Signed API client | Full envelope implementation |
| Developer tools | Merkle proofs, hash visualization |
| NFT minting | eStream Identity NFT |

---

## Development Commands

```bash
# Install dependencies
npm install

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

---

## Related Repositories

| Repo | Relationship |
|------|--------------|
| `estream/crates/estream-browser` | WASM dependency for crypto (future) |
| `estream/crates/estream-core` | Server this app connects to |
| `taketitle-app` | Downstream app using similar patterns |
| `trueresolve-app` (future) | Downstream app using similar patterns |

---

## Security Considerations

> **See**: [estream Security Patterns Guide](../estream/docs/guides/SECURITY_PATTERNS.md) for authoritative patterns.

### PQ-First Security

1. **PQ Key Storage**: Use Seeker Secure Enclave for Dilithium5/Kyber1024 keys
2. **PQ Attestation**: Hardware-backed PQ keys provide quantum-resistant attestation
3. **PQ Signed Requests**: All privileged operations use Dilithium5 signatures
4. **No Plain Secrets**: Never store unencrypted private keys
5. **Fail Closed**: On vault errors, deny operations rather than fallback

### Core Security Principles

1. **Fail Closed, Never Fail Open** - On any error, deny access
2. **One Door Principle** - Governance is single entry for privileged ops
3. **Constant-Time for Secrets** - All crypto comparisons use constant-time
4. **PQ-First** - All production crypto is Dilithium5 + Kyber1024
5. **Validate All Inputs** - Never trust any input

### Related Issues

- estream Issue #42: PQ Seeker Integration
- estream Issue #33: PQ Security Posture

---

**Maintainer**: Todd Rooke  
**Last Updated**: December 2025
