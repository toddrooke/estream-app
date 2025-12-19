/**
 * DeviceRegistryService Tests
 * 
 * Tests for the device registry client.
 */

import {
  DeviceRegistryService,
  DeviceMetadata,
  RegisterDeviceRequest,
  resetDeviceRegistryService,
} from '../../src/services/device';

// Mock fetch
global.fetch = jest.fn();

describe('DeviceRegistryService', () => {
  let service: DeviceRegistryService;

  beforeEach(() => {
    resetDeviceRegistryService();
    service = new DeviceRegistryService({
      baseUrl: 'http://localhost:8080',
      authToken: 'test-token',
    });
    jest.clearAllMocks();
  });

  describe('registerDevice', () => {
    it('should register a device successfully', async () => {
      const mockResponse = {
        device_id: 'device-123',
        trust_level: 'HardwareBacked',
        status: 'Active',
        registered_at: 1703001234,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const request: RegisterDeviceRequest = {
        appId: 'io.estream.app',
        namespace: 'estream',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        deviceFingerprint: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
        metadata: {
          securityLevel: 'strongbox',
          deviceClass: 'seeker',
          appVersion: '1.0.0',
          nickname: 'My Seeker',
        },
        signature: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC==',
      };

      const result = await service.registerDevice(request);

      expect(result.deviceId).toBe('device-123');
      expect(result.trustLevel).toBe('HardwareBacked');
      expect(result.status).toBe('Active');
      
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/devices/register',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle registration errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Device already registered',
      });

      const request: RegisterDeviceRequest = {
        appId: 'io.estream.app',
        namespace: 'estream',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        deviceFingerprint: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
        metadata: {
          securityLevel: 'strongbox',
          deviceClass: 'seeker',
          appVersion: '1.0.0',
        },
        signature: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC==',
      };

      await expect(service.registerDevice(request)).rejects.toThrow('API error 400');
    });
  });

  describe('getDeviceStatus', () => {
    it('should get device status', async () => {
      const mockResponse = {
        device_id: 'device-123',
        public_key: '0101010101010101010101010101010101010101010101010101010101010101',
        trust_level: 'HardwareBacked',
        status: 'Active',
        registered_at: 1703001234,
        last_seen: 1703005678,
        anchored: false,
        metadata: {
          security_level: 'strongbox',
          device_class: 'seeker',
          app_version: '1.0.0',
          nickname: 'My Seeker',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await service.getDeviceStatus('device-123');

      expect(result).not.toBeNull();
      expect(result!.deviceId).toBe('device-123');
      expect(result!.trustLevel).toBe('HardwareBacked');
      expect(result!.metadata.securityLevel).toBe('strongbox');
    });

    it('should return null for non-existent device', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Device not found',
      });

      const result = await service.getDeviceStatus('non-existent');
      
      expect(result).toBeNull();
    });
  });

  describe('revokeDevice', () => {
    it('should revoke a device', async () => {
      const mockResponse = {
        device_id: 'device-123',
        status: 'Revoked',
        revoked_at: 1703009999,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.revokeDevice('device-123', 'Compromised');

      expect(result.deviceId).toBe('device-123');
      expect(result.status).toBe('Revoked');
      
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/devices/device-123/revoke',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: 'Compromised' }),
        })
      );
    });
  });

  describe('listDevices', () => {
    it('should list all devices', async () => {
      const mockResponse = {
        devices: [
          {
            device_id: 'device-1',
            public_key: '0101010101010101010101010101010101010101010101010101010101010101',
            trust_level: 'HardwareBacked',
            status: 'Active',
            registered_at: 1703001234,
            last_seen: 1703005678,
            anchored: false,
            metadata: {
              security_level: 'strongbox',
              device_class: 'seeker',
              app_version: '1.0.0',
            },
          },
          {
            device_id: 'device-2',
            public_key: '0202020202020202020202020202020202020202020202020202020202020202',
            trust_level: 'SoftwareBacked',
            status: 'Active',
            registered_at: 1703002345,
            last_seen: 1703006789,
            anchored: true,
            anchor_signature: 'abc123',
            anchor_slot: 12345,
            metadata: {
              security_level: 'software',
              device_class: 'android_mobile',
              app_version: '1.0.0',
            },
          },
        ],
        count: 2,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.listDevices();

      expect(result.count).toBe(2);
      expect(result.devices).toHaveLength(2);
      expect(result.devices[0].deviceId).toBe('device-1');
      expect(result.devices[1].anchored).toBe(true);
    });
  });

  describe('setAuthToken', () => {
    it('should update the auth token', async () => {
      service.setAuthToken('new-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ devices: [], count: 0 }),
      });

      await service.listDevices();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer new-token',
          }),
        })
      );
    });
  });
});


