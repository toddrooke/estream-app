/**
 * Conversations Screen
 * 
 * Lists all active conversations with unread counts and last message preview
 */

import React from 'react';
import { FlatList, View, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useMessaging } from '../services/messaging/MessagingContext';
import { useNavigation } from '@react-navigation/native';
import { Conversation } from '../services/messaging/types';

export function ConversationsScreen() {
  const { conversations, isConnected, refreshConversations } = useMessaging();
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = React.useState(false);
  
  const onRefresh = async () => {
    setRefreshing(true);
    await refreshConversations();
    setRefreshing(false);
  };
  
  // Separate platform and user conversations
  const platformConversations = conversations.filter(c => c.peerDeviceId.startsWith('platform-'));
  const userConversations = conversations.filter(c => !c.peerDeviceId.startsWith('platform-'));
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Conversations</Text>
        <View style={[styles.statusDot, isConnected ? styles.statusConnected : styles.statusDisconnected]} />
      </View>
      
      {platformConversations.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform Messages</Text>
          {platformConversations.map(conversation => (
            <ConversationCard
              key={conversation.id}
              conversation={conversation}
              onPress={() => navigation.navigate('PlatformMessage' as never, { conversationId: conversation.id } as never)}
            />
          ))}
        </View>
      )}
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Messages</Text>
        <FlatList
          data={userConversations}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ConversationCard
              conversation={item}
              onPress={() => navigation.navigate('MessageThread' as never, { conversationId: item.id } as never)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No conversations yet</Text>
              <Text style={styles.emptySubtext}>Start a conversation to get started</Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

interface ConversationCardProps {
  conversation: Conversation;
  onPress: () => void;
}

function ConversationCard({ conversation, onPress }: ConversationCardProps) {
  const isPlatform = conversation.peerDeviceId.startsWith('platform-');
  
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={[styles.avatar, isPlatform && styles.avatarPlatform]}>
        <Text style={styles.avatarText}>
          {isPlatform ? '🔐' : conversation.peerDeviceId.substring(0, 2).toUpperCase()}
        </Text>
      </View>
      
      <View style={styles.content}>
        <Text style={styles.peerName}>
          {isPlatform ? 'eStream Platform' : formatDeviceId(conversation.peerDeviceId)}
        </Text>
        
        {conversation.lastMessage && (
          <Text style={styles.lastMessage} numberOfLines={1}>
            {conversation.lastMessage.content}
          </Text>
        )}
        
        <Text style={styles.timestamp}>
          {formatTimestamp(conversation.lastActivity)}
        </Text>
      </View>
      
      {conversation.unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{conversation.unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function formatDeviceId(deviceId: string): string {
  if (deviceId.length <= 16) return deviceId;
  return `${deviceId.substring(0, 8)}...${deviceId.substring(deviceId.length - 8)}`;
}

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusConnected: {
    backgroundColor: '#34C759',
  },
  statusDisconnected: {
    backgroundColor: '#FF3B30',
  },
  section: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    paddingHorizontal: 20,
    paddingVertical: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarPlatform: {
    backgroundColor: '#007AFF',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  content: {
    flex: 1,
  },
  peerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#636366',
  },
  badge: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#636366',
  },
});

