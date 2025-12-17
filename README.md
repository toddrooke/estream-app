# eStream Mobile App

> React Native client for the eStream network

The eStream mobile app provides direct access to eStream network functionality, serving as both a developer tool and reference implementation for downstream applications.

## Features

- **Key Management** - Generate, import, and manage Ed25519 keypairs
- **Seeker Integration** - Hardware-backed keys via Solana Seeker Seed Vault
- **Node Connection** - Connect to eStream nodes via WebSocket
- **Estream Operations** - Create, sign, browse, and verify estreams
- **Signed Requests** - Generate signed API envelopes for privileged operations
- **Developer Tools** - Raw inspection, Merkle proofs, hash chain visualization

## Quick Start

```bash
# Clone the repository
git clone https://github.com/toddrooke/estream-app.git
cd estream-app

# Install dependencies
npm install

# Build WASM module (requires wasm-pack)
npm run build:wasm

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
- wasm-pack (`cargo install wasm-pack`)

## Project Structure

```
estream-app/
├── android/          # Android native code
├── ios/              # iOS native code
├── src/
│   ├── api/          # API client with signed envelopes
│   ├── auth/         # Authentication state
│   ├── components/   # React components
│   ├── hooks/        # Custom hooks
│   ├── navigation/   # React Navigation setup
│   ├── screens/      # App screens
│   ├── services/     # Business logic
│   ├── store/        # Zustand state
│   └── types/        # TypeScript types
├── scripts/          # Build scripts
└── package.json
```

## Security

This app implements the eStream security posture:

- **Hardware-backed keys** via Seeker Seed Vault (Android) or Secure Enclave (iOS)
- **Signed request envelopes** for all privileged API operations
- **Device attestation** for hardware security verification
- **No plain secrets** - private keys never stored unencrypted

## Architecture

```
┌─────────────────────────────────┐
│         React Native UI         │
└───────────────┬─────────────────┘
                │
┌───────────────▼─────────────────┐
│      estream-browser (WASM)     │
│  - KeyPair, Signing, Envelopes  │
└───────────────┬─────────────────┘
                │
┌───────────────▼─────────────────┐
│     Native Vault Integration    │
│  - Seeker / Keychain / Keystore │
└───────────────┬─────────────────┘
                │
                ▼
        eStream Node (HTTP/WS)
```

## Related Repositories

- [estream](https://github.com/toddrooke/estream) - Core eStream platform
- [estream-browser](https://github.com/toddrooke/estream/tree/main/crates/estream-browser) - WASM client library
- [taketitle-app](https://github.com/taketitle/taketitle-app) - Example downstream app

## Development

```bash
# Run tests
npm test

# Lint
npm run lint

# Type check
npm run typecheck
```

## License

Apache 2.0 - See [LICENSE](LICENSE)

---

**Built by**: [Todd Rooke](https://github.com/toddrooke)




