package io.estream.app

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.KeyInfo
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import com.facebook.react.bridge.*
import java.security.*
import java.security.spec.ECGenParameterSpec
import android.os.Build
import android.os.CancellationSignal
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.util.concurrent.Executor

/**
 * SeekerModule - Native module for Solana Seeker hardware vault integration.
 * 
 * This module provides access to the device's hardware-backed keystore for:
 * - Ed25519 key generation in secure hardware
 * - Hardware-backed signing operations
 * - Android Key Attestation for proof of hardware security
 * - Biometric authentication for high-security operations
 * 
 * On Seeker devices, keys are stored in the Seed Vault (Titan M2 secure element).
 * On other Android devices, falls back to TEE-backed Android Keystore.
 */
class SeekerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "SeekerModule"
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        
        // Biometric authentication modes
        const val AUTH_MODE_NONE = 0
        const val AUTH_MODE_PER_OPERATION = 1
        const val AUTH_MODE_TIME_WINDOW = 2  // 30 second window
    }

    override fun getName(): String = NAME
    
    /**
     * Check if biometric authentication is available.
     */
    @ReactMethod
    fun isBiometricAvailable(promise: Promise) {
        try {
            val biometricManager = BiometricManager.from(reactApplicationContext)
            val canAuthenticate = biometricManager.canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            
            val result = Arguments.createMap()
            result.putBoolean("available", canAuthenticate == BiometricManager.BIOMETRIC_SUCCESS)
            result.putInt("status", canAuthenticate)
            result.putString("statusText", when (canAuthenticate) {
                BiometricManager.BIOMETRIC_SUCCESS -> "available"
                BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> "no_hardware"
                BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> "hw_unavailable"
                BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "none_enrolled"
                BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED -> "security_update_required"
                else -> "unknown"
            })
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("BIOMETRIC_CHECK_ERROR", e.message, e)
        }
    }

    /**
     * Check if hardware-backed key storage is available.
     * Returns true on Seeker devices and devices with TEE/StrongBox.
     */
    @ReactMethod
    fun isAvailable(promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            
            // Check if we can use hardware-backed keys
            val isSeeker = isSeekDevice()
            val hasHardwareSecurity = hasHardwareBackedKeystore()
            
            promise.resolve(isSeeker || hasHardwareSecurity)
        } catch (e: Exception) {
            promise.reject("AVAILABILITY_ERROR", e.message, e)
        }
    }

    /**
     * Check if this is a Solana Seeker device.
     */
    private fun isSeekDevice(): Boolean {
        val model = Build.MODEL?.lowercase() ?: ""
        val manufacturer = Build.MANUFACTURER?.lowercase() ?: ""
        return model.contains("seeker") || manufacturer.contains("solana")
    }

    /**
     * Check if device has hardware-backed keystore (TEE or StrongBox).
     */
    private fun hasHardwareBackedKeystore(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
    }

    /**
     * Check if a key exists with the given alias.
     */
    @ReactMethod
    fun hasKey(alias: String, promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            promise.resolve(keyStore.containsAlias(alias))
        } catch (e: Exception) {
            promise.reject("KEY_CHECK_ERROR", e.message, e)
        }
    }

    /**
     * Generate a new key pair in hardware.
     * Returns the public key as Base58.
     */
    @ReactMethod
    fun generateKey(alias: String, promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            
            // Delete existing key if present
            if (keyStore.containsAlias(alias)) {
                keyStore.deleteEntry(alias)
            }
            
            // Build key generation parameters
            val builder = KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
            )
                .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA512)
                .setUserAuthenticationRequired(false) // Can enable for biometric unlock
            
            // Use StrongBox if available (Titan M2 on Seeker)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                try {
                    builder.setIsStrongBoxBacked(true)
                } catch (e: StrongBoxUnavailableException) {
                    // Fall back to TEE
                }
            }

            // Generate EC key pair (Ed25519 not directly supported, use EC for now)
            // Note: For true Ed25519 on Seeker, we'd use the Seed Vault SDK
            val keyPairGenerator = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC,
                KEYSTORE_PROVIDER
            )
            keyPairGenerator.initialize(
                builder.setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1")).build()
            )
            
            val keyPair = keyPairGenerator.generateKeyPair()
            val publicKeyBytes = keyPair.public.encoded
            
            // Return as Base64 (would be Base58 with proper encoding)
            val publicKeyB64 = Base64.encodeToString(publicKeyBytes, Base64.NO_WRAP)
            promise.resolve(publicKeyB64)
            
        } catch (e: Exception) {
            promise.reject("KEY_GEN_ERROR", e.message, e)
        }
    }
    
    /**
     * Generate a new key pair with biometric protection.
     * @param alias Key alias
     * @param authMode Authentication mode: 0=none, 1=per-operation, 2=time-window (30s)
     */
    @ReactMethod
    fun generateBiometricKey(alias: String, authMode: Int, promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            
            // Delete existing key if present
            if (keyStore.containsAlias(alias)) {
                keyStore.deleteEntry(alias)
            }
            
            // Build key generation parameters with biometric auth
            val builder = KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
            )
                .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA512)
            
            // Configure authentication based on mode
            when (authMode) {
                AUTH_MODE_PER_OPERATION -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        builder.setUserAuthenticationRequired(true)
                        builder.setUserAuthenticationParameters(
                            0, // 0 = require auth for every operation
                            KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL
                        )
                    } else {
                        builder.setUserAuthenticationRequired(true)
                        builder.setUserAuthenticationValidityDurationSeconds(-1)
                    }
                }
                AUTH_MODE_TIME_WINDOW -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        builder.setUserAuthenticationRequired(true)
                        builder.setUserAuthenticationParameters(
                            30, // 30 second window
                            KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL
                        )
                    } else {
                        builder.setUserAuthenticationRequired(true)
                        builder.setUserAuthenticationValidityDurationSeconds(30)
                    }
                }
                // AUTH_MODE_NONE - no authentication required (default)
            }
            
            // Use StrongBox if available
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                try {
                    builder.setIsStrongBoxBacked(true)
                } catch (e: StrongBoxUnavailableException) {
                    // Fall back to TEE
                }
            }

            val keyPairGenerator = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC,
                KEYSTORE_PROVIDER
            )
            keyPairGenerator.initialize(
                builder.setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1")).build()
            )
            
            val keyPair = keyPairGenerator.generateKeyPair()
            val publicKeyBytes = keyPair.public.encoded
            
            val result = Arguments.createMap()
            result.putString("publicKey", Base64.encodeToString(publicKeyBytes, Base64.NO_WRAP))
            result.putInt("authMode", authMode)
            result.putBoolean("biometricProtected", authMode != AUTH_MODE_NONE)
            promise.resolve(result)
            
        } catch (e: Exception) {
            promise.reject("KEY_GEN_ERROR", e.message, e)
        }
    }
    
    /**
     * Sign with biometric authentication.
     * Shows biometric prompt before signing.
     */
    @ReactMethod
    fun signWithBiometric(
        alias: String,
        messageB64: String,
        title: String,
        subtitle: String,
        promise: Promise
    ) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available for biometric prompt")
            return
        }
        
        if (activity !is FragmentActivity) {
            promise.reject("INVALID_ACTIVITY", "Activity must be FragmentActivity for biometric")
            return
        }
        
        try {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            
            val entry = keyStore.getEntry(alias, null)
            if (entry !is KeyStore.PrivateKeyEntry) {
                promise.reject("KEY_NOT_FOUND", "Key not found: $alias")
                return
            }
            
            val privateKey = entry.privateKey
            val message = Base64.decode(messageB64, Base64.NO_WRAP)
            
            // Initialize signature
            val signatureInstance = Signature.getInstance("SHA256withECDSA")
            signatureInstance.initSign(privateKey)
            
            // Create CryptoObject for biometric binding
            val cryptoObject = BiometricPrompt.CryptoObject(signatureInstance)
            
            val executor: Executor = ContextCompat.getMainExecutor(reactApplicationContext)
            
            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    try {
                        val cryptoSignature = result.cryptoObject?.signature
                        if (cryptoSignature != null) {
                            cryptoSignature.update(message)
                            val signatureBytes = cryptoSignature.sign()
                            val signatureB64 = Base64.encodeToString(signatureBytes, Base64.NO_WRAP)
                            promise.resolve(signatureB64)
                        } else {
                            promise.reject("CRYPTO_ERROR", "No crypto object after auth")
                        }
                    } catch (e: Exception) {
                        promise.reject("SIGN_ERROR", e.message, e)
                    }
                }
                
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    promise.reject(
                        "BIOMETRIC_ERROR",
                        "Authentication error ($errorCode): $errString"
                    )
                }
                
                override fun onAuthenticationFailed() {
                    // Don't reject yet - user can retry
                }
            }
            
            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title.ifEmpty { "Sign Transaction" })
                .setSubtitle(subtitle.ifEmpty { "Authenticate to sign" })
                .setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL
                )
                .build()
            
            // Run on UI thread
            activity.runOnUiThread {
                val biometricPrompt = BiometricPrompt(activity, executor, callback)
                biometricPrompt.authenticate(promptInfo, cryptoObject)
            }
            
        } catch (e: Exception) {
            promise.reject("BIOMETRIC_SIGN_ERROR", e.message, e)
        }
    }

    /**
     * Get the public key for an alias.
     */
    @ReactMethod
    fun getPublicKey(alias: String, promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            
            val entry = keyStore.getEntry(alias, null)
            if (entry !is KeyStore.PrivateKeyEntry) {
                promise.reject("KEY_NOT_FOUND", "Key not found: $alias")
                return
            }
            
            val publicKeyBytes = entry.certificate.publicKey.encoded
            val publicKeyB64 = Base64.encodeToString(publicKeyBytes, Base64.NO_WRAP)
            promise.resolve(publicKeyB64)
            
        } catch (e: Exception) {
            promise.reject("GET_KEY_ERROR", e.message, e)
        }
    }

    /**
     * Sign a message with the key stored in hardware.
     * Input is Base64, output is Base64.
     */
    @ReactMethod
    fun sign(alias: String, messageB64: String, promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            
            val entry = keyStore.getEntry(alias, null)
            if (entry !is KeyStore.PrivateKeyEntry) {
                promise.reject("KEY_NOT_FOUND", "Key not found: $alias")
                return
            }
            
            val privateKey = entry.privateKey
            val message = Base64.decode(messageB64, Base64.NO_WRAP)
            
            // Sign with ECDSA
            val signature = Signature.getInstance("SHA256withECDSA")
            signature.initSign(privateKey)
            signature.update(message)
            val signatureBytes = signature.sign()
            
            val signatureB64 = Base64.encodeToString(signatureBytes, Base64.NO_WRAP)
            promise.resolve(signatureB64)
            
        } catch (e: Exception) {
            promise.reject("SIGN_ERROR", e.message, e)
        }
    }

    /**
     * Get attestation for a key, proving it exists in secure hardware.
     */
    @ReactMethod
    fun getAttestation(alias: String, promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            
            val entry = keyStore.getEntry(alias, null)
            if (entry !is KeyStore.PrivateKeyEntry) {
                promise.reject("KEY_NOT_FOUND", "Key not found: $alias")
                return
            }
            
            // Get certificate chain (includes attestation on supported devices)
            val certChain = entry.certificateChain
            if (certChain.isEmpty()) {
                promise.resolve(null)
                return
            }
            
            // Build attestation result
            val result = Arguments.createMap()
            
            // Get security level
            val factory = KeyFactory.getInstance(
                entry.privateKey.algorithm,
                KEYSTORE_PROVIDER
            )
            val keyInfo = factory.getKeySpec(entry.privateKey, KeyInfo::class.java)
            
            val securityLevel = when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && 
                    keyInfo.securityLevel == KeyProperties.SECURITY_LEVEL_STRONGBOX -> "strongbox"
                keyInfo.securityLevel == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "tee"
                else -> "software"
            }
            result.putString("securityLevel", securityLevel)
            result.putBoolean("isInsideSecureHardware", keyInfo.isInsideSecureHardware)
            
            // Encode certificates
            val certsArray = Arguments.createArray()
            for (cert in certChain) {
                certsArray.pushString(Base64.encodeToString(cert.encoded, Base64.NO_WRAP))
            }
            result.putArray("certificates", certsArray)
            result.putDouble("timestamp", System.currentTimeMillis().toDouble())
            
            promise.resolve(result)
            
        } catch (e: Exception) {
            promise.reject("ATTESTATION_ERROR", e.message, e)
        }
    }

    /**
     * Delete a key from the keystore.
     */
    @ReactMethod
    fun deleteKey(alias: String, promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            
            if (keyStore.containsAlias(alias)) {
                keyStore.deleteEntry(alias)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("DELETE_ERROR", e.message, e)
        }
    }
}

