# Issue #2: Messaging Service Integration (TypeScript)

**Epic**: Phase 1 - Messaging Integration  
**Priority**: P0 (Critical)  
**Estimated Effort**: 2-3 days  
**Depends On**: Issue #1 (QUIC Client)

---

## Overview

Build the TypeScript messaging service layer that wraps the QUIC native module and provides a high-level API for React Native components. This includes conversation management, message queuing, offline support, and delivery confirmations.

---

## Goals

1. ✅ MessagingService (high-level API)
2. ✅ Conversation management
3. ✅ Message queue (offline support)
4. ✅ Delivery confirmations
5. ✅ Contact/device discovery
6. ✅ React hooks for UI integration
7. ✅ Persistence (AsyncStorage)

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│          React Native Components                │
│  (Conversations, MessageList, Composer)         │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│        React Hooks & Context                    │
│  - useMessaging()                               │
│  - useConversation(deviceId)                    │
│  - useMessages(conversationId)                  │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│       MessagingService (TypeScript)             │
│  - sendMessage()                                │
│  - receiveMessage()                             │
│  - getConversations()                           │
│  - syncConversation()                           │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│      QuicMessagingClient (Native Module)        │
│  - QUIC connection                              │
│  - PQ wire protocol                             │
└─────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Core Types

**src/services/messaging/types.ts**:
```typescript
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
}

export enum MessageStatus {
  Pending = 'pending',     // Queued, not sent
  Sending = 'sending',     // In flight
  Sent = 'sent',           // Delivered to server
  Delivered = 'delivered', // Delivered to recipient
  Read = 'read',           // Read by recipient
  Failed = 'failed',       // Send failed
}

export interface Conversation {
  id: string;
  peerDeviceId: string;
  peerPublicKeys: DevicePublicKeys;
  lastMessage?: Message;
  lastActivity: number;
  unreadCount: number;
  ratchetState?: any;  // Encrypted Double Ratchet state
}

export interface DevicePublicKeys {
  signature_key: string;
  kem_key: string;
  key_hash: string;
  app_scope: string;
  created_at: number;
}

export interface PlatformMessage {
  type: 'SigningRequest' | 'SecurityAlert' | 'Notification' | 'GovernanceProposal' | 'BillingUpdate';
  data: any;
  timestamp: number;
  priority: 'critical' | 'high' | 'normal' | 'low';
}
```

### 2. Messaging Service

**src/services/messaging/MessagingService.ts**:
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QuicMessagingClient, PqWireMessage } from '../quic/QuicClient';
import { Message, Conversation, MessageStatus, DevicePublicKeys } from './types';

const STORAGE_PREFIX = '@estream:messaging:';

export class MessagingService {
  private quicClient: QuicMessagingClient;
  private conversations: Map<string, Conversation>;
  private messageQueue: Message[];
  private deviceKeys: any;
  private listeners: Set<(event: MessagingEvent) => void>;
  
  constructor(nodeAddr: string) {
    this.quicClient = new QuicMessagingClient(nodeAddr);
    this.conversations = new Map();
    this.messageQueue = [];
    this.listeners = new Set();
  }
  
  async initialize(deviceKeys: any): Promise<void> {
    this.deviceKeys = deviceKeys;
    await this.quicClient.initialize();
    await this.quicClient.connect();
    await this.loadConversations();
    await this.loadMessageQueue();
    this.startBackgroundSync();
    this.startMessageReceiver();
  }
  
  // === Sending Messages ===
  
  async sendMessage(
    recipientDeviceId: string,
    recipientPublicKeys: DevicePublicKeys,
    content: string
  ): Promise<Message> {
    // Get or create conversation
    let conversation = this.conversations.get(recipientDeviceId);
    if (!conversation) {
      conversation = await this.createConversation(recipientDeviceId, recipientPublicKeys);
    }
    
    // Create message
    const message: Message = {
      id: this.generateMessageId(),
      conversationId: conversation.id,
      fromDeviceId: this.deviceKeys.device_id,
      toDeviceId: recipientDeviceId,
      content,
      timestamp: Date.now(),
      status: MessageStatus.Pending,
    };
    
    // Add to queue
    this.messageQueue.push(message);
    await this.saveMessageQueue();
    
    // Notify listeners
    this.emit({ type: 'message:pending', message });
    
    // Try to send immediately
    this.processMessageQueue();
    
    return message;
  }
  
  private async processMessageQueue(): Promise<void> {
    const pendingMessages = this.messageQueue.filter(
      m => m.status === MessageStatus.Pending || m.status === MessageStatus.Failed
    );
    
    for (const message of pendingMessages) {
      try {
        message.status = MessageStatus.Sending;
        this.emit({ type: 'message:sending', message });
        
        // Build PQ wire message
        const wireMessage = await this.buildWireMessage(message);
        
        // Send via QUIC
        await this.quicClient.sendMessage(wireMessage);
        
        // Update status
        message.status = MessageStatus.Sent;
        this.emit({ type: 'message:sent', message });
        
        // Remove from queue
        this.messageQueue = this.messageQueue.filter(m => m.id !== message.id);
        await this.saveMessageQueue();
        
        // Store in conversation
        await this.storeMessage(message);
        
      } catch (error) {
        message.status = MessageStatus.Failed;
        this.emit({ type: 'message:failed', message, error });
      }
    }
  }
  
  private async buildWireMessage(message: Message): Promise<PqWireMessage> {
    const conversation = this.conversations.get(message.toDeviceId)!;
    
    // Encrypt with Double Ratchet
    const encrypted = await this.encryptMessage(
      conversation,
      message.content
    );
    
    // Wrap in Sealed Sender
    const sealed = await this.sealMessage(
      conversation.peerPublicKeys,
      encrypted
    );
    
    // Build wire message
    return {
      sender_key_ref: this.deviceKeys.key_hash,
      recipient_key_ref: conversation.peerPublicKeys.key_hash,
      sealed_message: sealed,
      timestamp: message.timestamp,
    };
  }
  
  // === Receiving Messages ===
  
  private startMessageReceiver(): void {
    // This would be called by the native module when messages arrive
    // For now, we'll poll (in production, use push notifications)
  }
  
  async receiveMessage(wireMessage: PqWireMessage): Promise<Message> {
    // Unseal message
    const unsealed = await this.unsealMessage(wireMessage);
    
    // Get or create conversation
    let conversation = this.conversations.get(unsealed.sender_device_id);
    if (!conversation) {
      // Fetch sender's public keys from platform
      const senderKeys = await this.fetchDevicePublicKeys(unsealed.sender_device_id);
      conversation = await this.createConversation(unsealed.sender_device_id, senderKeys);
    }
    
    // Decrypt with Double Ratchet
    const content = await this.decryptMessage(conversation, unsealed.encrypted);
    
    // Create message
    const message: Message = {
      id: this.generateMessageId(),
      conversationId: conversation.id,
      fromDeviceId: unsealed.sender_device_id,
      toDeviceId: this.deviceKeys.device_id,
      content,
      timestamp: wireMessage.timestamp,
      status: MessageStatus.Delivered,
      deliveredAt: Date.now(),
    };
    
    // Store message
    await this.storeMessage(message);
    
    // Update conversation
    conversation.lastMessage = message;
    conversation.lastActivity = Date.now();
    conversation.unreadCount++;
    await this.saveConversation(conversation);
    
    // Notify listeners
    this.emit({ type: 'message:received', message });
    
    return message;
  }
  
  // === Conversations ===
  
  private async createConversation(
    peerDeviceId: string,
    peerPublicKeys: DevicePublicKeys
  ): Promise<Conversation> {
    const conversation: Conversation = {
      id: this.generateConversationId(peerDeviceId),
      peerDeviceId,
      peerPublicKeys,
      lastActivity: Date.now(),
      unreadCount: 0,
    };
    
    // Initialize X3DH (if not already done)
    // Initialize Double Ratchet
    
    this.conversations.set(peerDeviceId, conversation);
    await this.saveConversation(conversation);
    
    this.emit({ type: 'conversation:created', conversation });
    
    return conversation;
  }
  
  async getConversations(): Promise<Conversation[]> {
    return Array.from(this.conversations.values())
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }
  
  async getConversation(deviceId: string): Promise<Conversation | undefined> {
    return this.conversations.get(deviceId);
  }
  
  async getMessages(conversationId: string, limit: number = 50): Promise<Message[]> {
    const key = `${STORAGE_PREFIX}messages:${conversationId}`;
    const json = await AsyncStorage.getItem(key);
    if (!json) return [];
    
    const messages: Message[] = JSON.parse(json);
    return messages.slice(-limit);
  }
  
  async markAsRead(conversationId: string): Promise<void> {
    const conversation = Array.from(this.conversations.values())
      .find(c => c.id === conversationId);
    
    if (conversation) {
      conversation.unreadCount = 0;
      await this.saveConversation(conversation);
      this.emit({ type: 'conversation:read', conversation });
    }
  }
  
  // === Persistence ===
  
  private async loadConversations(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const conversationKeys = keys.filter(k => k.startsWith(`${STORAGE_PREFIX}conversation:`));
    
    for (const key of conversationKeys) {
      const json = await AsyncStorage.getItem(key);
      if (json) {
        const conversation: Conversation = JSON.parse(json);
        this.conversations.set(conversation.peerDeviceId, conversation);
      }
    }
  }
  
  private async saveConversation(conversation: Conversation): Promise<void> {
    const key = `${STORAGE_PREFIX}conversation:${conversation.id}`;
    await AsyncStorage.setItem(key, JSON.stringify(conversation));
  }
  
  private async storeMessage(message: Message): Promise<void> {
    const key = `${STORAGE_PREFIX}messages:${message.conversationId}`;
    const json = await AsyncStorage.getItem(key);
    const messages: Message[] = json ? JSON.parse(json) : [];
    messages.push(message);
    await AsyncStorage.setItem(key, JSON.stringify(messages));
  }
  
  private async loadMessageQueue(): Promise<void> {
    const key = `${STORAGE_PREFIX}queue`;
    const json = await AsyncStorage.getItem(key);
    if (json) {
      this.messageQueue = JSON.parse(json);
    }
  }
  
  private async saveMessageQueue(): Promise<void> {
    const key = `${STORAGE_PREFIX}queue`;
    await AsyncStorage.setItem(key, JSON.stringify(this.messageQueue));
  }
  
  // === Background Sync ===
  
  private startBackgroundSync(): void {
    setInterval(() => {
      this.processMessageQueue();
    }, 5000); // Every 5 seconds
  }
  
  // === Event Listeners ===
  
  on(listener: (event: MessagingEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private emit(event: MessagingEvent): void {
    this.listeners.forEach(listener => listener(event));
  }
  
  // === Helpers ===
  
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateConversationId(peerDeviceId: string): string {
    return `conv_${this.deviceKeys.device_id}_${peerDeviceId}`;
  }
  
  private async fetchDevicePublicKeys(deviceId: string): Promise<DevicePublicKeys> {
    // In production, fetch from eStream platform device registry
    throw new Error('Not implemented');
  }
  
  private async encryptMessage(conversation: Conversation, content: string): Promise<any> {
    // Call native module for Double Ratchet encryption
    throw new Error('Not implemented');
  }
  
  private async decryptMessage(conversation: Conversation, encrypted: any): Promise<string> {
    // Call native module for Double Ratchet decryption
    throw new Error('Not implemented');
  }
  
  private async sealMessage(recipientKeys: DevicePublicKeys, encrypted: any): Promise<any> {
    // Call native module for Sealed Sender
    throw new Error('Not implemented');
  }
  
  private async unsealMessage(wireMessage: PqWireMessage): Promise<any> {
    // Call native module to unseal
    throw new Error('Not implemented');
  }
}

export type MessagingEvent =
  | { type: 'message:pending'; message: Message }
  | { type: 'message:sending'; message: Message }
  | { type: 'message:sent'; message: Message }
  | { type: 'message:delivered'; message: Message }
  | { type: 'message:read'; message: Message }
  | { type: 'message:failed'; message: Message; error: any }
  | { type: 'message:received'; message: Message }
  | { type: 'conversation:created'; conversation: Conversation }
  | { type: 'conversation:read'; conversation: Conversation };
```

### 3. React Context & Hooks

**src/services/messaging/MessagingContext.tsx**:
```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import { MessagingService } from './MessagingService';
import { Message, Conversation } from './types';

interface MessagingContextValue {
  service: MessagingService | null;
  conversations: Conversation[];
  isConnected: boolean;
  sendMessage: (recipientId: string, recipientKeys: any, content: string) => Promise<void>;
  getMessages: (conversationId: string) => Promise<Message[]>;
  markAsRead: (conversationId: string) => Promise<void>;
}

const MessagingContext = createContext<MessagingContextValue | null>(null);

export function MessagingProvider({ children, nodeAddr, deviceKeys }: any) {
  const [service, setService] = useState<MessagingService | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  useEffect(() => {
    const svc = new MessagingService(nodeAddr);
    
    svc.initialize(deviceKeys).then(() => {
      setService(svc);
      setIsConnected(true);
      
      // Load conversations
      svc.getConversations().then(setConversations);
      
      // Listen for updates
      svc.on((event) => {
        if (event.type === 'conversation:created' || 
            event.type === 'conversation:read' || 
            event.type === 'message:received') {
          svc.getConversations().then(setConversations);
        }
      });
    });
    
    return () => {
      // Cleanup
    };
  }, [nodeAddr, deviceKeys]);
  
  const value: MessagingContextValue = {
    service,
    conversations,
    isConnected,
    sendMessage: async (recipientId, recipientKeys, content) => {
      if (!service) throw new Error('Service not initialized');
      await service.sendMessage(recipientId, recipientKeys, content);
    },
    getMessages: async (conversationId) => {
      if (!service) throw new Error('Service not initialized');
      return await service.getMessages(conversationId);
    },
    markAsRead: async (conversationId) => {
      if (!service) throw new Error('Service not initialized');
      await service.markAsRead(conversationId);
    },
  };
  
  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
}

export function useMessaging(): MessagingContextValue {
  const context = useContext(MessagingContext);
  if (!context) {
    throw new Error('useMessaging must be used within MessagingProvider');
  }
  return context;
}

export function useConversation(deviceId: string): Conversation | undefined {
  const { conversations } = useMessaging();
  return conversations.find(c => c.peerDeviceId === deviceId);
}

export function useMessages(conversationId: string): Message[] {
  const { getMessages } = useMessaging();
  const [messages, setMessages] = useState<Message[]>([]);
  
  useEffect(() => {
    getMessages(conversationId).then(setMessages);
  }, [conversationId, getMessages]);
  
  return messages;
}
```

### 4. Tests

**__tests__/services/MessagingService.test.ts**:
```typescript
import { MessagingService } from '../../src/services/messaging/MessagingService';
import { MessageStatus } from '../../src/services/messaging/types';

describe('MessagingService', () => {
  let service: MessagingService;
  
  beforeEach(async () => {
    service = new MessagingService('127.0.0.1:5000');
    const deviceKeys = await generateTestDeviceKeys();
    await service.initialize(deviceKeys);
  });
  
  it('should send a message', async () => {
    const recipientKeys = await generateTestDeviceKeys();
    const message = await service.sendMessage(
      'recipient-device-id',
      recipientKeys.public_keys,
      'Hello, world!'
    );
    
    expect(message.status).toBe(MessageStatus.Pending);
    expect(message.content).toBe('Hello, world!');
  });
  
  it('should create a conversation', async () => {
    const conversations = await service.getConversations();
    expect(conversations.length).toBeGreaterThan(0);
  });
  
  it('should queue messages when offline', async () => {
    // Disconnect
    // Send message
    // Verify it's queued
    // Reconnect
    // Verify it's sent
  });
});
```

---

## Deliverables

1. ✅ MessagingService (TypeScript)
2. ✅ Conversation management
3. ✅ Message queue with offline support
4. ✅ React context & hooks
5. ✅ Persistence (AsyncStorage)
6. ✅ Comprehensive tests

---

## Success Criteria

- [ ] Can send messages via QUIC
- [ ] Can receive messages via QUIC
- [ ] Messages queue when offline
- [ ] Conversations persist across restarts
- [ ] React hooks work correctly
- [ ] All tests pass

---

**Status**: ⏳ Not Started  
**Branch**: `feature/messaging-service`

