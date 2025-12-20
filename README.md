# eStream Mobile App

> React Native client for the eStream network with post-quantum security

---

## Overview

The eStream mobile app provides direct access to eStream network functionality with quantum-resistant cryptography, serving as both a developer tool and reference implementation.

## PQ-First Architecture

| Component | Algorithm | Purpose |
|-----------|-----------|---------|
| Signing | Dilithium5 | Quantum-resistant signatures |
| Key Exchange | Kyber1024 | Quantum-resistant encryption |
| Transport | QUIC | PQ Wire Protocol |

---

## Features

### Implemented
- **PQ Vault Integration** - Hardware-backed Dilithium5/Kyber1024 key management
- **QUIC Client** - Native Rust QUIC with PQ Wire Protocol
- **Seeker Support** - Solana Seeker Secure Enclave integration
- **Trust Level Display** - Visual security level indicator

### Development
- **Messaging Service** - eStream messaging integration
- **Platform Messaging UI** - Cipher SDK UI components
- **Seeker Testing** - E2E testing on Seeker device

---

## Quick Start

```bash
# Install dependencies
npm install

# Build native QUIC module
cd rust && cargo build --release

# Start Metro bundler
npm start

# Run on Android (Seeker recommended)
npm run android
```

---

## Project Structure

```
estream-app/
├── src/
│   ├── screens/          # React Native screens
│   ├── components/       # UI components
│   ├── services/         # Business logic
│   │   └── vault/        # PQ Vault service
│   └── native/           # Native module wrappers
├── rust/                 # Rust QUIC native module
├── android/              # Android native code
├── ios/                  # iOS native code
└── docs/                 # Documentation
```

---

## Security

> **See**: [estream Security Patterns Guide](../estream/docs/guides/SECURITY_PATTERNS.md)

### Core Principles

1. **PQ-First** - All production crypto uses Dilithium5 + Kyber1024
2. **Fail Closed** - On any error, deny operation
3. **Hardware Preferred** - Use Seeker Secure Enclave when available
4. **Validate All Inputs** - Never trust any input

---

## Related

- [CLAUDE.md](./CLAUDE.md) - AI context
- [estream-core](../estream) - Backend server
- [estream-cipher](../estream-cipher) - Messaging app

---

**Repository**: [github.com/toddrooke/estream-app](https://github.com/toddrooke/estream-app)
