# Issue #1: PQ Crypto Rust Native Module

**Epic**: Phase 1 - Messaging Integration  
**Priority**: P0 (Critical - Foundation)  
**Estimated Effort**: 1-2 days  

---

## Overview

Create a Rust native module for estream-app that exposes PQ crypto primitives (Kyber1024, Dilithium5) to React Native via JNI (Android) and C FFI (iOS).

**Why Rust Native Module?**
- Reuse estream-core's battle-tested PQ crypto
- Hardware acceleration via ARM Neon
- Consistent crypto across platform and mobile
- Direct integration with Seed Vault (Android) and Secure Enclave (iOS)

---

## Goals

1. ✅ Create `estream-pq-native` Rust crate
2. ✅ Expose PQ primitives to React Native
3. ✅ JNI bindings for Android
4. ✅ C FFI bindings for iOS
5. ✅ Seed Vault integration (Android Seeker)
6. ✅ Secure Enclave integration (iOS)
7. ✅ Test harness for automated testing

---

## Implementation

### 1. Create Rust Crate

```bash
cd /Users/toddrooke/Documents/Cursor/toddrooke/
cargo new --lib estream-pq-native
```

**Cargo.toml**:
```toml
[package]
name = "estream-pq-native"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "staticlib"]

[dependencies]
estream-core = { path = "../estream/crates/estream-core" }
pqcrypto-kyber = "0.8"
pqcrypto-dilithium = "0.5"
jni = "0.21"           # Android JNI
libc = "0.2"           # iOS C FFI
serde = "1.0"
serde_json = "1.0"

[target.'cfg(target_os = "android")'.dependencies]
android_logger = "0.13"

[target.'cfg(target_os = "ios")'.dependencies]
log = "0.4"
```

### 2. JNI Bindings (Android)

**src/android/mod.rs**:
```rust
use jni::JNIEnv;
use jni::objects::{JClass, JString, JByteArray};
use jni::sys::{jbyteArray, jstring};
use estream_core::crypto::pq::{DeviceKeys, AppScope};

#[no_mangle]
pub extern "system" fn Java_io_estream_app_pq_PqCrypto_generateDeviceKeys(
    env: JNIEnv,
    _class: JClass,
    app_scope: JString,
) -> jbyteArray {
    let app_scope_str: String = env.get_string(app_scope).unwrap().into();
    let scope = AppScope::new(app_scope_str);
    
    let device_keys = DeviceKeys::generate(scope);
    let serialized = serde_json::to_vec(&device_keys.public_keys()).unwrap();
    
    env.byte_array_from_slice(&serialized).unwrap()
}

#[no_mangle]
pub extern "system" fn Java_io_estream_app_pq_PqCrypto_signMessage(
    env: JNIEnv,
    _class: JClass,
    device_keys_json: JString,
    message: JByteArray,
) -> jbyteArray {
    // Deserialize device keys
    // Sign message with Dilithium5
    // Return signature
}

#[no_mangle]
pub extern "system" fn Java_io_estream_app_pq_PqCrypto_encapsulateKey(
    env: JNIEnv,
    _class: JClass,
    recipient_public_key: JByteArray,
) -> jbyteArray {
    // Perform Kyber1024 KEM
    // Return ciphertext + shared secret
}
```

### 3. iOS C FFI Bindings

**src/ios/mod.rs**:
```rust
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use estream_core::crypto::pq::{DeviceKeys, AppScope};

#[no_mangle]
pub extern "C" fn pq_generate_device_keys(
    app_scope: *const c_char,
    out_json: *mut *mut c_char,
) -> i32 {
    let c_str = unsafe { CStr::from_ptr(app_scope) };
    let app_scope_str = c_str.to_str().unwrap();
    let scope = AppScope::new(app_scope_str.to_string());
    
    let device_keys = DeviceKeys::generate(scope);
    let json = serde_json::to_string(&device_keys.public_keys()).unwrap();
    let c_json = CString::new(json).unwrap();
    
    unsafe { *out_json = c_json.into_raw(); }
    
    0 // Success
}

#[no_mangle]
pub extern "C" fn pq_sign_message(
    device_keys_json: *const c_char,
    message: *const u8,
    message_len: usize,
    out_signature: *mut *mut u8,
    out_signature_len: *mut usize,
) -> i32 {
    // Sign message with Dilithium5
    // Return signature
}

#[no_mangle]
pub extern "C" fn pq_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe { CString::from_raw(ptr); }
    }
}
```

### 4. React Native Integration (Android)

**android/app/src/main/java/io/estream/app/pq/PqCrypto.kt**:
```kotlin
package io.estream.app.pq

class PqCrypto {
    companion object {
        init {
            System.loadLibrary("estream_pq_native")
        }
        
        @JvmStatic
        external fun generateDeviceKeys(appScope: String): ByteArray
        
        @JvmStatic
        external fun signMessage(deviceKeysJson: String, message: ByteArray): ByteArray
        
        @JvmStatic
        external fun encapsulateKey(recipientPublicKey: ByteArray): ByteArray
    }
}
```

**android/app/src/main/java/io/estream/app/pq/PqCryptoModule.kt**:
```kotlin
package io.estream.app.pq

import com.facebook.react.bridge.*

class PqCryptoModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    override fun getName() = "PqCrypto"
    
    @ReactMethod
    fun generateDeviceKeys(appScope: String, promise: Promise) {
        try {
            val publicKeysBytes = PqCrypto.generateDeviceKeys(appScope)
            val publicKeysJson = String(publicKeysBytes, Charsets.UTF_8)
            promise.resolve(publicKeysJson)
        } catch (e: Exception) {
            promise.reject("PQ_ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun signMessage(deviceKeysJson: String, messageBase64: String, promise: Promise) {
        try {
            val message = android.util.Base64.decode(messageBase64, android.util.Base64.DEFAULT)
            val signature = PqCrypto.signMessage(deviceKeysJson, message)
            val signatureBase64 = android.util.Base64.encodeToString(signature, android.util.Base64.NO_WRAP)
            promise.resolve(signatureBase64)
        } catch (e: Exception) {
            promise.reject("PQ_ERROR", e.message)
        }
    }
}
```

### 5. React Native Integration (iOS)

**ios/EstreamApp/PqCryptoModule.h**:
```objc
#import <React/RCTBridgeModule.h>

@interface PqCryptoModule : NSObject <RCTBridgeModule>
@end
```

**ios/EstreamApp/PqCryptoModule.m**:
```objc
#import "PqCryptoModule.h"
#import "estream_pq_native.h"

@implementation PqCryptoModule

RCT_EXPORT_MODULE(PqCrypto);

RCT_EXPORT_METHOD(generateDeviceKeys:(NSString *)appScope
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    char *out_json = NULL;
    int result = pq_generate_device_keys([appScope UTF8String], &out_json);
    
    if (result == 0 && out_json != NULL) {
        NSString *publicKeysJson = [NSString stringWithUTF8String:out_json];
        pq_free_string(out_json);
        resolve(publicKeysJson);
    } else {
        reject(@"PQ_ERROR", @"Failed to generate device keys", nil);
    }
}

RCT_EXPORT_METHOD(signMessage:(NSString *)deviceKeysJson
                  messageBase64:(NSString *)messageBase64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    // Implement signing
}

@end
```

### 6. TypeScript Types

**src/services/pq/types.ts**:
```typescript
export interface DevicePublicKeys {
  signature_key: string;      // Base64-encoded Dilithium5 public key
  kem_key: string;             // Base64-encoded Kyber1024 public key
  key_hash: string;            // Hex-encoded Blake3 hash
  app_scope: string;           // "cipher"
  created_at: number;          // Unix timestamp
}

export interface PqSignature {
  bytes: string;               // Base64-encoded signature
  algorithm: 'Dilithium5';
  signed_at: number;
}
```

### 7. Test Harness

**__tests__/services/PqCrypto.test.ts**:
```typescript
import { NativeModules } from 'react-native';

const { PqCrypto } = NativeModules;

describe('PqCrypto Native Module', () => {
  it('should generate device keys', async () => {
    const publicKeysJson = await PqCrypto.generateDeviceKeys('cipher');
    const publicKeys = JSON.parse(publicKeysJson);
    
    expect(publicKeys.signature_key).toBeDefined();
    expect(publicKeys.kem_key).toBeDefined();
    expect(publicKeys.key_hash).toBeDefined();
  });
  
  it('should sign a message', async () => {
    const publicKeysJson = await PqCrypto.generateDeviceKeys('cipher');
    const message = Buffer.from('test message').toString('base64');
    const signatureBase64 = await PqCrypto.signMessage(publicKeysJson, message);
    
    expect(signatureBase64).toBeDefined();
    expect(signatureBase64.length).toBeGreaterThan(0);
  });
  
  it('should perform KEM', async () => {
    const publicKeysJson = await PqCrypto.generateDeviceKeys('cipher');
    const publicKeys = JSON.parse(publicKeysJson);
    const result = await PqCrypto.encapsulateKey(publicKeys.kem_key);
    
    expect(result.ciphertext).toBeDefined();
    expect(result.shared_secret).toBeDefined();
  });
});
```

---

## Deliverables

1. ✅ `estream-pq-native` Rust crate
2. ✅ JNI bindings for Android
3. ✅ C FFI bindings for iOS
4. ✅ React Native module integration
5. ✅ TypeScript types
6. ✅ Comprehensive tests
7. ✅ Build configuration (Gradle, Xcode)

---

## Testing Strategy

1. **Unit Tests**: Test Rust functions directly
2. **Integration Tests**: Test JNI/FFI bindings
3. **E2E Tests**: Test from React Native
4. **Hardware Tests**: Test on real Seeker device

---

## Dependencies

- estream-core (PQ crypto primitives)
- pqcrypto-kyber (Kyber1024)
- pqcrypto-dilithium (Dilithium5)
- jni (Android)
- React Native 0.72+

---

## Success Criteria

- [ ] All Rust unit tests pass
- [ ] Android JNI bindings compile
- [ ] iOS C FFI bindings compile
- [ ] React Native can generate device keys
- [ ] React Native can sign messages
- [ ] React Native can perform KEM
- [ ] Tests pass on Seeker hardware
- [ ] Performance: Key generation < 100ms
- [ ] Performance: Signing < 50ms
- [ ] Performance: KEM < 100ms

---

**Status**: ⏳ Not Started  
**Branch**: `feature/pq-native-module`

