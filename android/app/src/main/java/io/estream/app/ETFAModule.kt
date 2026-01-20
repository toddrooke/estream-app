/**
 * ETFAModule.kt
 *
 * Android native module for Embedded Timing Fingerprint Authentication.
 * Collects device-specific timing fingerprints and submits to ETFA lattice.
 *
 * @package io.estream.app
 */

package io.estream.app

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.opengl.GLES20
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.random.Random

class ETFAModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "ETFAModule"
        private const val MODULE_NAME = "ETFAModule"
        
        // Events
        private const val EVENT_PROGRESS = "onETFAProgress"
        private const val EVENT_COMPLETE = "onETFAComplete"
        private const val EVENT_ERROR = "onETFAError"
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    
    // Pre-allocated buffers
    private val data1KB = ByteArray(1024) { it.toByte() }
    private val data64KB = ByteArray(65536) { it.toByte() }
    private val aesKey = ByteArray(32).also { SecureRandom().nextBytes(it) }
    private val memBuffer1M = ByteArray(1024 * 1024) { it.toByte() }
    private val memBuffer4M = ByteArray(4 * 1024 * 1024) { it.toByte() }
    private val randomIndices1M = (0 until 1024 * 1024).shuffled().toIntArray()
    
    @Volatile private var blackhole: Any? = null

    override fun getName(): String = MODULE_NAME

    // ==========================================================================
    // Public API
    // ==========================================================================

    /**
     * Collect a timing fingerprint with the specified number of samples.
     * Emits progress events during collection.
     */
    @ReactMethod
    fun collectFingerprint(sampleCount: Int, promise: Promise) {
        scope.launch {
            try {
                val fingerprint = generateFingerprint(sampleCount) { op, progress ->
                    sendProgressEvent(op, progress)
                }
                
                val result = Arguments.createMap().apply {
                    putString("id", fingerprint.id)
                    putInt("phase", fingerprint.phase)
                    putString("deviceModel", fingerprint.deviceModel)
                    putString("platform", "android")
                    putString("platformVersion", Build.VERSION.RELEASE)
                    putInt("sampleCount", sampleCount)
                    putDouble("timestamp", System.currentTimeMillis().toDouble())
                    
                    // Stable ratios
                    putDouble("r5_mem_seq_to_rand", fingerprint.r5)
                    putDouble("r6_mem_copy_to_seq", fingerprint.r6)
                    putDouble("r7_int_to_float", fingerprint.r7)
                    putDouble("r9_float_to_matrix", fingerprint.r9)
                    putDouble("r10_seq_4k_to_64k", fingerprint.r10)
                    putDouble("r11_seq_64k_to_1m", fingerprint.r11)
                    putDouble("r12_seq_1m_to_4m", fingerprint.r12)
                    putDouble("r13_rand_4k_to_64k", fingerprint.r13)
                    putDouble("r14_rand_64k_to_1m", fingerprint.r14)
                    putDouble("r18_int_mul_32_to_64", fingerprint.r18)
                    putDouble("r19_int_div_32_to_64", fingerprint.r19)
                    putDouble("r22_int_mul_to_div", fingerprint.r22)
                    putDouble("r24_add_chain_to_parallel", fingerprint.r24)
                    putDouble("r25_int_to_bitwise", fingerprint.r25)
                    putDouble("r28_gpu_vertex_to_fragment", fingerprint.r28)
                    putDouble("r29_gpu_compile_to_link", fingerprint.r29)
                    
                    // All ratios as array for hashing
                    val ratiosArray = Arguments.createArray()
                    fingerprint.stableRatios.forEach { ratiosArray.pushDouble(it) }
                    putArray("stableRatios", ratiosArray)
                    
                    // Device fingerprint hash
                    putString("fingerprintHash", fingerprint.hash)
                }
                
                promise.resolve(result)
                sendCompleteEvent(fingerprint.id)
                
            } catch (e: Exception) {
                Log.e(TAG, "Fingerprint collection failed: ${e.message}")
                sendErrorEvent(e.message ?: "Unknown error")
                promise.reject("ETFA_ERROR", e.message, e)
            }
        }
    }

    /**
     * Get device info without running full fingerprint collection.
     */
    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        val result = Arguments.createMap().apply {
            putString("platform", "android")
            putString("platformVersion", Build.VERSION.RELEASE)
            putString("deviceModel", "${Build.MANUFACTURER}_${Build.MODEL}_${Build.HARDWARE}")
            putString("deviceName", Build.MODEL)
            putBoolean("isEmulator", isEmulator())
        }
        promise.resolve(result)
    }

    /**
     * Check if ETFA is supported on this device.
     */
    @ReactMethod
    fun isSupported(promise: Promise) {
        // ETFA is supported on all Android devices with basic timing APIs
        promise.resolve(true)
    }

    // ==========================================================================
    // Fingerprint Generation
    // ==========================================================================

    private data class Fingerprint(
        val id: String,
        val phase: Int,
        val deviceModel: String,
        val r5: Double, val r6: Double, val r7: Double, val r9: Double,
        val r10: Double, val r11: Double, val r12: Double, val r13: Double, val r14: Double,
        val r18: Double, val r19: Double, val r22: Double, val r24: Double, val r25: Double,
        val r28: Double, val r29: Double,
        val stableRatios: List<Double>,
        val hash: String
    )

    private fun generateFingerprint(
        sampleCount: Int,
        onProgress: (String, Float) -> Unit
    ): Fingerprint {
        val totalOps = 25
        var completed = 0
        
        fun report(name: String) {
            completed++
            onProgress(name, completed.toFloat() / totalOps)
        }
        
        // GC before measurement
        System.gc()
        Thread.sleep(100)
        
        report("Warmup")
        
        // Phase 1: Memory operations
        val memSeq = measureMedian(sampleCount) { memSequential() }
        report("Memory Sequential")
        
        val memRand = measureMedian(sampleCount) { memRandom() }
        report("Memory Random")
        
        val memCopy = measureMedian(sampleCount) { memCopy() }
        report("Memory Copy")
        
        // Phase 1: Compute operations
        val intMult = measureMedian(sampleCount) { intMultiply() }
        report("Int Multiply")
        
        val floatMult = measureMedian(sampleCount) { floatMultiply() }
        report("Float Multiply")
        
        val vecDot = measureMedian(sampleCount) { vectorDot() }
        report("Vector Dot")
        
        val matrixOp = measureMedian(sampleCount) { matrixOp() }
        report("Matrix Op")
        
        // Phase 2: Memory hierarchy
        val seq4k = measureMedian(sampleCount) { memSequential4K() }
        report("Seq 4K")
        
        val seq64k = measureMedian(sampleCount) { memSequential64K() }
        report("Seq 64K")
        
        val seq4m = measureMedian(sampleCount) { memSequential4M() }
        report("Seq 4M")
        
        val rand4k = measureMedian(sampleCount) { memRandom4K() }
        report("Rand 4K")
        
        val rand64k = measureMedian(sampleCount) { memRandom64K() }
        report("Rand 64K")
        
        // Phase 3: Precision variants
        val intMul32 = measureMedian(sampleCount) { intMultiply32() }
        report("Int Mul 32")
        
        val intDiv32 = measureMedian(sampleCount) { intDivide32() }
        report("Int Div 32")
        
        val intDiv64 = measureMedian(sampleCount) { intDivide64() }
        report("Int Div 64")
        
        val addChain = measureMedian(sampleCount) { intAddChain() }
        report("Add Chain")
        
        val addParallel = measureMedian(sampleCount) { intAddParallel() }
        report("Add Parallel")
        
        val bitwise = measureMedian(sampleCount) { bitwiseOps() }
        report("Bitwise")
        
        // Phase 4: GPU (fewer samples - slower)
        val gpuVertex = measureMedian(minOf(sampleCount, 50)) { gpuShaderVertex() }
        report("GPU Vertex")
        
        val gpuFragment = measureMedian(minOf(sampleCount, 50)) { gpuShaderFragment() }
        report("GPU Fragment")
        
        val gpuLink = measureMedian(minOf(sampleCount, 50)) { gpuProgramLink() }
        report("GPU Link")
        
        // Compute ratios
        fun ratio(a: Long, b: Long) = if (b > 0) a.toDouble() / b else 0.0
        
        val r5 = ratio(memSeq, memRand)
        val r6 = ratio(memCopy, memSeq)
        val r7 = ratio(intMult, floatMult)
        val r9 = ratio(floatMult, matrixOp)
        val r10 = ratio(seq4k, seq64k)
        val r11 = ratio(seq64k, memSeq)
        val r12 = ratio(memSeq, seq4m)
        val r13 = ratio(rand4k, rand64k)
        val r14 = ratio(rand64k, memRand)
        val r18 = ratio(intMul32, intMult)
        val r19 = ratio(intDiv32, intDiv64)
        val r22 = ratio(intMult, intDiv64)
        val r24 = ratio(addChain, addParallel)
        val r25 = ratio(intMult, bitwise)
        val r28 = ratio(gpuVertex, gpuFragment)
        val r29 = ratio(gpuVertex, gpuLink)
        
        val stableRatios = listOf(r5, r6, r7, r9, r10, r11, r12, r13, r14, r18, r19, r22, r24, r25, r28, r29)
        
        // Create hash of stable ratios
        val hash = hashRatios(stableRatios)
        
        return Fingerprint(
            id = UUID.randomUUID().toString(),
            phase = 4,
            deviceModel = "${Build.MANUFACTURER}_${Build.MODEL}_${Build.HARDWARE}",
            r5 = r5, r6 = r6, r7 = r7, r9 = r9,
            r10 = r10, r11 = r11, r12 = r12, r13 = r13, r14 = r14,
            r18 = r18, r19 = r19, r22 = r22, r24 = r24, r25 = r25,
            r28 = r28, r29 = r29,
            stableRatios = stableRatios,
            hash = hash
        )
    }

    private fun hashRatios(ratios: List<Double>): String {
        val md = MessageDigest.getInstance("SHA-256")
        ratios.forEach { ratio ->
            // Quantize to 2 decimal places for stability
            val quantized = (ratio * 100).toLong()
            md.update(quantized.toString().toByteArray())
        }
        return md.digest().joinToString("") { "%02x".format(it) }.take(32)
    }

    // ==========================================================================
    // Timing Operations
    // ==========================================================================

    private inline fun measureMedian(samples: Int, op: () -> Long): Long {
        val results = LongArray(samples)
        repeat(samples) { i -> results[i] = op() }
        results.sort()
        return results[samples / 2]
    }

    private fun nowNanos(): Long = System.nanoTime()

    private fun memSequential(): Long {
        val start = nowNanos()
        var sum = 0L
        for (i in memBuffer1M.indices) sum += memBuffer1M[i]
        blackhole = sum
        return nowNanos() - start
    }

    private fun memRandom(): Long {
        val start = nowNanos()
        var sum = 0L
        for (i in randomIndices1M) sum += memBuffer1M[i and 0xFFFFF]
        blackhole = sum
        return nowNanos() - start
    }

    private fun memCopy(): Long {
        val dest = ByteArray(memBuffer1M.size)
        val start = nowNanos()
        System.arraycopy(memBuffer1M, 0, dest, 0, memBuffer1M.size)
        blackhole = dest[0]
        return nowNanos() - start
    }

    private fun memSequential4K(): Long {
        val start = nowNanos()
        var sum = 0L
        for (i in 0 until 4096) sum += memBuffer1M[i]
        blackhole = sum
        return nowNanos() - start
    }

    private fun memSequential64K(): Long {
        val start = nowNanos()
        var sum = 0L
        for (i in 0 until 65536) sum += memBuffer1M[i]
        blackhole = sum
        return nowNanos() - start
    }

    private fun memSequential4M(): Long {
        val start = nowNanos()
        var sum = 0L
        for (i in memBuffer4M.indices) sum += memBuffer4M[i]
        blackhole = sum
        return nowNanos() - start
    }

    private fun memRandom4K(): Long {
        val start = nowNanos()
        var sum = 0L
        for (i in 0 until 4096) sum += memBuffer1M[randomIndices1M[i] and 0xFFF]
        blackhole = sum
        return nowNanos() - start
    }

    private fun memRandom64K(): Long {
        val start = nowNanos()
        var sum = 0L
        for (i in 0 until 65536) sum += memBuffer1M[randomIndices1M[i] and 0xFFFF]
        blackhole = sum
        return nowNanos() - start
    }

    private fun intMultiply(): Long {
        val start = nowNanos()
        var result = 1L
        var multiplier = 7L
        repeat(1_000_000) {
            result = result * multiplier
            result = result and 0x7FFFFFFFFFFFFFFFL
            multiplier = (multiplier * 31 + 17) and 0x7FFFFFFF
        }
        blackhole = result
        return nowNanos() - start
    }

    private fun intMultiply32(): Long {
        val start = nowNanos()
        var result = 1
        var multiplier = 7
        repeat(1_000_000) {
            result = result * multiplier
            result = result and 0x7FFFFFFF
            multiplier = (multiplier * 31 + 17) and 0x7FFF
        }
        blackhole = result
        return nowNanos() - start
    }

    private fun intDivide32(): Long {
        val start = nowNanos()
        var result = Int.MAX_VALUE
        var divisor = 3
        repeat(500_000) {
            result = result / divisor
            if (result < 1000) result = Int.MAX_VALUE
            divisor = (divisor * 31 + 17) and 0x7FFF
            if (divisor < 2) divisor = 3
        }
        blackhole = result
        return nowNanos() - start
    }

    private fun intDivide64(): Long {
        val start = nowNanos()
        var result = Long.MAX_VALUE
        var divisor = 3L
        repeat(500_000) {
            result = result / divisor
            if (result < 1000) result = Long.MAX_VALUE
            divisor = (divisor * 31 + 17) and 0x7FFFFFFF
            if (divisor < 2) divisor = 3
        }
        blackhole = result
        return nowNanos() - start
    }

    private fun floatMultiply(): Long {
        val start = nowNanos()
        var result = 1.0
        val multiplier = 1.0000001
        repeat(1_000_000) {
            result *= multiplier
            if (result > 1e100) result = 1.0
        }
        blackhole = result
        return nowNanos() - start
    }

    private fun vectorDot(): Long {
        val a = FloatArray(65536) { (it % 100) / 100f }
        val b = FloatArray(65536) { ((it + 37) % 100) / 100f }
        val start = nowNanos()
        var result = 0f
        for (i in a.indices) result += a[i] * b[i]
        blackhole = result
        return nowNanos() - start
    }

    private fun matrixOp(): Long {
        val n = 128
        val a = FloatArray(n * n) { (it % 100) / 100f }
        val b = FloatArray(n * n) { ((it + 17) % 100) / 100f }
        val c = FloatArray(n * n)
        val start = nowNanos()
        for (i in 0 until n) {
            for (j in 0 until n) {
                var sum = 0f
                for (k in 0 until n) sum += a[i * n + k] * b[k * n + j]
                c[i * n + j] = sum
            }
        }
        blackhole = c
        return nowNanos() - start
    }

    private fun intAddChain(): Long {
        val start = nowNanos()
        var a = 1L; var b = 2L; var c = 3L; var d = 4L
        repeat(1_000_000) {
            a = a + b; b = b + c; c = c + d; d = d + a
        }
        blackhole = a + b + c + d
        return nowNanos() - start
    }

    private fun intAddParallel(): Long {
        val start = nowNanos()
        var a = 1L; var b = 2L; var c = 3L; var d = 4L
        val x = 5L; val y = 6L; val z = 7L; val w = 8L
        repeat(1_000_000) {
            a += x; b += y; c += z; d += w
        }
        blackhole = a + b + c + d
        return nowNanos() - start
    }

    private fun bitwiseOps(): Long {
        val start = nowNanos()
        var a = 0xDEADBEEFL
        var b = 0xCAFEBABEL
        repeat(1_000_000) {
            a = a xor b
            b = (b and 0xFFFF0000L) or (a and 0x0000FFFFL)
            a = (a shl 1) or (a shr 63)
        }
        blackhole = a xor b
        return nowNanos() - start
    }

    // GPU operations
    private var eglDisplay: EGLDisplay? = null
    private var eglContext: EGLContext? = null
    private var eglSurface: EGLSurface? = null

    private fun initEGL(): Boolean {
        try {
            eglDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
            if (eglDisplay == EGL14.EGL_NO_DISPLAY) return false
            
            val version = IntArray(2)
            if (!EGL14.eglInitialize(eglDisplay, version, 0, version, 1)) return false
            
            val configAttribs = intArrayOf(
                EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
                EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT,
                EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8,
                EGL14.EGL_NONE
            )
            val configs = arrayOfNulls<EGLConfig>(1)
            val numConfigs = IntArray(1)
            EGL14.eglChooseConfig(eglDisplay, configAttribs, 0, configs, 0, 1, numConfigs, 0)
            if (numConfigs[0] == 0) return false
            
            val contextAttribs = intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE)
            eglContext = EGL14.eglCreateContext(eglDisplay, configs[0], EGL14.EGL_NO_CONTEXT, contextAttribs, 0)
            
            val surfaceAttribs = intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE)
            eglSurface = EGL14.eglCreatePbufferSurface(eglDisplay, configs[0], surfaceAttribs, 0)
            
            EGL14.eglMakeCurrent(eglDisplay, eglSurface, eglSurface, eglContext)
            return true
        } catch (e: Exception) { return false }
    }

    private fun cleanupEGL() {
        try {
            eglDisplay?.let { display ->
                EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
                eglSurface?.let { EGL14.eglDestroySurface(display, it) }
                eglContext?.let { EGL14.eglDestroyContext(display, it) }
                EGL14.eglTerminate(display)
            }
        } catch (e: Exception) {}
        eglDisplay = null; eglContext = null; eglSurface = null
    }

    private fun gpuShaderVertex(): Long {
        if (!initEGL()) return 0L
        val code = "attribute vec4 p; void main() { gl_Position = p; }"
        val start = nowNanos()
        val shader = GLES20.glCreateShader(GLES20.GL_VERTEX_SHADER)
        GLES20.glShaderSource(shader, code)
        GLES20.glCompileShader(shader)
        val result = nowNanos() - start
        GLES20.glDeleteShader(shader)
        cleanupEGL()
        return result
    }

    private fun gpuShaderFragment(): Long {
        if (!initEGL()) return 0L
        val code = "precision mediump float; void main() { gl_FragColor = vec4(1.0); }"
        val start = nowNanos()
        val shader = GLES20.glCreateShader(GLES20.GL_FRAGMENT_SHADER)
        GLES20.glShaderSource(shader, code)
        GLES20.glCompileShader(shader)
        val result = nowNanos() - start
        GLES20.glDeleteShader(shader)
        cleanupEGL()
        return result
    }

    private fun gpuProgramLink(): Long {
        if (!initEGL()) return 0L
        val vs = GLES20.glCreateShader(GLES20.GL_VERTEX_SHADER)
        GLES20.glShaderSource(vs, "attribute vec4 p; void main() { gl_Position = p; }")
        GLES20.glCompileShader(vs)
        val fs = GLES20.glCreateShader(GLES20.GL_FRAGMENT_SHADER)
        GLES20.glShaderSource(fs, "precision mediump float; void main() { gl_FragColor = vec4(1.0); }")
        GLES20.glCompileShader(fs)
        
        val start = nowNanos()
        val program = GLES20.glCreateProgram()
        GLES20.glAttachShader(program, vs)
        GLES20.glAttachShader(program, fs)
        GLES20.glLinkProgram(program)
        val result = nowNanos() - start
        
        GLES20.glDeleteProgram(program)
        GLES20.glDeleteShader(vs)
        GLES20.glDeleteShader(fs)
        cleanupEGL()
        return result
    }

    // ==========================================================================
    // Helpers
    // ==========================================================================

    private fun isEmulator(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic")
            || Build.FINGERPRINT.startsWith("unknown")
            || Build.MODEL.contains("Emulator")
            || Build.MODEL.contains("Android SDK built for x86")
            || Build.MANUFACTURER.contains("Genymotion")
            || Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
    }

    // ==========================================================================
    // Event Emission
    // ==========================================================================

    private fun sendProgressEvent(operation: String, progress: Float) {
        val params = Arguments.createMap().apply {
            putString("operation", operation)
            putDouble("progress", progress.toDouble())
        }
        sendEvent(EVENT_PROGRESS, params)
    }

    private fun sendCompleteEvent(fingerprintId: String) {
        val params = Arguments.createMap().apply {
            putString("fingerprintId", fingerprintId)
        }
        sendEvent(EVENT_COMPLETE, params)
    }

    private fun sendErrorEvent(message: String) {
        val params = Arguments.createMap().apply {
            putString("message", message)
        }
        sendEvent(EVENT_ERROR, params)
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    override fun invalidate() {
        scope.cancel()
        super.invalidate()
    }
}
