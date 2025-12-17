//
//  KeychainModule.m
//  EstreamApp
//
//  Objective-C bridge for React Native native module.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(KeychainModule, NSObject)

RCT_EXTERN_METHOD(isSecureEnclaveAvailable:
                  (RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(generateKey:
                  (NSString *)alias
                  useSecureEnclave:(BOOL)useSecureEnclave
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(hasKey:
                  (NSString *)alias
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPublicKey:
                  (NSString *)alias
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sign:
                  (NSString *)alias
                  message:(NSString *)messageBase64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deleteKey:
                  (NSString *)alias
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSecurityLevel:
                  (NSString *)alias
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

