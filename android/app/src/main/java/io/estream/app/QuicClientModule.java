package io.estream.app;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableArray;

public class QuicClientModule extends ReactContextBaseJavaModule {
    private static final String TAG = "QuicClientModule";

    static {
        try {
            android.util.Log.i(TAG, "Loading native library estream_quic_native...");
            System.loadLibrary("estream_quic_native");
            android.util.Log.i(TAG, "Native library loaded successfully!");
        } catch (Exception e) {
            android.util.Log.e(TAG, "Failed to load native library", e);
            throw e;
        }
    }

    public QuicClientModule(ReactApplicationContext reactContext) {
        super(reactContext);
        android.util.Log.i(TAG, "QuicClientModule created");
    }

    @Override
    public String getName() {
        return "QuicClient";
    }

    @ReactMethod
    public void initialize(Promise promise) {
        android.util.Log.i(TAG, "initialize() called from JavaScript");
        try {
            android.util.Log.i(TAG, "Calling nativeInitialize()...");
            long handle = nativeInitialize();
            android.util.Log.i(TAG, "nativeInitialize() returned handle: " + handle);
            promise.resolve((double) handle);
        } catch (Exception e) {
            android.util.Log.e(TAG, "initialize() failed: " + e.getMessage(), e);
            promise.reject("INIT_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void connect(double handle, String nodeAddr, Promise promise) {
        android.util.Log.i(TAG, "connect() called with handle=" + handle + " nodeAddr=" + nodeAddr);
        try {
            // Validate parameters before calling native code
            // Note: handle 0 is valid (Rust uses 0-based indexing)
            if (handle < 0) {
                promise.reject("CONNECT_ERROR", "Invalid handle: " + handle);
                return;
            }
            if (nodeAddr == null || nodeAddr.isEmpty()) {
                promise.reject("CONNECT_ERROR", "Invalid nodeAddr: null or empty");
                return;
            }
            android.util.Log.i(TAG, "Calling nativeConnect()...");
            nativeConnect((long) handle, nodeAddr);
            android.util.Log.i(TAG, "nativeConnect() returned successfully");
            promise.resolve(null);
        } catch (Exception e) {
            android.util.Log.e(TAG, "connect() failed: " + e.getMessage(), e);
            promise.reject("CONNECT_ERROR", e.getMessage(), e);
        } catch (Error e) {
            android.util.Log.e(TAG, "connect() crashed: " + e.getMessage(), e);
            promise.reject("CONNECT_CRASH", "Native crash: " + e.getMessage());
        }
    }

    @ReactMethod
    public void sendMessage(double handle, String nodeAddr, String messageJson, Promise promise) {
        try {
            nativeSendMessage((long) handle, nodeAddr, messageJson);
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("SEND_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void generateDeviceKeys(String appScope, Promise promise) {
        android.util.Log.i(TAG, "generateDeviceKeys() called with appScope=" + appScope);
        try {
            // Native returns byte[] (the JNI function returns jbyteArray)
            // Convert to String (JSON) for JavaScript
            byte[] publicKeysBytes = nativeGenerateDeviceKeys(appScope);
            String publicKeysJson = new String(publicKeysBytes, java.nio.charset.StandardCharsets.UTF_8);
            android.util.Log.i(TAG, "generateDeviceKeys() returned " + publicKeysJson.length() + " chars");
            promise.resolve(publicKeysJson);
        } catch (Exception e) {
            android.util.Log.e(TAG, "generateDeviceKeys() failed: " + e.getMessage(), e);
            promise.reject("KEYGEN_ERROR", e.getMessage(), e);
        } catch (Error e) {
            android.util.Log.e(TAG, "generateDeviceKeys() crashed: " + e.getMessage(), e);
            promise.reject("KEYGEN_CRASH", "Native crash: " + e.getMessage());
        }
    }

    @ReactMethod
    public void dispose(double handle) {
        try {
            nativeDispose((long) handle);
        } catch (Exception e) {
            // Log but don't throw
            android.util.Log.e("QuicClient", "Dispose error: " + e.getMessage());
        }
    }

    // Native methods
    // NOTE: These signatures MUST match the JNI function signatures in the Rust code
    // The Rust code returns jbyteArray (byte[]), not jstring (String)
    private native long nativeInitialize();
    private native void nativeConnect(long handle, String nodeAddr);
    private native void nativeSendMessage(long handle, String nodeAddr, String messageJson);
    private native byte[] nativeGenerateDeviceKeys(String appScope);  // Returns byte[], not String!
    private native void nativeDispose(long handle);
}

