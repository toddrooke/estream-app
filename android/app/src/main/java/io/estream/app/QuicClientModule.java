package io.estream.app;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableArray;

public class QuicClientModule extends ReactContextBaseJavaModule {
    static {
        System.loadLibrary("estream_quic_native");
    }

    public QuicClientModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "QuicClient";
    }

    @ReactMethod
    public void initialize(Promise promise) {
        try {
            long handle = nativeInitialize();
            promise.resolve((double) handle);
        } catch (Exception e) {
            promise.reject("INIT_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void connect(double handle, String nodeAddr, Promise promise) {
        try {
            nativeConnect((long) handle, nodeAddr);
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("CONNECT_ERROR", e.getMessage(), e);
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
        try {
            String publicKeysJson = nativeGenerateDeviceKeys(appScope);
            promise.resolve(publicKeysJson);
        } catch (Exception e) {
            promise.reject("KEYGEN_ERROR", e.getMessage(), e);
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
    private native long nativeInitialize();
    private native void nativeConnect(long handle, String nodeAddr);
    private native void nativeSendMessage(long handle, String nodeAddr, String messageJson);
    private native String nativeGenerateDeviceKeys(String appScope);
    private native void nativeDispose(long handle);
}

