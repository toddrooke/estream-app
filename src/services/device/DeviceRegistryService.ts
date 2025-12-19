/**
 * Device Registry Service
 * 
 * Client for the eStream device registry API.
 * Handles device registration, status queries, and revocation.
 * 
 * See: estream-core/src/api/handlers.rs for API implementation
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Device metadata for registration
 */
export interface DeviceMetadata {
  /** Security level: "strongbox", "tee", "software", "unknown" */
  securityLevel: string;
  /** Device class: "seeker", "android_mobile", "ios_mobile", "browser", "server" */
  deviceClass: string;
  /** App version */
  appVersion: string;
  /** Optional user-provided nickname */
  nickname?: string;
}

/**
 * Attestation proof for device registration
 */
export interface AttestationProof {
  /** Certificate chain (base64 encoded DER certificates) */
  certificates: string[];
  /** Challenge used for attestation (hex) */
  challenge: string;
  /** Timestamp of attestation */
  timestamp: number;
}

/**
 * Device registration request
 */
export interface RegisterDeviceRequest {
  /** App identifier (e.g., "io.estream.app") */
  appId: string;
  /** App namespace for key derivation */
  namespace: string;
  /** Device's public key (base64 encoded, 32 bytes) */
  publicKey: string;
  /** Blind device fingerprint (base64 encoded, 32 bytes) */
  deviceFingerprint: string;
  /** Device metadata */
  metadata: DeviceMetadata;
  /** Attestation proof (optional) */
  attestation?: AttestationProof;
  /** Signature over the request (base64 encoded, 64 bytes) */
  signature: string;
}

/**
 * Device registration response
 */
export interface DeviceRegistration {
  /** Unique device ID */
  deviceId: string;
  /** Trust level assigned */
  trustLevel: string;
  /** Device status */
  status: string;
  /** Registration timestamp */
  registeredAt: number;
}

/**
 * Device status response
 */
export interface DeviceStatus {
  /** Unique device ID */
  deviceId: string;
  /** Public key (hex encoded) */
  publicKey: string;
  /** Trust level */
  trustLevel: string;
  /** Device status */
  status: string;
  /** Registration timestamp */
  registeredAt: number;
  /** Last seen timestamp */
  lastSeen: number;
  /** Whether device is anchored on-chain */
  anchored: boolean;
  /** Solana signature (if anchored) */
  anchorSignature?: string;
  /** Solana slot (if anchored) */
  anchorSlot?: number;
  /** Device metadata */
  metadata: DeviceMetadata;
}

/**
 * Device revocation request
 */
export interface RevokeDeviceRequest {
  /** Reason for revocation */
  reason: string;
}

/**
 * Device revocation response
 */
export interface RevokeDeviceResponse {
  /** Device ID */
  deviceId: string;
  /** New status */
  status: string;
  /** Revocation timestamp */
  revokedAt: number;
}

/**
 * List devices response
 */
export interface ListDevicesResponse {
  /** List of devices */
  devices: DeviceStatus[];
  /** Total count */
  count: number;
}

// ============================================================================
// Service Configuration
// ============================================================================

export interface DeviceRegistryConfig {
  /** Base URL of the eStream API */
  baseUrl: string;
  /** Auth token for API calls */
  authToken?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Device Registry Service
 * 
 * Manages device registration and status with the eStream API.
 */
export class DeviceRegistryService {
  private config: Required<DeviceRegistryConfig>;

  constructor(config: DeviceRegistryConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''), // Remove trailing slash
      authToken: config.authToken || '',
      timeout: config.timeout || 30000,
    };
  }

  /**
   * Register a new device with the registry.
   * 
   * @param request - Registration request with device info and attestation
   * @returns Device registration result
   */
  async registerDevice(request: RegisterDeviceRequest): Promise<DeviceRegistration> {
    const response = await this.fetch('/api/v1/devices/register', {
      method: 'POST',
      body: JSON.stringify({
        app_id: request.appId,
        namespace: request.namespace,
        public_key: request.publicKey,
        device_fingerprint: request.deviceFingerprint,
        metadata: {
          security_level: request.metadata.securityLevel,
          device_class: request.metadata.deviceClass,
          app_version: request.metadata.appVersion,
          nickname: request.metadata.nickname,
        },
        attestation: request.attestation ? {
          certificates: request.attestation.certificates,
          challenge: request.attestation.challenge,
          timestamp: request.attestation.timestamp,
        } : undefined,
        signature: request.signature,
      }),
    });

    const data = await response.json();
    
    return {
      deviceId: data.device_id,
      trustLevel: data.trust_level,
      status: data.status,
      registeredAt: data.registered_at,
    };
  }

  /**
   * Get device status by ID.
   * 
   * @param deviceId - The device ID to query
   * @returns Device status or null if not found
   */
  async getDeviceStatus(deviceId: string): Promise<DeviceStatus | null> {
    try {
      const response = await this.fetch(`/api/v1/devices/${encodeURIComponent(deviceId)}`, {
        method: 'GET',
      });

      if (response.status === 404) {
        return null;
      }

      const data = await response.json();
      
      return this.parseDeviceStatus(data);
    } catch (error: any) {
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Revoke a device.
   * 
   * @param deviceId - The device ID to revoke
   * @param reason - Reason for revocation
   * @returns Revocation result
   */
  async revokeDevice(deviceId: string, reason: string): Promise<RevokeDeviceResponse> {
    const response = await this.fetch(`/api/v1/devices/${encodeURIComponent(deviceId)}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });

    const data = await response.json();
    
    return {
      deviceId: data.device_id,
      status: data.status,
      revokedAt: data.revoked_at,
    };
  }

  /**
   * List all active devices.
   * 
   * @returns List of active devices
   */
  async listDevices(): Promise<ListDevicesResponse> {
    const response = await this.fetch('/api/v1/devices', {
      method: 'GET',
    });

    const data = await response.json();
    
    return {
      devices: data.devices.map((d: any) => this.parseDeviceStatus(d)),
      count: data.count,
    };
  }

  /**
   * Update the auth token.
   */
  setAuthToken(token: string): void {
    this.config.authToken = token;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async fetch(path: string, options: RequestInit): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API error ${response.status}: ${errorBody}`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseDeviceStatus(data: any): DeviceStatus {
    return {
      deviceId: data.device_id,
      publicKey: data.public_key,
      trustLevel: data.trust_level,
      status: data.status,
      registeredAt: data.registered_at,
      lastSeen: data.last_seen,
      anchored: data.anchored,
      anchorSignature: data.anchor_signature,
      anchorSlot: data.anchor_slot,
      metadata: {
        securityLevel: data.metadata.security_level,
        deviceClass: data.metadata.device_class,
        appVersion: data.metadata.app_version,
        nickname: data.metadata.nickname,
      },
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let serviceInstance: DeviceRegistryService | null = null;

/**
 * Get the device registry service singleton.
 */
export function getDeviceRegistryService(config?: DeviceRegistryConfig): DeviceRegistryService {
  if (!serviceInstance && config) {
    serviceInstance = new DeviceRegistryService(config);
  }
  if (!serviceInstance) {
    throw new Error('DeviceRegistryService not initialized. Call with config first.');
  }
  return serviceInstance;
}

/**
 * Reset the service (for testing).
 */
export function resetDeviceRegistryService(): void {
  serviceInstance = null;
}


