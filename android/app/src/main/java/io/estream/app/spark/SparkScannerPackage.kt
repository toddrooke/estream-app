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
            // Register SparkFrameProcessor with VisionCamera
            if (!isRegistered) {
                FrameProcessorPluginRegistry.addFrameProcessorPlugin("scanSpark") { proxy, options ->
                    SparkFrameProcessor(proxy, options)
                }
                isRegistered = true
                android.util.Log.i("SparkScannerPackage", "SparkFrameProcessor registered as 'scanSpark'")
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
