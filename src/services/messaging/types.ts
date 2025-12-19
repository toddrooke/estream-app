/**
 * Messaging Service Types
 * 
 * Core types for Cipher messenger with built-in message expiration
 */

// ============================================================================
// Message Types
// ============================================================================

export interface Message {
  id: string;
  conversationId: string;
  fromDeviceId: string;
  toDeviceId: string;
  content: string;
  timestamp: number;
  status: MessageStatus;
  deliveredAt?: number;
  readAt?: number;
  
  // Message Expiration (Issue #82)
  expiration?: MessageExpiration;
}

export enum MessageStatus {
  Pending = 'pending',     // Queued, not sent
  Sending = 'sending',     // In flight
  Sent = 'sent',           // Delivered to server
  Delivered = 'delivered', // Delivered to recipient
  Read = 'read',           // Read by recipient
  Failed = 'failed',       // Send failed
  Expired = 'expired',     // Message expired and deleted
}

// ============================================================================
// Message Expiration (Issue #82)
// ============================================================================

export enum ExpirationMode {
  Never = 'never',                    // Messages never expire
  AfterRead = 'after_read',          // Expire X seconds after read
  AfterSend = 'after_send',          // Expire X seconds after send
  AfterDelivery = 'after_delivery',  // Expire X seconds after delivery
}

export interface MessageExpiration {
  mode: ExpirationMode;
  duration: number;              // Duration in seconds
  expiresAt?: number;           // Computed expiration timestamp
  expired: boolean;             // Marked as expired
}

// ============================================================================
// Conversation Types
// ============================================================================

export interface Conversation {
  id: string;
  peerDeviceId: string;
  peerPublicKeys: DevicePublicKeys;
  peerDisplayName?: string;
  lastMessage?: Message;
  lastActivity: number;
  unreadCount: number;
  
  // Conversation Settings
  expirationMode: ExpirationMode;
  expirationDuration: number;    // Default expiration duration in seconds
  
  // Double Ratchet State (encrypted)
  ratchetState?: string;         // Serialized + encrypted ratchet state
}

// ============================================================================
// Device & Crypto Types
// ============================================================================

export interface DevicePublicKeys {
  signature_key: string;      // Base64-encoded Dilithium5 public key
  kem_key: string;            // Base64-encoded Kyber1024 public key
  key_hash: string;           // Hex-encoded Blake3 hash
  app_scope: string;          // "cipher"
  created_at: number;         // Unix timestamp
}

export interface DeviceKeys {
  device_id: string;
  public_keys: DevicePublicKeys;
  // Private keys stored in Seed Vault / Secure Enclave
}

// ============================================================================
// Platform Message Types
// ============================================================================

export enum PlatformMessageType {
  SigningRequest = 'SigningRequest',
  SecurityAlert = 'SecurityAlert',
  Notification = 'Notification',
  GovernanceProposal = 'GovernanceProposal',
  BillingUpdate = 'BillingUpdate',
}

export interface PlatformMessage {
  type: PlatformMessageType;
  data: any;
  timestamp: number;
  priority: MessagePriority;
}

export enum MessagePriority {
  Critical = 'critical',
  High = 'high',
  Normal = 'normal',
  Low = 'low',
}

// ============================================================================
// Event Types
// ============================================================================

export type MessagingEvent =
  | { type: 'message:pending'; message: Message }
  | { type: 'message:sending'; message: Message }
  | { type: 'message:sent'; message: Message }
  | { type: 'message:delivered'; message: Message }
  | { type: 'message:read'; message: Message }
  | { type: 'message:failed'; message: Message; error: any }
  | { type: 'message:received'; message: Message }
  | { type: 'message:expired'; message: Message }           // Issue #82
  | { type: 'conversation:created'; conversation: Conversation }
  | { type: 'conversation:updated'; conversation: Conversation }
  | { type: 'conversation:read'; conversation: Conversation }
  | { type: 'expiration:scheduled'; messageId: string; expiresAt: number }  // Issue #82
  | { type: 'expiration:triggered'; messageId: string };    // Issue #82

// ============================================================================
// Configuration
// ============================================================================

export interface MessagingConfig {
  nodeAddr: string;
  maxConversations: number;
  maxMessagesPerConversation: number;
  backgroundSyncInterval: number;      // ms
  expirationCheckInterval: number;     // ms (Issue #82)
}

export const DEFAULT_MESSAGING_CONFIG: MessagingConfig = {
  nodeAddr: '127.0.0.1:5000',
  maxConversations: 1000,
  maxMessagesPerConversation: 10000,
  backgroundSyncInterval: 5000,        // 5 seconds
  expirationCheckInterval: 1000,       // 1 second (Issue #82)
};

