//
//  PqCryptoModule.swift
//  EstreamApp
//
//  Post-quantum cryptography module powered by eStream Mobile SDK.
//  Uses ML-KEM-1024 (Kyber) and ML-DSA-87 (Dilithium5) - FIPS 203/204 compliant.
//

import Foundation

/// Result wrapper for FFI calls
struct FFIResult<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let error: String?
}

/// Device public keys (PQ crypto)
struct PqDeviceKeys: Codable {
    let app_scope: AppScope
    let created_at: UInt64
    let kem_key: KemKeyInfo
    let key_hash: [UInt8]
    let signature_key: KemKeyInfo
    
    struct AppScope: Codable {
        let app_id: String
        let namespace: String
    }
    
    struct KemKeyInfo: Codable {
        let kem_public: [UInt8]
        let signature_public: [UInt8]
    }
}

/// Ratchet initialization result
struct RatchetInitResult: Codable {
    let handle: Int64
    let initial_ciphertext: String?
    let our_kem_public: String?
}

/// Ratchet decrypt result
struct RatchetDecryptResult: Codable {
    let plaintext: String
    let plaintext_hex: String
}

@objc(PqCryptoModule)
class PqCryptoModule: NSObject {
    
    private var connectionHandle: Int = 0
    
    // MARK: - Initialization
    
    override init() {
        super.init()
        // Initialize the SDK (no QUIC, just crypto)
        connectionHandle = Int(estream_initialize())
        print("[PqCrypto] Initialized with handle: \(connectionHandle)")
    }
    
    deinit {
        estream_dispose(Int(connectionHandle))
        print("[PqCrypto] Disposed")
    }
    
    // MARK: - React Native Methods
    
    /// Get library version
    @objc(getVersion:rejecter:)
    func getVersion(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let versionPtr = estream_version()
        defer { estream_free_string(versionPtr) }
        
        if let ptr = versionPtr {
            resolve(String(cString: ptr))
        } else {
            reject("VERSION_ERROR", "Failed to get version", nil)
        }
    }
    
    /// Generate PQ device keys (Dilithium5 + Kyber1024)
    @objc(generateDeviceKeys:resolver:rejecter:)
    func generateDeviceKeys(
        _ appScope: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        print("[PqCrypto] generateDeviceKeys for scope: \(appScope)")
        
        let resultPtr = appScope.withCString { scopePtr in
            estream_generate_device_keys(scopePtr)
        }
        defer { estream_free_string(resultPtr) }
        
        guard let ptr = resultPtr else {
            reject("KEYGEN_ERROR", "Failed to generate device keys", nil)
            return
        }
        
        let jsonString = String(cString: ptr)
        
        guard let jsonData = jsonString.data(using: .utf8) else {
            reject("PARSE_ERROR", "Invalid JSON response", nil)
            return
        }
        
        do {
            let result = try JSONDecoder().decode(FFIResult<PqDeviceKeys>.self, from: jsonData)
            if result.success, let keys = result.data {
                // Convert to dictionary for React Native
                let response: [String: Any] = [
                    "keyHash": Data(keys.key_hash).base64EncodedString(),
                    "kemPublicKeySize": keys.kem_key.kem_public.count,
                    "signaturePublicKeySize": keys.signature_key.signature_public.count,
                    "createdAt": keys.created_at
                ]
                resolve(response)
            } else {
                reject("KEYGEN_ERROR", result.error ?? "Unknown error", nil)
            }
        } catch {
            reject("PARSE_ERROR", "JSON decode failed: \(error)", nil)
        }
    }
    
    /// Initialize Double Ratchet as sender
    @objc(initRatchetSender:theirKemPublic:resolver:rejecter:)
    func initRatchetSender(
        _ sharedSecretHex: String,
        theirKemPublic: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        print("[PqCrypto] initRatchetSender")
        
        guard let sharedSecret = Data(hexString: sharedSecretHex),
              let theirKem = Data(hexString: theirKemPublic) else {
            reject("INVALID_INPUT", "Invalid hex string", nil)
            return
        }
        
        guard sharedSecret.count == 32 else {
            reject("INVALID_INPUT", "Shared secret must be 32 bytes", nil)
            return
        }
        
        let resultPtr = sharedSecret.withUnsafeBytes { ssPtr in
            theirKem.withUnsafeBytes { kemPtr in
                estream_ratchet_init_sender(
                    ssPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    kemPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    theirKem.count
                )
            }
        }
        defer { estream_free_string(resultPtr) }
        
        parseFFIResult(resultPtr, resolve: resolve, reject: reject)
    }
    
    /// Encrypt a message with Double Ratchet
    @objc(ratchetEncrypt:plaintext:resolver:rejecter:)
    func ratchetEncrypt(
        _ handle: Double,
        plaintext: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        print("[PqCrypto] ratchetEncrypt handle=\(Int(handle))")
        
        guard let plaintextData = plaintext.data(using: .utf8) else {
            reject("INVALID_INPUT", "Invalid plaintext", nil)
            return
        }
        
        let resultPtr = plaintextData.withUnsafeBytes { ptr in
            estream_ratchet_encrypt(
                Int(handle),
                ptr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                plaintextData.count
            )
        }
        defer { estream_free_string(resultPtr) }
        
        parseFFIResult(resultPtr, resolve: resolve, reject: reject)
    }
    
    /// Decrypt a message with Double Ratchet
    @objc(ratchetDecrypt:messageJson:resolver:rejecter:)
    func ratchetDecrypt(
        _ handle: Double,
        messageJson: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        print("[PqCrypto] ratchetDecrypt handle=\(Int(handle))")
        
        let resultPtr = messageJson.withCString { msgPtr in
            estream_ratchet_decrypt(Int(handle), msgPtr)
        }
        defer { estream_free_string(resultPtr) }
        
        parseFFIResult(resultPtr, resolve: resolve, reject: reject)
    }
    
    /// Dispose a ratchet session
    @objc(ratchetDispose:)
    func ratchetDispose(_ handle: Double) {
        print("[PqCrypto] ratchetDispose handle=\(Int(handle))")
        estream_ratchet_dispose(Int(handle))
    }
    
    // MARK: - Helpers
    
    private func parseFFIResult(
        _ resultPtr: UnsafeMutablePointer<CChar>?,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let ptr = resultPtr else {
            reject("FFI_ERROR", "Null result from FFI", nil)
            return
        }
        
        let jsonString = String(cString: ptr)
        
        guard let jsonData = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else {
            reject("PARSE_ERROR", "Invalid JSON: \(jsonString)", nil)
            return
        }
        
        if let success = json["success"] as? Bool, success {
            resolve(json["data"] ?? json)
        } else {
            let error = json["error"] as? String ?? "Unknown error"
            reject("FFI_ERROR", error, nil)
        }
    }
}

// MARK: - Objective-C Bridge

extension PqCryptoModule {
    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }
}

// MARK: - Data Extension

extension Data {
    init?(hexString: String) {
        let len = hexString.count / 2
        var data = Data(capacity: len)
        var i = hexString.startIndex
        for _ in 0..<len {
            let j = hexString.index(i, offsetBy: 2)
            let bytes = hexString[i..<j]
            if var num = UInt8(bytes, radix: 16) {
                data.append(&num, count: 1)
            } else {
                return nil
            }
            i = j
        }
        self = data
    }
}

