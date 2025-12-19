# Issue #1: QUIC Client Native Module (Pure QUIC)

**Epic**: Phase 1 - Messaging Integration  
**Priority**: P0 (Critical - Foundation)  
**Estimated Effort**: 2-3 days  

---

## Overview

Build a **pure QUIC** native module for estream-app that connects directly to eStream nodes via the QUIC wire protocol. This eliminates HTTP overhead and provides real-time, quantum-safe messaging with minimal latency.

**Strategy**: QUIC-first for everything. HTTP only for web clients as fallback.

---

## Goals

1. ✅ Create `estream-quic-native` Rust crate
2. ✅ QUIC client with connection pooling
3. ✅ PQ crypto integration (Dilithium5, Kyber1024)
4. ✅ Wire protocol support (`PqWireMessage`, `PqWireMessageBatch`)
5. ✅ JNI bindings for Android
6. ✅ C FFI bindings for iOS
7. ✅ Connection state management (reconnection, failover)
8. ✅ Test harness for automated testing

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│         estream-quic-native (Rust)              │
│  ┌──────────────────────────────────────────┐  │
│  │        QUIC Connection Manager            │  │
│  │  - Connection pooling                     │  │
│  │  - Automatic reconnection                 │  │
│  │  - Network change detection               │  │
│  └──────────────┬───────────────────────────┘  │
│                 │                               │
│  ┌──────────────▼───────────────────────────┐  │
│  │      Wire Protocol Handler                │  │
│  │  - PqWireMessage serialization            │  │
│  │  - PqWireMessageBatch handling            │  │
│  │  - Key caching                            │  │
│  └──────────────┬───────────────────────────┘  │
│                 │                               │
│  ┌──────────────▼───────────────────────────┐  │
│  │      PQ Crypto Module                     │  │
│  │  - DeviceKeys generation                  │  │
│  │  - Dilithium5 signing                     │  │
│  │  - Kyber1024 KEM                          │  │
│  │  - X3DH, Double Ratchet, Sealed Sender    │  │
│  └──────────────┬───────────────────────────┘  │
│                 │                               │
│  ┌──────────────▼───────────────────────────┐  │
│  │      Seed Vault Integration (Android)     │  │
│  │      Secure Enclave (iOS)                 │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Create Rust Crate

```bash
cd /Users/toddrooke/Documents/Cursor/toddrooke/
cargo new --lib estream-quic-native
```

**Cargo.toml**:
```toml
[package]
name = "estream-quic-native"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "staticlib"]

[dependencies]
estream-core = { path = "../estream/crates/estream-core" }
quinn = "0.10"                  # QUIC client
tokio = { version = "1.35", features = ["full"] }
rustls = "0.21"
pqcrypto-kyber = "0.8"
pqcrypto-dilithium = "0.5"
bincode = "1.3"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
blake3 = "1.5"
jni = "0.21"                    # Android
libc = "0.2"                    # iOS
log = "0.4"
parking_lot = "0.12"

[target.'cfg(target_os = "android")'.dependencies]
android_logger = "0.13"

[target.'cfg(target_os = "ios")'.dependencies]
oslog = "0.1"
```

### 2. QUIC Connection Manager

**src/connection.rs**:
```rust
use quinn::{Endpoint, Connection, RecvStream, SendStream};
use std::sync::Arc;
use parking_lot::RwLock;
use std::collections::HashMap;

pub struct QuicConnectionManager {
    endpoint: Endpoint,
    connections: Arc<RwLock<HashMap<String, Connection>>>,
    key_cache: Arc<RwLock<HashMap<[u8; 32], estream_core::crypto::pq::PqPublicKey>>>,
}

impl QuicConnectionManager {
    /// Create new connection manager
    pub async fn new() -> Result<Self, String> {
        // Configure QUIC endpoint
        let mut endpoint = Endpoint::client("0.0.0.0:0".parse().unwrap())
            .map_err(|e| format!("Failed to create endpoint: {}", e))?;
        
        Ok(Self {
            endpoint,
            connections: Arc::new(RwLock::new(HashMap::new())),
            key_cache: Arc::new(RwLock::new(HashMap::new())),
        })
    }
    
    /// Connect to eStream node
    pub async fn connect(&self, node_addr: &str) -> Result<Connection, String> {
        // Check if already connected
        {
            let connections = self.connections.read();
            if let Some(conn) = connections.get(node_addr) {
                if !conn.close_reason().is_some() {
                    return Ok(conn.clone());
                }
            }
        }
        
        // Create new connection
        let conn = self.endpoint
            .connect(node_addr.parse().unwrap(), "estream")
            .map_err(|e| format!("Failed to connect: {}", e))?
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;
        
        // Store connection
        {
            let mut connections = self.connections.write();
            connections.insert(node_addr.to_string(), conn.clone());
        }
        
        Ok(conn)
    }
    
    /// Send PQ wire message
    pub async fn send_message(
        &self,
        node_addr: &str,
        message: estream_core::wire::pq_protocol::PqWireMessage,
    ) -> Result<(), String> {
        let conn = self.connect(node_addr).await?;
        
        // Open bi-directional stream
        let (mut send, mut recv) = conn.open_bi().await
            .map_err(|e| format!("Failed to open stream: {}", e))?;
        
        // Serialize message
        let message_bytes = bincode::serialize(&message)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        
        // Send message
        send.write_all(&message_bytes).await
            .map_err(|e| format!("Failed to send: {}", e))?;
        send.finish().await
            .map_err(|e| format!("Failed to finish: {}", e))?;
        
        // Wait for acknowledgment
        let ack = recv.read_to_end(1024).await
            .map_err(|e| format!("Failed to read ack: {}", e))?;
        
        Ok(())
    }
    
    /// Send message batch (optimized)
    pub async fn send_message_batch(
        &self,
        node_addr: &str,
        batch: estream_core::wire::pq_protocol::PqWireMessageBatch,
    ) -> Result<(), String> {
        let conn = self.connect(node_addr).await?;
        
        let (mut send, mut recv) = conn.open_bi().await
            .map_err(|e| format!("Failed to open stream: {}", e))?;
        
        let batch_bytes = bincode::serialize(&batch)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        
        send.write_all(&batch_bytes).await
            .map_err(|e| format!("Failed to send: {}", e))?;
        send.finish().await
            .map_err(|e| format!("Failed to finish: {}", e))?;
        
        let ack = recv.read_to_end(1024).await
            .map_err(|e| format!("Failed to read ack: {}", e))?;
        
        Ok(())
    }
    
    /// Receive messages (background task)
    pub async fn receive_messages(
        &self,
        node_addr: &str,
        callback: Box<dyn Fn(estream_core::wire::pq_protocol::PqWireMessage) + Send + 'static>,
    ) -> Result<(), String> {
        let conn = self.connect(node_addr).await?;
        
        // Accept incoming uni-directional streams (server push)
        tokio::spawn(async move {
            loop {
                match conn.accept_uni().await {
                    Ok(mut recv) => {
                        let message_bytes = recv.read_to_end(10 * 1024 * 1024).await.unwrap();
                        if let Ok(message) = bincode::deserialize(&message_bytes) {
                            callback(message);
                        }
                    }
                    Err(_) => break,
                }
            }
        });
        
        Ok(())
    }
    
    /// Cache public key
    pub fn cache_key(&self, key_hash: [u8; 32], public_key: estream_core::crypto::pq::PqPublicKey) {
        let mut cache = self.key_cache.write();
        cache.insert(key_hash, public_key);
    }
    
    /// Get cached key
    pub fn get_cached_key(&self, key_hash: &[u8; 32]) -> Option<estream_core::crypto::pq::PqPublicKey> {
        let cache = self.key_cache.read();
        cache.get(key_hash).cloned()
    }
}
```

### 3. JNI Bindings (Android)

**src/android/mod.rs**:
```rust
use jni::JNIEnv;
use jni::objects::{JClass, JString, JByteArray};
use jni::sys::{jlong, jbyteArray, jstring};
use std::sync::Arc;
use tokio::runtime::Runtime;

static mut RUNTIME: Option<Runtime> = None;
static mut CONNECTION_MANAGER: Option<Arc<crate::connection::QuicConnectionManager>> = None;

#[no_mangle]
pub extern "system" fn Java_io_estream_app_quic_QuicClient_initialize(
    env: JNIEnv,
    _class: JClass,
) -> jlong {
    android_logger::init_once(
        android_logger::Config::default()
            .with_max_level(log::LevelFilter::Debug)
    );
    
    // Create Tokio runtime
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let manager = runtime.block_on(async {
        crate::connection::QuicConnectionManager::new().await.unwrap()
    });
    
    let manager_arc = Arc::new(manager);
    
    unsafe {
        RUNTIME = Some(runtime);
        CONNECTION_MANAGER = Some(manager_arc.clone());
    }
    
    Arc::into_raw(manager_arc) as jlong
}

#[no_mangle]
pub extern "system" fn Java_io_estream_app_quic_QuicClient_connect(
    env: JNIEnv,
    _class: JClass,
    manager_ptr: jlong,
    node_addr: JString,
) -> jstring {
    let manager = unsafe { Arc::from_raw(manager_ptr as *const crate::connection::QuicConnectionManager) };
    let node_addr_str: String = env.get_string(node_addr).unwrap().into();
    
    let result = unsafe {
        RUNTIME.as_ref().unwrap().block_on(async {
            manager.connect(&node_addr_str).await
        })
    };
    
    std::mem::forget(manager); // Don't drop the Arc
    
    match result {
        Ok(_) => env.new_string("OK").unwrap().into_raw(),
        Err(e) => env.new_string(format!("ERROR: {}", e)).unwrap().into_raw(),
    }
}

#[no_mangle]
pub extern "system" fn Java_io_estream_app_quic_QuicClient_sendMessage(
    env: JNIEnv,
    _class: JClass,
    manager_ptr: jlong,
    node_addr: JString,
    message_bytes: JByteArray,
) -> jstring {
    let manager = unsafe { Arc::from_raw(manager_ptr as *const crate::connection::QuicConnectionManager) };
    let node_addr_str: String = env.get_string(node_addr).unwrap().into();
    let message_data = env.convert_byte_array(message_bytes).unwrap();
    
    let message: estream_core::wire::pq_protocol::PqWireMessage = 
        bincode::deserialize(&message_data).unwrap();
    
    let result = unsafe {
        RUNTIME.as_ref().unwrap().block_on(async {
            manager.send_message(&node_addr_str, message).await
        })
    };
    
    std::mem::forget(manager);
    
    match result {
        Ok(_) => env.new_string("OK").unwrap().into_raw(),
        Err(e) => env.new_string(format!("ERROR: {}", e)).unwrap().into_raw(),
    }
}

#[no_mangle]
pub extern "system" fn Java_io_estream_app_quic_QuicClient_generateDeviceKeys(
    env: JNIEnv,
    _class: JClass,
    app_scope: JString,
) -> jbyteArray {
    let app_scope_str: String = env.get_string(app_scope).unwrap().into();
    let scope = estream_core::crypto::AppScope::new(app_scope_str);
    
    let device_keys = estream_core::crypto::pq::DeviceKeys::generate(scope);
    let public_keys = device_keys.public_keys();
    let serialized = serde_json::to_vec(&public_keys).unwrap();
    
    env.byte_array_from_slice(&serialized).unwrap()
}
```

### 4. iOS C FFI Bindings

**src/ios/mod.rs**:
```rust
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::sync::Arc;
use tokio::runtime::Runtime;

static mut RUNTIME: Option<Runtime> = None;
static mut CONNECTION_MANAGER: Option<Arc<crate::connection::QuicConnectionManager>> = None;

#[no_mangle]
pub extern "C" fn quic_initialize() -> i32 {
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let manager = runtime.block_on(async {
        crate::connection::QuicConnectionManager::new().await.unwrap()
    });
    
    unsafe {
        RUNTIME = Some(runtime);
        CONNECTION_MANAGER = Some(Arc::new(manager));
    }
    
    0 // Success
}

#[no_mangle]
pub extern "C" fn quic_connect(node_addr: *const c_char) -> i32 {
    let c_str = unsafe { CStr::from_ptr(node_addr) };
    let node_addr_str = c_str.to_str().unwrap();
    
    let result = unsafe {
        let manager = CONNECTION_MANAGER.as_ref().unwrap();
        RUNTIME.as_ref().unwrap().block_on(async {
            manager.connect(node_addr_str).await
        })
    };
    
    match result {
        Ok(_) => 0,
        Err(_) => -1,
    }
}

#[no_mangle]
pub extern "C" fn quic_send_message(
    node_addr: *const c_char,
    message_bytes: *const u8,
    message_len: usize,
) -> i32 {
    let c_str = unsafe { CStr::from_ptr(node_addr) };
    let node_addr_str = c_str.to_str().unwrap();
    let message_data = unsafe { std::slice::from_raw_parts(message_bytes, message_len) };
    
    let message: estream_core::wire::pq_protocol::PqWireMessage = 
        bincode::deserialize(message_data).unwrap();
    
    let result = unsafe {
        let manager = CONNECTION_MANAGER.as_ref().unwrap();
        RUNTIME.as_ref().unwrap().block_on(async {
            manager.send_message(node_addr_str, message).await
        })
    };
    
    match result {
        Ok(_) => 0,
        Err(_) => -1,
    }
}

#[no_mangle]
pub extern "C" fn quic_generate_device_keys(
    app_scope: *const c_char,
    out_json: *mut *mut c_char,
) -> i32 {
    let c_str = unsafe { CStr::from_ptr(app_scope) };
    let app_scope_str = c_str.to_str().unwrap();
    let scope = estream_core::crypto::AppScope::new(app_scope_str.to_string());
    
    let device_keys = estream_core::crypto::pq::DeviceKeys::generate(scope);
    let public_keys = device_keys.public_keys();
    let json = serde_json::to_string(&public_keys).unwrap();
    let c_json = CString::new(json).unwrap();
    
    unsafe { *out_json = c_json.into_raw(); }
    
    0
}
```

### 5. React Native Integration (Android)

**android/app/src/main/java/io/estream/app/quic/QuicClient.kt**:
```kotlin
package io.estream.app.quic

class QuicClient {
    companion object {
        init {
            System.loadLibrary("estream_quic_native")
        }
        
        @JvmStatic
        external fun initialize(): Long
        
        @JvmStatic
        external fun connect(managerPtr: Long, nodeAddr: String): String
        
        @JvmStatic
        external fun sendMessage(managerPtr: Long, nodeAddr: String, messageBytes: ByteArray): String
        
        @JvmStatic
        external fun generateDeviceKeys(appScope: String): ByteArray
    }
}
```

**android/app/src/main/java/io/estream/app/quic/QuicModule.kt**:
```kotlin
package io.estream.app.quic

import com.facebook.react.bridge.*

class QuicModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    private var managerPtr: Long = 0
    
    override fun getName() = "QuicClient"
    
    @ReactMethod
    fun initialize(promise: Promise) {
        try {
            managerPtr = QuicClient.initialize()
            promise.resolve("OK")
        } catch (e: Exception) {
            promise.reject("QUIC_ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun connect(nodeAddr: String, promise: Promise) {
        try {
            val result = QuicClient.connect(managerPtr, nodeAddr)
            if (result == "OK") {
                promise.resolve("Connected")
            } else {
                promise.reject("QUIC_ERROR", result)
            }
        } catch (e: Exception) {
            promise.reject("QUIC_ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun sendMessage(nodeAddr: String, messageJson: String, promise: Promise) {
        try {
            val messageBytes = messageJson.toByteArray(Charsets.UTF_8)
            val result = QuicClient.sendMessage(managerPtr, nodeAddr, messageBytes)
            if (result == "OK") {
                promise.resolve("Sent")
            } else {
                promise.reject("QUIC_ERROR", result)
            }
        } catch (e: Exception) {
            promise.reject("QUIC_ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun generateDeviceKeys(appScope: String, promise: Promise) {
        try {
            val publicKeysBytes = QuicClient.generateDeviceKeys(appScope)
            val publicKeysJson = String(publicKeysBytes, Charsets.UTF_8)
            promise.resolve(publicKeysJson)
        } catch (e: Exception) {
            promise.reject("QUIC_ERROR", e.message)
        }
    }
}
```

### 6. TypeScript Integration

**src/services/quic/QuicClient.ts**:
```typescript
import { NativeModules } from 'react-native';

const { QuicClient } = NativeModules;

export interface PqWireMessage {
  sender_key_ref: string;
  recipient_key_ref: string;
  sealed_message: any;
  timestamp: number;
}

export class QuicMessagingClient {
  private nodeAddr: string;
  
  constructor(nodeAddr: string) {
    this.nodeAddr = nodeAddr;
  }
  
  async initialize(): Promise<void> {
    await QuicClient.initialize();
  }
  
  async connect(): Promise<void> {
    await QuicClient.connect(this.nodeAddr);
  }
  
  async sendMessage(message: PqWireMessage): Promise<void> {
    const messageJson = JSON.stringify(message);
    await QuicClient.sendMessage(this.nodeAddr, messageJson);
  }
  
  async generateDeviceKeys(appScope: string): Promise<any> {
    const publicKeysJson = await QuicClient.generateDeviceKeys(appScope);
    return JSON.parse(publicKeysJson);
  }
}
```

### 7. Test Harness

**__tests__/services/QuicClient.test.ts**:
```typescript
import { QuicMessagingClient } from '../../src/services/quic/QuicClient';

describe('QUIC Client', () => {
  let client: QuicMessagingClient;
  
  beforeAll(async () => {
    client = new QuicMessagingClient('127.0.0.1:5000');
    await client.initialize();
  });
  
  it('should connect to node', async () => {
    await expect(client.connect()).resolves.not.toThrow();
  });
  
  it('should generate device keys', async () => {
    const publicKeys = await client.generateDeviceKeys('cipher');
    expect(publicKeys.signature_key).toBeDefined();
    expect(publicKeys.kem_key).toBeDefined();
  });
  
  it('should send PQ wire message', async () => {
    const message = {
      sender_key_ref: 'hash123',
      recipient_key_ref: 'hash456',
      sealed_message: {},
      timestamp: Date.now(),
    };
    
    await expect(client.sendMessage(message)).resolves.not.toThrow();
  });
});
```

---

## Deliverables

1. ✅ `estream-quic-native` Rust crate
2. ✅ QUIC connection manager with pooling
3. ✅ Wire protocol support (PqWireMessage, batching)
4. ✅ PQ crypto integration
5. ✅ JNI bindings for Android
6. ✅ C FFI bindings for iOS
7. ✅ React Native module
8. ✅ TypeScript client
9. ✅ Comprehensive tests

---

## Success Criteria

- [ ] QUIC connection established (< 100ms)
- [ ] Message send latency < 50ms
- [ ] Reconnection on network change (< 1s)
- [ ] Key caching reduces bandwidth by 90%
- [ ] All tests pass on Seeker hardware
- [ ] Battery usage < HTTP equivalent
- [ ] Works on cellular networks

---

**Status**: ⏳ Not Started  
**Branch**: `feature/quic-native-module`

