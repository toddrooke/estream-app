/**
 * QuicClient Native Module
 *
 * Provides QUIC transport and PQ crypto to React Native.
 * Wraps the estream-mobile-core Rust library via C FFI.
 */

import Foundation

@objc(QuicClient)
class QuicClientModule: NSObject {
  
  private var currentHandle: Int = -1
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  // MARK: - Connection Management
  
  /**
   * Initialize the QUIC runtime.
   * Returns a handle for subsequent operations.
   */
  @objc
  func initialize(_ resolve: @escaping RCTPromiseResolveBlock,
                  reject: @escaping RCTPromiseRejectBlock) {
    let handle = estream_initialize()
    
    if handle >= 0 {
      currentHandle = Int(handle)
      resolve(handle)
    } else if handle == -1 {
      reject("INIT_ERROR", "Failed to create Tokio runtime", nil)
    } else if handle == -2 {
      reject("INIT_ERROR", "Failed to initialize QUIC endpoint", nil)
    } else {
      reject("INIT_ERROR", "Unknown initialization error", nil)
    }
  }
  
  /**
   * Connect to an eStream node.
   */
  @objc
  func connect(_ handle: Int,
               nodeAddr: String,
               resolve: @escaping RCTPromiseResolveBlock,
               reject: @escaping RCTPromiseRejectBlock) {
    guard let resultPtr = estream_connect(handle, nodeAddr) else {
      reject("CONNECT_ERROR", "Connection returned null", nil)
      return
    }
    
    let result = String(cString: resultPtr)
    estream_free_string(resultPtr)
    
    if let data = result.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      if json["success"] as? Bool == true {
        resolve(json["data"])
      } else {
        let error = json["error"] as? String ?? "Unknown error"
        reject("CONNECT_ERROR", error, nil)
      }
    } else {
      reject("CONNECT_ERROR", "Failed to parse result", nil)
    }
  }
  
  /**
   * Generate PQ device keys (Kyber1024 + Dilithium5).
   * Returns JSON with public key information.
   */
  @objc
  func generateDeviceKeys(_ appScope: String,
                          resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
    guard let resultPtr = estream_generate_device_keys(appScope) else {
      reject("KEYGEN_ERROR", "Key generation returned null", nil)
      return
    }
    
    let result = String(cString: resultPtr)
    estream_free_string(resultPtr)
    
    // Return raw JSON string for TypeScript to parse
    if let data = result.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      if json["success"] as? Bool == true {
        // Return the data as JSON string for TS to parse
        if let jsonData = json["data"],
           let jsonBytes = try? JSONSerialization.data(withJSONObject: jsonData),
           let jsonString = String(data: jsonBytes, encoding: .utf8) {
          resolve(jsonString)
        } else {
          resolve(result)
        }
      } else {
        let error = json["error"] as? String ?? "Key generation failed"
        reject("KEYGEN_ERROR", error, nil)
      }
    } else {
      reject("KEYGEN_ERROR", "Failed to parse result", nil)
    }
  }
  
  /**
   * Dispose of the QUIC runtime.
   */
  @objc
  func dispose(_ handle: Int) {
    estream_dispose(handle)
    if currentHandle == handle {
      currentHandle = -1
    }
  }
  
  /**
   * Send a message (placeholder - needs full implementation).
   */
  @objc
  func sendMessage(_ handle: Int,
                   nodeAddr: String,
                   messageJson: String,
                   resolve: @escaping RCTPromiseResolveBlock,
                   reject: @escaping RCTPromiseRejectBlock) {
    // TODO: Implement message sending via QUIC
    reject("NOT_IMPLEMENTED", "sendMessage not yet implemented", nil)
  }
  
  /**
   * Get library version.
   */
  @objc
  func getVersion(_ resolve: @escaping RCTPromiseResolveBlock,
                  reject: @escaping RCTPromiseRejectBlock) {
    guard let versionPtr = estream_version() else {
      reject("VERSION_ERROR", "Failed to get version", nil)
      return
    }
    
    let version = String(cString: versionPtr)
    estream_free_string(versionPtr)
    resolve(version)
  }
  
  // MARK: - HTTP/3 Client (UDP-based write operations)
  
  /**
   * Connect to eStream HTTP/3 server.
   * Required for write operations (POST, PUT, DELETE).
   */
  @objc
  func h3Connect(_ serverAddr: String,
                 resolve: @escaping RCTPromiseResolveBlock,
                 reject: @escaping RCTPromiseRejectBlock) {
    guard let resultPtr = estream_h3_connect(serverAddr) else {
      reject("H3_ERROR", "H3 connect returned null", nil)
      return
    }
    
    let result = String(cString: resultPtr)
    estream_free_string(resultPtr)
    
    if let data = result.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      if json["success"] != nil && json["error"] == nil {
        resolve(result)
      } else {
        let error = json["error"] as? String ?? "H3 connection failed"
        reject("H3_ERROR", error, nil)
      }
    } else {
      // Raw success
      resolve(result)
    }
  }
  
  /**
   * POST request over HTTP/3.
   */
  @objc
  func h3Post(_ path: String,
              body: String,
              resolve: @escaping RCTPromiseResolveBlock,
              reject: @escaping RCTPromiseRejectBlock) {
    guard let resultPtr = estream_h3_post(path, body) else {
      reject("H3_ERROR", "H3 POST returned null", nil)
      return
    }
    
    let result = String(cString: resultPtr)
    estream_free_string(resultPtr)
    
    if let data = result.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      if json["error"] != nil {
        let error = json["error"] as? String ?? "H3 POST failed"
        reject("H3_ERROR", error, nil)
      } else {
        resolve(result)
      }
    } else {
      resolve(result)
    }
  }
  
  /**
   * GET request over HTTP/3.
   */
  @objc
  func h3Get(_ path: String,
             resolve: @escaping RCTPromiseResolveBlock,
             reject: @escaping RCTPromiseRejectBlock) {
    guard let resultPtr = estream_h3_get(path) else {
      reject("H3_ERROR", "H3 GET returned null", nil)
      return
    }
    
    let result = String(cString: resultPtr)
    estream_free_string(resultPtr)
    
    if let data = result.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      if json["error"] != nil {
        let error = json["error"] as? String ?? "H3 GET failed"
        reject("H3_ERROR", error, nil)
      } else {
        resolve(result)
      }
    } else {
      resolve(result)
    }
  }
  
  /**
   * Mint an eStream Identity NFT via HTTP/3.
   */
  @objc
  func h3MintIdentityNft(_ owner: String,
                         trustLevel: String,
                         resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
    guard let resultPtr = estream_h3_mint_identity_nft(owner, trustLevel) else {
      reject("H3_ERROR", "H3 mint returned null", nil)
      return
    }
    
    let result = String(cString: resultPtr)
    estream_free_string(resultPtr)
    
    if let data = result.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      if json["error"] != nil {
        let error = json["error"] as? String ?? "H3 mint failed"
        reject("H3_ERROR", error, nil)
      } else {
        resolve(result)
      }
    } else {
      resolve(result)
    }
  }
  
  /**
   * Check if connected to HTTP/3 server.
   */
  @objc
  func h3IsConnected(_ resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
    let connected = estream_h3_is_connected()
    resolve(connected == 1)
  }
  
  /**
   * Disconnect from HTTP/3 server.
   */
  @objc
  func h3Disconnect(_ resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock) {
    estream_h3_disconnect()
    resolve(nil)
  }
}

