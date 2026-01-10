# Seeker ML-DSA-87 Integration

## Current State

### iOS
- ✅ ML-DSA-87 (Dilithium5) available via `estream_mobile_sdk` Rust library
- ✅ Key generation works (`generateDeviceKeys`)
- ⚠️ Signing method not yet exposed to React Native

### Android
- ✅ SeekerModule works with Android KeyStore
- ✅ Biometric-protected signing works
- ⚠️ Currently using ECDSA (secp256r1), NOT ML-DSA-87
- ⚠️ Need to integrate Rust `pqcrypto-dilithium` via JNI

## Required Changes

### 1. iOS: Expose ML-DSA-87 Signing

Add to `PqCryptoModule.swift`:

```swift
/// Sign a message with ML-DSA-87 (Dilithium5)
@objc(signMlDsa:message:resolver:rejecter:)
func signMlDsa(
    _ keyAlias: String,
    message messageB64: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
) {
    let resultPtr = keyAlias.withCString { aliasPtr in
        messageB64.withCString { msgPtr in
            estream_sign_mldsa(aliasPtr, msgPtr)
        }
    }
    // ... handle result
}
```

### 2. Android: Add Rust JNI Bridge

Create `estream-mobile-android` crate:

```rust
// android/estream-mobile/src/lib.rs
use jni::JNIEnv;
use jni::objects::{JClass, JString};
use jni::sys::jstring;
use pqcrypto_dilithium::dilithium5;

#[no_mangle]
pub extern "C" fn Java_io_estream_app_PqCryptoModule_signMlDsa(
    env: JNIEnv,
    _class: JClass,
    key_alias: JString,
    message_b64: JString,
) -> jstring {
    // 1. Load key from Android KeyStore (or our own secure storage)
    // 2. Sign with Dilithium5
    // 3. Return signature as Base64
}
```

### 3. Governance Signing Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ML-DSA-87 Signing Flow                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  CLI (es ops provision)                                              │
│         │                                                            │
│         │ 1. Generate proposal hash                                  │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │ Send to     │──────────────────────────────────────┐              │
│  │ estream-app │                                      │              │
│  └─────────────┘                                      │              │
│                                                       ▼              │
│                                              ┌─────────────────┐     │
│                                              │ Governance      │     │
│                                              │ Screen          │     │
│                                              │ (review ops)    │     │
│                                              └────────┬────────┘     │
│                                                       │              │
│                                                       ▼              │
│                                              ┌─────────────────┐     │
│                                              │ Biometric       │     │
│                                              │ Prompt          │     │
│                                              └────────┬────────┘     │
│                                                       │              │
│                                                       ▼              │
│                     ┌────────────────────────────────────────────┐  │
│                     │          ML-DSA-87 Sign                     │  │
│                     │  ┌─────────────────────────────────────┐   │  │
│                     │  │ iOS: PqCryptoModule.signMlDsa       │   │  │
│                     │  │ Android: PqCryptoModule.signMlDsa   │   │  │
│                     │  │   (via JNI to Rust pqcrypto)        │   │  │
│                     │  └─────────────────────────────────────┘   │  │
│                     └────────────────────────────────────────────┘  │
│                                                       │              │
│                                                       ▼              │
│  ┌─────────────┐                             ┌─────────────────┐     │
│  │ CLI receives│◄────────────────────────────│ Return          │     │
│  │ signature   │                             │ signature       │     │
│  └─────────────┘                             └─────────────────┘     │
│         │                                                            │
│         ▼                                                            │
│  Submit to governance lattice                                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Timeline

| Phase | Task | Status |
|-------|------|--------|
| 1 | Clean app UI with tabs | ✅ Done |
| 2 | GovernanceSigningService | ✅ Done |
| 3 | iOS: Expose signMlDsa | 🔄 Pending |
| 4 | Android: JNI bridge for ML-DSA | 🔄 Pending |
| 5 | CLI ↔ App communication | 🔄 Pending |
| 6 | Integration testing with Seeker | 🔄 Pending |

## Workaround for Phase 1 Testing

For now, we can:
1. Use ECDSA (secp256r1) on Android for testing
2. Accept that this is NOT post-quantum
3. Replace with ML-DSA-87 before mainnet

```typescript
// In GovernanceSigningService.ts - current fallback
if (Platform.OS === 'android') {
  // Uses ECDSA via SeekerModule
  const sig = await SeekerModule.signWithBiometric(alias, messageB64, title, subtitle);
  return { algorithm: 'ECDSA-P256', signature: sig };
}
```

## Security Note

- **ECDSA (secp256r1)** is NOT quantum-resistant
- This is acceptable for testing only
- Production governance MUST use ML-DSA-87
- The Rust `pqcrypto-dilithium` library is FIPS 204 compliant
