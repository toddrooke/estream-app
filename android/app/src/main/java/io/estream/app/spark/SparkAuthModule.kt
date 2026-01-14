package io.estream.app.spark

import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

/**
 * SparkAuthModule - React Native bridge for Rust Spark authentication
 * 
 * Uses native Rust estream_spark crate for:
 * - Frame rendering (same as Console WASM)
 * - Challenge signing (ML-DSA-87)
 * - Challenge validation
 */
class SparkAuthModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "SparkAuthModule"
        
        init {
            try {
                System.loadLibrary("estream_native")
                Log.i(TAG, "estream_native library loaded")
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Failed to load estream_native: ${e.message}")
            }
        }
    }
    
    override fun getName(): String = "SparkAuthModule"
    
    /**
     * Render a Spark animation frame
     * 
     * @param challengeJson JSON-serialized SparkChallenge
     * @param variant Visual variant (kaleidoscope, orbital, hex, ember)
     * @param size Canvas size in pixels
     * @param timeMs Current time in milliseconds
     * @param promise Resolves with JSON containing base64 pixel data
     */
    @ReactMethod
    fun renderSparkFrame(
        challengeJson: String,
        variant: String,
        size: Int,
        timeMs: Double,
        promise: Promise
    ) {
        try {
            val result = nativeRenderSparkFrame(challengeJson, variant, size, timeMs.toLong())
            if (result != null) {
                promise.resolve(result)
            } else {
                promise.reject("RENDER_ERROR", "Failed to render frame")
            }
        } catch (e: Exception) {
            Log.e(TAG, "renderSparkFrame error: ${e.message}")
            promise.reject("RENDER_ERROR", e.message, e)
        }
    }
    
    /**
     * Get Spark code from challenge
     */
    @ReactMethod
    fun getSparkCode(challengeJson: String, promise: Promise) {
        try {
            val code = nativeGetSparkCode(challengeJson)
            promise.resolve(code)
        } catch (e: Exception) {
            Log.e(TAG, "getSparkCode error: ${e.message}")
            promise.reject("CODE_ERROR", e.message, e)
        }
    }
    
    /**
     * Check if challenge is expired
     */
    @ReactMethod
    fun isChallengeExpired(challengeJson: String, promise: Promise) {
        try {
            val expired = nativeIsChallengeExpired(challengeJson)
            promise.resolve(expired)
        } catch (e: Exception) {
            Log.e(TAG, "isChallengeExpired error: ${e.message}")
            promise.reject("EXPIRED_ERROR", e.message, e)
        }
    }
    
    /**
     * Sign a Spark challenge with device keys
     */
    @ReactMethod
    fun signChallenge(challengeJson: String, appScope: String, promise: Promise) {
        try {
            val result = nativeSignSparkChallenge(challengeJson, appScope)
            if (result != null) {
                promise.resolve(String(result))
            } else {
                promise.reject("SIGN_ERROR", "Failed to sign challenge")
            }
        } catch (e: Exception) {
            Log.e(TAG, "signChallenge error: ${e.message}")
            promise.reject("SIGN_ERROR", e.message, e)
        }
    }
    
    // Native method declarations (implemented in Rust via JNI)
    private external fun nativeRenderSparkFrame(
        challengeJson: String,
        variant: String,
        size: Int,
        timeMs: Long
    ): String?
    
    private external fun nativeGetSparkCode(challengeJson: String): String?
    
    private external fun nativeIsChallengeExpired(challengeJson: String): Boolean
    
    private external fun nativeSignSparkChallenge(
        challengeJson: String,
        appScope: String
    ): ByteArray?
}
