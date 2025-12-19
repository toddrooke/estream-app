/**
 * Messaging Context - React Context for Messaging Service
 * 
 * Provides hooks for accessing messaging functionality in React components
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { MessagingService } from './MessagingService';
import { Message, Conversation, DevicePublicKeys } from './types';

interface MessagingContextValue {
  service: MessagingService | null;
  conversations: Conversation[];
  isConnected: boolean;
  isInitializing: boolean;
  error: string | null;
  sendMessage: (
    recipientId: string, 
    recipientKeys: DevicePublicKeys, 
    content: string,
    expiration?: { mode: string; duration_seconds?: number }
  ) => Promise<void>;
  getMessages: (conversationId: string) => Promise<Message[]>;
  markAsRead: (conversationId: string) => Promise<void>;
  refreshConversations: () => Promise<void>;
}

const MessagingContext = createContext<MessagingContextValue | null>(null);

interface MessagingProviderProps {
  children: React.ReactNode;
  nodeAddr: string;
  deviceKeys: any;
}

export function MessagingProvider({ children, nodeAddr, deviceKeys }: MessagingProviderProps) {
  const [service, setService] = useState<MessagingService | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    let svc: MessagingService | null = null;
    let unsubscribe: (() => void) | null = null;
    
    const initialize = async () => {
      try {
        setIsInitializing(true);
        setError(null);
        
        console.log('[MessagingContext] Initializing messaging service...');
        
        svc = new MessagingService(nodeAddr);
        
        await svc.initialize(deviceKeys);
        
        setService(svc);
        setIsConnected(true);
        
        // Load conversations
        const convos = await svc.getConversations();
        setConversations(convos);
        
        // Listen for updates
        unsubscribe = svc.on((event) => {
          console.log('[MessagingContext] Event:', event.type);
          
          if (event.type === 'conversation:created' || 
              event.type === 'conversation:read' || 
              event.type === 'message:received') {
            // Refresh conversations
            svc!.getConversations().then(setConversations);
          }
        });
        
        console.log('[MessagingContext] Messaging service initialized successfully');
        
      } catch (err) {
        console.error('[MessagingContext] Failed to initialize:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize messaging service');
        setIsConnected(false);
      } finally {
        setIsInitializing(false);
      }
    };
    
    if (deviceKeys) {
      initialize();
    }
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      if (svc) {
        svc.shutdown().catch(console.error);
      }
    };
  }, [nodeAddr, deviceKeys]);
  
  const refreshConversations = useCallback(async () => {
    if (service) {
      const convos = await service.getConversations();
      setConversations(convos);
    }
  }, [service]);
  
  const value: MessagingContextValue = {
    service,
    conversations,
    isConnected,
    isInitializing,
    error,
    sendMessage: async (recipientId, recipientKeys, content, expiration) => {
      if (!service) throw new Error('Service not initialized');
      await service.sendMessage(recipientId, recipientKeys, content, expiration);
      await refreshConversations();
    },
    getMessages: async (conversationId) => {
      if (!service) throw new Error('Service not initialized');
      return await service.getMessages(conversationId);
    },
    markAsRead: async (conversationId) => {
      if (!service) throw new Error('Service not initialized');
      await service.markAsRead(conversationId);
      await refreshConversations();
    },
    refreshConversations,
  };
  
  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
}

/**
 * Hook to access the messaging service
 */
export function useMessaging(): MessagingContextValue {
  const context = useContext(MessagingContext);
  if (!context) {
    throw new Error('useMessaging must be used within MessagingProvider');
  }
  return context;
}

/**
 * Hook to get a specific conversation
 */
export function useConversation(deviceId: string): Conversation | undefined {
  const { conversations } = useMessaging();
  return conversations.find(c => c.peerDeviceId === deviceId);
}

/**
 * Hook to get messages for a conversation
 */
export function useMessages(conversationId: string): { messages: Message[]; loading: boolean; refresh: () => Promise<void> } {
  const { getMessages } = useMessaging();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const msgs = await getMessages(conversationId);
      setMessages(msgs);
    } catch (error) {
      console.error('[useMessages] Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, getMessages]);
  
  useEffect(() => {
    refresh();
  }, [refresh]);
  
  return { messages, loading, refresh };
}

