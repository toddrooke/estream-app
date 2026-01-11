package com.estreamapp.spark

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

/**
 * Register the Spark frame processor plugin with Vision Camera
 */
class SparkFrameProcessorPluginPackage : ReactPackage {
    
    companion object {
        init {
            // Register the frame processor when the class is loaded
            FrameProcessorPluginRegistry.addFrameProcessorPlugin("scanSpark") { proxy, options ->
                SparkFrameProcessor(proxy, options)
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
