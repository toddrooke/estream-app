/**
 * Device Module - Device registration and management.
 * 
 * Export hierarchy:
 * - DeviceRegistryService for API interaction
 * - Types for device registration and status
 */

export {
  DeviceRegistryService,
  getDeviceRegistryService,
  resetDeviceRegistryService,
} from './DeviceRegistryService';

export type {
  DeviceRegistryConfig,
  DeviceMetadata,
  AttestationProof,
  RegisterDeviceRequest,
  DeviceRegistration,
  DeviceStatus,
  RevokeDeviceRequest,
  RevokeDeviceResponse,
  ListDevicesResponse,
} from './DeviceRegistryService';


