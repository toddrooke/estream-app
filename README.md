# eStream Mobile App

> React Native client for the eStream network

The eStream mobile app provides direct access to eStream network functionality, serving as both a developer tool and reference implementation for downstream applications.

**Current Status**: Early development - basic vault integration complete

---

## Current Features (Implemented)

- **Vault Integration** - Hardware-backed key management
  - Seeker Seed Vault support (Android)
  - iOS Keychain support
  - Software fallback for development
- **Trust Badge Display** - Visual security level indicator
- **Public Key Display** - View device identity

## Planned Features (Not Yet Implemented)

- Node Connection via WebSocket
- Estream Operations (create, sign, browse, verify)
- Signed Request envelope generation
- Developer Tools (Merkle proofs, hash chain visualization)
- NFT Preview integration

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/toddrooke/estream-app.git
cd estream-app

# Install dependencies
npm install

# Start Metro bundler
npm start

# Run on Android
npm run android

# Run on iOS (macOS only)
npm run ios
```

## Prerequisites

- Node.js 18+
- React Native CLI
- Android Studio (for Android)
- Xcode (for iOS, macOS only)

---

## Project Structure

```
estream-app/
├── android/              # Android native code
├── ios/                  # iOS native code
├── src/
│   ├── App.tsx           # Root component with VaultProvider
│   ├── api/
│   │   └── signedClient.ts    # Signed envelope API client
│   ├── components/
│   │   └── NftPreview.tsx     # NFT image preview
│   ├── screens/
│   │   └── DevTools.tsx       # Developer tools screen
│   ├── services/
│   │   ├── nft/               # NFT minting service
│   │   │   ├── index.ts
│   │   │   └── NftMintService.ts
│   │   ├── solana/            # Mobile Wallet Adapter
│   │   │   ├── index.ts
│   │   │   └── MwaService.ts
│   │   └── vault/             # Key vault services
│   │       ├── index.ts
│   │       ├── VaultService.ts        # Interface
│   │       ├── VaultContext.tsx       # React context
│   │       ├── SeekerVaultService.ts  # Android Seeker
│   │       ├── KeychainVaultService.ts # iOS Keychain
│   │       └── SoftwareVaultService.ts # Dev fallback
│   ├── types/
│   │   └── index.ts           # TypeScript types
│   └── utils/
│       └── crypto.ts          # Crypto utilities
├── docs/
│   ├── IDENTITY_NFT_DESIGN.md # NFT specification
│   └── SEEKER_SECURITY_DESIGN.md
├── screenshots/          # Development screenshots
└── package.json
```

---

## Security Architecture

This app implements the eStream security posture:

```
┌─────────────────────────────────────┐
│         React Native UI             │
└───────────────┬─────────────────────┘
                │
┌───────────────▼─────────────────────┐
│      VaultProvider (Context)        │
│  - Trust level detection            │
│  - Public key management            │
│  - Signing interface                │
└───────────────┬─────────────────────┘
                │
┌───────────────▼─────────────────────┐
│     Vault Service Implementations   │
│  - SeekerVaultService (Android)     │
│  - KeychainVaultService (iOS)       │
│  - SoftwareVaultService (Dev)       │
└───────────────┬─────────────────────┘
                │
                ▼
        eStream Node (HTTP)
```

### Vault Service Interface

```typescript
export interface VaultService {
  isAvailable(): Promise<boolean>;
  getPublicKey(): Promise<Uint8Array>;
  getPublicKeyBase58(): Promise<string>;
  sign(message: Uint8Array): Promise<Uint8Array>;
  getTrustLevel(): Promise<TrustLevel>;
  getAttestation?(): Promise<AttestationData | null>;
}
```

### Trust Levels

| Level | Description | Badge Color |
|-------|-------------|-------------|
| Hardware | Seeker Seed Vault / Secure Enclave | Gold |
| Software | Encrypted keystore | Green |
| Untrusted | Development only | Orange |

---

## Signed Request Envelopes

For privileged API operations, requests are signed with Ed25519:

```typescript
// src/api/signedClient.ts
import { useVault } from '../services/vault';

export async function signedFetch(
  vault: VaultService,
  method: string,
  path: string,
  body: unknown
): Promise<Response> {
  // Build signing payload: {method}.{path}.{bodyHash}.{ts}.{nonce}
  // Sign with vault
  // Add X-Device-* headers
}
```

**Required Headers**:
- `X-Device-Public-Key` - Base58 public key
- `X-Device-Signature` - Base58 signature
- `X-Device-Timestamp` - Unix milliseconds
- `X-Device-Nonce` - Hex nonce

---

## Development

```bash
# Run tests
npm test

# Lint
npm run lint

# Type check
npm run typecheck
```

---

## Related Repositories

- [estream](https://github.com/toddrooke/estream) - Core eStream platform
- [estream-browser](https://github.com/toddrooke/estream/tree/main/crates/estream-browser) - WASM client library
- [taketitle-app](https://github.com/taketitle/taketitle-app) - Example downstream app

---

## License

Apache 2.0 - See [LICENSE](LICENSE)

---

**Built by**: [Todd Rooke](https://github.com/toddrooke)
