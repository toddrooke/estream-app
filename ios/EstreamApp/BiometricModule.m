//
//  BiometricModule.m
//  EstreamApp
//
//  Objective-C bridge for BiometricModule.swift
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(BiometricModule, NSObject)

RCT_EXTERN_METHOD(getBiometricStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(authenticate:(NSString *)reason
                  subtitle:(NSString * _Nullable)subtitle
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(generateBiometricProtectedKey:(NSString *)alias
                  requireBiometric:(BOOL)requireBiometric
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signWithBiometricKey:(NSString *)alias
                  dataBase64:(NSString *)dataBase64
                  reason:(NSString *)reason
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(hasBiometricKey:(NSString *)alias
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deleteBiometricKey:(NSString *)alias
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signGovernanceAction:(NSString *)alias
                  actionJson:(NSString *)actionJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
