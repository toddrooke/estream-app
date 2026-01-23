/**
 * Circuit Transport Service
 * 
 * Manages transport for circuit governance operations.
 * Uses HTTP/3 (QUIC) as primary transport with HTTP/1.1 fallback.
 * 
 * Transport Priority:
 * 1. HTTP/3 (QUIC) - Low latency, multiplexed, connection migration
 * 2. HTTP/2 - Fallback for non-QUIC environments
 * 3. HTTP/1.1 - Final fallback
 */

import { NativeModules, Platform } from 'react-native';
import { EventEmitter } from 'events';

const { QuicClient: NativeQuicClient } = NativeModules;

// Check if QUIC native module is available
const QUIC_AVAILABLE = !!NativeQuicClient?.h3Get;

const EDGE_URL = 'https://edge.estream.dev';
const EDGE_H3_URL = 'edge.estream.dev:443'; // HTTP/3 endpoint

export type TransportType = 'h3' | 'h2' | 'h1' | 'unknown';

export interface Circuit {
  id: string;
  type: string;
  description: string;
  status: string;
  environment?: string;
  signatures: unknown[];
  requiredSignatures: number;
  createdAt: string;
  expiresAt?: string;
}

export interface TransportStatus {
  connected: boolean;
  transport: TransportType;
  latencyMs: number;
  lastError?: string;
}

/**
 * Circuit Transport Service
 * 
 * Singleton that manages HTTP/3 and HTTP fallback for circuit operations.
 */
class CircuitTransportServiceImpl extends EventEmitter {
  private static instance: CircuitTransportServiceImpl;
  
  private h3Connected: boolean = false;
  private currentTransport: TransportType = 'unknown';
  private lastLatency: number = 0;
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private streamActive: boolean = false;
  
  private constructor() {
    super();
    this.initTransport();
  }
  
  static getInstance(): CircuitTransportServiceImpl {
    if (!CircuitTransportServiceImpl.instance) {
      CircuitTransportServiceImpl.instance = new CircuitTransportServiceImpl();
    }
    return CircuitTransportServiceImpl.instance;
  }
  
  /**
   * Initialize transport - try HTTP/3 first
   */
  private async initTransport(): Promise<void> {
    if (QUIC_AVAILABLE) {
      try {
        console.log('[CircuitTransport] Attempting HTTP/3 connection...');
        await NativeQuicClient.h3Connect(EDGE_H3_URL);
        this.h3Connected = true;
        this.currentTransport = 'h3';
        console.log('[CircuitTransport] HTTP/3 connected successfully');
      } catch (error) {
        console.log('[CircuitTransport] HTTP/3 failed, falling back to HTTP:', error);
        this.currentTransport = 'h1';
      }
    } else {
      console.log('[CircuitTransport] QUIC not available, using HTTP fallback');
      this.currentTransport = 'h1';
    }
    
    this.emit('transport_ready', this.getStatus());
  }
  
  /**
   * Get current transport status
   */
  getStatus(): TransportStatus {
    return {
      connected: this.h3Connected || this.currentTransport !== 'unknown',
      transport: this.currentTransport,
      latencyMs: this.lastLatency,
    };
  }
  
  /**
   * Fetch pending circuits using best available transport
   */
  async fetchPendingCircuits(): Promise<Circuit[]> {
    const startTime = Date.now();
    
    try {
      let data: { circuits: Circuit[] };
      
      if (this.h3Connected && QUIC_AVAILABLE) {
        // Use HTTP/3
        const result = await NativeQuicClient.h3Get('/api/circuits?status=pending');
        data = JSON.parse(result.body || result);
        this.currentTransport = 'h3';
      } else {
        // Fallback to HTTP
        const response = await fetch(`${EDGE_URL}/api/circuits?status=pending`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        data = await response.json();
        this.currentTransport = 'h1';
      }
      
      this.lastLatency = Date.now() - startTime;
      return data.circuits || [];
      
    } catch (error) {
      console.error('[CircuitTransport] Fetch failed:', error);
      
      // If H3 failed, try HTTP fallback
      if (this.h3Connected) {
        this.h3Connected = false;
        console.log('[CircuitTransport] H3 failed, switching to HTTP fallback');
        return this.fetchPendingCircuits(); // Retry with HTTP
      }
      
      throw error;
    }
  }
  
  /**
   * Submit circuit approval using best available transport
   */
  async submitApproval(approval: {
    circuitId: string;
    signature: string;
    signerKeyHash: string;
    publicKey: string;
    algorithm: string;
    timestamp: number;
  }): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      if (this.h3Connected && QUIC_AVAILABLE) {
        // Use HTTP/3 for write operations (required per security policy)
        const result = await NativeQuicClient.h3Post('/api/circuits/approve', JSON.stringify(approval));
        const response = JSON.parse(result.body || result);
        this.lastLatency = Date.now() - startTime;
        return response.success === true;
      } else {
        // HTTP fallback
        const response = await fetch(`${EDGE_URL}/api/circuits/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(approval),
        });
        this.lastLatency = Date.now() - startTime;
        return response.ok;
      }
    } catch (error) {
      console.error('[CircuitTransport] Submit approval failed:', error);
      
      // Fallback to HTTP if H3 failed
      if (this.h3Connected) {
        this.h3Connected = false;
        return this.submitApproval(approval);
      }
      
      return false;
    }
  }
  
  /**
   * Start streaming circuit updates
   * Uses long-polling over H3 or regular polling over HTTP
   */
  startCircuitStream(onCircuits: (circuits: Circuit[]) => void): void {
    if (this.streamActive) {
      console.log('[CircuitTransport] Stream already active');
      return;
    }
    
    this.streamActive = true;
    console.log(`[CircuitTransport] Starting circuit stream via ${this.currentTransport}`);
    
    const poll = async () => {
      if (!this.streamActive) return;
      
      try {
        const circuits = await this.fetchPendingCircuits();
        onCircuits(circuits);
      } catch (error) {
        console.warn('[CircuitTransport] Poll failed:', error);
      }
    };
    
    // Initial fetch
    poll();
    
    // Poll interval - shorter for H3, longer for HTTP
    const interval = this.h3Connected ? 2000 : 5000;
    this.pollIntervalId = setInterval(poll, interval);
  }
  
  /**
   * Stop circuit streaming
   */
  stopCircuitStream(): void {
    this.streamActive = false;
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    console.log('[CircuitTransport] Circuit stream stopped');
  }
  
  /**
   * Force reconnect to H3
   */
  async reconnectH3(): Promise<boolean> {
    if (!QUIC_AVAILABLE) {
      return false;
    }
    
    try {
      await NativeQuicClient.h3Connect(EDGE_H3_URL);
      this.h3Connected = true;
      this.currentTransport = 'h3';
      console.log('[CircuitTransport] H3 reconnected');
      return true;
    } catch (error) {
      console.error('[CircuitTransport] H3 reconnect failed:', error);
      return false;
    }
  }
  
  /**
   * Check if using HTTP/3
   */
  isUsingH3(): boolean {
    return this.h3Connected && this.currentTransport === 'h3';
  }
}

// Export singleton
export const CircuitTransportService = CircuitTransportServiceImpl.getInstance();
export default CircuitTransportService;
