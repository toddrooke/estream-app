/**
 * Signing Server
 * 
 * Local HTTP server that receives signing requests from the CLI.
 * Runs on port 8765 and exposes endpoints for:
 * - Discovery: GET /health
 * - Request signing: POST /sign
 * - Check status: GET /status/:requestId
 * 
 * Uses react-native's fetch polyfill for the server-side.
 * In production, this would use a native HTTP server module.
 */

import { Platform, NativeModules, DeviceEventEmitter, NativeEventEmitter } from 'react-native';
import { GovernanceSigningService, GovernanceRequest, SigningResult } from './GovernanceSigningService';
import bs58 from 'bs58';

const SERVER_PORT = 8765;

// Native module interface
interface SigningServerNative {
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
  isRunning(): Promise<boolean>;
  getPendingRequests(): Promise<string[]>;
  markSigned(requestId: string, signatureB58: string, keyHashB58: string): Promise<boolean>;
  markRejected(requestId: string, reason: string): Promise<boolean>;
}

const SigningServerNative: SigningServerNative | null = 
  Platform.OS === 'android' ? NativeModules.SigningServerModule : null;

// Debug: Log native module availability
console.log('[SigningServer] Platform:', Platform.OS);
console.log('[SigningServer] NativeModules available:', Object.keys(NativeModules));
console.log('[SigningServer] SigningServerModule:', SigningServerNative ? 'AVAILABLE' : 'NOT AVAILABLE');

// Response types
interface HealthResponse {
  status: 'ok';
  version: string;
  keyHash: string | null;
  trustLevel: string | null;
  pendingRequests: number;
}

interface SignRequestBody {
  id: string;
  operation: string;
  description: string;
  timestamp: number;
  expiresAt: number;
  payload: string;  // Base58 encoded
  metadata?: Record<string, unknown>;
}

interface SignResponse {
  success: boolean;
  requestId: string;
  message: string;
}

interface StatusResponse {
  requestId: string;
  status: 'pending' | 'signed' | 'rejected' | 'expired' | 'not_found';
  signature?: string;      // Base58 encoded
  signerKeyHash?: string;  // Base58 encoded
  algorithm?: 'ML-DSA-87';
  timestamp?: number;
}

/**
 * Signing Server Manager
 * 
 * Manages the local HTTP server for CLI communication.
 */
class SigningServerManager {
  private static instance: SigningServerManager;
  private isRunning: boolean = false;
  private serverHandle: number | null = null;
  private completedSignatures: Map<string, SigningResult> = new Map();
  private rejectedRequests: Set<string> = new Set();
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  
  private constructor() {
    // Listen for signing results and sync with native module
    GovernanceSigningService.on('signed', async (result: SigningResult) => {
      this.completedSignatures.set(result.requestId, result);
      
      // Sync with native module if available
      if (SigningServerNative) {
        try {
          await SigningServerNative.markSigned(
            result.requestId,
            bs58.encode(result.signature),
            bs58.encode(result.signerKeyHash)
          );
        } catch (error) {
          console.warn('[SigningServer] Failed to sync signed state:', error);
        }
      }
    });
    
    GovernanceSigningService.on('rejected', async (requestId: string) => {
      this.rejectedRequests.add(requestId);
      
      // Sync with native module if available
      if (SigningServerNative) {
        try {
          await SigningServerNative.markRejected(requestId, 'User rejected');
        } catch (error) {
          console.warn('[SigningServer] Failed to sync rejected state:', error);
        }
      }
    });
    
    // Listen for native module events (incoming CLI requests)
    if (Platform.OS === 'android' && SigningServerNative) {
      const eventEmitter = new NativeEventEmitter(NativeModules.SigningServerModule);
      eventEmitter.addListener('onSigningRequest', (event) => {
        console.log('[SigningServer] Received request from CLI:', event);
        
        // Parse and add to GovernanceSigningService
        try {
          const request: GovernanceRequest = {
            id: event.requestId,
            operation: event.operation || 'sign',
            description: event.description || 'Signing request from CLI',
            timestamp: Date.now(),
            expiresAt: Date.now() + 5 * 60 * 1000,
            payload: bs58.decode(event.payload),
            metadata: event.metadata || {},
          };
          
          GovernanceSigningService.addRequest(request);
        } catch (error) {
          console.error('[SigningServer] Failed to parse request:', error);
        }
      });
    }
  }
  
  static getInstance(): SigningServerManager {
    if (!SigningServerManager.instance) {
      SigningServerManager.instance = new SigningServerManager();
    }
    return SigningServerManager.instance;
  }
  
  /**
   * Start the signing server
   */
  async start(): Promise<boolean> {
    if (this.isRunning) {
      console.log('[SigningServer] Already running');
      return true;
    }
    
    this.connectionStatus = 'connecting';
    
    try {
      console.log(`[SigningServer] Starting on port ${SERVER_PORT}...`);
      
      // Start native HTTP server if available (Android)
      if (SigningServerNative) {
        const started = await SigningServerNative.start();
        if (!started) {
          throw new Error('Native server failed to start');
        }
        console.log('[SigningServer] Native HTTP server started');
      }
      
      // Start listening for requests via GovernanceSigningService
      await GovernanceSigningService.startListening();
      
      this.isRunning = true;
      this.connectionStatus = 'connected';
      console.log(`[SigningServer] Ready on port ${SERVER_PORT}`);
      
      return true;
    } catch (error) {
      console.error('[SigningServer] Failed to start:', error);
      this.connectionStatus = 'error';
      return false;
    }
  }
  
  /**
   * Stop the signing server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    // Stop native HTTP server if available
    if (SigningServerNative) {
      try {
        await SigningServerNative.stop();
        console.log('[SigningServer] Native HTTP server stopped');
      } catch (error) {
        console.warn('[SigningServer] Failed to stop native server:', error);
      }
    }
    
    GovernanceSigningService.stopListening();
    this.isRunning = false;
    this.connectionStatus = 'disconnected';
    
    console.log('[SigningServer] Stopped');
  }
  
  /**
   * Get server status for health check
   */
  async getHealth(): Promise<HealthResponse> {
    const keyHash = await GovernanceSigningService.getKeyHash();
    const trustLevel = await GovernanceSigningService.getTrustLevel();
    
    return {
      status: 'ok',
      version: '0.3.0',
      keyHash,
      trustLevel: trustLevel !== null ? String(trustLevel) : null,
      pendingRequests: GovernanceSigningService.getPendingCount(),
    };
  }
  
  /**
   * Handle incoming sign request from CLI
   */
  async handleSignRequest(body: SignRequestBody): Promise<SignResponse> {
    try {
      // Validate request
      if (!body.id || !body.operation || !body.payload) {
        return {
          success: false,
          requestId: body.id || 'unknown',
          message: 'Missing required fields: id, operation, payload',
        };
      }
      
      // Parse request
      const request: GovernanceRequest = {
        id: body.id,
        operation: body.operation as GovernanceRequest['operation'],
        description: body.description || body.operation,
        timestamp: body.timestamp || Date.now(),
        expiresAt: body.expiresAt || Date.now() + 5 * 60 * 1000,
        payload: bs58.decode(body.payload),
        metadata: body.metadata || {},
      };
      
      // Add to pending requests
      GovernanceSigningService.addRequest(request);
      
      return {
        success: true,
        requestId: body.id,
        message: 'Request added. Waiting for user approval.',
      };
    } catch (error) {
      return {
        success: false,
        requestId: body.id || 'unknown',
        message: `Error: ${error}`,
      };
    }
  }
  
  /**
   * Get status of a signing request
   */
  async getRequestStatus(requestId: string): Promise<StatusResponse> {
    // Check if signed
    const signature = this.completedSignatures.get(requestId);
    if (signature) {
      return {
        requestId,
        status: 'signed',
        signature: bs58.encode(signature.signature),
        signerKeyHash: bs58.encode(signature.signerKeyHash),
        algorithm: signature.algorithm,
        timestamp: signature.timestamp,
      };
    }
    
    // Check if rejected
    if (this.rejectedRequests.has(requestId)) {
      return {
        requestId,
        status: 'rejected',
      };
    }
    
    // Check if pending
    const pending = GovernanceSigningService.getRequest(requestId);
    if (pending) {
      // Check if expired
      if (Date.now() > pending.expiresAt) {
        return {
          requestId,
          status: 'expired',
        };
      }
      
      return {
        requestId,
        status: 'pending',
      };
    }
    
    return {
      requestId,
      status: 'not_found',
    };
  }
  
  /**
   * Get local IP address for CLI discovery
   */
  getLocalAddress(): string {
    // This would come from a native module in production
    // For now, return a placeholder
    return `http://localhost:${SERVER_PORT}`;
  }
  
  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }
}

// Export singleton
export const SigningServer = SigningServerManager.getInstance();

// Export types
export type { HealthResponse, SignRequestBody, SignResponse, StatusResponse };
