package io.estream.app.spark

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
// VisionCamera frame processor disabled - requires react-native-vision-camera
// import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

/**
 * React Native package for Spark scanning
 */
class SparkScannerPackage : ReactPackage {
    
    companion object {
        @Volatile
        private var isRegistered = false
        
        init {
            // VisionCamera frame processor registration disabled
            // Requires react-native-vision-camera package
            // Re-enable when VisionCamera is added to dependencies
        }
    }
    
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(SparkScannerModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
