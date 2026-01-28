/**
 * eStream Client Service
 * 
 * Unified interface for interacting with the eStream network via the native SDK.
 * Uses estream-client under the hood for consistent API with the desktop app.
 */

import { NativeModules, Platform } from 'react-native';
import { networkConfig } from '@estream/react-native';

// Native module interface
interface EstreamClientModule {
  nativeGetNetworkInfo(consoleUrl: string): Promise<ArrayBuffer>;
  nativeGetPendingApprovals(consoleUrl: string): Promise<ArrayBuffer>;
  nativeSubmitApproval(
    consoleUrl: string,
    requestId: string,
    secretKeyHex: string,
    approve: boolean
  ): Promise<ArrayBuffer>;
  nativeStartSparkChallenge(
    consoleUrl: string,
    identityId: string
  ): Promise<ArrayBuffer>;
  nativeSubmitSparkMotion(
    consoleUrl: string,
    challengeId: string,
    motionDataJson: string
  ): Promise<ArrayBuffer>;
}

const NativeClient: EstreamClientModule | null = NativeModules.EstreamClientModule;

// Types matching estream-client
export interface NetworkInfo {
  status: string;
  active_nodes: number;
  total_lattices: number;
  tps: number;
  avg_latency_ms: number;
  uptime: number;
  cost_per_hour: number;
}

export interface LatticeInfo {
  id: string;
  name: string;
  status: string;
  node_count: number;
  tps: number;
  cost_per_hour: number;
}

export interface NodeInfo {
  id: string;
  node_type: string;
  region: string;
  status: string;
  uptime: string;
  load: number;
}

export interface SigningRequest {
  id: string;
  request_type: string;
  title: string;
  description: string;
  payload_hash: string;
  required_signers: string[];
  signatures: string[];
  created_at: number;
  expires_at: number;
}

export interface SigningResult {
  request_id: string;
  key_name: string;
  signature: string;
  signed_at: number;
}

export interface SparkChallenge {
  id: string;
  identity_id: string;
  created_at: number;
  expires_at: number;
  motion_sequence: SparkMotion[];
  display_data: string;
}

export interface SparkMotion {
  timestamp_ms: number;
  x: number;
  y: number;
  z: number;
}

export interface SparkResult {
  challenge_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  verified_at?: number;
  error_message?: string;
}

// Get console URL from network config (changes based on selected environment)
const getDefaultConsoleUrl = () => networkConfig.getEndpoints().consoleUrl;

/**
 * eStream Client Service
 * 
 * Provides access to network, governance, and Spark authentication.
 */
export class EstreamClientService {
  private consoleUrl: string;

  constructor(consoleUrl?: string) {
    this.consoleUrl = consoleUrl || getDefaultConsoleUrl();
  }

  /**
   * Check if the native module is available
   */
  isAvailable(): boolean {
    return NativeClient != null;
  }

  /**
   * Set the console URL
   */
  setConsoleUrl(url: string): void {
    this.consoleUrl = url;
  }

  // ==========================================================================
  // Network
  // ==========================================================================

  /**
   * Get network status and metrics
   */
  async getNetworkInfo(): Promise<NetworkInfo> {
    if (!NativeClient) {
      // Return mock data for development
      return {
        status: 'active',
        active_nodes: 12,
        total_lattices: 3,
        tps: 1450.5,
        avg_latency_ms: 45,
        uptime: 0.9998,
        cost_per_hour: 2.50,
      };
    }

    const result = await NativeClient.nativeGetNetworkInfo(this.consoleUrl);
    return JSON.parse(Buffer.from(result).toString('utf8'));
  }

  // ==========================================================================
  // Governance
  // ==========================================================================

  /**
   * Get pending governance approval requests
   */
  async getPendingApprovals(): Promise<SigningRequest[]> {
    if (!NativeClient) {
      // Return mock data for development
      return [];
    }

    const result = await NativeClient.nativeGetPendingApprovals(this.consoleUrl);
    return JSON.parse(Buffer.from(result).toString('utf8'));
  }

  /**
   * Submit an approval for a governance request
   */
  async submitApproval(
    requestId: string,
    secretKeyHex: string,
    approve: boolean
  ): Promise<SigningResult> {
    if (!NativeClient) {
      throw new Error('Native module not available');
    }

    const result = await NativeClient.nativeSubmitApproval(
      this.consoleUrl,
      requestId,
      secretKeyHex,
      approve
    );
    return JSON.parse(Buffer.from(result).toString('utf8'));
  }

  // ==========================================================================
  // Spark Visual Authentication
  // ==========================================================================

  /**
   * Start a new Spark challenge for identity verification
   */
  async startSparkChallenge(identityId: string): Promise<SparkChallenge> {
    if (!NativeClient) {
      // Return mock challenge for development
      const now = Date.now();
      return {
        id: `spark-${now}`,
        identity_id: identityId,
        created_at: now,
        expires_at: now + 60000, // 1 minute
        motion_sequence: [
          { timestamp_ms: 0, x: 0, y: 0, z: 0 },
          { timestamp_ms: 500, x: 0.5, y: 0.3, z: 0.1 },
          { timestamp_ms: 1000, x: 1.0, y: 0.8, z: 0.2 },
        ],
        display_data: 'mock-qr-data',
      };
    }

    const result = await NativeClient.nativeStartSparkChallenge(
      this.consoleUrl,
      identityId
    );
    return JSON.parse(Buffer.from(result).toString('utf8'));
  }

  /**
   * Submit motion data for Spark verification
   */
  async submitSparkMotion(
    challengeId: string,
    motionData: SparkMotion[]
  ): Promise<SparkResult> {
    if (!NativeClient) {
      // Return mock result for development
      return {
        challenge_id: challengeId,
        status: 'approved',
        verified_at: Date.now(),
      };
    }

    const result = await NativeClient.nativeSubmitSparkMotion(
      this.consoleUrl,
      challengeId,
      JSON.stringify(motionData)
    );
    return JSON.parse(Buffer.from(result).toString('utf8'));
  }
}

// Singleton instance
export const estreamClient = new EstreamClientService();
