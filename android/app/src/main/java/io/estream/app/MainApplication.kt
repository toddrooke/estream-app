package io.estream.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader
import io.estream.app.spark.SparkScannerPackage
import io.estream.app.spark.SparkAuthPackage
// VisionCamera frame processor disabled - requires react-native-vision-camera
// import io.estream.app.spark.SparkFrameProcessor
// import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here
              // RNGetRandomValuesPackage is autolinked, don't add manually
              // Native Seeker/Hardware vault module
              add(SeekerPackage())
              // Native QUIC module
              add(QuicClientPackage())
              // ML-DSA-87 Post-Quantum signing module
              add(MlDsa87Package())
              // Native Spark scanner for motion detection
              add(SparkScannerPackage())
              // Spark authentication (Rust renderer + ML-DSA signing)
              add(SparkAuthPackage())
              // ETFA (Embedded Timing Fingerprint Authentication) module
              add(ETFAPackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, false)
    
    // VisionCamera frame processor registration disabled
    // Requires react-native-vision-camera package to be installed
    // Re-enable when VisionCamera is added to dependencies
    
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
  }
}
