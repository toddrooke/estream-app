package com.estreamapp.spark

import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.media.Image
import com.facebook.react.bridge.*
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import java.nio.ByteBuffer
import kotlin.math.*

/**
 * Native Spark Frame Processor
 * 
 * Analyzes camera frames for Spark patterns:
 * 1. Detects bright spots (particles)
 * 2. Tracks motion between frames
 * 3. Verifies orbital motion pattern
 */
class SparkFrameProcessor(proxy: VisionCameraProxy, options: Map<String, Any>?) : FrameProcessorPlugin() {
    
    companion object {
        private const val TAG = "SparkFrameProcessor"
        private const val PARTICLE_COUNT = 12
        private const val BRIGHTNESS_THRESHOLD = 180
        private const val GRID_SIZE = 30
        private const val MAX_FRAMES = 60
        private const val MIN_FRAMES_FOR_MOTION = 20
        private const val MOTION_THRESHOLD = 0.4
    }
    
    // Frame history for motion tracking
    private val frameHistory = mutableListOf<FrameAnalysis>()
    private var startTime: Long = 0
    private var isScanning = false
    
    data class Particle(
        val x: Float,  // Normalized 0-1
        val y: Float,
        val brightness: Float,
        val hue: Float
    )
    
    data class FrameAnalysis(
        val timestamp: Long,
        val particles: List<Particle>,
        val centerHue: Float,
        val centerBrightness: Float
    )
    
    override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
        val command = arguments?.get("command") as? String ?: "analyze"
        
        return when (command) {
            "start" -> {
                startScanning()
                mapOf("status" to "started")
            }
            "stop" -> {
                val result = stopScanning()
                result
            }
            "analyze" -> {
                if (isScanning) {
                    analyzeFrame(frame)
                } else {
                    mapOf("status" to "not_scanning")
                }
            }
            "reset" -> {
                reset()
                mapOf("status" to "reset")
            }
            else -> mapOf("error" to "Unknown command: $command")
        }
    }
    
    private fun startScanning() {
        frameHistory.clear()
        startTime = System.currentTimeMillis()
        isScanning = true
    }
    
    private fun stopScanning(): Map<String, Any> {
        isScanning = false
        
        if (frameHistory.size < MIN_FRAMES_FOR_MOTION) {
            return mapOf(
                "success" to false,
                "error" to "Insufficient frames: ${frameHistory.size}",
                "framesAnalyzed" to frameHistory.size
            )
        }
        
        val motionResult = analyzeMotion()
        val duration = System.currentTimeMillis() - startTime
        
        return mapOf(
            "success" to (motionResult.confidence > MOTION_THRESHOLD),
            "framesAnalyzed" to frameHistory.size,
            "durationMs" to duration,
            "motionScore" to motionResult.confidence,
            "direction" to motionResult.direction
        )
    }
    
    private fun reset() {
        frameHistory.clear()
        startTime = 0
        isScanning = false
    }
    
    private fun analyzeFrame(frame: Frame): Map<String, Any> {
        val timestamp = System.currentTimeMillis() - startTime
        
        // Get frame dimensions
        val width = frame.width
        val height = frame.height
        
        // Convert frame to analyzable format
        val analysis = try {
            processFrameData(frame, width, height, timestamp)
        } catch (e: Exception) {
            return mapOf(
                "error" to "Frame processing failed: ${e.message}",
                "timestamp" to timestamp
            )
        }
        
        // Store for motion tracking
        if (frameHistory.size >= MAX_FRAMES) {
            frameHistory.removeAt(0)
        }
        frameHistory.add(analysis)
        
        // Calculate progress
        val duration = System.currentTimeMillis() - startTime
        val progress = minOf(1.0, duration / 2500.0)
        
        // Check for early detection
        var motionDetected = false
        if (frameHistory.size >= MIN_FRAMES_FOR_MOTION) {
            val motionResult = analyzeMotion()
            motionDetected = motionResult.confidence > MOTION_THRESHOLD
        }
        
        return mapOf(
            "timestamp" to timestamp,
            "progress" to progress,
            "particleCount" to analysis.particles.size,
            "centerHue" to analysis.centerHue,
            "motionDetected" to motionDetected,
            "frameCount" to frameHistory.size
        )
    }
    
    private fun processFrameData(frame: Frame, width: Int, height: Int, timestamp: Long): FrameAnalysis {
        val particles = mutableListOf<Particle>()
        
        // Get image data - handle different formats
        val image = frame.image
        
        when (image.format) {
            ImageFormat.YUV_420_888 -> {
                val yPlane = image.planes[0]
                val yBuffer = yPlane.buffer
                val yRowStride = yPlane.rowStride
                val yPixelStride = yPlane.pixelStride
                
                // Grid-based bright spot detection
                val gridStepX = width / GRID_SIZE
                val gridStepY = height / GRID_SIZE
                
                for (gy in 0 until GRID_SIZE) {
                    for (gx in 0 until GRID_SIZE) {
                        val startX = gx * gridStepX
                        val startY = gy * gridStepY
                        val endX = minOf(startX + gridStepX, width)
                        val endY = minOf(startY + gridStepY, height)
                        
                        var maxBrightness = 0
                        var maxX = startX
                        var maxY = startY
                        
                        // Find brightest pixel in grid cell
                        for (y in startY until endY step 2) {
                            for (x in startX until endX step 2) {
                                val yIndex = y * yRowStride + x * yPixelStride
                                if (yIndex < yBuffer.capacity()) {
                                    val yValue = yBuffer.get(yIndex).toInt() and 0xFF
                                    if (yValue > maxBrightness) {
                                        maxBrightness = yValue
                                        maxX = x
                                        maxY = y
                                    }
                                }
                            }
                        }
                        
                        if (maxBrightness > BRIGHTNESS_THRESHOLD) {
                            particles.add(Particle(
                                x = maxX.toFloat() / width,
                                y = maxY.toFloat() / height,
                                brightness = maxBrightness.toFloat() / 255f,
                                hue = 0f  // Would need UV planes for color
                            ))
                        }
                    }
                }
            }
            else -> {
                // Fallback for other formats
            }
        }
        
        // Sort by brightness and take top particles
        val topParticles = particles
            .sortedByDescending { it.brightness }
            .take(PARTICLE_COUNT)
            .toList()
        
        // Extract center color info
        val centerBrightness = extractCenterBrightness(image, width, height)
        
        return FrameAnalysis(
            timestamp = timestamp,
            particles = topParticles,
            centerHue = 0f,  // Would need color conversion
            centerBrightness = centerBrightness
        )
    }
    
    private fun extractCenterBrightness(image: Image, width: Int, height: Int): Float {
        try {
            val yPlane = image.planes[0]
            val yBuffer = yPlane.buffer
            val yRowStride = yPlane.rowStride
            val yPixelStride = yPlane.pixelStride
            
            val centerX = width / 2
            val centerY = height / 2
            val sampleRadius = 20
            
            var total = 0
            var count = 0
            
            for (dy in -sampleRadius..sampleRadius) {
                for (dx in -sampleRadius..sampleRadius) {
                    val x = centerX + dx
                    val y = centerY + dy
                    
                    if (x in 0 until width && y in 0 until height) {
                        val dist = sqrt((dx * dx + dy * dy).toDouble())
                        if (dist <= sampleRadius) {
                            val yIndex = y * yRowStride + x * yPixelStride
                            if (yIndex < yBuffer.capacity()) {
                                total += yBuffer.get(yIndex).toInt() and 0xFF
                                count++
                            }
                        }
                    }
                }
            }
            
            return if (count > 0) total.toFloat() / count / 255f else 0f
        } catch (e: Exception) {
            return 0f
        }
    }
    
    data class MotionResult(
        val confidence: Double,
        val direction: String  // "cw", "ccw", or "mixed"
    )
    
    private fun analyzeMotion(): MotionResult {
        if (frameHistory.size < MIN_FRAMES_FOR_MOTION) {
            return MotionResult(0.0, "unknown")
        }
        
        var cwVotes = 0
        var ccwVotes = 0
        var totalMotion = 0
        
        // Compare consecutive frames
        for (i in 1 until frameHistory.size) {
            val prev = frameHistory[i - 1]
            val curr = frameHistory[i]
            
            // Match particles between frames
            for (currP in curr.particles.take(6)) {
                var minDist = Double.MAX_VALUE
                var bestPrev: Particle? = null
                
                for (prevP in prev.particles) {
                    val dx = currP.x - prevP.x
                    val dy = currP.y - prevP.y
                    val dist = sqrt((dx * dx + dy * dy).toDouble())
                    
                    if (dist < minDist && dist < 0.15) {
                        minDist = dist
                        bestPrev = prevP
                    }
                }
                
                if (bestPrev != null) {
                    // Check if motion is tangential (orbital)
                    val cx = 0.5f
                    val cy = 0.5f
                    
                    val prevAngle = atan2((bestPrev.y - cy).toDouble(), (bestPrev.x - cx).toDouble())
                    val currAngle = atan2((currP.y - cy).toDouble(), (currP.x - cx).toDouble())
                    
                    var angleDelta = currAngle - prevAngle
                    if (angleDelta > PI) angleDelta -= 2 * PI
                    if (angleDelta < -PI) angleDelta += 2 * PI
                    
                    if (abs(angleDelta) > 0.01) {
                        totalMotion++
                        if (angleDelta > 0) cwVotes++ else ccwVotes++
                    }
                }
            }
        }
        
        if (totalMotion < 10) {
            return MotionResult(0.0, "insufficient")
        }
        
        val consistency = abs(cwVotes - ccwVotes).toDouble() / totalMotion
        val direction = when {
            cwVotes > ccwVotes -> "cw"
            ccwVotes > cwVotes -> "ccw"
            else -> "mixed"
        }
        
        return MotionResult(consistency, direction)
    }
}
