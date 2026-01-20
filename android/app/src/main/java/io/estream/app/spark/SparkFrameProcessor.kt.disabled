package io.estream.app.spark

import android.graphics.ImageFormat
import android.media.Image
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import kotlin.math.sqrt

/**
 * Vision Camera Frame Processor for Spark Detection
 * 
 * Analyzes each camera frame for bright spots (particles) and
 * feeds the data to SparkScannerModule for motion analysis.
 */
class SparkFrameProcessor(proxy: VisionCameraProxy, options: Map<String, Any>?) : FrameProcessorPlugin() {
    
    companion object {
        private const val TAG = "SparkFrameProcessor"
        private const val BRIGHTNESS_THRESHOLD = 170
        private const val GRID_SIZE = 20
        private const val MAX_PARTICLES = 12
    }

    override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
        android.util.Log.d(TAG, "Frame callback called, isScanning=${SparkScannerModule.isScanning}")
        
        // Check if scanning is active
        if (!SparkScannerModule.isScanning) {
            return null
        }
        
        val width = frame.width
        val height = frame.height
        val image = frame.image
        
        android.util.Log.d(TAG, "Processing frame: ${width}x${height}")
        
        // Detect particles in frame
        val particles = detectParticles(image, width, height)
        val centerBrightness = getCenterBrightness(image, width, height)
        
        // Only log periodically to avoid spam
        if (SparkScannerModule.getFrameCount() % 30 == 0) {
            android.util.Log.d(TAG, "Detected ${particles.size} particles, brightness=$centerBrightness, frames=${SparkScannerModule.getFrameCount()}")
        }
        
        // Feed to scanner module
        SparkScannerModule.addFrame(particles, centerBrightness)
        
        // Return null - status is polled from SparkScannerModule instead
        // (VisionCamera JSI can't convert Float to jsi::Value)
        return null
    }
    
    private fun detectParticles(image: Image, width: Int, height: Int): List<SparkScannerModule.ParticleData> {
        val particles = mutableListOf<SparkScannerModule.ParticleData>()
        
        try {
            if (image.format != ImageFormat.YUV_420_888) {
                return particles
            }
            
            val yPlane = image.planes[0]
            val yBuffer = yPlane.buffer
            val yRowStride = yPlane.rowStride
            val yPixelStride = yPlane.pixelStride
            
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
                    
                    // Sample every 2nd pixel for speed
                    var y = startY
                    while (y < endY) {
                        var x = startX
                        while (x < endX) {
                            val yIndex = y * yRowStride + x * yPixelStride
                            if (yIndex < yBuffer.capacity()) {
                                val yValue = yBuffer.get(yIndex).toInt() and 0xFF
                                if (yValue > maxBrightness) {
                                    maxBrightness = yValue
                                    maxX = x
                                    maxY = y
                                }
                            }
                            x += 2
                        }
                        y += 2
                    }
                    
                    if (maxBrightness > BRIGHTNESS_THRESHOLD) {
                        particles.add(SparkScannerModule.ParticleData(
                            x = maxX.toFloat() / width,
                            y = maxY.toFloat() / height,
                            brightness = maxBrightness.toFloat() / 255f
                        ))
                    }
                }
            }
        } catch (e: Exception) {
            // Ignore frame processing errors
        }
        
        // Sort by brightness, take top particles
        return particles
            .sortedByDescending { it.brightness }
            .take(MAX_PARTICLES)
    }
    
    private fun getCenterBrightness(image: Image, width: Int, height: Int): Float {
        try {
            val yPlane = image.planes[0]
            val yBuffer = yPlane.buffer
            val yRowStride = yPlane.rowStride
            val yPixelStride = yPlane.pixelStride
            
            val cx = width / 2
            val cy = height / 2
            val radius = 15
            
            var total = 0
            var count = 0
            
            for (dy in -radius..radius step 2) {
                for (dx in -radius..radius step 2) {
                    val dist = sqrt((dx * dx + dy * dy).toDouble())
                    if (dist <= radius) {
                        val x = cx + dx
                        val y = cy + dy
                        if (x in 0 until width && y in 0 until height) {
                            val idx = y * yRowStride + x * yPixelStride
                            if (idx < yBuffer.capacity()) {
                                total += yBuffer.get(idx).toInt() and 0xFF
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
}
