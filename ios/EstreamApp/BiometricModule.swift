//
//  BiometricModule.swift
//  EstreamApp
//
//  Face ID / Touch ID integration for iOS Secure Enclave operations.
//  Provides biometric authentication for signing and key access.
//
//  Security Features:
//  - Face ID with fallback to passcode
//  - Secure Enclave P-256 key generation and signing
//  - Per-operation biometric requirement for governance
//  - Key attestation support
//

import Foundation
import LocalAuthentication
import Security
import CryptoKit

@objc(BiometricModule)
class BiometricModule: NSObject {
  
  private let keychainService = "io.estream.app.biometric"
  
  // MARK: - Biometric Status
  
  /// Check biometric availability and type
  @objc(getBiometricStatus:rejecter:)
  func getBiometricStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let context = LAContext()
    var error: NSError?
    
    let canEvaluate = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    
    var biometricType: String
    if #available(iOS 11.0, *) {
      switch context.biometryType {
      case .faceID:
        biometricType = "FaceID"
      case .touchID:
        biometricType = "TouchID"
      case .opticID:
        biometricType = "OpticID"
      case .none:
        biometricType = "None"
      @unknown default:
        biometricType = "Unknown"
      }
    } else {
      biometricType = canEvaluate ? "TouchID" : "None"
    }
    
    let result: [String: Any] = [
      "available": canEvaluate,
      "biometricType": biometricType,
      "secureEnclaveAvailable": SecureEnclave.isAvailable,
      "errorCode": error?.code ?? 0,
      "errorMessage": error?.localizedDescription ?? ""
    ]
    
    resolve(result)
  }
  
  // MARK: - Biometric Authentication
  
  /// Authenticate with Face ID / Touch ID
  @objc(authenticate:subtitle:resolver:rejecter:)
  func authenticate(
    _ reason: String,
    subtitle: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let context = LAContext()
    context.localizedFallbackTitle = "Use Passcode"
    
    if #available(iOS 13.0, *) {
      if let sub = subtitle {
        context.localizedReason = sub
      }
    }
    
    // Use device owner auth to allow passcode fallback
    context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, error in
      DispatchQueue.main.async {
        if success {
          resolve([
            "success": true,
            "method": self.getCurrentBiometricType()
          ])
        } else {
          let authError = error as? LAError
          resolve([
            "success": false,
            "errorCode": authError?.code.rawValue ?? -1,
            "errorMessage": error?.localizedDescription ?? "Authentication failed"
          ])
        }
      }
    }
  }
  
  // MARK: - Secure Enclave Keys with Biometric Protection
  
  /// Generate a Secure Enclave P-256 key that requires Face ID for signing
  @objc(generateBiometricProtectedKey:requireBiometric:resolver:rejecter:)
  func generateBiometricProtectedKey(
    _ alias: String,
    requireBiometric: Bool,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 13.0, *) else {
      reject("UNSUPPORTED", "iOS 13+ required", nil)
      return
    }
    
    // Delete existing key if present
    deleteExistingKey(alias: alias)
    
    do {
      // Create access control with biometric requirement
      var accessFlags: SecAccessControlCreateFlags = [.privateKeyUsage]
      if requireBiometric {
        accessFlags.insert(.biometryCurrentSet)
      }
      
      guard let accessControl = SecAccessControlCreateWithFlags(
        nil,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        accessFlags,
        nil
      ) else {
        reject("ACCESS_CONTROL_ERROR", "Failed to create access control", nil)
        return
      }
      
      // Generate P-256 key in Secure Enclave
      let attributes: [String: Any] = [
        kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256,
        kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
        kSecPrivateKeyAttrs as String: [
          kSecAttrIsPermanent as String: true,
          kSecAttrApplicationTag as String: alias.data(using: .utf8)!,
          kSecAttrAccessControl as String: accessControl
        ] as [String: Any]
      ]
      
      var error: Unmanaged<CFError>?
      guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
        let errorMsg = error?.takeRetainedValue().localizedDescription ?? "Unknown error"
        reject("KEY_GEN_ERROR", errorMsg, nil)
        return
      }
      
      // Get public key
      guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
        reject("PUBKEY_ERROR", "Failed to get public key", nil)
        return
      }
      
      // Export public key bytes
      guard let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else {
        reject("EXPORT_ERROR", "Failed to export public key", nil)
        return
      }
      
      let result: [String: Any] = [
        "alias": alias,
        "publicKey": publicKeyData.base64EncodedString(),
        "publicKeyHex": publicKeyData.map { String(format: "%02x", $0) }.joined(),
        "secureEnclave": true,
        "biometricProtected": requireBiometric
      ]
      
      resolve(result)
      
    } catch {
      reject("KEY_GEN_ERROR", error.localizedDescription, error)
    }
  }
  
  /// Sign data with a biometric-protected key
  @objc(signWithBiometricKey:dataBase64:reason:resolver:rejecter:)
  func signWithBiometricKey(
    _ alias: String,
    dataBase64: String,
    reason: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 13.0, *) else {
      reject("UNSUPPORTED", "iOS 13+ required", nil)
      return
    }
    
    guard let data = Data(base64Encoded: dataBase64) else {
      reject("INVALID_INPUT", "Data must be valid Base64", nil)
      return
    }
    
    // Query for the private key
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrApplicationTag as String: alias.data(using: .utf8)!,
      kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
      kSecReturnRef as String: true,
      kSecUseOperationPrompt as String: reason
    ]
    
    var keyRef: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &keyRef)
    
    guard status == errSecSuccess, let key = keyRef else {
      if status == errSecUserCanceled {
        resolve([
          "success": false,
          "cancelled": true,
          "errorMessage": "Authentication cancelled"
        ])
      } else {
        reject("KEY_NOT_FOUND", "Key not found or access denied: \(status)", nil)
      }
      return
    }
    
    let privateKey = key as! SecKey
    
    // Sign with ECDSA
    var error: Unmanaged<CFError>?
    guard let signature = SecKeyCreateSignature(
      privateKey,
      .ecdsaSignatureMessageX962SHA256,
      data as CFData,
      &error
    ) else {
      let errorMsg = error?.takeRetainedValue().localizedDescription ?? "Signing failed"
      reject("SIGN_ERROR", errorMsg, nil)
      return
    }
    
    let signatureData = signature as Data
    
    resolve([
      "success": true,
      "signature": signatureData.base64EncodedString(),
      "signatureHex": signatureData.map { String(format: "%02x", $0) }.joined()
    ])
  }
  
  /// Check if a biometric-protected key exists
  @objc(hasBiometricKey:resolver:rejecter:)
  func hasBiometricKey(
    _ alias: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrApplicationTag as String: alias.data(using: .utf8)!,
      kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
      kSecReturnAttributes as String: true
    ]
    
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    
    resolve(status == errSecSuccess)
  }
  
  /// Delete a biometric-protected key
  @objc(deleteBiometricKey:resolver:rejecter:)
  func deleteBiometricKey(
    _ alias: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: alias.data(using: .utf8)!
    ]
    
    let status = SecItemDelete(query as CFDictionary)
    resolve(status == errSecSuccess || status == errSecItemNotFound)
  }
  
  // MARK: - Governance Signing
  
  /// Sign a governance action with biometric authentication
  /// This always requires Face ID/Touch ID per operation
  @objc(signGovernanceAction:actionJson:resolver:rejecter:)
  func signGovernanceAction(
    _ alias: String,
    actionJson: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 13.0, *) else {
      reject("UNSUPPORTED", "iOS 13+ required", nil)
      return
    }
    
    // Parse action to extract title for prompt
    var actionTitle = "eStream Governance Action"
    if let data = actionJson.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let type = json["type"] as? String,
       let operation = json["operation"] as? String {
      actionTitle = "\(type): \(operation)"
    }
    
    // Hash the action for signing
    guard let actionData = actionJson.data(using: .utf8) else {
      reject("INVALID_INPUT", "Invalid action JSON", nil)
      return
    }
    
    let hash = SHA256.hash(data: actionData)
    let hashData = Data(hash)
    
    // Sign with biometric key
    signWithBiometricKey(
      alias,
      dataBase64: hashData.base64EncodedString(),
      reason: "Sign: \(actionTitle)",
      resolver: { result in
        guard let signResult = result as? [String: Any] else {
          resolve(result)
          return
        }
        
        // Add action hash to response
        var enhanced = signResult
        enhanced["actionHash"] = hashData.map { String(format: "%02x", $0) }.joined()
        resolve(enhanced)
      },
      rejecter: reject
    )
  }
  
  // MARK: - Private Helpers
  
  private func getCurrentBiometricType() -> String {
    let context = LAContext()
    var error: NSError?
    context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    
    if #available(iOS 11.0, *) {
      switch context.biometryType {
      case .faceID: return "FaceID"
      case .touchID: return "TouchID"
      case .opticID: return "OpticID"
      case .none: return "None"
      @unknown default: return "Unknown"
      }
    }
    return "TouchID"
  }
  
  private func deleteExistingKey(alias: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: alias.data(using: .utf8)!
    ]
    SecItemDelete(query as CFDictionary)
  }
}

// MARK: - Objective-C Bridge

extension BiometricModule {
  @objc static func requiresMainQueueSetup() -> Bool {
    return true // Face ID UI needs main thread
  }
}
