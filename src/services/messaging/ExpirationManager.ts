/**
 * Message Expiration Manager (Issue #82)
 * 
 * Handles client-side message expiration with timers and cleanup
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Message, MessageExpiration, ExpirationMode, MessagingEvent } from './types';

const STORAGE_PREFIX = '@estream:messaging:';

export class MessageExpirationManager {
  private timers: Map<string, NodeJS.Timeout>;
  private listeners: Set<(event: MessagingEvent) => void>;
  private checkInterval: NodeJS.Timeout | null;
  
  constructor(private expirationCheckInterval: number = 1000) {
    this.timers = new Map();
    this.listeners = new Set();
    this.checkInterval = null;
  }
  
  /**
   * Start the expiration manager
   */
  start(): void {
    // Periodic check for expired messages (backup to timers)
    this.checkInterval = setInterval(() => {
      this.checkExpiredMessages();
    }, this.expirationCheckInterval);
    
    console.log('ExpirationManager started');
  }
  
  /**
   * Stop the expiration manager
   */
  stop(): void {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    
    // Stop check interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    console.log('ExpirationManager stopped');
  }
  
  /**
   * Schedule expiration for a message
   */
  scheduleExpiration(message: Message): void {
    if (!message.expiration || message.expiration.expired) {
      return;
    }
    
    // Compute expiration time if not already set
    if (!message.expiration.expiresAt) {
      const expiresAt = this.computeExpiration(message);
      if (!expiresAt) return; // Never expires
      
      message.expiration.expiresAt = expiresAt;
    }
    
    const now = Date.now() / 1000;
    const expiresAt = message.expiration.expiresAt!;
    const delay = (expiresAt - now) * 1000; // Convert to ms
    
    // Already expired?
    if (delay <= 0) {
      this.expireMessage(message.id);
      return;
    }
    
    // Schedule expiration
    const timer = setTimeout(() => {
      this.expireMessage(message.id);
    }, delay);
    
    this.timers.set(message.id, timer);
    
    this.emit({
      type: 'expiration:scheduled',
      messageId: message.id,
      expiresAt,
    });
    
    console.log(`Scheduled expiration for message ${message.id} in ${delay}ms`);
  }
  
  /**
   * Cancel expiration for a message
   */
  cancelExpiration(messageId: string): void {
    const timer = this.timers.get(messageId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(messageId);
      console.log(`Cancelled expiration for message ${messageId}`);
    }
  }
  
  /**
   * Update expiration when message is read
   */
  async onMessageRead(message: Message): Promise<void> {
    if (!message.expiration) return;
    
    // If expiration mode is AfterRead, recompute expiration time
    if (message.expiration.mode === ExpirationMode.AfterRead) {
      message.readAt = Date.now() / 1000;
      
      const newExpiresAt = this.computeExpiration(message);
      if (newExpiresAt) {
        message.expiration.expiresAt = newExpiresAt;
        
        // Cancel old timer
        this.cancelExpiration(message.id);
        
        // Schedule new timer
        this.scheduleExpiration(message);
        
        // Save updated message
        await this.saveMessage(message);
      }
    }
  }
  
  /**
   * Expire a message (delete it)
   */
  private async expireMessage(messageId: string): Promise<void> {
    console.log(`Expiring message ${messageId}`);
    
    try {
      // 1. Load message
      const message = await this.loadMessage(messageId);
      if (!message) return;
      
      // 2. Mark as expired
      if (message.expiration) {
        message.expiration.expired = true;
      }
      
      // 3. Delete from storage
      await AsyncStorage.removeItem(`${STORAGE_PREFIX}message:${messageId}`);
      
      // 4. Remove from conversation's message list
      await this.removeFromConversation(message.conversationId, messageId);
      
      // 5. Clear timer
      this.timers.delete(messageId);
      
      // 6. Emit event
      this.emit({ type: 'message:expired', message });
      this.emit({ type: 'expiration:triggered', messageId });
      
      console.log(`Message ${messageId} expired and deleted`);
    } catch (error) {
      console.error(`Failed to expire message ${messageId}:`, error);
    }
  }
  
  /**
   * Compute expiration timestamp for a message
   */
  private computeExpiration(message: Message): number | null {
    if (!message.expiration) return null;
    
    const { mode, duration } = message.expiration;
    const now = Date.now() / 1000;
    
    switch (mode) {
      case ExpirationMode.Never:
        return null;
        
      case ExpirationMode.AfterSend:
        return message.timestamp + duration;
        
      case ExpirationMode.AfterDelivery:
        if (!message.deliveredAt) return null;
        return message.deliveredAt + duration;
        
      case ExpirationMode.AfterRead:
        if (!message.readAt) return null;
        return message.readAt + duration;
        
      default:
        return null;
    }
  }
  
  /**
   * Check for expired messages (backup to timers)
   */
  private async checkExpiredMessages(): Promise<void> {
    const now = Date.now() / 1000;
    
    // Get all message keys
    const keys = await AsyncStorage.getAllKeys();
    const messageKeys = keys.filter(k => k.startsWith(`${STORAGE_PREFIX}message:`));
    
    for (const key of messageKeys) {
      try {
        const json = await AsyncStorage.getItem(key);
        if (!json) continue;
        
        const message: Message = JSON.parse(json);
        
        if (message.expiration?.expiresAt && message.expiration.expiresAt <= now) {
          await this.expireMessage(message.id);
        }
      } catch (error) {
        console.error('Failed to check message expiration:', error);
      }
    }
  }
  
  /**
   * Get time remaining until expiration
   */
  getTimeRemaining(message: Message): number | null {
    if (!message.expiration?.expiresAt) return null;
    
    const now = Date.now() / 1000;
    const remaining = message.expiration.expiresAt - now;
    
    return remaining > 0 ? remaining : 0;
  }
  
  /**
   * Format time remaining for display
   */
  formatTimeRemaining(seconds: number): string {
    if (seconds <= 0) return 'Expired';
    
    if (seconds < 60) {
      return `${Math.floor(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m`;
    } else if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `${hours}h`;
    } else {
      const days = Math.floor(seconds / 86400);
      return `${days}d`;
    }
  }
  
  // ========================================================================
  // Private Helpers
  // ========================================================================
  
  private async loadMessage(messageId: string): Promise<Message | null> {
    const json = await AsyncStorage.getItem(`${STORAGE_PREFIX}message:${messageId}`);
    return json ? JSON.parse(json) : null;
  }
  
  private async saveMessage(message: Message): Promise<void> {
    await AsyncStorage.setItem(
      `${STORAGE_PREFIX}message:${message.id}`,
      JSON.stringify(message)
    );
  }
  
  private async removeFromConversation(conversationId: string, messageId: string): Promise<void> {
    const key = `${STORAGE_PREFIX}messages:${conversationId}`;
    const json = await AsyncStorage.getItem(key);
    if (!json) return;
    
    const messages: Message[] = JSON.parse(json);
    const filtered = messages.filter(m => m.id !== messageId);
    await AsyncStorage.setItem(key, JSON.stringify(filtered));
  }
  
  // ========================================================================
  // Event Listeners
  // ========================================================================
  
  on(listener: (event: MessagingEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private emit(event: MessagingEvent): void {
    this.listeners.forEach(listener => listener(event));
  }
}

