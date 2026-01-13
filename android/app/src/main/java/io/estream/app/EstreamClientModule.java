package io.estream.app;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import android.util.Base64;

/**
 * eStream Client Module
 * 
 * Provides access to network, governance, and Spark authentication
 * via the estream-client native library.
 */
public class EstreamClientModule extends ReactContextBaseJavaModule {
    private static final String TAG = "EstreamClientModule";

    public EstreamClientModule(ReactApplicationContext reactContext) {
        super(reactContext);
        android.util.Log.i(TAG, "EstreamClientModule created");
    }

    @Override
    public String getName() {
        return "EstreamClientModule";
    }

    // =========================================================================
    // Network
    // =========================================================================

    @ReactMethod
    public void getNetworkInfo(String consoleUrl, Promise promise) {
        android.util.Log.i(TAG, "getNetworkInfo() called with consoleUrl=" + consoleUrl);
        try {
            byte[] result = nativeGetNetworkInfo(consoleUrl);
            if (result == null) {
                promise.reject("NETWORK_ERROR", "Failed to get network info");
                return;
            }
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "getNetworkInfo() failed: " + e.getMessage(), e);
            promise.reject("NETWORK_ERROR", e.getMessage(), e);
        }
    }

    // =========================================================================
    // Governance
    // =========================================================================

    @ReactMethod
    public void getPendingApprovals(String consoleUrl, Promise promise) {
        android.util.Log.i(TAG, "getPendingApprovals() called with consoleUrl=" + consoleUrl);
        try {
            byte[] result = nativeGetPendingApprovals(consoleUrl);
            if (result == null) {
                promise.reject("GOVERNANCE_ERROR", "Failed to get pending approvals");
                return;
            }
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "getPendingApprovals() failed: " + e.getMessage(), e);
            promise.reject("GOVERNANCE_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void submitApproval(String consoleUrl, String requestId, String secretKeyHex, boolean approve, Promise promise) {
        android.util.Log.i(TAG, "submitApproval() called for request=" + requestId);
        try {
            byte[] result = nativeSubmitApproval(consoleUrl, requestId, secretKeyHex, approve);
            if (result == null) {
                promise.reject("GOVERNANCE_ERROR", "Failed to submit approval");
                return;
            }
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "submitApproval() failed: " + e.getMessage(), e);
            promise.reject("GOVERNANCE_ERROR", e.getMessage(), e);
        }
    }

    // =========================================================================
    // Identity
    // =========================================================================

    @ReactMethod
    public void createIdentity(String consoleUrl, String displayName, String pubkeyHashHex, Promise promise) {
        android.util.Log.i(TAG, "createIdentity() called for displayName=" + displayName);
        try {
            byte[] result = nativeCreateIdentity(consoleUrl, displayName, pubkeyHashHex);
            if (result == null) {
                promise.reject("IDENTITY_ERROR", "Failed to create identity");
                return;
            }
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "createIdentity() failed: " + e.getMessage(), e);
            promise.reject("IDENTITY_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void syncIdentity(String consoleUrl, String identityId, Promise promise) {
        android.util.Log.i(TAG, "syncIdentity() called for identity=" + identityId);
        try {
            byte[] result = nativeSyncIdentity(consoleUrl, identityId);
            if (result == null) {
                promise.reject("IDENTITY_ERROR", "Failed to sync identity");
                return;
            }
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "syncIdentity() failed: " + e.getMessage(), e);
            promise.reject("IDENTITY_ERROR", e.getMessage(), e);
        }
    }

    // =========================================================================
    // Spark Visual Authentication
    // =========================================================================

    @ReactMethod
    public void startSparkChallenge(String consoleUrl, String identityId, Promise promise) {
        android.util.Log.i(TAG, "startSparkChallenge() called for identity=" + identityId);
        try {
            byte[] result = nativeStartSparkChallenge(consoleUrl, identityId);
            if (result == null) {
                promise.reject("SPARK_ERROR", "Failed to start Spark challenge");
                return;
            }
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "startSparkChallenge() failed: " + e.getMessage(), e);
            promise.reject("SPARK_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void submitSparkMotion(String consoleUrl, String challengeId, String motionDataJson, Promise promise) {
        android.util.Log.i(TAG, "submitSparkMotion() called for challenge=" + challengeId);
        try {
            byte[] result = nativeSubmitSparkMotion(consoleUrl, challengeId, motionDataJson);
            if (result == null) {
                promise.reject("SPARK_ERROR", "Failed to submit Spark motion");
                return;
            }
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "submitSparkMotion() failed: " + e.getMessage(), e);
            promise.reject("SPARK_ERROR", e.getMessage(), e);
        }
    }

    // =========================================================================
    // Native Methods (JNI)
    // =========================================================================

    private static native byte[] nativeGetNetworkInfo(String consoleUrl);
    private static native byte[] nativeGetPendingApprovals(String consoleUrl);
    private static native byte[] nativeSubmitApproval(String consoleUrl, String requestId, String secretKeyHex, boolean approve);
    private static native byte[] nativeStartSparkChallenge(String consoleUrl, String identityId);
    private static native byte[] nativeSubmitSparkMotion(String consoleUrl, String challengeId, String motionDataJson);
    private static native byte[] nativeCreateIdentity(String consoleUrl, String displayName, String pubkeyHashHex);
    private static native byte[] nativeSyncIdentity(String consoleUrl, String identityId);

    // Load native library
    static {
        try {
            System.loadLibrary("estream_mobile_core");
            android.util.Log.i("EstreamClientModule", "Loaded libestream_mobile_core.so");
        } catch (UnsatisfiedLinkError e) {
            android.util.Log.e("EstreamClientModule", "Failed to load native library: " + e.getMessage());
        }
    }
}
