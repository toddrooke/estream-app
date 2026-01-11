package com.estreamapp.spark

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

/**
 * React Native module for Spark scanning
 * 
 * Provides control over the native frame processor and motion detection.
 */
@ReactModule(name = SparkScannerModule.NAME)
class SparkScannerModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "SparkScanner"
        
        // Shared state for frame processor
        @Volatile
        var isScanning = false
        
        @Volatile
        var frameHistory = mutableListOf<FrameData>()
        
        @Volatile
        var startTime: Long = 0
        
        private const val MIN_FRAMES = 30
        private const val MOTION_THRESHOLD = 0.4
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
        try {
            isScanning = true
            frameHistory.clear()
            startTime = System.currentTimeMillis()
            
            promise.resolve(WritableNativeMap().apply {
                putBoolean("success", true)
                putString("status", "scanning")
            })
        } catch (e: Exception) {
            promise.reject("SPARK_ERROR", "Failed to start scanning: ${e.message}")
        }
    }

    @ReactMethod
    fun stopScanning(promise: Promise) {
        try {
            isScanning = false
            val duration = System.currentTimeMillis() - startTime
            val frameCount = frameHistory.size
            
            // Analyze motion
            val motionResult = analyzeCollectedMotion()
            
            promise.resolve(WritableNativeMap().apply {
                putBoolean("success", motionResult.confidence > MOTION_THRESHOLD)
                putInt("framesAnalyzed", frameCount)
                putDouble("durationMs", duration.toDouble())
                putDouble("motionScore", motionResult.confidence)
                putString("direction", motionResult.direction)
                putBoolean("sparkDetected", motionResult.confidence > MOTION_THRESHOLD)
            })
        } catch (e: Exception) {
            promise.reject("SPARK_ERROR", "Failed to stop scanning: ${e.message}")
        }
    }

    @ReactMethod
    fun reset(promise: Promise) {
        isScanning = false
        frameHistory.clear()
        startTime = 0
        promise.resolve(true)
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        promise.resolve(WritableNativeMap().apply {
            putBoolean("isScanning", isScanning)
            putInt("frameCount", frameHistory.size)
            putDouble("durationMs", if (startTime > 0) (System.currentTimeMillis() - startTime).toDouble() else 0.0)
        })
    }

    private data class MotionResult(
        val confidence: Double,
        val direction: String
    )

    private fun analyzeCollectedMotion(): MotionResult {
        if (frameHistory.size < MIN_FRAMES) {
            return MotionResult(0.0, "insufficient")
        }

        var cwVotes = 0
        var ccwVotes = 0
        var totalMotion = 0

        for (i in 1 until frameHistory.size) {
            val prev = frameHistory[i - 1]
            val curr = frameHistory[i]

            for (currP in curr.particles.take(6)) {
                var minDist = Double.MAX_VALUE
                var bestPrev: ParticleData? = null

                for (prevP in prev.particles) {
                    val dx = currP.x - prevP.x
                    val dy = currP.y - prevP.y
                    val dist = kotlin.math.sqrt((dx * dx + dy * dy).toDouble())

                    if (dist < minDist && dist < 0.15) {
                        minDist = dist
                        bestPrev = prevP
                    }
                }

                if (bestPrev != null) {
                    val cx = 0.5f
                    val cy = 0.5f

                    val prevAngle = kotlin.math.atan2((bestPrev.y - cy).toDouble(), (bestPrev.x - cx).toDouble())
                    val currAngle = kotlin.math.atan2((currP.y - cy).toDouble(), (currP.x - cx).toDouble())

                    var angleDelta = currAngle - prevAngle
                    if (angleDelta > kotlin.math.PI) angleDelta -= 2 * kotlin.math.PI
                    if (angleDelta < -kotlin.math.PI) angleDelta += 2 * kotlin.math.PI

                    if (kotlin.math.abs(angleDelta) > 0.01) {
                        totalMotion++
                        if (angleDelta > 0) cwVotes++ else ccwVotes++
                    }
                }
            }
        }

        if (totalMotion < 10) {
            return MotionResult(0.0, "insufficient")
        }

        val consistency = kotlin.math.abs(cwVotes - ccwVotes).toDouble() / totalMotion
        val direction = when {
            cwVotes > ccwVotes -> "cw"
            ccwVotes > cwVotes -> "ccw"
            else -> "mixed"
        }

        return MotionResult(consistency, direction)
    }
}
