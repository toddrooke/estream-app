package io.estream.app.spark

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import kotlin.math.*

/**
 * React Native module for Spark scanning
 * 
 * Provides native frame analysis and motion detection for Spark patterns.
 * This analyzes real camera frames for bright particle detection and orbital motion.
 */
@ReactModule(name = SparkScannerModule.NAME)
class SparkScannerModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "SparkScanner"
        
        // Shared state - accessible from frame processor
        @Volatile
        @JvmField
        var isScanning = false
        
        @Volatile
        private var frameHistory = mutableListOf<FrameData>()
        
        @Volatile
        @JvmField
        var startTime: Long = 0
        
        private const val MIN_FRAMES = 15
        private const val MAX_FRAMES = 100
        private const val MOTION_THRESHOLD = 0.03  // Very low for testing - accept any motion
        private const val MIN_MOTION_SAMPLES = 5
        
        // Called from frame processor
        @JvmStatic
        fun addFrame(particles: List<ParticleData>, brightness: Float) {
            if (!isScanning) return
            
            val timestamp = System.currentTimeMillis() - startTime
            
            synchronized(frameHistory) {
                if (frameHistory.size >= MAX_FRAMES) {
                    frameHistory.removeAt(0)
                }
                frameHistory.add(FrameData(timestamp, particles, brightness))
            }
        }
        
        @JvmStatic
        fun getProgress(): Double {
            if (startTime == 0L) return 0.0
            val elapsed = System.currentTimeMillis() - startTime
            return minOf(1.0, elapsed / 2500.0)
        }
        
        @JvmStatic
        fun getFrameCount(): Int = synchronized(frameHistory) { frameHistory.size }
        
        @JvmStatic
        fun getFramesCopy(): List<FrameData> = synchronized(frameHistory) { frameHistory.toList() }
        
        @JvmStatic
        fun clearFrames() = synchronized(frameHistory) { frameHistory.clear() }
    }
    
    data class FrameData(
        val timestamp: Long,
        val particles: List<ParticleData>,
        val brightness: Float
    )
    
    data class ParticleData(
        val x: Float,
        val y: Float,
        val brightness: Float
    )

    override fun getName(): String = NAME

    @ReactMethod
    fun startScanning(promise: Promise) {
        android.util.Log.i("SparkScanner", "startScanning() called")
        try {
            isScanning = true
            clearFrames()
            startTime = System.currentTimeMillis()
            
            android.util.Log.i("SparkScanner", "isScanning set to TRUE, startTime=$startTime")
            
            promise.resolve(WritableNativeMap().apply {
                putBoolean("success", true)
                putString("status", "scanning")
            })
        } catch (e: Exception) {
            android.util.Log.e("SparkScanner", "startScanning failed: ${e.message}")
            promise.reject("SPARK_ERROR", "Failed to start: ${e.message}")
        }
    }

    @ReactMethod
    fun stopScanning(promise: Promise) {
        try {
            isScanning = false
            val duration = System.currentTimeMillis() - startTime
            val frameCount = getFrameCount()
            
            val motionResult = analyzeMotion()
            val success = motionResult.confidence > MOTION_THRESHOLD && frameCount >= MIN_FRAMES
            
            promise.resolve(WritableNativeMap().apply {
                putBoolean("success", success)
                putBoolean("sparkDetected", success)
                putInt("framesAnalyzed", frameCount)
                putDouble("durationMs", duration.toDouble())
                putDouble("motionScore", motionResult.confidence)
                putString("direction", motionResult.direction)
            })
        } catch (e: Exception) {
            promise.reject("SPARK_ERROR", "Failed to stop: ${e.message}")
        }
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        val elapsed = if (startTime > 0) System.currentTimeMillis() - startTime else 0L
        val progress = if (startTime > 0) minOf(1.0, elapsed / 2500.0) else 0.0
        val frameCount = getFrameCount()
        
        // Quick motion check
        val motionResult = if (frameCount >= MIN_FRAMES) analyzeMotion() else MotionResult(0.0, "scanning")
        
        promise.resolve(WritableNativeMap().apply {
            putBoolean("isScanning", isScanning)
            putInt("frameCount", frameCount)
            putDouble("durationMs", elapsed.toDouble())
            putDouble("progress", progress)
            putDouble("motionScore", motionResult.confidence)
            putBoolean("motionDetected", motionResult.confidence > MOTION_THRESHOLD)
        })
    }

    @ReactMethod
    fun reset(promise: Promise) {
        isScanning = false
        clearFrames()
        startTime = 0
        promise.resolve(true)
    }

    private data class MotionResult(
        val confidence: Double,
        val direction: String
    )

    private fun analyzeMotion(): MotionResult {
        val frames = getFramesCopy()
        
        android.util.Log.d("SparkMotion", "Analyzing ${frames.size} frames")
        
        if (frames.size < MIN_FRAMES) {
            android.util.Log.d("SparkMotion", "Insufficient frames: ${frames.size} < $MIN_FRAMES")
            return MotionResult(0.0, "insufficient")
        }

        var cwVotes = 0
        var ccwVotes = 0
        var totalMotion = 0

        for (i in 1 until frames.size) {
            val prev = frames[i - 1]
            val curr = frames[i]

            // Match top particles
            for (currP in curr.particles.take(6)) {
                var minDist = Double.MAX_VALUE
                var bestPrev: ParticleData? = null

                for (prevP in prev.particles) {
                    val dx = currP.x - prevP.x
                    val dy = currP.y - prevP.y
                    val dist = sqrt((dx * dx + dy * dy).toDouble())

                    // Particles shouldn't move too far between frames
                    if (dist < minDist && dist < 0.12) {
                        minDist = dist
                        bestPrev = prevP
                    }
                }

                if (bestPrev != null) {
                    // Calculate angular motion around center
                    val cx = 0.5f
                    val cy = 0.5f

                    val prevAngle = atan2((bestPrev.y - cy).toDouble(), (bestPrev.x - cx).toDouble())
                    val currAngle = atan2((currP.y - cy).toDouble(), (currP.x - cx).toDouble())

                    var angleDelta = currAngle - prevAngle
                    
                    // Normalize angle
                    if (angleDelta > PI) angleDelta -= 2 * PI
                    if (angleDelta < -PI) angleDelta += 2 * PI

                    // Significant motion
                    if (abs(angleDelta) > 0.008) {
                        totalMotion++
                        if (angleDelta > 0) cwVotes++ else ccwVotes++
                    }
                }
            }
        }

        android.util.Log.d("SparkMotion", "Motion: cwVotes=$cwVotes, ccwVotes=$ccwVotes, total=$totalMotion")
        
        if (totalMotion < MIN_MOTION_SAMPLES) {
            android.util.Log.d("SparkMotion", "Insufficient motion samples: $totalMotion < $MIN_MOTION_SAMPLES")
            return MotionResult(0.0, "no_motion")
        }

        // Consistency = how much motion is in one direction vs mixed
        val consistency = abs(cwVotes - ccwVotes).toDouble() / totalMotion
        
        val direction = when {
            cwVotes > ccwVotes * 1.2 -> "cw"
            ccwVotes > cwVotes * 1.2 -> "ccw"
            else -> "mixed"
        }

        android.util.Log.d("SparkMotion", "Result: consistency=$consistency, direction=$direction, threshold=$MOTION_THRESHOLD")
        android.util.Log.d("SparkMotion", "Spark detected: ${consistency > MOTION_THRESHOLD}")

        return MotionResult(consistency, direction)
    }
}
