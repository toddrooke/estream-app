/**
 * Platform Inbox Screen
 * 
 * Displays platform messages (signing requests, alerts, governance, etc.)
 */

import React, { useState } from 'react';
import { FlatList, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useMessaging, useMessages } from '../services/messaging/MessagingContext';
import { useRoute } from '@react-navigation/native';
import { SigningRequestModal } from '../components/messaging/SigningRequestModal';
import { SecurityAlertModal } from '../components/messaging/SecurityAlertModal';
import { GovernanceProposalModal } from '../components/messaging/GovernanceProposalModal';
import { PlatformMessageType } from '../services/messaging/types';

export function PlatformInboxScreen() {
  const route = useRoute();
  const { conversationId } = route.params as any;
  const { markAsRead } = useMessaging();
  const { messages, loading, refresh } = useMessages(conversationId);
  
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [modalType, setModalType] = useState<string | null>(null);
  
  React.useEffect(() => {
    markAsRead(conversationId);
  }, [conversationId, markAsRead]);
  
  const handleMessagePress = (message: any) => {
    try {
      const platformMessage = JSON.parse(message.content);
      setSelectedMessage(platformMessage);
      setModalType(platformMessage.type);
    } catch (error) {
      console.error('Failed to parse platform message:', error);
    }
  };
  
  const handleApproveSigningRequest = (signature: string) => {
    console.log('Signing request approved:', signature);
    // TODO: Send response back to platform
    setModalType(null);
    setSelectedMessage(null);
    refresh();
  };
  
  const handleRejectSigningRequest = () => {
    console.log('Signing request rejected');
    // TODO: Send rejection back to platform
    setModalType(null);
    setSelectedMessage(null);
  };
  
  const handleAcknowledgeAlert = () => {
    console.log('Alert acknowledged');
    // TODO: Send acknowledgment back to platform
    setModalType(null);
    setSelectedMessage(null);
  };
  
  const handleAlertAction = (actionId: string) => {
    console.log('Alert action:', actionId);
    // TODO: Execute action and send response
    setModalType(null);
    setSelectedMessage(null);
  };
  
  const handleVote = (option: string) => {
    console.log('Vote cast:', option);
    // TODO: Submit vote to platform
    setModalType(null);
    setSelectedMessage(null);
  };
  
  const handleCloseGovernance = () => {
    setModalType(null);
    setSelectedMessage(null);
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Platform Messages</Text>
      </View>
      
      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <PlatformMessageCard
            message={item}
            onPress={() => handleMessagePress(item)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No platform messages</Text>
          </View>
        }
      />
      
      {/* Modals */}
      {modalType === PlatformMessageType.SigningRequest && (
        <SigningRequestModal
          visible={true}
          message={selectedMessage}
          onApprove={handleApproveSigningRequest}
          onReject={handleRejectSigningRequest}
        />
      )}
      
      {modalType === PlatformMessageType.SecurityAlert && (
        <SecurityAlertModal
          visible={true}
          message={selectedMessage}
          onAcknowledge={handleAcknowledgeAlert}
          onAction={handleAlertAction}
        />
      )}
      
      {modalType === PlatformMessageType.GovernanceProposal && (
        <GovernanceProposalModal
          visible={true}
          message={selectedMessage}
          onVote={handleVote}
          onClose={handleCloseGovernance}
        />
      )}
    </View>
  );
}

interface PlatformMessageCardProps {
  message: any;
  onPress: () => void;
}

function PlatformMessageCard({ message, onPress }: PlatformMessageCardProps) {
  let platformMessage: any;
  try {
    platformMessage = JSON.parse(message.content);
  } catch {
    platformMessage = { type: 'Unknown', data: {} };
  }
  
  const icon = getIconForMessageType(platformMessage.type);
  const displayName = getDisplayName(platformMessage.type);
  const summary = getSummary(platformMessage);
  const priority = platformMessage.priority || 'normal';
  
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={[styles.iconContainer, getPriorityStyle(priority)]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      
      <View style={styles.content}>
        <Text style={styles.messageType}>{displayName}</Text>
        <Text style={styles.summary} numberOfLines={2}>
          {summary}
        </Text>
        <Text style={styles.timestamp}>
          {formatTimestamp(message.timestamp)}
        </Text>
      </View>
      
      <View style={styles.arrow}>
        <Text style={styles.arrowText}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

function getIconForMessageType(type: string): string {
  switch (type) {
    case PlatformMessageType.SigningRequest:
      return '🔐';
    case PlatformMessageType.SecurityAlert:
      return '🚨';
    case PlatformMessageType.Notification:
      return '📢';
    case PlatformMessageType.GovernanceProposal:
      return '🗳️';
    case PlatformMessageType.BillingUpdate:
      return '💳';
    default:
      return '📬';
  }
}

function getDisplayName(type: string): string {
  switch (type) {
    case PlatformMessageType.SigningRequest:
      return 'Signing Request';
    case PlatformMessageType.SecurityAlert:
      return 'Security Alert';
    case PlatformMessageType.Notification:
      return 'Notification';
    case PlatformMessageType.GovernanceProposal:
      return 'Governance Proposal';
    case PlatformMessageType.BillingUpdate:
      return 'Billing Update';
    default:
      return 'Platform Message';
  }
}

function getSummary(platformMessage: any): string {
  const data = platformMessage.data || {};
  return data.title || data.description || 'No summary available';
}

function getPriorityStyle(priority: string): any {
  switch (priority) {
    case 'critical':
      return { backgroundColor: '#FF3B30' };
    case 'high':
      return { backgroundColor: '#FF9500' };
    case 'normal':
      return { backgroundColor: '#007AFF' };
    case 'low':
      return { backgroundColor: '#8E8E93' };
    default:
      return { backgroundColor: '#007AFF' };
  }
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
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
  },
  list: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    marginBottom: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
  },
  messageType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  summary: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#636366',
  },
  arrow: {
    marginLeft: 8,
  },
  arrowText: {
    fontSize: 24,
    color: '#636366',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#8E8E93',
  },
});

