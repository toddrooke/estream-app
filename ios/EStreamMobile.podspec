Pod::Spec.new do |s|
  s.name         = 'EStreamMobile'
  s.version      = '0.1.0'
  s.summary      = 'eStream Mobile SDK - Post-quantum cryptography for iOS'
  s.description  = <<-DESC
    Post-quantum secure messaging primitives using ML-KEM-1024 (Kyber) and
    ML-DSA-87 (Dilithium5) - FIPS 203/204 compliant.
  DESC
  
  s.homepage     = 'https://github.com/toddrooke/estream'
  s.license      = { :type => 'MIT', :file => '../../LICENSE' }
  s.author       = { 'Todd Rooke' => 'todd@estream.io' }
  
  s.platform     = :ios, '13.4'
  s.source       = { :path => '.' }
  
  # Static library from Rust build
  s.vendored_libraries = 'EstreamApp/EStreamSDK/libestream_mobile_core.a'
  
  # C header for FFI
  s.public_header_files = 'EstreamApp/estream_native.h'
  s.source_files = 'EstreamApp/estream_native.h'
  
  # Required for Rust static library
  s.libraries = 'c++'
  
  # Don't generate module map - we use bridging header
  s.pod_target_xcconfig = {
    'HEADER_SEARCH_PATHS' => '$(PODS_TARGET_SRCROOT)/EstreamApp',
    'LIBRARY_SEARCH_PATHS' => '$(PODS_TARGET_SRCROOT)/EstreamApp/EStreamSDK'
  }
end

