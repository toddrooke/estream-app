# eStream Mobile SDK Integration

## Files

- `libestream_mobile_core.a` - Static library with PQ crypto (5.4MB)

## Xcode Integration Steps

1. **Add library to project**:
   - Drag `libestream_mobile_core.a` into Xcode project navigator
   - Check "Copy items if needed"
   - Add to target: EstreamApp

2. **Configure Build Settings**:
   - Go to Build Settings > Other Linker Flags
   - Add: `-lc++` (for C++ standard library)

3. **Configure Library Search Paths**:
   - Add: `$(PROJECT_DIR)/EstreamApp/EStreamSDK`

4. **Configure Header Search Paths**:
   - Add: `$(PROJECT_DIR)/EstreamApp`

## Rebuilding the SDK

From the estream repo:

```bash
cd packages/mobile-sdk

# Build for simulator only (fast, for development)
./scripts/build-ios.sh --sim-only

# Build full XCFramework (for distribution)
./scripts/build-ios.sh
```

Then copy the new library:

```bash
cp target/aarch64-apple-ios-sim/release/libestream_mobile_core.a \
   /path/to/estream-app/ios/EstreamApp/EStreamSDK/
```

## API Reference

See `estream_native.h` for the full C API.

### Swift Usage (via PqCryptoModule)

```swift
import PqCryptoModule

// Generate PQ device keys
let keys = try await PqCrypto.generateDeviceKeys(appScope: "io.estream.app")

// Initialize Double Ratchet
let ratchet = try await PqCrypto.initRatchetSender(
    sharedSecret: sharedSecretHex,
    theirKemPublic: theirKemPublicHex
)

// Encrypt/Decrypt
let encrypted = try await ratchet.encrypt("Hello, PQ!")
let decrypted = try await ratchet.decrypt(encryptedJson)
```

## Security

- ML-KEM-1024 (Kyber) - FIPS 203 compliant
- ML-DSA-87 (Dilithium5) - FIPS 204 compliant
- Pure Rust implementation - no C dependencies for core crypto


