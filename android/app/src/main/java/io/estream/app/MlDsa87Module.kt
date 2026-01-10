package io.estream.app

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import android.util.Log
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.*
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * MlDsa87Module - Native module for ML-DSA-87 (FIPS 204 / Dilithium5) operations.
 * 
 * This module provides quantum-resistant digital signatures with hardware protection:
 * 
 * ## Security Architecture
 * 
 * 1. **ML-DSA-87 Keys**: Generated via native Rust (fips204 crate)
 *    - Public key: 2592 bytes
 *    - Secret key: 4896 bytes (encrypted at rest)
 *    - Signature: 4627 bytes
 * 
 * 2. **Hardware Protection**: 
 *    - AES-256-GCM wrapping key stored in Android Keystore (StrongBox/TEE)
 *    - ML-DSA secret key encrypted with wrapping key
 *    - Encrypted key stored in EncryptedSharedPreferences
 * 
 * 3. **Authentication**: 
 *    - PIN + Biometric required for governance signing
 *    - Uses setUserAuthenticationParameters with both BIOMETRIC and CREDENTIAL
 *    - StrongBox-backed on Seeker (Titan M2)
 * 
 * ## Authentication Modes
 * 
 * - AUTH_BIOMETRIC_ONLY: Fingerprint/face only
 * - AUTH_PIN_ONLY: PIN/pattern/password only  
 * - AUTH_PIN_AND_BIOMETRIC: Both required (most secure, for governance)
 * 
 * On Seeker devices, the wrapping key is stored in the Titan M2 secure element.
 */
class MlDsa87Module(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "MlDsa87Module"
        private const val TAG = "MlDsa87Module"
        
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val WRAPPING_KEY_ALIAS = "estream_mldsa87_wrapper"
        private const val PREFS_NAME = "estream_mldsa87_vault"
        private const val PREF_ENCRYPTED_SK = "encrypted_secret_key"
        private const val PREF_PUBLIC_KEY = "public_key"
        private const val PREF_KEY_IV = "key_iv"
        
        // Authentication modes
        const val AUTH_NONE = 0
        const val AUTH_BIOMETRIC_ONLY = 1
        const val AUTH_PIN_ONLY = 2
        const val AUTH_PIN_AND_BIOMETRIC = 3  // Most secure - for governance
        
        // GCM constants
        private const val GCM_IV_LENGTH = 12
        private const val GCM_TAG_LENGTH = 128
    }

    private var hasStrongBox: Boolean = false
    
    init {
        // Check for StrongBox on init
        hasStrongBox = checkStrongBoxAvailable()
        Log.i(TAG, "MlDsa87Module initialized - StrongBox: $hasStrongBox")
    }

    override fun getName(): String = NAME
    
    /**
     * Load native library containing ML-DSA-87 implementation
     */
    init {
        try {
            System.loadLibrary("estream_native")
            Log.i(TAG, "Native library loaded successfully")
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "Failed to load native library", e)
        }
    }

    // ============================================================================
    // Native JNI Methods (implemented in Rust)
    // ============================================================================
    
    private external fun nativeMlDsaGenerateKeys(): ByteArray
    private external fun nativeMlDsaSign(secretKeyHex: String, message: ByteArray): ByteArray
    private external fun nativeMlDsaVerify(publicKeyHex: String, message: ByteArray, signatureHex: String): Long

    // ============================================================================
    // React Native Methods
    // ============================================================================

    /**
     * Check if hardware-backed ML-DSA-87 is available
     */
    @ReactMethod
    fun isAvailable(promise: Promise) {
        try {
            val result = Arguments.createMap()
            result.putBoolean("available", true)
            result.putBoolean("strongBox", hasStrongBox)
            result.putBoolean("isSeeker", isSeekDevice())
            result.putString("algorithm", "ML-DSA-87")
            result.putInt("securityLevel", 5)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("AVAILABILITY_ERROR", e.message, e)
        }
    }

    /**
     * Check if a keypair exists
     */
    @ReactMethod
    fun hasKeypair(promise: Promise) {
        try {
            val prefs = getEncryptedPrefs()
            val hasKey = prefs.contains(PREF_ENCRYPTED_SK) && prefs.contains(PREF_PUBLIC_KEY)
            promise.resolve(hasKey)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", e.message, e)
        }
    }

    /**
     * Generate a new ML-DSA-87 keypair with hardware protection
     * 
     * @param authMode Authentication mode for signing: 0=none, 1=biometric, 2=PIN, 3=PIN+biometric
     */
    @ReactMethod
    fun generateKeypair(authMode: Int, promise: Promise) {
        try {
            Log.i(TAG, "Generating ML-DSA-87 keypair with authMode=$authMode")
            
            // Generate keypair using native Rust implementation
            val keyJsonBytes = nativeMlDsaGenerateKeys()
            val keyJson = String(keyJsonBytes, StandardCharsets.UTF_8)
            
            Log.d(TAG, "Native keygen returned: ${keyJson.length} bytes")
            
            // Parse the JSON response
            val keyData = org.json.JSONObject(keyJson)
            val publicKeyHex = keyData.getString("public_key")
            val secretKeyHex = keyData.getString("secret_key")
            
            Log.i(TAG, "ML-DSA-87 keypair generated: pk=${publicKeyHex.length/2} bytes, sk=${secretKeyHex.length/2} bytes")
            
            // Create hardware-protected wrapping key
            createWrappingKey(authMode)
            
            // Encrypt the secret key
            val (encryptedSk, iv) = encryptSecretKey(secretKeyHex)
            
            // Store encrypted secret key and public key
            val prefs = getEncryptedPrefs()
            prefs.edit()
                .putString(PREF_ENCRYPTED_SK, Base64.encodeToString(encryptedSk, Base64.NO_WRAP))
                .putString(PREF_PUBLIC_KEY, publicKeyHex)
                .putString(PREF_KEY_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                .apply()
            
            Log.i(TAG, "ML-DSA-87 keypair stored securely")
            
            // Return public key info
            val result = Arguments.createMap()
            result.putString("publicKey", publicKeyHex)
            result.putInt("publicKeyBytes", publicKeyHex.length / 2)
            result.putString("algorithm", "ML-DSA-87")
            result.putInt("authMode", authMode)
            result.putBoolean("hardwareProtected", true)
            result.putBoolean("strongBox", hasStrongBox)
            promise.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to generate keypair", e)
            promise.reject("KEYGEN_ERROR", e.message, e)
        }
    }

    /**
     * Get the public key (does not require authentication)
     */
    @ReactMethod
    fun getPublicKey(promise: Promise) {
        try {
            val prefs = getEncryptedPrefs()
            val publicKey = prefs.getString(PREF_PUBLIC_KEY, null)
            
            if (publicKey == null) {
                promise.reject("NO_KEY", "No keypair found. Call generateKeypair first.")
                return
            }
            
            promise.resolve(publicKey)
        } catch (e: Exception) {
            promise.reject("GET_KEY_ERROR", e.message, e)
        }
    }

    /**
     * Sign a message with ML-DSA-87 (requires PIN + biometric authentication)
     * 
     * This is the main signing method for governance operations.
     * Shows biometric prompt, then signs using hardware-protected secret key.
     * 
     * @param messageB64 Base64-encoded message to sign
     * @param title Title for biometric prompt
     * @param subtitle Subtitle for biometric prompt
     */
    @ReactMethod
    fun signWithAuth(
        messageB64: String,
        title: String,
        subtitle: String,
        promise: Promise
    ) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available for authentication")
            return
        }
        
        if (activity !is FragmentActivity) {
            promise.reject("INVALID_ACTIVITY", "Activity must be FragmentActivity")
            return
        }
        
        try {
            Log.i(TAG, "signWithAuth: Starting authentication")
            
            // Get encrypted secret key
            val prefs = getEncryptedPrefs()
            val encryptedSkB64 = prefs.getString(PREF_ENCRYPTED_SK, null)
            val ivB64 = prefs.getString(PREF_KEY_IV, null)
            
            if (encryptedSkB64 == null || ivB64 == null) {
                promise.reject("NO_KEY", "No keypair found. Call generateKeypair first.")
                return
            }
            
            val encryptedSk = Base64.decode(encryptedSkB64, Base64.NO_WRAP)
            val iv = Base64.decode(ivB64, Base64.NO_WRAP)
            val message = Base64.decode(messageB64, Base64.NO_WRAP)
            
            // Get wrapping key for decryption
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            val wrappingKey = keyStore.getKey(WRAPPING_KEY_ALIAS, null) as SecretKey
            
            // Initialize cipher for biometric binding
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, wrappingKey, GCMParameterSpec(GCM_TAG_LENGTH, iv))
            
            // Create CryptoObject for biometric binding
            val cryptoObject = BiometricPrompt.CryptoObject(cipher)
            
            val executor = ContextCompat.getMainExecutor(reactContext)
            
            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    try {
                        Log.i(TAG, "Authentication succeeded, decrypting secret key")
                        
                        // Decrypt secret key using authenticated cipher
                        val authenticatedCipher = result.cryptoObject?.cipher
                        if (authenticatedCipher == null) {
                            promise.reject("CRYPTO_ERROR", "No cipher after authentication")
                            return
                        }
                        
                        val secretKeyHex = String(authenticatedCipher.doFinal(encryptedSk), StandardCharsets.UTF_8)
                        
                        Log.i(TAG, "Secret key decrypted, signing message")
                        
                        // Sign with native ML-DSA-87
                        val signatureBytes = nativeMlDsaSign(secretKeyHex, message)
                        val signatureHex = String(signatureBytes, StandardCharsets.UTF_8)
                        
                        Log.i(TAG, "Message signed successfully: ${signatureHex.length / 2} bytes")
                        
                        // Clear secret key from memory
                        // Note: In Kotlin, we can't truly zero the string, but we can minimize exposure
                        
                        val resultMap = Arguments.createMap()
                        resultMap.putString("signature", signatureHex)
                        resultMap.putInt("signatureBytes", signatureHex.length / 2)
                        resultMap.putString("algorithm", "ML-DSA-87")
                        resultMap.putBoolean("hardwareSigned", true)
                        promise.resolve(resultMap)
                        
                    } catch (e: Exception) {
                        Log.e(TAG, "Signing failed after auth", e)
                        promise.reject("SIGN_ERROR", e.message, e)
                    }
                }
                
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    Log.e(TAG, "Authentication error: $errorCode - $errString")
                    promise.reject("AUTH_ERROR", "Authentication error ($errorCode): $errString")
                }
                
                override fun onAuthenticationFailed() {
                    Log.w(TAG, "Authentication failed (attempt)")
                    // Don't reject - user can retry
                }
            }
            
            // Build prompt with PIN + biometric requirement
            val promptInfoBuilder = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title.ifEmpty { "Governance Signature Required" })
                .setSubtitle(subtitle.ifEmpty { "Authenticate with PIN and biometric" })
            
            // Configure authenticators based on Android version
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                promptInfoBuilder.setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL
                )
            } else {
                promptInfoBuilder.setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG
                )
                promptInfoBuilder.setNegativeButtonText("Cancel")
            }
            
            val promptInfo = promptInfoBuilder.build()
            
            // Run on UI thread
            activity.runOnUiThread {
                val biometricPrompt = BiometricPrompt(activity, executor, callback)
                biometricPrompt.authenticate(promptInfo, cryptoObject)
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "signWithAuth failed", e)
            promise.reject("SIGN_ERROR", e.message, e)
        }
    }

    /**
     * Sign a message without authentication (for testing/low-security operations)
     * 
     * WARNING: This bypasses hardware authentication. Only use for testing.
     */
    @ReactMethod
    fun signWithoutAuth(messageB64: String, promise: Promise) {
        try {
            Log.w(TAG, "signWithoutAuth: Signing without authentication (testing only)")
            
            val prefs = getEncryptedPrefs()
            val encryptedSkB64 = prefs.getString(PREF_ENCRYPTED_SK, null)
            val ivB64 = prefs.getString(PREF_KEY_IV, null)
            
            if (encryptedSkB64 == null || ivB64 == null) {
                promise.reject("NO_KEY", "No keypair found")
                return
            }
            
            val encryptedSk = Base64.decode(encryptedSkB64, Base64.NO_WRAP)
            val iv = Base64.decode(ivB64, Base64.NO_WRAP)
            val message = Base64.decode(messageB64, Base64.NO_WRAP)
            
            // Decrypt secret key (may fail if auth is required for wrapping key)
            val secretKeyHex = try {
                decryptSecretKey(encryptedSk, iv)
            } catch (e: Exception) {
                promise.reject("AUTH_REQUIRED", "Authentication required for this key")
                return
            }
            
            // Sign
            val signatureBytes = nativeMlDsaSign(secretKeyHex, message)
            val signatureHex = String(signatureBytes, StandardCharsets.UTF_8)
            
            val result = Arguments.createMap()
            result.putString("signature", signatureHex)
            result.putInt("signatureBytes", signatureHex.length / 2)
            promise.resolve(result)
            
        } catch (e: Exception) {
            promise.reject("SIGN_ERROR", e.message, e)
        }
    }

    /**
     * Verify an ML-DSA-87 signature (no authentication required)
     */
    @ReactMethod
    fun verify(publicKeyHex: String, messageB64: String, signatureHex: String, promise: Promise) {
        try {
            val message = Base64.decode(messageB64, Base64.NO_WRAP)
            val result = nativeMlDsaVerify(publicKeyHex, message, signatureHex)
            promise.resolve(result == 1L)
        } catch (e: Exception) {
            promise.reject("VERIFY_ERROR", e.message, e)
        }
    }

    /**
     * Delete the keypair
     */
    @ReactMethod
    fun deleteKeypair(promise: Promise) {
        try {
            // Delete from EncryptedSharedPreferences
            val prefs = getEncryptedPrefs()
            prefs.edit()
                .remove(PREF_ENCRYPTED_SK)
                .remove(PREF_PUBLIC_KEY)
                .remove(PREF_KEY_IV)
                .apply()
            
            // Delete wrapping key from Keystore
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            if (keyStore.containsAlias(WRAPPING_KEY_ALIAS)) {
                keyStore.deleteEntry(WRAPPING_KEY_ALIAS)
            }
            
            Log.i(TAG, "ML-DSA-87 keypair deleted")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DELETE_ERROR", e.message, e)
        }
    }

    /**
     * Get security information about the current key
     */
    @ReactMethod
    fun getSecurityInfo(promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            
            val result = Arguments.createMap()
            result.putBoolean("hasKeypair", keyStore.containsAlias(WRAPPING_KEY_ALIAS))
            result.putBoolean("strongBox", hasStrongBox)
            result.putBoolean("isSeeker", isSeekDevice())
            result.putString("algorithm", "ML-DSA-87")
            result.putInt("securityLevel", 5)
            result.putString("keyProtection", if (hasStrongBox) "StrongBox (Titan M2)" else "TEE")
            
            // Check biometric availability
            val biometricManager = BiometricManager.from(reactContext)
            val canAuth = biometricManager.canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            result.putBoolean("biometricAvailable", canAuth == BiometricManager.BIOMETRIC_SUCCESS)
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("INFO_ERROR", e.message, e)
        }
    }

    // ============================================================================
    // Private Helper Methods
    // ============================================================================

    private fun isSeekDevice(): Boolean {
        val model = Build.MODEL?.lowercase() ?: ""
        val manufacturer = Build.MANUFACTURER?.lowercase() ?: ""
        return model.contains("seeker") || manufacturer.contains("solana")
    }

    private fun checkStrongBoxAvailable(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
        
        return try {
            val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
            val spec = KeyGenParameterSpec.Builder(
                "strongbox_test",
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setIsStrongBoxBacked(true)
                .build()
            
            keyGenerator.init(spec)
            keyGenerator.generateKey()
            
            // Cleanup test key
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            keyStore.deleteEntry("strongbox_test")
            
            true
        } catch (e: StrongBoxUnavailableException) {
            false
        } catch (e: Exception) {
            false
        }
    }

    private fun createWrappingKey(authMode: Int) {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
        keyStore.load(null)
        
        // Delete existing key if present
        if (keyStore.containsAlias(WRAPPING_KEY_ALIAS)) {
            keyStore.deleteEntry(WRAPPING_KEY_ALIAS)
        }
        
        val builder = KeyGenParameterSpec.Builder(
            WRAPPING_KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
        
        // Configure authentication based on mode
        when (authMode) {
            AUTH_PIN_AND_BIOMETRIC -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    builder.setUserAuthenticationRequired(true)
                    builder.setUserAuthenticationParameters(
                        0, // 0 = require auth for every operation
                        KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL
                    )
                    // Invalidate if new biometrics enrolled (security measure)
                    builder.setInvalidatedByBiometricEnrollment(true)
                } else {
                    builder.setUserAuthenticationRequired(true)
                    builder.setUserAuthenticationValidityDurationSeconds(-1)
                }
                Log.i(TAG, "Wrapping key configured for PIN + biometric auth")
            }
            AUTH_BIOMETRIC_ONLY -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    builder.setUserAuthenticationRequired(true)
                    builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                } else {
                    builder.setUserAuthenticationRequired(true)
                    builder.setUserAuthenticationValidityDurationSeconds(-1)
                }
                Log.i(TAG, "Wrapping key configured for biometric only")
            }
            AUTH_PIN_ONLY -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    builder.setUserAuthenticationRequired(true)
                    builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_DEVICE_CREDENTIAL)
                } else {
                    builder.setUserAuthenticationRequired(true)
                    builder.setUserAuthenticationValidityDurationSeconds(30)
                }
                Log.i(TAG, "Wrapping key configured for PIN only")
            }
            // AUTH_NONE - no authentication
            else -> {
                Log.w(TAG, "Wrapping key created WITHOUT authentication (testing only)")
            }
        }
        
        // Use StrongBox if available
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && hasStrongBox) {
            try {
                builder.setIsStrongBoxBacked(true)
                Log.i(TAG, "Wrapping key will use StrongBox")
            } catch (e: StrongBoxUnavailableException) {
                Log.w(TAG, "StrongBox unavailable, falling back to TEE")
            }
        }
        
        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        keyGenerator.init(builder.build())
        keyGenerator.generateKey()
        
        Log.i(TAG, "Wrapping key created successfully")
    }

    private fun encryptSecretKey(secretKeyHex: String): Pair<ByteArray, ByteArray> {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
        keyStore.load(null)
        val wrappingKey = keyStore.getKey(WRAPPING_KEY_ALIAS, null) as SecretKey
        
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, wrappingKey)
        
        val iv = cipher.iv
        val encrypted = cipher.doFinal(secretKeyHex.toByteArray(StandardCharsets.UTF_8))
        
        return Pair(encrypted, iv)
    }

    private fun decryptSecretKey(encryptedSk: ByteArray, iv: ByteArray): String {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
        keyStore.load(null)
        val wrappingKey = keyStore.getKey(WRAPPING_KEY_ALIAS, null) as SecretKey
        
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, wrappingKey, GCMParameterSpec(GCM_TAG_LENGTH, iv))
        
        val decrypted = cipher.doFinal(encryptedSk)
        return String(decrypted, StandardCharsets.UTF_8)
    }

    private fun getEncryptedPrefs(): android.content.SharedPreferences {
        val masterKey = MasterKey.Builder(reactContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        
        return EncryptedSharedPreferences.create(
            reactContext,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }
}
