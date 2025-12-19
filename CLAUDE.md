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

### VaultService Interface

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

export enum TrustLevel {
  Untrusted = 0,    // No security
  Software = 1,     // Encrypted storage
  Hardware = 2,     // Secure enclave/Seeker
  Certified = 3,    // HSM with attestation
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

### Signed Request Envelopes

```typescript
// src/api/signedClient.ts
export async function signedFetch(
  vault: VaultService,
  method: string,
  path: string,
  body: unknown
): Promise<Response> {
  const publicKey = await vault.getPublicKeyBase58();
  const timestamp = Date.now().toString();
  const nonce = generateNonce();
  const bodyHash = computeBodyHash(body);
  
  // Build signing payload
  const payload = `${method}.${path}.${bodyHash}.${timestamp}.${nonce}`;
  
  // Sign with vault
  const signature = await vault.sign(new TextEncoder().encode(payload));
  
  return fetch(`${NODE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Public-Key': publicKey,
      'X-Device-Signature': bs58.encode(signature),
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

1. **Key Storage**: Use Seeker Seed Vault when available, otherwise iOS Keychain / Android Keystore
2. **Attestation**: Hardware-backed keys provide attestation for key registry
3. **Signed Requests**: All privileged operations require signed envelopes
4. **No Plain Secrets**: Never store unencrypted private keys
5. **Fail Closed**: On vault errors, deny operations rather than fallback

---

**Maintainer**: Todd Rooke  
**Last Updated**: December 2025
