/**
 * QuicClient Native Module - Objective-C Bridge
 *
 * Exposes the Swift QuicClientModule to React Native.
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(QuicClient, NSObject)

// Connection Management
RCT_EXTERN_METHOD(initialize:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(connect:(NSInteger)handle
                  nodeAddr:(NSString *)nodeAddr
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(dispose:(NSInteger)handle)

// Key Generation
RCT_EXTERN_METHOD(generateDeviceKeys:(NSString *)appScope
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Messaging
RCT_EXTERN_METHOD(sendMessage:(NSInteger)handle
                  nodeAddr:(NSString *)nodeAddr
                  messageJson:(NSString *)messageJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Utility
RCT_EXTERN_METHOD(getVersion:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// HTTP/3 Client (UDP-based write operations)
RCT_EXTERN_METHOD(h3Connect:(NSString *)serverAddr
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(h3Post:(NSString *)path
                  body:(NSString *)body
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(h3Get:(NSString *)path
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(h3MintIdentityNft:(NSString *)owner
                  trustLevel:(NSString *)trustLevel
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(h3IsConnected:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(h3Disconnect:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end

