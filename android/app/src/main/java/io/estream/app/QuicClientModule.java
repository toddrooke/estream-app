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
            // Load the main native library with QUIC + HTTP/3 support
            android.util.Log.i(TAG, "Loading native library estream_native...");
            System.loadLibrary("estream_native");
            android.util.Log.i(TAG, "Native library loaded successfully!");
        } catch (UnsatisfiedLinkError e) {
            // Fallback to older library name
            android.util.Log.w(TAG, "estream_native not found, trying estream_quic_native...");
            try {
                System.loadLibrary("estream_quic_native");
                android.util.Log.i(TAG, "Fallback library loaded (no HTTP/3)");
            } catch (Exception e2) {
                android.util.Log.e(TAG, "Failed to load any native library", e2);
                throw e2;
            }
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

    // ============================================================================
    // HTTP/3 Client Methods (UDP-based write operations)
    // ============================================================================

    @ReactMethod
    public void h3Connect(String serverAddr, Promise promise) {
        android.util.Log.i(TAG, "h3Connect() called with serverAddr=" + serverAddr);
        try {
            byte[] result = nativeH3Connect(serverAddr);
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            android.util.Log.i(TAG, "h3Connect() result: " + json);
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "h3Connect() failed: " + e.getMessage(), e);
            promise.reject("H3_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void h3Post(String path, String body, Promise promise) {
        android.util.Log.i(TAG, "h3Post() called with path=" + path);
        try {
            byte[] result = nativeH3Post(path, body);
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            android.util.Log.i(TAG, "h3Post() result: " + json.substring(0, Math.min(100, json.length())));
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "h3Post() failed: " + e.getMessage(), e);
            promise.reject("H3_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void h3Get(String path, Promise promise) {
        android.util.Log.i(TAG, "h3Get() called with path=" + path);
        try {
            byte[] result = nativeH3Get(path);
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "h3Get() failed: " + e.getMessage(), e);
            promise.reject("H3_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void h3IsConnected(Promise promise) {
        try {
            long connected = nativeH3IsConnected();
            promise.resolve(connected == 1);
        } catch (Exception e) {
            promise.reject("H3_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void h3Disconnect(Promise promise) {
        try {
            nativeH3Disconnect();
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("H3_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void h3MintIdentityNft(String owner, String trustLevel, Promise promise) {
        android.util.Log.i(TAG, "h3MintIdentityNft() called for owner=" + owner + " trustLevel=" + trustLevel);
        try {
            // Build the JSON body
            String body = "{\"owner\":\"" + owner + "\",\"trust_level\":\"" + trustLevel + 
                         "\",\"member_since\":\"Jan 2026\",\"activity_score\":100,\"anchor_count\":1}";
            
            // POST to /api/v1/nft/identity
            byte[] result = nativeH3Post("/api/v1/nft/identity", body);
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            android.util.Log.i(TAG, "h3MintIdentityNft() result: " + json.substring(0, Math.min(200, json.length())));
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "h3MintIdentityNft() failed: " + e.getMessage(), e);
            promise.reject("H3_ERROR", e.getMessage(), e);
        }
    }

    // ============================================================================
    // Native Estream Methods
    // ============================================================================

    @ReactMethod
    public void estreamCreate(String appId, double typeNum, String resource, String payloadBase64, Promise promise) {
        android.util.Log.i(TAG, "estreamCreate() called for app=" + appId + " type=" + typeNum);
        try {
            byte[] payload = android.util.Base64.decode(payloadBase64, android.util.Base64.DEFAULT);
            byte[] result = nativeEstreamCreate(appId, (long) typeNum, resource, payload);
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            android.util.Log.i(TAG, "estreamCreate() success: " + json.length() + " bytes");
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "estreamCreate() failed: " + e.getMessage(), e);
            promise.reject("ESTREAM_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void estreamSign(String estreamJson, double deviceKeysHandle, Promise promise) {
        android.util.Log.i(TAG, "estreamSign() called");
        try {
            byte[] estreamBytes = estreamJson.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            byte[] result = nativeEstreamSign(estreamBytes, (long) deviceKeysHandle);
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            android.util.Log.i(TAG, "estreamSign() success");
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "estreamSign() failed: " + e.getMessage(), e);
            promise.reject("ESTREAM_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void estreamVerify(String estreamJson, Promise promise) {
        android.util.Log.i(TAG, "estreamVerify() called");
        try {
            byte[] estreamBytes = estreamJson.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            long result = nativeEstreamVerify(estreamBytes);
            promise.resolve(result == 1);
        } catch (Exception e) {
            android.util.Log.e(TAG, "estreamVerify() failed: " + e.getMessage(), e);
            promise.reject("ESTREAM_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void estreamParse(String estreamJson, Promise promise) {
        android.util.Log.i(TAG, "estreamParse() called");
        try {
            byte[] estreamBytes = estreamJson.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            byte[] result = nativeEstreamParse(estreamBytes);
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "estreamParse() failed: " + e.getMessage(), e);
            promise.reject("ESTREAM_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void estreamToMsgpack(String estreamJson, Promise promise) {
        android.util.Log.i(TAG, "estreamToMsgpack() called");
        try {
            byte[] estreamBytes = estreamJson.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            byte[] msgpack = nativeEstreamToMsgpack(estreamBytes);
            String base64 = android.util.Base64.encodeToString(msgpack, android.util.Base64.NO_WRAP);
            android.util.Log.i(TAG, "estreamToMsgpack() success: " + msgpack.length + " bytes");
            promise.resolve(base64);
        } catch (Exception e) {
            android.util.Log.e(TAG, "estreamToMsgpack() failed: " + e.getMessage(), e);
            promise.reject("ESTREAM_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void estreamFromMsgpack(String msgpackBase64, Promise promise) {
        android.util.Log.i(TAG, "estreamFromMsgpack() called");
        try {
            byte[] msgpack = android.util.Base64.decode(msgpackBase64, android.util.Base64.DEFAULT);
            byte[] result = nativeEstreamFromMsgpack(msgpack);
            String json = new String(result, java.nio.charset.StandardCharsets.UTF_8);
            promise.resolve(json);
        } catch (Exception e) {
            android.util.Log.e(TAG, "estreamFromMsgpack() failed: " + e.getMessage(), e);
            promise.reject("ESTREAM_ERROR", e.getMessage(), e);
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

    // HTTP/3 native methods
    private native byte[] nativeH3Connect(String serverAddr);
    private native byte[] nativeH3Post(String path, String body);
    private native byte[] nativeH3Get(String path);
    private native long nativeH3IsConnected();
    private native void nativeH3Disconnect();

    // Estream native methods
    private native byte[] nativeEstreamCreate(String appId, long typeNum, String resource, byte[] payload);
    private native byte[] nativeEstreamSign(byte[] estreamJson, long deviceKeysHandle);
    private native long nativeEstreamVerify(byte[] estreamJson);
    private native byte[] nativeEstreamParse(byte[] estreamJson);
    private native byte[] nativeEstreamToMsgpack(byte[] estreamJson);
    private native byte[] nativeEstreamFromMsgpack(byte[] msgpack);
}

