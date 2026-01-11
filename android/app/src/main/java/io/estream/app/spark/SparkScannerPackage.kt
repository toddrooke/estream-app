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
        init {
            // Register the Spark frame processor with Vision Camera
            try {
                FrameProcessorPluginRegistry.addFrameProcessorPlugin("scanSpark") { proxy, options ->
                    SparkFrameProcessor(proxy, options)
                }
            } catch (e: Exception) {
                // Vision Camera not available or already registered
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
