package io.estream.app

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.net.InetAddress
import java.net.NetworkInterface

/**
 * Native HTTP server for receiving signing requests from CLI.
 * Uses NanoHTTPD for a lightweight embedded server.
 * 
 * eStream Signing Protocol v1.0
 */
class SigningServerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "estream.SigningServer"
        private const val PORT = 8765
        private const val VERSION = "0.3.0"
    }
    
    init {
        Log.i(TAG, "╔══════════════════════════════════════════════════════╗")
        Log.i(TAG, "║  eStream SigningServer Module Initialized            ║")
        Log.i(TAG, "║  Version: $VERSION                                       ║")
        Log.i(TAG, "║  Port: $PORT                                           ║")
        Log.i(TAG, "╚══════════════════════════════════════════════════════╝")
        logNetworkInfo()
    }
    
    private fun logNetworkInfo() {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            Log.d(TAG, "Network interfaces:")
            while (interfaces.hasMoreElements()) {
                val ni = interfaces.nextElement()
                val addresses = ni.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (!addr.isLoopbackAddress && addr.hostAddress?.contains(":") == false) {
                        Log.d(TAG, "  ${ni.displayName}: ${addr.hostAddress}")
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not enumerate network interfaces: ${e.message}")
        }
    }

    private var server: SigningHttpServer? = null
    private val pendingRequests = ConcurrentHashMap<String, JSONObject>()
    private val completedSignatures = ConcurrentHashMap<String, JSONObject>()
    private val rejectedRequests = ConcurrentHashMap<String, String>()

    override fun getName(): String = "SigningServerModule"

    /**
     * Start the HTTP server
     */
    @ReactMethod
    fun start(promise: Promise) {
        Log.i(TAG, "┌─────────────────────────────────────────────────────")
        Log.i(TAG, "│ START REQUEST RECEIVED")
        Log.i(TAG, "│ Current server state: ${if (server != null) "RUNNING" else "STOPPED"}")
        Log.i(TAG, "└─────────────────────────────────────────────────────")
        
        try {
            if (server != null) {
                Log.i(TAG, "Server already running, returning true")
                promise.resolve(true)
                return
            }

            Log.i(TAG, "Creating new SigningHttpServer on port $PORT...")
            server = SigningHttpServer()
            
            Log.i(TAG, "Starting server...")
            server?.start()
            
            Log.i(TAG, "╔═══════════════════════════════════════════════════════╗")
            Log.i(TAG, "║  eStream SigningServer STARTED                        ║")
            Log.i(TAG, "║  Port: $PORT                                           ║")
            Log.i(TAG, "║  Status: ${if (server?.isAlive == true) "ALIVE" else "NOT ALIVE"}")
            Log.i(TAG, "╚═══════════════════════════════════════════════════════╝")
            
            logNetworkInfo()
            
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "╔═══════════════════════════════════════════════════════╗")
            Log.e(TAG, "║  eStream SigningServer FAILED TO START                ║")
            Log.e(TAG, "║  Error: ${e.message}")
            Log.e(TAG, "╚═══════════════════════════════════════════════════════╝")
            e.printStackTrace()
            promise.reject("START_ERROR", e.message, e)
        }
    }

    /**
     * Stop the HTTP server
     */
    @ReactMethod
    fun stop(promise: Promise) {
        try {
            server?.stop()
            server = null
            Log.i(TAG, "Signing server stopped")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    /**
     * Check if server is running
     */
    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(server?.isAlive == true)
    }

    /**
     * Get pending requests (called from JS)
     */
    @ReactMethod
    fun getPendingRequests(promise: Promise) {
        val array = Arguments.createArray()
        pendingRequests.values.forEach { request ->
            array.pushString(request.toString())
        }
        promise.resolve(array)
    }

    /**
     * Mark a request as signed (called from JS after user approves)
     */
    @ReactMethod
    fun markSigned(
        requestId: String,
        signatureB58: String,
        keyHashB58: String,
        promise: Promise
    ) {
        try {
            val result = JSONObject().apply {
                put("requestId", requestId)
                put("status", "signed")
                put("signature", signatureB58)
                put("signerKeyHash", keyHashB58)
                put("algorithm", "ML-DSA-87")
                put("timestamp", System.currentTimeMillis())
            }
            completedSignatures[requestId] = result
            pendingRequests.remove(requestId)
            Log.i(TAG, "Request $requestId marked as signed")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SIGN_ERROR", e.message, e)
        }
    }

    /**
     * Mark a request as rejected (called from JS after user rejects)
     */
    @ReactMethod
    fun markRejected(requestId: String, reason: String, promise: Promise) {
        rejectedRequests[requestId] = reason
        pendingRequests.remove(requestId)
        Log.i(TAG, "Request $requestId marked as rejected: $reason")
        promise.resolve(true)
    }

    /**
     * Send event to JS layer
     */
    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Embedded HTTP server using NanoHTTPD
     */
    inner class SigningHttpServer : NanoHTTPD(PORT) {

        override fun serve(session: IHTTPSession): Response {
            val uri = session.uri
            val method = session.method

            Log.d(TAG, "Request: $method $uri")

            return try {
                when {
                    uri == "/health" && method == Method.GET -> handleHealth()
                    uri == "/sign" && method == Method.POST -> handleSign(session)
                    uri.startsWith("/status/") && method == Method.GET -> handleStatus(uri)
                    else -> newFixedLengthResponse(
                        Response.Status.NOT_FOUND,
                        "application/json",
                        """{"error": "Not found"}"""
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error handling request", e)
                newFixedLengthResponse(
                    Response.Status.INTERNAL_ERROR,
                    "application/json",
                    """{"error": "${e.message}"}"""
                )
            }
        }

        private fun handleHealth(): Response {
            val response = JSONObject().apply {
                put("status", "ok")
                put("version", "0.3.0")
                put("keyHash", null as String?) // Will be filled by JS
                put("trustLevel", "HardwareBacked")
                put("pendingRequests", pendingRequests.size)
            }
            return jsonResponse(response)
        }

        private fun handleSign(session: IHTTPSession): Response {
            // Read body
            val bodyMap = HashMap<String, String>()
            session.parseBody(bodyMap)
            val body = bodyMap["postData"] ?: session.queryParameterString ?: "{}"
            
            val request = JSONObject(body)
            val requestId = request.optString("id", "unknown")

            // Store pending request
            pendingRequests[requestId] = request

            // Notify JS layer
            val params = Arguments.createMap().apply {
                putString("requestId", requestId)
                putString("operation", request.optString("operation"))
                putString("description", request.optString("description"))
                putString("payload", request.optString("payload"))
            }
            sendEvent("onSigningRequest", params)

            val response = JSONObject().apply {
                put("success", true)
                put("requestId", requestId)
                put("message", "Request added. Waiting for user approval.")
            }
            return jsonResponse(response)
        }

        private fun handleStatus(uri: String): Response {
            val requestId = uri.removePrefix("/status/")

            // Check if signed
            completedSignatures[requestId]?.let { sig ->
                return jsonResponse(sig)
            }

            // Check if rejected
            rejectedRequests[requestId]?.let { reason ->
                val response = JSONObject().apply {
                    put("requestId", requestId)
                    put("status", "rejected")
                    put("reason", reason)
                }
                return jsonResponse(response)
            }

            // Check if pending
            if (pendingRequests.containsKey(requestId)) {
                val response = JSONObject().apply {
                    put("requestId", requestId)
                    put("status", "pending")
                }
                return jsonResponse(response)
            }

            // Not found
            val response = JSONObject().apply {
                put("requestId", requestId)
                put("status", "not_found")
            }
            return jsonResponse(response)
        }

        private fun jsonResponse(json: JSONObject): Response {
            return newFixedLengthResponse(
                Response.Status.OK,
                "application/json",
                json.toString()
            ).apply {
                addHeader("Access-Control-Allow-Origin", "*")
            }
        }
    }
}
