# Issue #3: Platform Messaging UI

**Epic**: Phase 1 - Messaging Integration  
**Priority**: P1 (High)  
**Estimated Effort**: 2-3 days  
**Depends On**: Issue #2 (Messaging Service)

---

## Overview

Build the UI for platform messaging in estream-app. This includes screens for:
- Signing requests (transaction approval via MWA)
- Security alerts
- System notifications
- Governance proposals
- Conversation list
- Message thread view

---

## Goals

1. ✅ Platform message inbox
2. ✅ Signing request UI (MWA integration)
3. ✅ Security alert modal
4. ✅ Notification center
5. ✅ Governance voting UI
6. ✅ Conversation list
7. ✅ Message thread view
8. ✅ Message composer

---

## Screens

### 1. Platform Inbox

**src/screens/PlatformInbox.tsx**:
```typescript
import React from 'react';
import { FlatList, View, Text, TouchableOpacity } from 'react-native';
import { useMessaging } from '../services/messaging/MessagingContext';

export function PlatformInboxScreen() {
  const { conversations } = useMessaging();
  
  // Filter for platform messages
  const platformConversations = conversations.filter(
    c => c.peerDeviceId.startsWith('platform-')
  );
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Platform Messages</Text>
      
      <FlatList
        data={platformConversations}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <PlatformMessageCard conversation={item} />
        )}
      />
    </View>
  );
}

function PlatformMessageCard({ conversation }: any) {
  const lastMessage = conversation.lastMessage;
  
  // Parse platform message
  const platformMessage = JSON.parse(lastMessage.content);
  
  return (
    <TouchableOpacity style={styles.card}>
      <View style={styles.icon}>
        {getIconForMessageType(platformMessage.type)}
      </View>
      
      <View style={styles.content}>
        <Text style={styles.messageType}>
          {getDisplayName(platformMessage.type)}
        </Text>
        <Text style={styles.summary} numberOfLines={2}>
          {getSummary(platformMessage)}
        </Text>
        <Text style={styles.timestamp}>
          {formatTimestamp(lastMessage.timestamp)}
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
```

### 2. Signing Request UI

**src/components/messaging/SigningRequestModal.tsx**:
```typescript
import React, { useState } from 'react';
import { View, Text, Button, Modal } from 'react-native';
import { transact } from '@solana-mobile/mobile-wallet-adapter-walletlib';

interface SigningRequestProps {
  message: any;
  onApprove: (signature: string) => void;
  onReject: () => void;
}

export function SigningRequestModal({ message, onApprove, onReject }: SigningRequestProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  
  const data = message.data;
  
  const handleApprove = async () => {
    setIsProcessing(true);
    
    try {
      // Use MWA to sign transaction
      const result = await transact(async (wallet) => {
        const authResult = await wallet.authorize({
          cluster: 'mainnet-beta',
          identity: { name: 'eStream' },
        });
        
        // Build transaction
        const tx = buildTransaction(data);
        
        // Sign with MWA
        const signedTxs = await wallet.signTransactions({
          transactions: [tx],
        });
        
        return signedTxs[0];
      });
      
      onApprove(result);
    } catch (error) {
      console.error('Signing failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };
  
  return (
    <Modal visible={true} animationType="slide">
      <View style={styles.container}>
        <Text style={styles.title}>Signing Request</Text>
        
        <View style={styles.details}>
          <Text style={styles.label}>Transaction Type:</Text>
          <Text style={styles.value}>{data.transaction_type}</Text>
          
          <Text style={styles.label}>Description:</Text>
          <Text style={styles.value}>{data.description}</Text>
          
          {data.amount_tokens && (
            <>
              <Text style={styles.label}>Amount:</Text>
              <Text style={styles.value}>{data.amount_tokens} eSTREAM</Text>
            </>
          )}
          
          <View style={styles.detailsBox}>
            <Text style={styles.detailsJson}>
              {JSON.stringify(data.details, null, 2)}
            </Text>
          </View>
        </View>
        
        <View style={styles.actions}>
          <Button
            title="Reject"
            onPress={onReject}
            color="#FF3B30"
            disabled={isProcessing}
          />
          
          <Button
            title={isProcessing ? "Processing..." : "Approve & Sign"}
            onPress={handleApprove}
            disabled={isProcessing}
          />
        </View>
      </View>
    </Modal>
  );
}
```

### 3. Security Alert Modal

**src/components/messaging/SecurityAlertModal.tsx**:
```typescript
import React from 'react';
import { View, Text, Button, Modal } from 'react-native';

interface SecurityAlertProps {
  message: any;
  onAcknowledge: () => void;
  onAction: (actionId: string) => void;
}

export function SecurityAlertModal({ message, onAcknowledge, onAction }: SecurityAlertProps) {
  const data = message.data;
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#FF3B30';
      case 'high': return '#FF9500';
      case 'medium': return '#FFCC00';
      case 'low': return '#34C759';
      default: return '#8E8E93';
    }
  };
  
  return (
    <Modal visible={true} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={[styles.container, { borderColor: getSeverityColor(data.severity) }]}>
          <View style={[styles.header, { backgroundColor: getSeverityColor(data.severity) }]}>
            <Text style={styles.severity}>🔐 {data.severity.toUpperCase()}</Text>
          </View>
          
          <View style={styles.content}>
            <Text style={styles.title}>{data.title}</Text>
            <Text style={styles.description}>{data.description}</Text>
          </View>
          
          <View style={styles.actions}>
            {data.actions.map((action: any) => (
              <Button
                key={action.action_id}
                title={action.label}
                onPress={() => onAction(action.action_id)}
                color={getActionColor(action.style)}
              />
            ))}
            
            <Button
              title="Acknowledge"
              onPress={onAcknowledge}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

### 4. Governance Voting UI

**src/components/messaging/GovernanceProposalModal.tsx**:
```typescript
import React, { useState } from 'react';
import { View, Text, Button, Modal, ScrollView } from 'react-native';

interface GovernanceProposalProps {
  message: any;
  onVote: (option: string) => void;
  onClose: () => void;
}

export function GovernanceProposalModal({ message, onVote, onClose }: GovernanceProposalProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const data = message.data;
  
  const daysRemaining = Math.ceil((data.deadline - Date.now()) / (1000 * 60 * 60 * 24));
  
  return (
    <Modal visible={true} animationType="slide">
      <ScrollView style={styles.container}>
        <Text style={styles.title}>🗳️ Governance Proposal</Text>
        
        <View style={styles.header}>
          <Text style={styles.proposalTitle}>{data.title}</Text>
          <Text style={styles.deadline}>Voting ends in {daysRemaining} days</Text>
        </View>
        
        <View style={styles.description}>
          <Text>{data.description}</Text>
        </View>
        
        <View style={styles.votingPower}>
          <Text style={styles.label}>Your Voting Power:</Text>
          <Text style={styles.value}>{data.voting_power} votes</Text>
        </View>
        
        <View style={styles.options}>
          <Text style={styles.label}>Vote:</Text>
          {data.options.map((option: string) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.option,
                selectedOption === option && styles.optionSelected
              ]}
              onPress={() => setSelectedOption(option)}
            >
              <Text style={styles.optionText}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <View style={styles.actions}>
          <Button title="Close" onPress={onClose} color="#8E8E93" />
          <Button
            title="Submit Vote"
            onPress={() => selectedOption && onVote(selectedOption)}
            disabled={!selectedOption}
          />
        </View>
      </ScrollView>
    </Modal>
  );
}
```

### 5. Conversations List

**src/screens/ConversationsScreen.tsx**:
```typescript
import React from 'react';
import { FlatList, View, Text, TouchableOpacity } from 'react-native';
import { useMessaging } from '../services/messaging/MessagingContext';
import { useNavigation } from '@react-navigation/native';

export function ConversationsScreen() {
  const { conversations } = useMessaging();
  const navigation = useNavigation();
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Conversations</Text>
      
      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ConversationCard
            conversation={item}
            onPress={() => navigation.navigate('MessageThread', { conversationId: item.id })}
          />
        )}
      />
    </View>
  );
}

function ConversationCard({ conversation, onPress }: any) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {conversation.peerDeviceId.substring(0, 2).toUpperCase()}
        </Text>
      </View>
      
      <View style={styles.content}>
        <Text style={styles.peerName}>{conversation.peerDeviceId}</Text>
        
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
```

### 6. Message Thread

**src/screens/MessageThreadScreen.tsx**:
```typescript
import React, { useState, useEffect } from 'react';
import { FlatList, View, Text, TextInput, Button } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useMessaging, useMessages } from '../services/messaging/MessagingContext';

export function MessageThreadScreen() {
  const route = useRoute();
  const { conversationId } = route.params as any;
  const { sendMessage, markAsRead } = useMessaging();
  const messages = useMessages(conversationId);
  const [inputText, setInputText] = useState('');
  
  useEffect(() => {
    markAsRead(conversationId);
  }, [conversationId, markAsRead]);
  
  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    // Get conversation details (recipientId, recipientKeys)
    // For now, placeholder
    const recipientId = 'peer-device-id';
    const recipientKeys = {}; // Fetch from conversation
    
    await sendMessage(recipientId, recipientKeys, inputText);
    setInputText('');
  };
  
  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <MessageBubble message={item} />
        )}
        inverted
      />
      
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          multiline
        />
        <Button title="Send" onPress={handleSend} />
      </View>
    </View>
  );
}

function MessageBubble({ message }: any) {
  const isSent = message.fromDeviceId === 'my-device-id'; // Get from context
  
  return (
    <View style={[styles.bubble, isSent ? styles.bubbleSent : styles.bubbleReceived]}>
      <Text style={styles.bubbleText}>{message.content}</Text>
      <View style={styles.bubbleFooter}>
        <Text style={styles.timestamp}>{formatTimestamp(message.timestamp)}</Text>
        {isSent && <Text style={styles.status}>{getStatusIcon(message.status)}</Text>}
      </View>
    </View>
  );
}
```

---

## Deliverables

1. ✅ Platform inbox screen
2. ✅ Signing request modal (MWA integration)
3. ✅ Security alert modal
4. ✅ Governance voting modal
5. ✅ Conversations list
6. ✅ Message thread view
7. ✅ Message composer

---

## Success Criteria

- [ ] Can view platform messages
- [ ] Can approve signing requests via MWA
- [ ] Can acknowledge security alerts
- [ ] Can vote on governance proposals
- [ ] Can view all conversations
- [ ] Can send/receive messages in thread
- [ ] UI is responsive and intuitive

---

**Status**: ✅ Complete  
**Branch**: `main`

