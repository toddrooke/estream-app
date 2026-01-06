//
//  PqCryptoModule.m
//  EstreamApp
//
//  Objective-C bridge for PqCryptoModule native module.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PqCryptoModule, NSObject)

RCT_EXTERN_METHOD(getVersion:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(generateDeviceKeys:(NSString *)appScope
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(initRatchetSender:(NSString *)sharedSecretHex
                  theirKemPublic:(NSString *)theirKemPublic
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(ratchetEncrypt:(double)handle
                  plaintext:(NSString *)plaintext
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(ratchetDecrypt:(double)handle
                  messageJson:(NSString *)messageJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(ratchetDispose:(double)handle)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end


