package io.estream.app.spark

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

/**
 * React Native package for Spark scanning
 */
class SparkScannerPackage : ReactPackage {
    
    companion object {
        @Volatile
        private var isRegistered = false
        
        init {
            // Register the Spark frame processor with Vision Camera
            if (!isRegistered) {
                try {
                    FrameProcessorPluginRegistry.addFrameProcessorPlugin("scanSpark") { proxy, options ->
                        SparkFrameProcessor(proxy, options)
                    }
                    isRegistered = true
                } catch (e: Throwable) {
                    // Vision Camera not available, already registered, or other error
                    isRegistered = true // Prevent retry
                }
            }
        }
    }
    
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(SparkScannerModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
