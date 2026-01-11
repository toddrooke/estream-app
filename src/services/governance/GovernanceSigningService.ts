/**
 * Governance Signing Service
 * 
 * Receives signing requests from the eStream CLI and coordinates
 * with the ML-DSA-87 vault for post-quantum governance signatures.
 * 
 * Communication Methods:
 * 1. Local Network (primary) - CLI sends requests over local network
 * 2. QR Code (fallback) - User scans QR from CLI
 * 
 * Architecture:
 * CLI → Local Server (port 8765) → GovernanceSigningService → ML-DSA Vault → Signature
 */

import { EventEmitter } from 'events';
import bs58 from 'bs58';
import { getMlDsaVaultService, MlDsaVaultService, MlDsaSignature } from '@/services/vault';
import { TrustLevel } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface GovernanceRequest {
  id: string;
  operation: GovernanceOperation;
  description: string;
  timestamp: number;
  expiresAt: number;
  payload: Uint8Array;  // The data to sign (proposal hash)
  metadata: GovernanceMetadata;
}

export type GovernanceOperation = 
  | 'provision'
  | 'deploy'
  | 'release'
  | 'build'
  | 'autoscale'
  | 'network_genesis'
  | 'lattice_create'
  | 'node_approve'
  | 'node_revoke'
  | 'device_register';  // Device registration via Spark

export interface GovernanceMetadata {
  // Provision
  nodeType?: string;
  nodeCount?: number;
  region?: string;
  machineType?: string;
  
  // Deploy
  releaseId?: string;
  targets?: string[];
  strategy?: string;
  
  // Build
  gitRef?: string;
  target?: string;
  
  // Autoscale
  lattice?: string;
  minNodes?: number;
  maxNodes?: number;
  
  // Cost
  estimatedCost?: string;
  
  // Network
  networkId?: string;
  environment?: string;
}

export interface SigningResult {
  requestId: string;
  signature: Uint8Array;
  signerKeyHash: Uint8Array;
  algorithm: 'ML-DSA-87';
  timestamp: number;
  trustLevel: TrustLevel;
}

export interface GovernanceSigningEvents {
  'request': (request: GovernanceRequest) => void;
  'signed': (result: SigningResult) => void;
  'rejected': (requestId: string, reason: string) => void;
  'expired': (requestId: string) => void;
  'error': (error: Error) => void;
  'connection': (connected: boolean) => void;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ============================================================================
// Governance Signing Service Implementation
// ============================================================================

/**
 * Governance Signing Service
 * 
 * Singleton that manages incoming signing requests and coordinates
 * with the ML-DSA-87 vault service.
 */
class GovernanceSigningServiceImpl extends EventEmitter {
  private static instance: GovernanceSigningServiceImpl;
  private pendingRequests: Map<string, GovernanceRequest> = new Map();
  private completedSignatures: Map<string, SigningResult> = new Map();
  private serverPort: number = 8765;
  private isListening: boolean = false;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private mlDsaService: MlDsaVaultService | null = null;
  private expiryCheckerId: ReturnType<typeof setInterval> | null = null;
  
  private constructor() {
    super();
    this.initMlDsa();
    this.startExpiryChecker();
  }
  
  static getInstance(): GovernanceSigningServiceImpl {
    if (!GovernanceSigningServiceImpl.instance) {
      GovernanceSigningServiceImpl.instance = new GovernanceSigningServiceImpl();
    }
    return GovernanceSigningServiceImpl.instance;
  }
  
  /**
   * Initialize the ML-DSA vault service
   */
  private async initMlDsa(): Promise<void> {
    try {
      this.mlDsaService = await getMlDsaVaultService();
      const available = await this.mlDsaService.isMlDsaAvailable();
      console.log(`[GovernanceService] ML-DSA-87 available: ${available}`);
      
      if (available) {
        const keyHash = await this.mlDsaService.getMlDsaKeyHash();
        console.log(`[GovernanceService] Key hash: ${this.toHex(keyHash.slice(0, 8))}...`);
      }
    } catch (error) {
      console.error('[GovernanceService] Failed to init ML-DSA:', error);
      this.emit('error', error as Error);
    }
  }
  
  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }
  
  /**
   * Get ML-DSA key hash (for display)
   */
  async getKeyHash(): Promise<string | null> {
    if (!this.mlDsaService) return null;
    try {
      const hash = await this.mlDsaService.getMlDsaKeyHash();
      return bs58.encode(hash);
    } catch {
      return null;
    }
  }
  
  /**
   * Get ML-DSA trust level
   */
  async getTrustLevel(): Promise<TrustLevel | null> {
    if (!this.mlDsaService) return null;
    try {
      return await this.mlDsaService.getMlDsaTrustLevel();
    } catch {
      return null;
    }
  }
  
  /**
   * Start listening for signing requests from CLI
   * 
   * In React Native, we use a simple HTTP server via native module
   * or polling mechanism for CLI discovery.
   */
  async startListening(): Promise<void> {
    if (this.isListening) return;
    
    this.connectionStatus = 'connecting';
    this.emit('connection', false);
    
    // In production, this would start a local HTTP server using a native module
    // For now, we simulate listening and allow manual request addition
    console.log(`[GovernanceService] Listening for requests on port ${this.serverPort}`);
    
    this.isListening = true;
    this.connectionStatus = 'connected';
    this.emit('connection', true);
  }
  
  /**
   * Stop listening for requests
   */
  stopListening(): void {
    this.isListening = false;
    this.connectionStatus = 'disconnected';
    this.emit('connection', false);
    console.log('[GovernanceService] Stopped listening');
  }
  
  /**
   * Add a request (from QR code scan or local network)
   */
  addRequest(request: GovernanceRequest): void {
    // Check for duplicates
    if (this.pendingRequests.has(request.id)) {
      console.warn(`[GovernanceService] Duplicate request: ${request.id}`);
      return;
    }
    
    // Check if already expired
    if (Date.now() > request.expiresAt) {
      console.warn(`[GovernanceService] Request already expired: ${request.id}`);
      this.emit('expired', request.id);
      return;
    }
    
    this.pendingRequests.set(request.id, request);
    this.emit('request', request);
    
    console.log(`[GovernanceService] New request: ${request.operation} (${request.id})`);
  }
  
  /**
   * Parse a request from QR code data
   */
  parseQRCode(qrData: string): GovernanceRequest {
    try {
      const data = JSON.parse(qrData);
      
      return {
        id: data.id,
        operation: data.op,
        description: data.desc,
        timestamp: data.ts,
        expiresAt: data.exp,
        payload: bs58.decode(data.payload),
        metadata: data.meta || {},
      };
    } catch (error) {
      throw new Error(`Invalid QR code data: ${error}`);
    }
  }
  
  /**
   * Get all pending requests
   */
  getPendingRequests(): GovernanceRequest[] {
    return Array.from(this.pendingRequests.values());
  }
  
  /**
   * Get pending request count
   */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }
  
  /**
   * Get a specific request
   */
  getRequest(id: string): GovernanceRequest | undefined {
    return this.pendingRequests.get(id);
  }
  
  /**
   * Get recent completed signatures
   */
  getRecentSignatures(limit: number = 10): SigningResult[] {
    return Array.from(this.completedSignatures.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  
  /**
   * Sign a request using ML-DSA-87
   */
  async signRequest(requestId: string): Promise<SigningResult> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }
    
    // Check expiry
    if (Date.now() > request.expiresAt) {
      this.pendingRequests.delete(requestId);
      this.emit('expired', requestId);
      throw new Error('Request has expired');
    }
    
    // Ensure ML-DSA service is ready
    if (!this.mlDsaService) {
      await this.initMlDsa();
    }
    
    if (!this.mlDsaService) {
      throw new Error('ML-DSA service not available');
    }
    
    // Sign with ML-DSA-87
    const signature = await this.mlDsaService.signGovernance({
      operation: request.operation,
      description: request.description,
      payload: request.payload,
      metadata: request.metadata,
    });
    
    const trustLevel = await this.mlDsaService.getMlDsaTrustLevel();
    
    const result: SigningResult = {
      requestId,
      signature: signature.signature,
      signerKeyHash: signature.keyHash,
      algorithm: 'ML-DSA-87',
      timestamp: Date.now(),
      trustLevel,
    };
    
    // Remove from pending, add to completed
    this.pendingRequests.delete(requestId);
    this.completedSignatures.set(requestId, result);
    
    // Keep only last 50 signatures
    if (this.completedSignatures.size > 50) {
      const oldest = Array.from(this.completedSignatures.keys())[0];
      this.completedSignatures.delete(oldest);
    }
    
    // Emit signed event
    this.emit('signed', result);
    
    console.log(`[GovernanceService] Signed request: ${requestId}`);
    console.log(`[GovernanceService] Signature: ${signature.signature.length} bytes`);
    
    return result;
  }
  
  /**
   * Reject a request
   */
  rejectRequest(requestId: string, reason: string = 'User rejected'): void {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      console.warn(`[GovernanceService] Request not found for rejection: ${requestId}`);
      return;
    }
    
    this.pendingRequests.delete(requestId);
    this.emit('rejected', requestId, reason);
    
    console.log(`[GovernanceService] Rejected request: ${requestId} (${reason})`);
  }
  
  /**
   * Periodically check for expired requests
   */
  private startExpiryChecker(): void {
    if (this.expiryCheckerId) return;
    
    this.expiryCheckerId = setInterval(() => {
      const now = Date.now();
      
      for (const [id, request] of this.pendingRequests) {
        if (now > request.expiresAt) {
          this.pendingRequests.delete(id);
          this.emit('expired', id);
          console.log(`[GovernanceService] Request expired: ${id}`);
        }
      }
    }, 10000); // Check every 10 seconds
  }
  
  /**
   * Format operation for display
   */
  formatOperation(request: GovernanceRequest): string {
    const { operation, metadata } = request;
    
    switch (operation) {
      case 'provision':
        return `Provision ${metadata.nodeCount || 0} ${metadata.nodeType || 'node'}(s) in ${metadata.region || 'unknown'}`;
      case 'deploy':
        return `Deploy ${metadata.releaseId || 'unknown'} to ${metadata.targets?.join(', ') || 'unknown'}`;
      case 'build':
        return `Build ${metadata.target || 'unknown'} from ${metadata.gitRef || 'unknown'}`;
      case 'autoscale':
        return `Configure autoscale for ${metadata.lattice || 'unknown'} (${metadata.minNodes}-${metadata.maxNodes} nodes)`;
      case 'network_genesis':
        return `Create network: ${metadata.networkId || 'new'}`;
      case 'lattice_create':
        return `Create lattice: ${metadata.lattice || 'new'}`;
      case 'node_approve':
        return `Approve node: ${metadata.nodeType || 'unknown'}`;
      case 'node_revoke':
        return `Revoke node: ${metadata.nodeType || 'unknown'}`;
      default:
        return request.description || operation;
    }
  }
  
  /**
   * Get operation icon
   */
  getOperationIcon(operation: GovernanceOperation): string {
    const icons: Record<GovernanceOperation, string> = {
      provision: '🖥️',
      deploy: '🚀',
      release: '📦',
      build: '🔨',
      autoscale: '📈',
      network_genesis: '🌐',
      lattice_create: '🔗',
      node_approve: '✅',
      node_revoke: '❌',
    };
    return icons[operation] || '📋';
  }
  
  /**
   * Cleanup
   */
  destroy(): void {
    if (this.expiryCheckerId) {
      clearInterval(this.expiryCheckerId);
      this.expiryCheckerId = null;
    }
    this.stopListening();
    this.pendingRequests.clear();
    this.completedSignatures.clear();
    this.removeAllListeners();
  }
  
  // Utility
  private toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

// Export singleton
export const GovernanceSigningService = GovernanceSigningServiceImpl.getInstance();

// Export types for consumers
export type { MlDsaSignature } from '@/services/vault';
