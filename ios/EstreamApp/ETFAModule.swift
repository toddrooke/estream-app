//
//  ETFAModule.swift
//  EstreamApp
//
//  Embedded Timing Fingerprint Authentication for iOS.
//  Collects device-specific timing fingerprints for device verification
//  and emulator detection.
//
//  Uses mach_absolute_time for high-precision timing, Metal for GPU,
//  and Accelerate framework for vector/matrix operations.
//

import Foundation
import Metal
import Accelerate
import CryptoKit
import UIKit

@objc(ETFAModule)
class ETFAModule: NSObject {
    
    // MARK: - Constants
    
    private static let TAG = "ETFAModule"
    
    // Events
    private static let EVENT_PROGRESS = "onETFAProgress"
    private static let EVENT_COMPLETE = "onETFAComplete"
    private static let EVENT_ERROR = "onETFAError"
    
    // MARK: - Pre-allocated Buffers
    
    private let memBuffer1M: [UInt8]
    private let memBuffer4M: [UInt8]
    private let randomIndices1M: [Int]
    
    // Metal device (lazy initialized)
    private lazy var metalDevice: MTLDevice? = MTLCreateSystemDefaultDevice()
    
    // Timing conversion
    private var timebaseInfo = mach_timebase_info_data_t()
    
    // Blackhole to prevent optimization
    private var blackhole: Any?
    
    // Event bridge
    private var eventBridge: RCTEventEmitter?
    
    // MARK: - Initialization
    
    override init() {
        // Pre-allocate memory buffers
        self.memBuffer1M = [UInt8](repeating: 0, count: 1024 * 1024)
        self.memBuffer4M = [UInt8](repeating: 0, count: 4 * 1024 * 1024)
        
        // Generate random indices
        var indices = Array(0..<(1024 * 1024))
        indices.shuffle()
        self.randomIndices1M = indices
        
        super.init()
        
        // Get timebase info for nanosecond conversion
        mach_timebase_info(&timebaseInfo)
        
        print("[\(ETFAModule.TAG)] Initialized")
    }
    
    // MARK: - React Native Methods
    
    /// Check if ETFA is supported on this device
    @objc(isSupported:rejecter:)
    func isSupported(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // ETFA is supported on all iOS devices with mach_absolute_time
        resolve(true)
    }
    
    /// Get device info without full fingerprint collection
    @objc(getDeviceInfo:rejecter:)
    func getDeviceInfo(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let device = UIDevice.current
        var systemInfo = utsname()
        uname(&systemInfo)
        let modelCode = withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) { ptr in
                String(validatingUTF8: ptr) ?? "Unknown"
            }
        }
        
        let result: [String: Any] = [
            "platform": "ios",
            "platformVersion": device.systemVersion,
            "deviceModel": "Apple_\(modelCode)",
            "deviceName": device.name,
            "isEmulator": isEmulator()
        ]
        resolve(result)
    }
    
    /// Collect a timing fingerprint with the specified number of samples
    @objc(collectFingerprint:resolver:rejecter:)
    func collectFingerprint(
        _ sampleCount: Int,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            do {
                let fingerprint = try self.generateFingerprint(sampleCount: sampleCount) { operation, progress in
                    self.sendProgressEvent(operation: operation, progress: progress)
                }
                
                // Build result dictionary
                let result: [String: Any] = [
                    "id": fingerprint.id,
                    "phase": fingerprint.phase,
                    "deviceModel": fingerprint.deviceModel,
                    "platform": "ios",
                    "platformVersion": UIDevice.current.systemVersion,
                    "sampleCount": sampleCount,
                    "timestamp": Date().timeIntervalSince1970 * 1000,
                    
                    // Stable ratios
                    "r5_mem_seq_to_rand": fingerprint.r5,
                    "r6_mem_copy_to_seq": fingerprint.r6,
                    "r7_int_to_float": fingerprint.r7,
                    "r9_float_to_matrix": fingerprint.r9,
                    "r10_seq_4k_to_64k": fingerprint.r10,
                    "r11_seq_64k_to_1m": fingerprint.r11,
                    "r12_seq_1m_to_4m": fingerprint.r12,
                    "r13_rand_4k_to_64k": fingerprint.r13,
                    "r14_rand_64k_to_1m": fingerprint.r14,
                    "r18_int_mul_32_to_64": fingerprint.r18,
                    "r19_int_div_32_to_64": fingerprint.r19,
                    "r22_int_mul_to_div": fingerprint.r22,
                    "r24_add_chain_to_parallel": fingerprint.r24,
                    "r25_int_to_bitwise": fingerprint.r25,
                    "r28_gpu_vertex_to_fragment": fingerprint.r28,
                    "r29_gpu_compile_to_link": fingerprint.r29,
                    
                    // All ratios as array
                    "stableRatios": fingerprint.stableRatios,
                    
                    // Device fingerprint hash
                    "fingerprintHash": fingerprint.hash
                ]
                
                DispatchQueue.main.async {
                    resolve(result)
                    self.sendCompleteEvent(fingerprintId: fingerprint.id)
                }
                
            } catch {
                DispatchQueue.main.async {
                    self.sendErrorEvent(message: error.localizedDescription)
                    reject("ETFA_ERROR", error.localizedDescription, error)
                }
            }
        }
    }
    
    // MARK: - Fingerprint Generation
    
    private struct Fingerprint {
        let id: String
        let phase: Int
        let deviceModel: String
        let r5, r6, r7, r9: Double
        let r10, r11, r12, r13, r14: Double
        let r18, r19, r22, r24, r25: Double
        let r28, r29: Double
        let stableRatios: [Double]
        let hash: String
    }
    
    private func generateFingerprint(
        sampleCount: Int,
        onProgress: @escaping (String, Float) -> Void
    ) throws -> Fingerprint {
        let totalOps = 25
        var completed = 0
        
        func report(_ name: String) {
            completed += 1
            onProgress(name, Float(completed) / Float(totalOps))
        }
        
        // Warmup and GC hint
        autoreleasepool {
            _ = memSequential()
        }
        Thread.sleep(forTimeInterval: 0.1)
        
        report("Warmup")
        
        // Phase 1: Memory operations
        let memSeq = measureMedian(samples: sampleCount) { memSequential() }
        report("Memory Sequential")
        
        let memRand = measureMedian(samples: sampleCount) { memRandom() }
        report("Memory Random")
        
        let memCopy = measureMedian(samples: sampleCount) { memCopy() }
        report("Memory Copy")
        
        // Phase 1: Compute operations
        let intMult = measureMedian(samples: sampleCount) { intMultiply() }
        report("Int Multiply")
        
        let floatMult = measureMedian(samples: sampleCount) { floatMultiply() }
        report("Float Multiply")
        
        let vecDot = measureMedian(samples: sampleCount) { vectorDot() }
        report("Vector Dot")
        
        let matrixOp = measureMedian(samples: sampleCount) { matrixOp() }
        report("Matrix Op")
        
        // Phase 2: Memory hierarchy
        let seq4k = measureMedian(samples: sampleCount) { memSequential4K() }
        report("Seq 4K")
        
        let seq64k = measureMedian(samples: sampleCount) { memSequential64K() }
        report("Seq 64K")
        
        let seq4m = measureMedian(samples: sampleCount) { memSequential4M() }
        report("Seq 4M")
        
        let rand4k = measureMedian(samples: sampleCount) { memRandom4K() }
        report("Rand 4K")
        
        let rand64k = measureMedian(samples: sampleCount) { memRandom64K() }
        report("Rand 64K")
        
        // Phase 3: Precision variants
        let intMul32 = measureMedian(samples: sampleCount) { intMultiply32() }
        report("Int Mul 32")
        
        let intDiv32 = measureMedian(samples: sampleCount) { intDivide32() }
        report("Int Div 32")
        
        let intDiv64 = measureMedian(samples: sampleCount) { intDivide64() }
        report("Int Div 64")
        
        let addChain = measureMedian(samples: sampleCount) { intAddChain() }
        report("Add Chain")
        
        let addParallel = measureMedian(samples: sampleCount) { intAddParallel() }
        report("Add Parallel")
        
        let bitwise = measureMedian(samples: sampleCount) { bitwiseOps() }
        report("Bitwise")
        
        // Phase 4: GPU (fewer samples - slower)
        let gpuSamples = min(sampleCount, 50)
        let gpuVertex = measureMedian(samples: gpuSamples) { gpuShaderVertex() }
        report("GPU Vertex")
        
        let gpuFragment = measureMedian(samples: gpuSamples) { gpuShaderFragment() }
        report("GPU Fragment")
        
        let gpuLink = measureMedian(samples: gpuSamples) { gpuProgramLink() }
        report("GPU Link")
        
        // Compute ratios
        func ratio(_ a: UInt64, _ b: UInt64) -> Double {
            b > 0 ? Double(a) / Double(b) : 0.0
        }
        
        let r5 = ratio(memSeq, memRand)
        let r6 = ratio(memCopy, memSeq)
        let r7 = ratio(intMult, floatMult)
        let r9 = ratio(floatMult, matrixOp)
        let r10 = ratio(seq4k, seq64k)
        let r11 = ratio(seq64k, memSeq)
        let r12 = ratio(memSeq, seq4m)
        let r13 = ratio(rand4k, rand64k)
        let r14 = ratio(rand64k, memRand)
        let r18 = ratio(intMul32, intMult)
        let r19 = ratio(intDiv32, intDiv64)
        let r22 = ratio(intMult, intDiv64)
        let r24 = ratio(addChain, addParallel)
        let r25 = ratio(intMult, bitwise)
        let r28 = ratio(gpuVertex, gpuFragment)
        let r29 = ratio(gpuVertex, gpuLink)
        
        let stableRatios = [r5, r6, r7, r9, r10, r11, r12, r13, r14, r18, r19, r22, r24, r25, r28, r29]
        
        // Create hash of stable ratios
        let hash = hashRatios(stableRatios)
        
        // Get device model
        var systemInfo = utsname()
        uname(&systemInfo)
        let modelCode = withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) { ptr in
                String(validatingUTF8: ptr) ?? "Unknown"
            }
        }
        
        return Fingerprint(
            id: UUID().uuidString,
            phase: 4,
            deviceModel: "Apple_\(modelCode)",
            r5: r5, r6: r6, r7: r7, r9: r9,
            r10: r10, r11: r11, r12: r12, r13: r13, r14: r14,
            r18: r18, r19: r19, r22: r22, r24: r24, r25: r25,
            r28: r28, r29: r29,
            stableRatios: stableRatios,
            hash: hash
        )
    }
    
    private func hashRatios(_ ratios: [Double]) -> String {
        // Quantize to 2 decimal places for stability, then hash
        let quantizedData = ratios.map { ratio -> String in
            String(Int(ratio * 100))
        }.joined().data(using: .utf8)!
        
        let digest = SHA256.hash(data: quantizedData)
        return digest.prefix(16).map { String(format: "%02x", $0) }.joined()
    }
    
    // MARK: - Timing Utilities
    
    private func nowNanos() -> UInt64 {
        let time = mach_absolute_time()
        return time * UInt64(timebaseInfo.numer) / UInt64(timebaseInfo.denom)
    }
    
    private func measureMedian(samples: Int, operation: () -> UInt64) -> UInt64 {
        var results = [UInt64](repeating: 0, count: samples)
        for i in 0..<samples {
            results[i] = operation()
        }
        results.sort()
        return results[samples / 2]
    }
    
    // MARK: - Memory Operations
    
    private func memSequential() -> UInt64 {
        let start = nowNanos()
        var sum: UInt64 = 0
        for i in 0..<memBuffer1M.count {
            sum = sum &+ UInt64(memBuffer1M[i])
        }
        blackhole = sum
        return nowNanos() - start
    }
    
    private func memRandom() -> UInt64 {
        let start = nowNanos()
        var sum: UInt64 = 0
        for i in randomIndices1M {
            sum = sum &+ UInt64(memBuffer1M[i & 0xFFFFF])
        }
        blackhole = sum
        return nowNanos() - start
    }
    
    private func memCopy() -> UInt64 {
        var dest = [UInt8](repeating: 0, count: memBuffer1M.count)
        let start = nowNanos()
        memBuffer1M.withUnsafeBytes { src in
            dest.withUnsafeMutableBytes { dst in
                _ = memcpy(dst.baseAddress!, src.baseAddress!, memBuffer1M.count)
            }
        }
        blackhole = dest[0]
        return nowNanos() - start
    }
    
    private func memSequential4K() -> UInt64 {
        let start = nowNanos()
        var sum: UInt64 = 0
        for i in 0..<4096 {
            sum = sum &+ UInt64(memBuffer1M[i])
        }
        blackhole = sum
        return nowNanos() - start
    }
    
    private func memSequential64K() -> UInt64 {
        let start = nowNanos()
        var sum: UInt64 = 0
        for i in 0..<65536 {
            sum = sum &+ UInt64(memBuffer1M[i])
        }
        blackhole = sum
        return nowNanos() - start
    }
    
    private func memSequential4M() -> UInt64 {
        let start = nowNanos()
        var sum: UInt64 = 0
        for i in 0..<memBuffer4M.count {
            sum = sum &+ UInt64(memBuffer4M[i])
        }
        blackhole = sum
        return nowNanos() - start
    }
    
    private func memRandom4K() -> UInt64 {
        let start = nowNanos()
        var sum: UInt64 = 0
        for i in 0..<4096 {
            sum = sum &+ UInt64(memBuffer1M[randomIndices1M[i] & 0xFFF])
        }
        blackhole = sum
        return nowNanos() - start
    }
    
    private func memRandom64K() -> UInt64 {
        let start = nowNanos()
        var sum: UInt64 = 0
        for i in 0..<65536 {
            sum = sum &+ UInt64(memBuffer1M[randomIndices1M[i] & 0xFFFF])
        }
        blackhole = sum
        return nowNanos() - start
    }
    
    // MARK: - Compute Operations
    
    private func intMultiply() -> UInt64 {
        let start = nowNanos()
        var result: Int64 = 1
        var multiplier: Int64 = 7
        for _ in 0..<1_000_000 {
            result = result &* multiplier
            result = result & 0x7FFFFFFFFFFFFFFF
            multiplier = (multiplier &* 31 &+ 17) & 0x7FFFFFFF
        }
        blackhole = result
        return nowNanos() - start
    }
    
    private func intMultiply32() -> UInt64 {
        let start = nowNanos()
        var result: Int32 = 1
        var multiplier: Int32 = 7
        for _ in 0..<1_000_000 {
            result = result &* multiplier
            result = result & 0x7FFFFFFF
            multiplier = (multiplier &* 31 &+ 17) & 0x7FFF
        }
        blackhole = result
        return nowNanos() - start
    }
    
    private func intDivide32() -> UInt64 {
        let start = nowNanos()
        var result: Int32 = Int32.max
        var divisor: Int32 = 3
        for _ in 0..<500_000 {
            result = result / divisor
            if result < 1000 { result = Int32.max }
            divisor = (divisor &* 31 &+ 17) & 0x7FFF
            if divisor < 2 { divisor = 3 }
        }
        blackhole = result
        return nowNanos() - start
    }
    
    private func intDivide64() -> UInt64 {
        let start = nowNanos()
        var result: Int64 = Int64.max
        var divisor: Int64 = 3
        for _ in 0..<500_000 {
            result = result / divisor
            if result < 1000 { result = Int64.max }
            divisor = (divisor &* 31 &+ 17) & 0x7FFFFFFF
            if divisor < 2 { divisor = 3 }
        }
        blackhole = result
        return nowNanos() - start
    }
    
    private func floatMultiply() -> UInt64 {
        let start = nowNanos()
        var result: Double = 1.0
        let multiplier: Double = 1.0000001
        for _ in 0..<1_000_000 {
            result *= multiplier
            if result > 1e100 { result = 1.0 }
        }
        blackhole = result
        return nowNanos() - start
    }
    
    private func vectorDot() -> UInt64 {
        var a = [Float](repeating: 0, count: 65536)
        var b = [Float](repeating: 0, count: 65536)
        for i in 0..<65536 {
            a[i] = Float(i % 100) / 100.0
            b[i] = Float((i + 37) % 100) / 100.0
        }
        
        let start = nowNanos()
        var result: Float = 0
        vDSP_dotpr(a, 1, b, 1, &result, vDSP_Length(65536))
        blackhole = result
        return nowNanos() - start
    }
    
    private func matrixOp() -> UInt64 {
        let n = 128
        var a = [Float](repeating: 0, count: n * n)
        var b = [Float](repeating: 0, count: n * n)
        var c = [Float](repeating: 0, count: n * n)
        
        for i in 0..<(n * n) {
            a[i] = Float(i % 100) / 100.0
            b[i] = Float((i + 17) % 100) / 100.0
        }
        
        let start = nowNanos()
        // Using Accelerate for matrix multiply
        vDSP_mmul(a, 1, b, 1, &c, 1, vDSP_Length(n), vDSP_Length(n), vDSP_Length(n))
        blackhole = c
        return nowNanos() - start
    }
    
    private func intAddChain() -> UInt64 {
        let start = nowNanos()
        var a: Int64 = 1, b: Int64 = 2, c: Int64 = 3, d: Int64 = 4
        for _ in 0..<1_000_000 {
            a = a &+ b; b = b &+ c; c = c &+ d; d = d &+ a
        }
        blackhole = a &+ b &+ c &+ d
        return nowNanos() - start
    }
    
    private func intAddParallel() -> UInt64 {
        let start = nowNanos()
        var a: Int64 = 1, b: Int64 = 2, c: Int64 = 3, d: Int64 = 4
        let x: Int64 = 5, y: Int64 = 6, z: Int64 = 7, w: Int64 = 8
        for _ in 0..<1_000_000 {
            a = a &+ x; b = b &+ y; c = c &+ z; d = d &+ w
        }
        blackhole = a &+ b &+ c &+ d
        return nowNanos() - start
    }
    
    private func bitwiseOps() -> UInt64 {
        let start = nowNanos()
        var a: UInt64 = 0xDEADBEEF
        var b: UInt64 = 0xCAFEBABE
        for _ in 0..<1_000_000 {
            a = a ^ b
            b = (b & 0xFFFF0000) | (a & 0x0000FFFF)
            a = (a << 1) | (a >> 63)
        }
        blackhole = a ^ b
        return nowNanos() - start
    }
    
    // MARK: - GPU Operations (Metal)
    
    private func gpuShaderVertex() -> UInt64 {
        guard let device = metalDevice else { return 0 }
        
        let shaderSource = """
        #include <metal_stdlib>
        using namespace metal;
        
        vertex float4 vertexShader(uint vertexID [[vertex_id]]) {
            return float4(0.0);
        }
        """
        
        let start = nowNanos()
        do {
            _ = try device.makeLibrary(source: shaderSource, options: nil)
        } catch {
            // Compilation failed - still count time
        }
        return nowNanos() - start
    }
    
    private func gpuShaderFragment() -> UInt64 {
        guard let device = metalDevice else { return 0 }
        
        let shaderSource = """
        #include <metal_stdlib>
        using namespace metal;
        
        fragment float4 fragmentShader() {
            return float4(1.0);
        }
        """
        
        let start = nowNanos()
        do {
            _ = try device.makeLibrary(source: shaderSource, options: nil)
        } catch {
            // Compilation failed - still count time
        }
        return nowNanos() - start
    }
    
    private func gpuProgramLink() -> UInt64 {
        guard let device = metalDevice else { return 0 }
        
        let shaderSource = """
        #include <metal_stdlib>
        using namespace metal;
        
        vertex float4 vertexShader(uint vertexID [[vertex_id]]) {
            return float4(0.0);
        }
        
        fragment float4 fragmentShader() {
            return float4(1.0);
        }
        """
        
        let start = nowNanos()
        do {
            let library = try device.makeLibrary(source: shaderSource, options: nil)
            let vertexFunc = library.makeFunction(name: "vertexShader")
            let fragmentFunc = library.makeFunction(name: "fragmentShader")
            
            let descriptor = MTLRenderPipelineDescriptor()
            descriptor.vertexFunction = vertexFunc
            descriptor.fragmentFunction = fragmentFunc
            descriptor.colorAttachments[0].pixelFormat = .bgra8Unorm
            
            _ = try device.makeRenderPipelineState(descriptor: descriptor)
        } catch {
            // Pipeline creation failed - still count time
        }
        return nowNanos() - start
    }
    
    // MARK: - Helpers
    
    private func isEmulator() -> Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
    }
    
    // MARK: - Event Emission
    
    private func sendProgressEvent(operation: String, progress: Float) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: NSNotification.Name(ETFAModule.EVENT_PROGRESS),
                object: nil,
                userInfo: ["operation": operation, "progress": progress]
            )
        }
    }
    
    private func sendCompleteEvent(fingerprintId: String) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: NSNotification.Name(ETFAModule.EVENT_COMPLETE),
                object: nil,
                userInfo: ["fingerprintId": fingerprintId]
            )
        }
    }
    
    private func sendErrorEvent(message: String) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: NSNotification.Name(ETFAModule.EVENT_ERROR),
                object: nil,
                userInfo: ["message": message]
            )
        }
    }
}

// MARK: - Objective-C Bridge

extension ETFAModule {
    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc func supportedEvents() -> [String] {
        return [
            ETFAModule.EVENT_PROGRESS,
            ETFAModule.EVENT_COMPLETE,
            ETFAModule.EVENT_ERROR
        ]
    }
}
