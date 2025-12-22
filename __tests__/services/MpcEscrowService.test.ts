/**
 * MPC Escrow Service Unit Tests
 * 
 * Unit tests for the TypeScript MPC Escrow wrapper.
 * These tests mock the native module for CI/CD environments.
 */

import { NativeModules } from 'react-native';
import {
  MpcEscrowService,
  EscrowConfig,
  MIN_THRESHOLD,
  MAX_SHARDS,
} from '@/services/escrow/MpcEscrowService';

// Mock the native module
jest.mock('react-native', () => ({
  NativeModules: {
    MpcEscrowModule: {
      createShards: jest.fn(),
      decryptShard: jest.fn(),
      reconstruct: jest.fn(),
      createTimeLock: jest.fn(),
      isTimeLockExpired: jest.fn(),
      createSignatureShare: jest.fn(),
      combineSignatureShares: jest.fn(),
    },
  },
  Platform: {
    OS: 'android',
  },
}));

describe('MpcEscrowService', () => {
  let service: MpcEscrowService;
  let mockModule: typeof NativeModules.MpcEscrowModule;

  beforeEach(() => {
    service = new MpcEscrowService();
    mockModule = NativeModules.MpcEscrowModule;
    jest.clearAllMocks();
  });

  describe('Configuration Validation', () => {
    test('should reject threshold less than MIN_THRESHOLD', async () => {
      const config: EscrowConfig = {
        threshold: 1, // Less than MIN_THRESHOLD (2)
        totalShards: 3,
      };

      const holderKeys = new Map<string, Uint8Array>();
      holderKeys.set('holder1', new Uint8Array(32));
      holderKeys.set('holder2', new Uint8Array(32));
      holderKeys.set('holder3', new Uint8Array(32));

      await expect(
        service.createShards(new Uint8Array([1, 2, 3]), config, holderKeys)
      ).rejects.toThrow(`Threshold must be at least ${MIN_THRESHOLD}`);
    });

    test('should reject totalShards greater than MAX_SHARDS', async () => {
      const config: EscrowConfig = {
        threshold: 2,
        totalShards: 10, // Greater than MAX_SHARDS (7)
      };

      const holderKeys = new Map<string, Uint8Array>();
      for (let i = 0; i < 10; i++) {
        holderKeys.set(`holder${i}`, new Uint8Array(32));
      }

      await expect(
        service.createShards(new Uint8Array([1, 2, 3]), config, holderKeys)
      ).rejects.toThrow(`Total shards cannot exceed ${MAX_SHARDS}`);
    });

    test('should reject threshold greater than totalShards', async () => {
      const config: EscrowConfig = {
        threshold: 5,
        totalShards: 3,
      };

      const holderKeys = new Map<string, Uint8Array>();
      holderKeys.set('holder1', new Uint8Array(32));
      holderKeys.set('holder2', new Uint8Array(32));
      holderKeys.set('holder3', new Uint8Array(32));

      await expect(
        service.createShards(new Uint8Array([1, 2, 3]), config, holderKeys)
      ).rejects.toThrow('Threshold cannot exceed total shards');
    });

    test('should reject mismatched holder count', async () => {
      const config: EscrowConfig = {
        threshold: 2,
        totalShards: 3,
      };

      const holderKeys = new Map<string, Uint8Array>();
      holderKeys.set('holder1', new Uint8Array(32));
      holderKeys.set('holder2', new Uint8Array(32));
      // Missing holder3

      await expect(
        service.createShards(new Uint8Array([1, 2, 3]), config, holderKeys)
      ).rejects.toThrow('Expected 3 holder keys, got 2');
    });
  });

  describe('Shard Creation', () => {
    test('should call native module with correct parameters', async () => {
      const config: EscrowConfig = {
        threshold: 2,
        totalShards: 3,
        label: 'test-escrow',
      };

      const holderKeys = new Map<string, Uint8Array>();
      holderKeys.set('a'.repeat(64), new Uint8Array(32)); // 32 bytes = 64 hex chars
      holderKeys.set('b'.repeat(64), new Uint8Array(32));
      holderKeys.set('c'.repeat(64), new Uint8Array(32));

      const mockResult = {
        shards: [
          { shardId: '123', index: 1, holderId: { id: 'a'.repeat(64) } },
          { shardId: '456', index: 2, holderId: { id: 'b'.repeat(64) } },
          { shardId: '789', index: 3, holderId: { id: 'c'.repeat(64) } },
        ],
        escrowId: 'escrow123',
        verificationData: {
          threshold: 2,
          secretHash: 'hash123',
          coefficientCommitments: [],
        },
      };

      (mockModule.createShards as jest.Mock).mockResolvedValue(
        JSON.stringify(mockResult)
      );

      const result = await service.createShards(
        new Uint8Array([1, 2, 3]),
        config,
        holderKeys
      );

      expect(mockModule.createShards).toHaveBeenCalledTimes(1);
      expect(result.shards).toHaveLength(3);
      expect(result.escrowId).toBe('escrow123');
    });
  });

  describe('Shard Decryption', () => {
    test('should decrypt shard and return Uint8Array', async () => {
      const shard = {
        shardId: '123',
        index: 1,
        encryptedData: 'base64data',
        kemCiphertext: 'base64ct',
        commitment: 'abc123',
        holderId: { id: 'holder1' },
      };
      const secretKey = new Uint8Array(32);

      const mockDecrypted = Buffer.from([1, 2, 3, 4]).toString('base64');
      (mockModule.decryptShard as jest.Mock).mockResolvedValue(mockDecrypted);

      const result = await service.decryptShard(shard, secretKey);

      expect(mockModule.decryptShard).toHaveBeenCalledTimes(1);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
    });
  });

  describe('Reconstruction', () => {
    test('should reject insufficient shards', async () => {
      const decryptedShards = [
        { index: 1, data: new Uint8Array([1, 2, 3]) },
      ];
      const verificationData = {
        threshold: 2,
        secretHash: 'hash',
        coefficientCommitments: [],
      };
      const config: EscrowConfig = {
        threshold: 2,
        totalShards: 3,
      };

      await expect(
        service.reconstruct(decryptedShards, verificationData, config)
      ).rejects.toThrow('Insufficient shards: got 1, need 2');
    });

    test('should call native module for reconstruction', async () => {
      const decryptedShards = [
        { index: 1, data: new Uint8Array([1, 2, 3]) },
        { index: 2, data: new Uint8Array([4, 5, 6]) },
      ];
      const verificationData = {
        threshold: 2,
        secretHash: 'hash',
        coefficientCommitments: [],
      };
      const config: EscrowConfig = {
        threshold: 2,
        totalShards: 3,
      };

      const mockSecret = Buffer.from([9, 8, 7]).toString('base64');
      (mockModule.reconstruct as jest.Mock).mockResolvedValue(mockSecret);

      const result = await service.reconstruct(
        decryptedShards,
        verificationData,
        config
      );

      expect(mockModule.reconstruct).toHaveBeenCalledTimes(1);
      expect(result).toEqual(new Uint8Array([9, 8, 7]));
    });
  });

  describe('Time Lock', () => {
    test('should create time lock', async () => {
      const mockTimeLock = {
        releaseAt: 1735689600,
        puzzleDifficulty: 1000,
        timeLockedKey: 'base64key',
      };
      (mockModule.createTimeLock as jest.Mock).mockResolvedValue(
        JSON.stringify(mockTimeLock)
      );

      const result = await service.createTimeLock(
        new Uint8Array([1, 2, 3]),
        1735689600,
        1000
      );

      expect(mockModule.createTimeLock).toHaveBeenCalledTimes(1);
      expect(result.releaseAt).toBe(1735689600);
      expect(result.puzzleDifficulty).toBe(1000);
    });

    test('should check time lock expiration', async () => {
      const timeLock = {
        releaseAt: 1735689600,
        puzzleDifficulty: 1000,
        timeLockedKey: 'base64key',
      };

      (mockModule.isTimeLockExpired as jest.Mock).mockResolvedValue(true);

      const result = await service.isTimeLockExpired(timeLock, 1735700000);

      expect(mockModule.isTimeLockExpired).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    test('should use current time if not provided', async () => {
      const timeLock = {
        releaseAt: 1735689600,
        puzzleDifficulty: 1000,
        timeLockedKey: 'base64key',
      };

      (mockModule.isTimeLockExpired as jest.Mock).mockResolvedValue(false);

      await service.isTimeLockExpired(timeLock);

      expect(mockModule.isTimeLockExpired).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number)
      );
    });
  });

  describe('Threshold Signing', () => {
    test('should create signature share', async () => {
      const mockShare = {
        holderId: { id: 'holder1' },
        partialSignature: 'base64sig',
        proof: 'base64proof',
      };
      (mockModule.createSignatureShare as jest.Mock).mockResolvedValue(
        JSON.stringify(mockShare)
      );

      const result = await service.createSignatureShare(
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6])
      );

      expect(mockModule.createSignatureShare).toHaveBeenCalledTimes(1);
      expect(result.holderId.id).toBe('holder1');
    });

    test('should reject insufficient signature shares', async () => {
      const shares = [
        {
          holderId: { id: 'holder1' },
          partialSignature: 'sig1',
          proof: 'proof1',
        },
      ];

      await expect(
        service.combineSignatureShares(shares, new Uint8Array([1, 2, 3]), 2)
      ).rejects.toThrow('Insufficient shares: got 1, need 2');
    });

    test('should combine signature shares', async () => {
      const shares = [
        {
          holderId: { id: 'holder1' },
          partialSignature: 'sig1',
          proof: 'proof1',
        },
        {
          holderId: { id: 'holder2' },
          partialSignature: 'sig2',
          proof: 'proof2',
        },
      ];

      const mockCombined = Buffer.from([1, 2, 3, 4, 5]).toString('base64');
      (mockModule.combineSignatureShares as jest.Mock).mockResolvedValue(
        mockCombined
      );

      const result = await service.combineSignatureShares(
        shares,
        new Uint8Array([9, 8, 7]),
        2
      );

      expect(mockModule.combineSignatureShares).toHaveBeenCalledTimes(1);
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });
  });
});


