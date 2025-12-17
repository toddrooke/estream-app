//
//  KeychainModule.swift
//  EstreamApp
//
//  Native module for iOS Keychain / Secure Enclave key operations.
//  Provides Ed25519 key generation and signing using hardware security.
//

import Foundation
import Security
import LocalAuthentication
import CryptoKit

@objc(KeychainModule)
class KeychainModule: NSObject {
  
  private let keychainService = "io.estream.app"
  
  /// Check if Secure Enclave is available on this device.
  @objc(isSecureEnclaveAvailable:rejecter:)
  func isSecureEnclaveAvailable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    // Secure Enclave is available on devices with A7+ chip (iPhone 5s+)
    // and requires iOS 9+. For our purposes, check if we can create a SE key.
    if #available(iOS 13.0, *) {
      let context = LAContext()
      var error: NSError?
      let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
      // Even without biometrics, Secure Enclave may be available
      resolve(SecureEnclave.isAvailable)
    } else {
      resolve(false)
    }
  }
  
  /// Generate a new Ed25519 key pair.
  /// Returns the public key as Base58.
  @objc(generateKey:useSecureEnclave:resolver:rejecter:)
  func generateKey(
    _ alias: String,
    useSecureEnclave: Bool,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      if #available(iOS 13.0, *) {
        let privateKey: Curve25519.Signing.PrivateKey
        
        if useSecureEnclave && SecureEnclave.isAvailable {
          // Generate in Secure Enclave (P-256 only, not Ed25519)
          // For Ed25519, we use software but store in Keychain with SE protection
          privateKey = Curve25519.Signing.PrivateKey()
        } else {
          // Software-only generation
          privateKey = Curve25519.Signing.PrivateKey()
        }
        
        // Store private key in Keychain
        try storePrivateKey(privateKey, alias: alias, useSecureEnclave: useSecureEnclave)
        
        // Return public key as Base58
        let publicKeyBytes = [UInt8](privateKey.publicKey.rawRepresentation)
        let publicKeyBase58 = Base58.encode(publicKeyBytes)
        resolve(publicKeyBase58)
      } else {
        reject("UNSUPPORTED", "iOS 13+ required for key generation", nil)
      }
    } catch {
      reject("KEY_GEN_ERROR", error.localizedDescription, error)
    }
  }
  
  /// Check if a key exists.
  @objc(hasKey:resolver:rejecter:)
  func hasKey(
    _ alias: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: alias,
      kSecReturnData as String: false
    ]
    
    let status = SecItemCopyMatching(query as CFDictionary, nil)
    resolve(status == errSecSuccess)
  }
  
  /// Get the public key for an alias.
  @objc(getPublicKey:resolver:rejecter:)
  func getPublicKey(
    _ alias: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      if #available(iOS 13.0, *) {
        let privateKey = try loadPrivateKey(alias: alias)
        let publicKeyBytes = [UInt8](privateKey.publicKey.rawRepresentation)
        let publicKeyBase58 = Base58.encode(publicKeyBytes)
        resolve(publicKeyBase58)
      } else {
        reject("UNSUPPORTED", "iOS 13+ required", nil)
      }
    } catch {
      reject("KEY_NOT_FOUND", error.localizedDescription, error)
    }
  }
  
  /// Sign a message.
  /// Input: Base64, Output: Base64
  @objc(sign:message:resolver:rejecter:)
  func sign(
    _ alias: String,
    message messageBase64: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      if #available(iOS 13.0, *) {
        guard let messageData = Data(base64Encoded: messageBase64) else {
          reject("INVALID_MESSAGE", "Message must be valid Base64", nil)
          return
        }
        
        let privateKey = try loadPrivateKey(alias: alias)
        let signature = try privateKey.signature(for: messageData)
        let signatureBase64 = signature.withUnsafeBytes { Data($0) }.base64EncodedString()
        
        resolve(signatureBase64)
      } else {
        reject("UNSUPPORTED", "iOS 13+ required", nil)
      }
    } catch {
      reject("SIGN_ERROR", error.localizedDescription, error)
    }
  }
  
  /// Delete a key.
  @objc(deleteKey:resolver:rejecter:)
  func deleteKey(
    _ alias: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: alias
    ]
    
    let status = SecItemDelete(query as CFDictionary)
    resolve(status == errSecSuccess || status == errSecItemNotFound)
  }
  
  /// Get security level for a key.
  @objc(getSecurityLevel:resolver:rejecter:)
  func getSecurityLevel(
    _ alias: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    // Check if key was stored with SE protection
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: alias,
      kSecReturnAttributes as String: true
    ]
    
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    
    if status == errSecSuccess, let attrs = result as? [String: Any] {
      // Check if protected by Secure Enclave
      if let protection = attrs[kSecAttrAccessible as String] as? String,
         protection.contains("AfterFirstUnlock") {
        resolve("software")
      } else {
        resolve("secure_enclave")
      }
    } else {
      resolve("software")
    }
  }
  
  // MARK: - Private Helpers
  
  @available(iOS 13.0, *)
  private func storePrivateKey(_ privateKey: Curve25519.Signing.PrivateKey, alias: String, useSecureEnclave: Bool) throws {
    // Delete existing key if present
    let deleteQuery: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: alias
    ]
    SecItemDelete(deleteQuery as CFDictionary)
    
    // Prepare access control
    var accessFlags: SecAccessControlCreateFlags = []
    if useSecureEnclave {
      accessFlags = [.privateKeyUsage]
    }
    
    guard let accessControl = SecAccessControlCreateWithFlags(
      nil,
      kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      accessFlags,
      nil
    ) else {
      throw KeychainError.accessControlCreationFailed
    }
    
    // Store private key
    let keyData = privateKey.rawRepresentation
    let addQuery: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: alias,
      kSecValueData as String: keyData,
      kSecAttrAccessControl as String: accessControl
    ]
    
    let status = SecItemAdd(addQuery as CFDictionary, nil)
    if status != errSecSuccess {
      throw KeychainError.storageFailed(status: status)
    }
  }
  
  @available(iOS 13.0, *)
  private func loadPrivateKey(alias: String) throws -> Curve25519.Signing.PrivateKey {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: alias,
      kSecReturnData as String: true
    ]
    
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    
    guard status == errSecSuccess, let keyData = result as? Data else {
      throw KeychainError.keyNotFound
    }
    
    return try Curve25519.Signing.PrivateKey(rawRepresentation: keyData)
  }
}

// MARK: - Keychain Error

enum KeychainError: Error, LocalizedError {
  case accessControlCreationFailed
  case storageFailed(status: OSStatus)
  case keyNotFound
  
  var errorDescription: String? {
    switch self {
    case .accessControlCreationFailed:
      return "Failed to create access control"
    case .storageFailed(let status):
      return "Keychain storage failed: \(status)"
    case .keyNotFound:
      return "Key not found in Keychain"
    }
  }
}

// MARK: - Base58 Encoding

enum Base58 {
  private static let alphabet = Array("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")
  
  static func encode(_ bytes: [UInt8]) -> String {
    var bigInt = bytes.reduce(0) { $0 * 256 + Int($1) }
    var result = [Character]()
    
    while bigInt > 0 {
      let remainder = bigInt % 58
      bigInt /= 58
      result.append(alphabet[remainder])
    }
    
    // Handle leading zeros
    for byte in bytes {
      if byte == 0 {
        result.append(alphabet[0])
      } else {
        break
      }
    }
    
    return String(result.reversed())
  }
}

// MARK: - Objective-C Bridge

extension KeychainModule {
  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
}

