/**
 * Message Thread Screen
 * 
 * Displays a conversation thread with message bubbles and composer
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  FlatList, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator 
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useMessaging, useMessages } from '../services/messaging/MessagingContext';
import { Message, MessageStatus } from '../services/messaging/types';

export function MessageThreadScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { conversationId } = route.params as any;
  const { sendMessage, markAsRead, service } = useMessaging();
  const { messages, loading, refresh } = useMessages(conversationId);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  
  useEffect(() => {
    markAsRead(conversationId);
  }, [conversationId, markAsRead]);
  
  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;
    
    setIsSending(true);
    
    try {
      // Get conversation to get recipient details
      const conversation = await service?.getConversation(conversationId.split('_')[2]); // Extract peer device ID
      
      if (!conversation) {
        console.error('Conversation not found');
        return;
      }
      
      await sendMessage(
        conversation.peerDeviceId,
        conversation.peerPublicKeys,
        inputText
      );
      
      setInputText('');
      
      // Refresh messages
      setTimeout(() => refresh(), 100);
      
      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 200);
      
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };
  
  if (loading && messages.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }
  
  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={[...messages].reverse()} // Reverse for inverted list
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <MessageBubble message={item} />
        )}
        inverted
        contentContainerStyle={styles.messageList}
      />
      
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor="#636366"
          multiline
          maxLength={1000}
        />
        <TouchableOpacity 
          style={[styles.sendButton, (!inputText.trim() || isSending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isSending}
        >
          <Text style={styles.sendButtonText}>
            {isSending ? '...' : '↑'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  // TODO: Get actual device ID from context
  const myDeviceId = 'local-device'; // Placeholder
  const isSent = message.fromDeviceId === myDeviceId;
  
  return (
    <View style={[styles.bubbleContainer, isSent ? styles.bubbleContainerSent : styles.bubbleContainerReceived]}>
      <View style={[styles.bubble, isSent ? styles.bubbleSent : styles.bubbleReceived]}>
        <Text style={[styles.bubbleText, isSent ? styles.bubbleTextSent : styles.bubbleTextReceived]}>
          {message.content}
        </Text>
        <View style={styles.bubbleFooter}>
          <Text style={[styles.timestamp, isSent && styles.timestampSent]}>
            {formatTimestamp(message.timestamp)}
          </Text>
          {isSent && (
            <Text style={styles.status}>{getStatusIcon(message.status)}</Text>
          )}
        </View>
        
        {message.expiration && message.expiration.mode !== 'Never' && (
          <View style={styles.expirationBadge}>
            <Text style={styles.expirationText}>
              ⏱️ {message.expiration.mode}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getStatusIcon(status: MessageStatus): string {
  switch (status) {
    case MessageStatus.Pending:
      return '○';
    case MessageStatus.Sending:
      return '◔';
    case MessageStatus.Sent:
      return '◉';
    case MessageStatus.Delivered:
      return '✓';
    case MessageStatus.Read:
      return '✓✓';
    case MessageStatus.Failed:
      return '✗';
    case MessageStatus.Expired:
      return '⏱';
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bubbleContainer: {
    marginVertical: 4,
    maxWidth: '80%',
  },
  bubbleContainerSent: {
    alignSelf: 'flex-end',
  },
  bubbleContainerReceived: {
    alignSelf: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  bubbleSent: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    backgroundColor: '#1C1C1E',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 20,
  },
  bubbleTextSent: {
    color: '#FFF',
  },
  bubbleTextReceived: {
    color: '#FFF',
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  timestamp: {
    fontSize: 11,
    color: '#8E8E93',
    marginRight: 4,
  },
  timestampSent: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  status: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  expirationBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  expirationText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '600',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
    backgroundColor: '#000',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#FFF',
    marginRight: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#1C1C1E',
  },
  sendButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
});

