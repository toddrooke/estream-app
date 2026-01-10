/**
 * Native Estream Service
 * 
 * Create, sign, verify, and emit native estreams from the mobile app.
 * Provides event logging for debugging and development.
 */

import { NativeModules, DeviceEventEmitter } from 'react-native';
import { Buffer } from 'buffer';

const { QuicClient } = NativeModules;

export interface EstreamInfo {
  content_id: string;
  content_hash?: string;
  type_num: number;
  resource: string;
  timestamp: number;
  payload_len: number;
  is_signed: boolean;
  is_expired: boolean;
  has_self_parent: boolean;
  has_other_parent: boolean;
}

export interface EstreamEvent {
  id: string;
  type: 'create' | 'sign' | 'verify' | 'emit' | 'receive' | 'parse' | 'error' | 'bridge';
  timestamp: Date;
  contentId?: string;
  typeNum?: number;
  resource?: string;
  payloadLen?: number;
  success: boolean;
  durationMs: number;
  details?: string;
}

// Bridge-related types
export interface BridgeStatus {
  status: 'active' | 'paused' | 'offline';
  pendingEvents: number;
  pendingBatches: number;
  confirmedAnchors: number;
  lastAnchorSlot?: number;
}

export interface MerkleProof {
  eventId: string;
  batchId: string;
  merkleRoot: string;
  proofPath: Array<{ hash: string; position: 'left' | 'right' }>;
  anchorStatus: 'pending' | 'submitted' | 'confirmed';
  solanaSlot?: number;
  solanaSignature?: string;
}

export type EstreamEventHandler = (event: EstreamEvent) => void;

/**
 * Estream Service for native estream operations
 */
class EstreamServiceImpl {
  private eventId = 0;
  private eventHandlers: Set<EstreamEventHandler> = new Set();
  private events: EstreamEvent[] = [];
  private maxEvents = 100;

  /**
   * Subscribe to estream events
   */
  onEvent(handler: EstreamEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Get recent events
   */
  getEvents(): EstreamEvent[] {
    return [...this.events];
  }

  /**
   * Clear event history
   */
  clearEvents(): void {
    this.events = [];
  }

  private emitEvent(event: Omit<EstreamEvent, 'id'>): void {
    const fullEvent: EstreamEvent = {
      ...event,
      id: `es-${++this.eventId}`,
    };
    
    this.events.unshift(fullEvent);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }
    
    this.eventHandlers.forEach(handler => handler(fullEvent));
    
    // Also emit to React Native event system
    DeviceEventEmitter.emit('estreamEvent', fullEvent);
  }

  /**
   * Create a new estream
   */
  async create(
    appId: string,
    typeNum: number,
    resource: string,
    payload: string | Uint8Array
  ): Promise<any> {
    const start = Date.now();
    
    try {
      // Convert payload to base64
      const payloadBytes = typeof payload === 'string' 
        ? Buffer.from(payload, 'utf-8')
        : Buffer.from(payload);
      const payloadBase64 = payloadBytes.toString('base64');
      
      console.log(`[Estream] Creating: app=${appId} type=${typeNum} resource=${resource}`);
      
      const resultJson = await QuicClient.estreamCreate(appId, typeNum, resource, payloadBase64);
      const estream = JSON.parse(resultJson);
      
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'create',
        timestamp: new Date(),
        contentId: estream.content_id || 'pending',
        typeNum,
        resource,
        payloadLen: payloadBytes.length,
        success: true,
        durationMs: duration,
        details: `Created in ${duration}ms`,
      });
      
      console.log(`[Estream] Created successfully in ${duration}ms`);
      return estream;
    } catch (error: any) {
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'create',
        timestamp: new Date(),
        typeNum,
        resource,
        success: false,
        durationMs: duration,
        details: error.message,
      });
      
      console.error(`[Estream] Create failed:`, error);
      throw error;
    }
  }

  /**
   * Sign an estream
   */
  async sign(estream: any, deviceKeysHandle: number = 0): Promise<any> {
    const start = Date.now();
    const estreamJson = JSON.stringify(estream);
    
    try {
      console.log(`[Estream] Signing estream...`);
      
      const resultJson = await QuicClient.estreamSign(estreamJson, deviceKeysHandle);
      const signed = JSON.parse(resultJson);
      
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'sign',
        timestamp: new Date(),
        contentId: signed.content_id,
        typeNum: signed.type_id?.type_num,
        resource: signed.resource,
        success: true,
        durationMs: duration,
        details: `Signed with ML-DSA-87 in ${duration}ms`,
      });
      
      console.log(`[Estream] Signed successfully in ${duration}ms`);
      return signed;
    } catch (error: any) {
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'sign',
        timestamp: new Date(),
        success: false,
        durationMs: duration,
        details: error.message,
      });
      
      console.error(`[Estream] Sign failed:`, error);
      throw error;
    }
  }

  /**
   * Verify an estream signature
   */
  async verify(estream: any): Promise<boolean> {
    const start = Date.now();
    const estreamJson = JSON.stringify(estream);
    
    try {
      console.log(`[Estream] Verifying signature...`);
      
      const valid = await QuicClient.estreamVerify(estreamJson);
      
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'verify',
        timestamp: new Date(),
        contentId: estream.content_id,
        success: valid,
        durationMs: duration,
        details: valid ? `Valid signature (${duration}ms)` : 'Invalid signature',
      });
      
      console.log(`[Estream] Verification: ${valid ? 'VALID' : 'INVALID'} in ${duration}ms`);
      return valid;
    } catch (error: any) {
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'verify',
        timestamp: new Date(),
        success: false,
        durationMs: duration,
        details: error.message,
      });
      
      console.error(`[Estream] Verify failed:`, error);
      throw error;
    }
  }

  /**
   * Parse estream and get info
   */
  async parse(estream: any): Promise<EstreamInfo> {
    const start = Date.now();
    const estreamJson = JSON.stringify(estream);
    
    try {
      const resultJson = await QuicClient.estreamParse(estreamJson);
      const info: EstreamInfo = JSON.parse(resultJson);
      
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'parse',
        timestamp: new Date(),
        contentId: info.content_id,
        typeNum: info.type_num,
        resource: info.resource,
        payloadLen: info.payload_len,
        success: true,
        durationMs: duration,
      });
      
      return info;
    } catch (error: any) {
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'parse',
        timestamp: new Date(),
        success: false,
        durationMs: duration,
        details: error.message,
      });
      
      throw error;
    }
  }

  /**
   * Convert estream to MessagePack (compact binary)
   */
  async toMsgpack(estream: any): Promise<string> {
    const estreamJson = JSON.stringify(estream);
    const base64 = await QuicClient.estreamToMsgpack(estreamJson);
    console.log(`[Estream] Converted to msgpack: ${base64.length} chars (base64)`);
    return base64;
  }

  /**
   * Parse estream from MessagePack
   */
  async fromMsgpack(msgpackBase64: string): Promise<any> {
    const resultJson = await QuicClient.estreamFromMsgpack(msgpackBase64);
    return JSON.parse(resultJson);
  }

  /**
   * Emit estream to network (via H3)
   */
  async emit(estream: any): Promise<{ content_id: string }> {
    const start = Date.now();
    
    try {
      console.log(`[Estream] Emitting to network...`);
      
      const estreamJson = JSON.stringify(estream);
      const resultJson = await QuicClient.h3Post('/api/v1/emit', estreamJson);
      const result = JSON.parse(resultJson);
      
      if (result.success === false) {
        throw new Error(result.error || 'Emit failed');
      }
      
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'emit',
        timestamp: new Date(),
        contentId: result.content_id || estream.content_id,
        typeNum: estream.type_id?.type_num,
        resource: estream.resource,
        success: true,
        durationMs: duration,
        details: `Emitted in ${duration}ms`,
      });
      
      console.log(`[Estream] Emitted successfully in ${duration}ms`);
      return result;
    } catch (error: any) {
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'emit',
        timestamp: new Date(),
        success: false,
        durationMs: duration,
        details: error.message,
      });
      
      console.error(`[Estream] Emit failed:`, error);
      throw error;
    }
  }

  /**
   * Create, sign, and emit an estream in one call
   */
  async createAndEmit(
    appId: string,
    typeNum: number,
    resource: string,
    payload: string | Uint8Array
  ): Promise<{ estream: any; content_id: string }> {
    // Create
    const estream = await this.create(appId, typeNum, resource, payload);
    
    // Sign
    const signed = await this.sign(estream);
    
    // Emit
    const result = await this.emit(signed);
    
    return { estream: signed, content_id: result.content_id };
  }

  // =========================================================================
  // Bridge Operations (Solana L1 Anchoring)
  // =========================================================================

  /**
   * Get bridge status
   */
  async getBridgeStatus(): Promise<BridgeStatus> {
    const start = Date.now();
    
    try {
      console.log(`[Estream] Getting bridge status...`);
      
      const resultJson = await QuicClient.h3Get('/api/v1/bridge/status');
      const status: BridgeStatus = JSON.parse(resultJson);
      
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'bridge',
        timestamp: new Date(),
        success: true,
        durationMs: duration,
        details: `Bridge ${status.status}, ${status.pendingEvents} pending events`,
      });
      
      return status;
    } catch (error: any) {
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'bridge',
        timestamp: new Date(),
        success: false,
        durationMs: duration,
        details: error.message,
      });
      
      throw error;
    }
  }

  /**
   * Get Merkle proof for an event (for Solana verification)
   */
  async getMerkleProof(eventId: string): Promise<MerkleProof> {
    const start = Date.now();
    
    try {
      console.log(`[Estream] Getting Merkle proof for ${eventId}...`);
      
      const resultJson = await QuicClient.h3Get(`/api/v1/bridge/proof/${eventId}`);
      const proof: MerkleProof = JSON.parse(resultJson);
      
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'bridge',
        timestamp: new Date(),
        contentId: eventId,
        success: true,
        durationMs: duration,
        details: `Proof: ${proof.anchorStatus}${proof.solanaSlot ? ` @ slot ${proof.solanaSlot}` : ''}`,
      });
      
      return proof;
    } catch (error: any) {
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'bridge',
        timestamp: new Date(),
        contentId: eventId,
        success: false,
        durationMs: duration,
        details: error.message,
      });
      
      throw error;
    }
  }

  /**
   * Verify Merkle proof locally
   */
  verifyMerkleProof(eventHash: Uint8Array, proof: MerkleProof): boolean {
    try {
      // Start with event hash
      let current = eventHash;
      
      for (const node of proof.proofPath) {
        const sibling = Buffer.from(node.hash, 'hex');
        
        // Combine in correct order
        let combined: Uint8Array;
        if (node.position === 'left') {
          combined = Buffer.concat([sibling, current]);
        } else {
          combined = Buffer.concat([current, sibling]);
        }
        
        // Hash combined (would use blake3 in production)
        // For now, just concat for demo
        current = combined.slice(0, 32);
      }
      
      // Compare with merkle root
      const expectedRoot = Buffer.from(proof.merkleRoot, 'hex');
      return Buffer.compare(current, expectedRoot) === 0;
    } catch {
      return false;
    }
  }

  /**
   * Create and emit a bridgeable event (marked for Solana anchoring)
   */
  async createAndEmitWithBridge(
    appId: string,
    typeNum: number,
    resource: string,
    payload: string | Uint8Array,
    bridgeOptions?: {
      priority?: 'normal' | 'high';
      waitForAnchor?: boolean;
    }
  ): Promise<{ estream: any; content_id: string; bridgeStatus: string }> {
    const start = Date.now();
    
    // Create and emit normally
    const { estream, content_id } = await this.createAndEmit(appId, typeNum, resource, payload);
    
    // Queue for bridge
    try {
      const queueResult = await QuicClient.h3Post('/api/v1/bridge/queue', JSON.stringify({
        event_id: content_id,
        priority: bridgeOptions?.priority || 'normal',
      }));
      const result = JSON.parse(queueResult);
      
      const duration = Date.now() - start;
      
      this.emitEvent({
        type: 'bridge',
        timestamp: new Date(),
        contentId: content_id,
        success: true,
        durationMs: duration,
        details: `Queued for bridge (${result.position || 'pending'})`,
      });
      
      // Optionally wait for anchor confirmation
      if (bridgeOptions?.waitForAnchor) {
        console.log('[Estream] Waiting for Solana anchor confirmation...');
        // This would poll or subscribe to confirmation events
        // For now, return immediately
      }
      
      return { estream, content_id, bridgeStatus: 'queued' };
    } catch (error: any) {
      console.warn('[Estream] Bridge queue failed, event still valid on L2:', error.message);
      return { estream, content_id, bridgeStatus: 'l2-only' };
    }
  }
}

// Export singleton
export const EstreamService = new EstreamServiceImpl();

