/**
 * QR Code Signing Service
 * 
 * Fallback mechanism for CLI ↔ App communication when direct HTTP/QUIC
 * connectivity isn't available. 
 * 
 * Flow:
 * 1. CLI generates a signing request with a unique ID
 * 2. CLI displays a QR code containing the request
 * 3. User scans QR code with eStream app
 * 4. App shows request details and prompts for approval
 * 5. User approves and signs with Seeker/ML-DSA-87
 * 6. App displays a QR code with the signature
 * 7. CLI scans the signature QR code
 * 8. CLI completes the operation
 * 
 * Format:
 * - Request QR: estream-sign://v1/<base58-encoded-request>
 * - Response QR: estream-sig://v1/<base58-encoded-response>
 */

import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { GovernanceRequest, GovernanceSigningService, SigningResult } from './GovernanceSigningService';

// QR protocol version
const QR_PROTOCOL_VERSION = 1;

// QR scheme prefixes
const REQUEST_SCHEME = 'estream-sign';
const RESPONSE_SCHEME = 'estream-sig';

/**
 * Parsed signing request from QR code
 */
export interface QrSigningRequest {
  version: number;
  id: string;
  operation: string;
  description: string;
  payload: Uint8Array;
  timestamp: number;
  expiresAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Signing response for QR code
 */
export interface QrSigningResponse {
  version: number;
  requestId: string;
  signature: Uint8Array;
  signerKeyHash: Uint8Array;
  algorithm: string;
  timestamp: number;
}

/**
 * Parse a signing request from QR code data
 */
export function parseSigningRequestQr(qrData: string): QrSigningRequest {
  // Expected format: estream-sign://v1/<base58-data>
  if (!qrData.startsWith(`${REQUEST_SCHEME}://`)) {
    throw new Error(`Invalid QR scheme. Expected ${REQUEST_SCHEME}://`);
  }
  
  const parts = qrData.slice(`${REQUEST_SCHEME}://`.length).split('/');
  if (parts.length !== 2) {
    throw new Error('Invalid QR format. Expected v1/<data>');
  }
  
  const versionStr = parts[0];
  if (!versionStr.startsWith('v')) {
    throw new Error('Invalid version format');
  }
  
  const version = parseInt(versionStr.slice(1), 10);
  if (version !== QR_PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${version}`);
  }
  
  // Decode the base58 data
  const encodedData = parts[1];
  const jsonData = Buffer.from(bs58.decode(encodedData)).toString('utf-8');
  const request = JSON.parse(jsonData);
  
  return {
    version,
    id: request.id,
    operation: request.operation,
    description: request.description,
    payload: bs58.decode(request.payload),
    timestamp: request.timestamp,
    expiresAt: request.expiresAt,
    metadata: request.metadata,
  };
}

/**
 * Generate QR code data for a signing response
 */
export function generateSigningResponseQr(response: QrSigningResponse): string {
  const jsonData = JSON.stringify({
    id: response.requestId,
    sig: bs58.encode(response.signature),
    key: bs58.encode(response.signerKeyHash),
    alg: response.algorithm,
    ts: response.timestamp,
  });
  
  const encodedData = bs58.encode(Buffer.from(jsonData, 'utf-8'));
  return `${RESPONSE_SCHEME}://v${response.version}/${encodedData}`;
}

/**
 * Convert QR request to GovernanceRequest
 */
export function qrToGovernanceRequest(qr: QrSigningRequest): GovernanceRequest {
  return {
    id: qr.id,
    operation: qr.operation as GovernanceRequest['operation'],
    description: qr.description,
    timestamp: qr.timestamp,
    expiresAt: qr.expiresAt,
    payload: qr.payload,
    metadata: qr.metadata || {},
  };
}

/**
 * Convert SigningResult to QR response
 */
export function signingResultToQr(result: SigningResult): QrSigningResponse {
  return {
    version: QR_PROTOCOL_VERSION,
    requestId: result.requestId,
    signature: result.signature,
    signerKeyHash: result.signerKeyHash,
    algorithm: result.algorithm,
    timestamp: result.timestamp,
  };
}

/**
 * QR Signing Service
 * 
 * Handles the QR code-based signing flow as a fallback.
 */
class QrSigningServiceImpl {
  private pendingQrResponse: QrSigningResponse | null = null;
  
  /**
   * Process a scanned QR code
   * Returns true if it was a valid signing request
   */
  async processScannedQr(qrData: string): Promise<boolean> {
    try {
      // Check if it's a signing request
      if (!qrData.startsWith(`${REQUEST_SCHEME}://`)) {
        console.log('[QrSigning] Not a signing request QR');
        return false;
      }
      
      console.log('[QrSigning] Processing signing request QR...');
      
      // Parse the request
      const qrRequest = parseSigningRequestQr(qrData);
      
      // Check expiration
      if (Date.now() > qrRequest.expiresAt) {
        console.warn('[QrSigning] Request has expired');
        throw new Error('Signing request has expired');
      }
      
      // Convert to GovernanceRequest and add to pending
      const govRequest = qrToGovernanceRequest(qrRequest);
      GovernanceSigningService.addRequest(govRequest);
      
      console.log('[QrSigning] Request added for approval:', qrRequest.id);
      return true;
    } catch (error) {
      console.error('[QrSigning] Failed to process QR:', error);
      throw error;
    }
  }
  
  /**
   * Set the pending response (called after user signs)
   */
  setPendingResponse(result: SigningResult): void {
    this.pendingQrResponse = signingResultToQr(result);
    console.log('[QrSigning] Response ready for QR display');
  }
  
  /**
   * Get the QR code data for the response
   */
  getResponseQrData(): string | null {
    if (!this.pendingQrResponse) {
      return null;
    }
    return generateSigningResponseQr(this.pendingQrResponse);
  }
  
  /**
   * Clear the pending response
   */
  clearPendingResponse(): void {
    this.pendingQrResponse = null;
  }
  
  /**
   * Check if there's a pending response to display
   */
  hasPendingResponse(): boolean {
    return this.pendingQrResponse !== null;
  }
  
  /**
   * Get pending response details
   */
  getPendingResponse(): QrSigningResponse | null {
    return this.pendingQrResponse;
  }
}

// Export singleton
export const QrSigningService = new QrSigningServiceImpl();

// Export protocol constants for CLI
export const QR_PROTOCOL = {
  VERSION: QR_PROTOCOL_VERSION,
  REQUEST_SCHEME,
  RESPONSE_SCHEME,
};
