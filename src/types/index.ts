/**
 * Core eStream types for the mobile app.
 */

// Trust levels for keys
export enum TrustLevel {
  Untrusted = 'untrusted',
  SoftwareBacked = 'software_backed',
  HardwareBacked = 'hardware_backed',
  Certified = 'certified',
}

// Estream type codes
export enum EstreamType {
  // Generic events
  Generic = 0x0000,
  Created = 0x0001,
  Updated = 0x0002,
  Deleted = 0x0003,
  
  // Asset events (0x01xx)
  AssetCreated = 0x0101,
  AssetUpdated = 0x0102,
  ValuationUpdated = 0x0103,
  DocumentAttached = 0x0104,
  
  // Governance events (0x02xx)
  GovernanceProposal = 0x0201,
  GovernanceVote = 0x0202,
  GovernanceExecuted = 0x0203,
  
  // Security events (0x03xx)
  KeyEnrolled = 0x0301,
  KeyRevoked = 0x0302,
  DeviceAttested = 0x0303,
}

// Estream structure
export interface Estream {
  id: string;              // Content-addressed ID (hex)
  parents: string[];       // Parent IDs (for DAG)
  resource: string;        // Resource identifier
  estreamType: number;     // Type code
  timestamp: number;       // Unix milliseconds
  sequence: number;        // Sequence within resource
  origin: string[];        // Locality path
  requiredRoles: number[]; // Role-based access
  payload: string;         // JSON payload
  signature: string;       // Ed25519 signature (base58)
  signer: string;          // Signer public key (base58)
}

// Node connection
export interface NodeConnection {
  url: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastHealthCheck?: number;
  version?: string;
}

// Key info
export interface KeyInfo {
  name: string;
  publicKey: string;       // Base58
  trustLevel: TrustLevel;
  createdAt: number;
  deviceId?: string;
  attestationHash?: string;
}

// Signed envelope headers
export interface SignedEnvelopeHeaders {
  'X-Device-Public-Key': string;
  'X-Device-Signature': string;
  'X-Device-Timestamp': string;
  'X-Device-Nonce': string;
  'X-Body-Hash': string;
}

// API error response
export interface ApiError {
  error: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

