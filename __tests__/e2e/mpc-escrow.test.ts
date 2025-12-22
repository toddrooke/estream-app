/**
 * MPC Escrow E2E Tests
 * 
 * Tests MPC escrow functionality on Seeker device
 * Validates Shamir Secret Sharing, threshold reconstruction,
 * and time-locked escrow operations.
 */

import { SeekerTestHarness } from './setup';

describe('MPC Escrow Tests', () => {
  let harness: SeekerTestHarness;
  
  beforeAll(async () => {
    harness = new SeekerTestHarness();
    await harness.setup();
    
    // Print device info
    const deviceInfo = await harness.getDeviceInfo();
    console.log('Device Info:', deviceInfo);
  }, 30000);
  
  afterAll(async () => {
    await harness.teardown();
  });
  
  describe('Shard Creation', () => {
    test('should create 3 shards with threshold 2', async () => {
      await harness.clearLogs();
      
      // Trigger shard creation test
      await harness.sendBroadcast('io.estream.app.TEST_MPC_CREATE_SHARDS', {
        threshold: '2',
        totalShards: '3',
        label: 'test-escrow',
      });
      
      // Wait for success log
      const success = await harness.waitForLog('Created.*shards', 10000);
      expect(success).toBe(true);
      
      // Verify shard count
      const logs = await harness.getLogs();
      const shardLog = logs.find(l => l.includes('Created') && l.includes('shards'));
      console.log('Shard creation log:', shardLog);
      
      expect(shardLog).toContain('3');
    }, 15000);
    
    test('should reject invalid threshold (k > n)', async () => {
      await harness.clearLogs();
      
      // Try to create with invalid config
      await harness.sendBroadcast('io.estream.app.TEST_MPC_CREATE_SHARDS', {
        threshold: '5',
        totalShards: '3',
        label: 'invalid-escrow',
      });
      
      // Should see error log
      const errorLogged = await harness.waitForLog('Invalid.*threshold|error', 5000);
      expect(errorLogged).toBe(true);
    }, 10000);
    
    test('should reject threshold less than 2', async () => {
      await harness.clearLogs();
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_CREATE_SHARDS', {
        threshold: '1',
        totalShards: '3',
        label: 'low-threshold',
      });
      
      const errorLogged = await harness.waitForLog('threshold.*at least|error', 5000);
      expect(errorLogged).toBe(true);
    }, 10000);
  });
  
  describe('Shard Decryption', () => {
    test('should decrypt shard with correct key', async () => {
      await harness.clearLogs();
      
      // First create shards
      await harness.sendBroadcast('io.estream.app.TEST_MPC_CREATE_SHARDS', {
        threshold: '2',
        totalShards: '3',
        label: 'decrypt-test',
      });
      await harness.sleep(2000);
      
      // Then decrypt our shard
      await harness.sendBroadcast('io.estream.app.TEST_MPC_DECRYPT_SHARD');
      
      const decrypted = await harness.waitForLog('Decrypted.*shard', 5000);
      expect(decrypted).toBe(true);
    }, 15000);
    
    test('should fail with wrong key', async () => {
      await harness.clearLogs();
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_DECRYPT_WRONG_KEY');
      
      const failed = await harness.waitForLog('decrypt.*failed|error', 5000);
      expect(failed).toBe(true);
    }, 10000);
  });
  
  describe('Secret Reconstruction', () => {
    test('should reconstruct with exactly threshold shards', async () => {
      await harness.clearLogs();
      
      // Create and decrypt shards
      await harness.sendBroadcast('io.estream.app.TEST_MPC_FULL_CYCLE', {
        threshold: '2',
        totalShards: '3',
        shardsToUse: '2',
      });
      
      const reconstructed = await harness.waitForLog('Reconstructed.*secret', 15000);
      expect(reconstructed).toBe(true);
      
      // Verify secret matches
      const logs = await harness.getLogs();
      const verifyLog = logs.find(l => l.includes('verification') && l.includes('passed'));
      expect(verifyLog).toBeTruthy();
    }, 20000);
    
    test('should reconstruct with more than threshold shards', async () => {
      await harness.clearLogs();
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_FULL_CYCLE', {
        threshold: '2',
        totalShards: '3',
        shardsToUse: '3', // Use all shards
      });
      
      const reconstructed = await harness.waitForLog('Reconstructed.*secret', 15000);
      expect(reconstructed).toBe(true);
    }, 20000);
    
    test('should fail with fewer than threshold shards', async () => {
      await harness.clearLogs();
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_FULL_CYCLE', {
        threshold: '3',
        totalShards: '5',
        shardsToUse: '2', // Not enough
      });
      
      const failed = await harness.waitForLog('Insufficient.*shards|error', 10000);
      expect(failed).toBe(true);
    }, 15000);
  });
  
  describe('Time-Lock Escrow', () => {
    test('should create time-locked escrow', async () => {
      await harness.clearLogs();
      
      const releaseAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_CREATE_TIMELOCK', {
        releaseAt: releaseAt.toString(),
        puzzleDifficulty: '1000',
      });
      
      const created = await harness.waitForLog('time.*lock.*created', 10000);
      expect(created).toBe(true);
    }, 15000);
    
    test('should report unexpired time lock', async () => {
      await harness.clearLogs();
      
      const releaseAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_CHECK_TIMELOCK', {
        releaseAt: releaseAt.toString(),
      });
      
      const notExpired = await harness.waitForLog('time.*lock.*not.*expired', 5000);
      expect(notExpired).toBe(true);
    }, 10000);
    
    test('should report expired time lock', async () => {
      await harness.clearLogs();
      
      const releaseAt = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_CHECK_TIMELOCK', {
        releaseAt: releaseAt.toString(),
      });
      
      const expired = await harness.waitForLog('time.*lock.*expired', 5000);
      expect(expired).toBe(true);
    }, 10000);
  });
  
  describe('Threshold Signing', () => {
    test('should create signature share', async () => {
      await harness.clearLogs();
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_CREATE_SIG_SHARE');
      
      const created = await harness.waitForLog('signature.*share.*created', 5000);
      expect(created).toBe(true);
    }, 10000);
    
    test('should combine threshold signature shares', async () => {
      await harness.clearLogs();
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_COMBINE_SIG_SHARES', {
        threshold: '2',
        sharesToCombine: '2',
      });
      
      const combined = await harness.waitForLog('combined.*signature', 10000);
      expect(combined).toBe(true);
    }, 15000);
    
    test('should reject duplicate signature shares', async () => {
      await harness.clearLogs();
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_DUPLICATE_SIG_SHARE');
      
      const rejected = await harness.waitForLog('duplicate|rejected', 5000);
      expect(rejected).toBe(true);
    }, 10000);
  });
  
  describe('Hardware Security', () => {
    test('should use hardware-backed keys for shard holders', async () => {
      await harness.clearLogs();
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_VERIFY_HARDWARE');
      
      // Check that keys are hardware-backed
      const hardwareBacked = await harness.waitForLog('hardware.*backed|TEE|StrongBox', 5000);
      expect(hardwareBacked).toBe(true);
    }, 10000);
    
    test('should require biometric for shard decryption', async () => {
      await harness.clearLogs();
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_BIOMETRIC_DECRYPT');
      
      // Should trigger biometric prompt
      const biometricPrompt = await harness.waitForLog('biometric.*prompt|authenticate', 5000);
      expect(biometricPrompt).toBe(true);
    }, 10000);
  });
  
  describe('Performance', () => {
    test('should create 5 shards in under 1 second', async () => {
      await harness.clearLogs();
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_BENCHMARK', {
        operation: 'create',
        threshold: '3',
        totalShards: '5',
      });
      
      const benchmark = await harness.waitForLog('benchmark.*ms', 5000);
      expect(benchmark).toBe(true);
      
      // Extract time from log
      const logs = await harness.getLogs();
      const timingLog = logs.find(l => l.includes('benchmark') && l.includes('ms'));
      
      if (timingLog) {
        const match = timingLog.match(/(\d+)\s*ms/);
        if (match) {
          const durationMs = parseInt(match[1], 10);
          console.log(`Shard creation took ${durationMs}ms`);
          expect(durationMs).toBeLessThan(1000);
        }
      }
    }, 10000);
    
    test('should reconstruct in under 500ms', async () => {
      await harness.clearLogs();
      
      await harness.sendBroadcast('io.estream.app.TEST_MPC_BENCHMARK', {
        operation: 'reconstruct',
        threshold: '3',
        totalShards: '5',
      });
      
      const benchmark = await harness.waitForLog('benchmark.*ms', 5000);
      expect(benchmark).toBe(true);
      
      // Extract time from log
      const logs = await harness.getLogs();
      const timingLog = logs.find(l => l.includes('benchmark') && l.includes('reconstruct'));
      
      if (timingLog) {
        const match = timingLog.match(/(\d+)\s*ms/);
        if (match) {
          const durationMs = parseInt(match[1], 10);
          console.log(`Secret reconstruction took ${durationMs}ms`);
          expect(durationMs).toBeLessThan(500);
        }
      }
    }, 10000);
  });
});


