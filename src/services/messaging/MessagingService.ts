/**
 * Messaging Service - High-level messaging API
 * 
 * Manages conversations, message queues, and offline support
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QuicMessagingClient, PqWireMessage, DevicePublicKeys } from '../quic/QuicClient';
import { Message, Conversation, MessageStatus, MessagingEvent } from './types';

const STORAGE_PREFIX = '@estream:messaging:';

export class MessagingService {
  private quicClient: QuicMessagingClient;
  private conversations: Map<string, Conversation>;
  private messageQueue: Message[];
  private deviceKeys: any;
  private listeners: Set<(event: MessagingEvent) => void>;
  private syncInterval: NodeJS.Timeout | null = null;
  
  constructor(nodeAddr: string) {
    this.quicClient = new QuicMessagingClient(nodeAddr);
    this.conversations = new Map();
    this.messageQueue = [];
    this.listeners = new Set();
  }
  
  /**
   * Initialize the messaging service
   */
  async initialize(deviceKeys: any): Promise<void> {
    console.log('[MessagingService] Initializing...');
    this.deviceKeys = deviceKeys;
    
    await this.quicClient.initialize();
    console.log('[MessagingService] QUIC client initialized');
    
    await this.quicClient.connect();
    console.log('[MessagingService] QUIC connected to node');
    
    await this.loadConversations();
    await this.loadMessageQueue();
    
    this.startBackgroundSync();
    this.startMessageReceiver();
    
    console.log('[MessagingService] Initialized successfully');
  }
  
  // === Sending Messages ===
  
  /**
   * Send a message to a recipient
   */
  async sendMessage(
    recipientDeviceId: string,
    recipientPublicKeys: DevicePublicKeys,
    content: string,
    expiration?: { mode: string; duration_seconds?: number }
  ): Promise<Message> {
    console.log(`[MessagingService] Sending message to ${recipientDeviceId}`);
    
    // Get or create conversation
    let conversation = this.conversations.get(recipientDeviceId);
    if (!conversation) {
      conversation = await this.createConversation(recipientDeviceId, recipientPublicKeys);
    }
    
    // Create message
    const message: Message = {
      id: this.generateMessageId(),
      conversationId: conversation.id,
      fromDeviceId: this.deviceKeys.device_id || 'local-device',
      toDeviceId: recipientDeviceId,
      content,
      timestamp: Date.now(),
      status: MessageStatus.Pending,
      expiration: expiration ? {
        mode: expiration.mode as any,
        duration_seconds: expiration.duration_seconds,
        expire_at: expiration.duration_seconds 
          ? Date.now() + (expiration.duration_seconds * 1000) 
          : undefined,
      } : undefined,
    };
    
    // Add to queue
    this.messageQueue.push(message);
    await this.saveMessageQueue();
    console.log(`[MessagingService] Message queued: ${message.id}`);
    
    // Notify listeners
    this.emit({ type: 'message:pending', message });
    
    // Try to send immediately
    await this.processMessageQueue();
    
    return message;
  }
  
  /**
   * Process the message queue (send pending messages)
   */
  private async processMessageQueue(): Promise<void> {
    const pendingMessages = this.messageQueue.filter(
      m => m.status === MessageStatus.Pending || m.status === MessageStatus.Failed
    );
    
    if (pendingMessages.length === 0) {
      return;
    }
    
    console.log(`[MessagingService] Processing ${pendingMessages.length} pending messages`);
    
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
        
        console.log(`[MessagingService] Message sent successfully: ${message.id}`);
        
      } catch (error) {
        console.error(`[MessagingService] Message send error: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`[MessagingService] Failed to send message ${message.id}`);
        message.status = MessageStatus.Failed;
        this.emit({ type: 'message:failed', message, error });
      }
    }
  }
  
  /**
   * Build a PQ wire message from a Message
   */
  private async buildWireMessage(message: Message): Promise<PqWireMessage> {
    const conversation = this.conversations.get(message.toDeviceId)!;
    
    // For now, we'll pass through the content as-is
    // In production, this would:
    // 1. Encrypt with Double Ratchet
    // 2. Wrap in Sealed Sender
    // 3. Sign with Dilithium
    
    const wireMessage: PqWireMessage = {
      sender_key_ref: this.deviceKeys.key_hash || 'local-key-hash',
      recipient_key_ref: conversation.peerPublicKeys.key_hash,
      sealed_message: {
        content: message.content,
        // In production, this would be encrypted
      },
      timestamp: message.timestamp,
      expiration: message.expiration,
    };
    
    return wireMessage;
  }
  
  // === Receiving Messages ===
  
  /**
   * Start the message receiver (background task)
   */
  private startMessageReceiver(): void {
    console.log('[MessagingService] Message receiver started');
    // In production, this would listen for incoming QUIC streams
    // For now, we'll implement polling or push notifications
  }
  
  /**
   * Receive a message from the wire
   */
  async receiveMessage(wireMessage: PqWireMessage): Promise<Message> {
    console.log('[MessagingService] Receiving message');
    
    // For now, we'll extract the content directly
    // In production, this would:
    // 1. Unseal message
    // 2. Decrypt with Double Ratchet
    // 3. Verify signature
    
    const senderDeviceId = wireMessage.sender_key_ref; // In production, look up by key hash
    const content = wireMessage.sealed_message.content;
    
    // Get or create conversation
    let conversation = this.conversations.get(senderDeviceId);
    if (!conversation) {
      // In production, fetch sender's public keys from platform
      const senderKeys: DevicePublicKeys = {
        signature_key: '',
        kem_key: '',
        key_hash: senderDeviceId,
        app_scope: 'cipher',
        created_at: Date.now(),
      };
      conversation = await this.createConversation(senderDeviceId, senderKeys);
    }
    
    // Create message
    const message: Message = {
      id: this.generateMessageId(),
      conversationId: conversation.id,
      fromDeviceId: senderDeviceId,
      toDeviceId: this.deviceKeys.device_id || 'local-device',
      content,
      timestamp: wireMessage.timestamp,
      status: MessageStatus.Delivered,
      deliveredAt: Date.now(),
      expiration: wireMessage.expiration,
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
    
    console.log(`[MessagingService] Message ${message.id} received successfully`);
    
    return message;
  }
  
  // === Conversations ===
  
  /**
   * Create a new conversation
   */
  private async createConversation(
    peerDeviceId: string,
    peerPublicKeys: DevicePublicKeys
  ): Promise<Conversation> {
    console.log(`[MessagingService] Creating conversation with ${peerDeviceId}`);
    
    const conversation: Conversation = {
      id: this.generateConversationId(peerDeviceId),
      peerDeviceId,
      peerPublicKeys,
      lastActivity: Date.now(),
      unreadCount: 0,
    };
    
    // In production, initialize X3DH and Double Ratchet here
    
    this.conversations.set(peerDeviceId, conversation);
    await this.saveConversation(conversation);
    
    this.emit({ type: 'conversation:created', conversation });
    
    return conversation;
  }
  
  /**
   * Get all conversations, sorted by last activity
   */
  async getConversations(): Promise<Conversation[]> {
    return Array.from(this.conversations.values())
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }
  
  /**
   * Get a specific conversation
   */
  async getConversation(deviceId: string): Promise<Conversation | undefined> {
    return this.conversations.get(deviceId);
  }
  
  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string, limit: number = 50): Promise<Message[]> {
    const key = `${STORAGE_PREFIX}messages:${conversationId}`;
    const json = await AsyncStorage.getItem(key);
    if (!json) return [];
    
    const messages: Message[] = JSON.parse(json);
    return messages.slice(-limit);
  }
  
  /**
   * Mark a conversation as read
   */
  async markAsRead(conversationId: string): Promise<void> {
    const conversation = Array.from(this.conversations.values())
      .find(c => c.id === conversationId);
    
    if (conversation) {
      conversation.unreadCount = 0;
      await this.saveConversation(conversation);
      this.emit({ type: 'conversation:read', conversation });
      
      console.log(`[MessagingService] Conversation ${conversationId} marked as read`);
    }
  }
  
  // === Persistence ===
  
  private async loadConversations(): Promise<void> {
    console.log('[MessagingService] Loading conversations...');
    const keys = await AsyncStorage.getAllKeys();
    const conversationKeys = keys.filter(k => k.startsWith(`${STORAGE_PREFIX}conversation:`));
    
    for (const key of conversationKeys) {
      const json = await AsyncStorage.getItem(key);
      if (json) {
        const conversation: Conversation = JSON.parse(json);
        this.conversations.set(conversation.peerDeviceId, conversation);
      }
    }
    
    console.log(`[MessagingService] Loaded ${this.conversations.size} conversations`);
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
    // Keep only last 1000 messages per conversation
    if (messages.length > 1000) {
      messages.shift();
    }
    await AsyncStorage.setItem(key, JSON.stringify(messages));
  }
  
  private async loadMessageQueue(): Promise<void> {
    console.log('[MessagingService] Loading message queue...');
    const key = `${STORAGE_PREFIX}queue`;
    const json = await AsyncStorage.getItem(key);
    if (json) {
      this.messageQueue = JSON.parse(json);
      console.log(`[MessagingService] Loaded ${this.messageQueue.length} queued messages`);
    }
  }
  
  private async saveMessageQueue(): Promise<void> {
    const key = `${STORAGE_PREFIX}queue`;
    await AsyncStorage.setItem(key, JSON.stringify(this.messageQueue));
  }
  
  // === Background Sync ===
  
  private startBackgroundSync(): void {
    // Process message queue every 5 seconds
    this.syncInterval = setInterval(() => {
      this.processMessageQueue().catch(error => {
        console.error('[MessagingService] Background sync error:', error);
      });
    }, 5000);
    
    console.log('[MessagingService] Background sync started');
  }
  
  private stopBackgroundSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[MessagingService] Background sync stopped');
    }
  }
  
  // === Event Listeners ===
  
  /**
   * Subscribe to messaging events
   */
  on(listener: (event: MessagingEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private emit(event: MessagingEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[MessagingService] Listener error:', error);
      }
    });
  }
  
  // === Cleanup ===
  
  /**
   * Shutdown the messaging service
   */
  async shutdown(): Promise<void> {
    console.log('[MessagingService] Shutting down...');
    this.stopBackgroundSync();
    this.quicClient.dispose();
    this.listeners.clear();
    console.log('[MessagingService] Shutdown complete');
  }
  
  // === Helpers ===
  
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateConversationId(peerDeviceId: string): string {
    const localDeviceId = this.deviceKeys.device_id || 'local-device';
    return `conv_${localDeviceId}_${peerDeviceId}`;
  }
}

