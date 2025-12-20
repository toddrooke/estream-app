# Cipher: Platform Messaging & Transaction Signing

**Repository**: `estream-app`  
**Focus**: Standalone PQ messaging app + platform integration for TakeTitle & TrueResolve  
**Timeline**: 12 weeks (Phases 2-4)  
**Platform**: React Native (iOS + Android)

---

## Overview

Cipher serves dual purposes:

1. **Standalone**: Secure PQ-encrypted messaging showcase
2. **Platform Backbone**: Communication hub for TakeTitle & TrueResolve

**Key Features**:
- Quantum-resistant encrypted messaging (Kyber1024 + Dilithium5)
- Platform-to-user notifications
- In-chat transaction signing (MWA)
- Expiring messages
- Multi-device sync via estream DAG

---

## Phase 2: Platform Messaging Foundation (Week 7-11)

### 2.1 Platform Message Types

**File**: `src/types/platform_messages.ts`

```typescript
export enum PlatformMessageType {
  // TakeTitle
  ASSET_CREATED = 'asset_created',
  INVESTMENT_CONFIRMED = 'investment_confirmed',
  SIGNING_REQUEST = 'signing_request',
  PORTFOLIO_UPDATE = 'portfolio_update',
  GOVERNANCE_PROPOSAL = 'governance_proposal',
  TRANSFER_RECEIVED = 'transfer_received',
  
  // TrueResolve
  NEW_CASE = 'new_case',
  NEW_EVIDENCE = 'new_evidence',
  CASE_UPDATE = 'case_update',
  AI_ANALYSIS_COMPLETE = 'ai_analysis_complete',
  DECISION_RENDERED = 'decision_rendered',
  
  // Generic
  SECURITY_ALERT = 'security_alert',
  SYSTEM_NOTIFICATION = 'system_notification',
}

export interface PlatformMessage {
  id: string;
  type: PlatformMessageType;
  platform: 'taketitle' | 'trueresolve';
  
  // Message content
  title: string;
  body: string;
  payload: any;
  
  // Cryptography
  signature: DilithiumSignature;
  platform_public_key: string;
  
  // Actions (in-chat buttons)
  actions?: MessageAction[];
  
  // Metadata
  timestamp: number;
  read: boolean;
  archived: boolean;
  
  // Deep linking
  deep_link?: string;
}

export interface MessageAction {
  label: string;
  action: 'sign_mwa' | 'open_app' | 'view_details' | 'vote' | 'custom';
  payload?: any;
}
```

### 2.2 Platform Message Handler

**File**: `src/services/platform_message_handler.ts`

```typescript
import { MessagingService } from '@estream/messaging';
import { transact } from '@solana-mobile/mobile-wallet-adapter';

export class PlatformMessageHandler {
  constructor(
    private messagingService: MessagingService,
    private keyManager: KeyManager,
  ) {}
  
  /**
   * Receive and decrypt platform message
   */
  async receiveMessage(encryptedMessage: EncryptedMessage): Promise<PlatformMessage> {
    const userKey = await this.keyManager.getKyberSecretKey();
    
    // Decrypt with Kyber1024
    const decrypted = await this.messagingService.decrypt_message(
      encryptedMessage,
      userKey,
    );
    
    const message: PlatformMessage = JSON.parse(decrypted);
    
    // Verify Dilithium5 signature (platform authenticity)
    const isValid = await this.verifyPlatformSignature(
      message.signature,
      message.platform_public_key,
      message.payload,
    );
    
    if (!isValid) {
      throw new Error('Invalid platform signature');
    }
    
    return message;
  }
  
  /**
   * Handle message action
   */
  async handleAction(message: PlatformMessage, action: MessageAction): Promise<void> {
    switch (action.action) {
      case 'sign_mwa':
        await this.handleSigningRequest(message, action);
        break;
        
      case 'open_app':
        await this.openPlatformApp(message.platform, message.deep_link);
        break;
        
      case 'view_details':
        await this.showMessageDetails(message);
        break;
        
      case 'vote':
        await this.handleGovernanceVote(message, action);
        break;
        
      default:
        throw new Error(`Unknown action: ${action.action}`);
    }
  }
  
  /**
   * Handle MWA signing request (TakeTitle investments)
   */
  private async handleSigningRequest(
    message: PlatformMessage,
    action: MessageAction,
  ): Promise<void> {
    const { transaction } = action.payload;
    
    try {
      // Open MWA signing flow
      const result = await transact(async (wallet) => {
        const authResult = await wallet.authorize({
          cluster: 'mainnet-beta',
          identity: { name: 'Cipher' },
        });
        
        const signedTx = await wallet.signTransactions({
          transactions: [transaction],
        });
        
        return signedTx[0];
      });
      
      // Send signed transaction back to platform
      await this.sendSigningResponse(message.id, result);
      
      // Update message UI
      await this.updateMessageStatus(message.id, 'signed');
      
      showToast('Transaction signed successfully');
    } catch (error) {
      Alert.alert('Signing Failed', error.message);
    }
  }
  
  /**
   * Handle governance vote (TakeTitle)
   */
  private async handleGovernanceVote(
    message: PlatformMessage,
    action: MessageAction,
  ): Promise<void> {
    const { proposal_id, vote } = action.payload;
    
    // Sign vote with Dilithium5
    const userKeypair = await this.keyManager.getDilithiumKeypair();
    const signature = await userKeypair.sign(
      JSON.stringify({ proposal_id, vote, timestamp: Date.now() }),
    );
    
    // Submit vote to platform
    await this.submitVote(message.platform, proposal_id, vote, signature);
    
    // Update message
    await this.updateMessageStatus(message.id, `voted_${vote}`);
    
    showToast(`Vote recorded: ${vote.toUpperCase()}`);
  }
}
```

### 2.3 Platform Messages Screen

**File**: `src/screens/PlatformMessagesScreen.tsx`

```typescript
export function PlatformMessagesScreen() {
  const { messages, loading } = usePlatformMessages();
  const [filter, setFilter] = useState<'all' | 'taketitle' | 'trueresolve'>('all');
  
  const filteredMessages = messages.filter(m =>
    filter === 'all' || m.platform === filter
  );
  
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Platform Messages</Text>
        <QuantumSecurityBadge />
      </View>
      
      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        <Tab
          label="All"
          active={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <Tab
          label="TakeTitle"
          active={filter === 'taketitle'}
          onPress={() => setFilter('taketitle')}
        />
        <Tab
          label="TrueResolve"
          active={filter === 'trueresolve'}
          onPress={() => setFilter('trueresolve')}
        />
      </View>
      
      {/* Messages List */}
      <FlatList
        data={filteredMessages}
        renderItem={({ item }) => (
          <PlatformMessageCard
            message={item}
            onPress={() => navigation.navigate('MessageDetails', { messageId: item.id })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="mail-outline"
            title="No messages"
            subtitle="Platform notifications will appear here"
          />
        }
      />
    </View>
  );
}
```

### 2.4 Message Details with Actions

**File**: `src/screens/MessageDetailsScreen.tsx`

```typescript
export function MessageDetailsScreen({ route }) {
  const { messageId } = route.params;
  const { message, loading } = usePlatformMessage(messageId);
  const [actionInProgress, setActionInProgress] = useState(false);
  
  const handleAction = async (action: MessageAction) => {
    setActionInProgress(true);
    try {
      await platformMessageHandler.handleAction(message, action);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setActionInProgress(false);
    }
  };
  
  return (
    <ScrollView style={styles.container}>
      {/* Platform Badge */}
      <View style={styles.platformBadge}>
        <Image
          source={getPlatformLogo(message.platform)}
          style={styles.platformLogo}
        />
        <Text style={styles.platformName}>
          {message.platform === 'taketitle' ? 'TakeTitle' : 'TrueResolve'}
        </Text>
      </View>
      
      {/* Message Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{message.title}</Text>
        <Text style={styles.timestamp}>
          {formatTimestamp(message.timestamp)}
        </Text>
      </View>
      
      {/* Message Body */}
      <View style={styles.body}>
        <Text style={styles.bodyText}>{message.body}</Text>
      </View>
      
      {/* Payload Details (type-specific) */}
      {renderPayloadDetails(message)}
      
      {/* Actions */}
      {message.actions && message.actions.length > 0 && (
        <View style={styles.actions}>
          <Text style={styles.actionsTitle}>Actions</Text>
          {message.actions.map((action, index) => (
            <Button
              key={index}
              title={action.label}
              onPress={() => handleAction(action)}
              loading={actionInProgress}
              icon={getActionIcon(action.action)}
              variant={action.action === 'sign_mwa' ? 'primary' : 'outline'}
            />
          ))}
        </View>
      )}
      
      {/* Security Info */}
      <View style={styles.securityInfo}>
        <Icon name="shield-checkmark" size={20} color="#4CAF50" />
        <Text style={styles.securityText}>
          Verified Dilithium5 signature from {message.platform}
        </Text>
      </View>
      
      {/* Deep Link */}
      {message.deep_link && (
        <Button
          title={`Open in ${message.platform}`}
          variant="outline"
          onPress={() => Linking.openURL(message.deep_link)}
        />
      )}
    </ScrollView>
  );
}

function renderPayloadDetails(message: PlatformMessage) {
  switch (message.type) {
    case PlatformMessageType.INVESTMENT_CONFIRMED:
      return (
        <View style={styles.payloadDetails}>
          <DetailRow label="Asset" value={message.payload.asset_name} />
          <DetailRow label="Amount" value={`$${message.payload.amount_usd.toLocaleString()}`} />
          <DetailRow label="Units" value={message.payload.units} />
          <DetailRow
            label="Privacy"
            value={message.payload.is_private ? 'Private Investment' : 'Public'}
          />
        </View>
      );
      
    case PlatformMessageType.NEW_EVIDENCE:
      return (
        <View style={styles.payloadDetails}>
          <DetailRow label="Case ID" value={message.payload.case_id} />
          <DetailRow label="Document" value={message.payload.document_name} />
          <DetailRow label="Submitted By" value={message.payload.submitted_by} />
          <DetailRow
            label="Document Hash"
            value={shortenHash(message.payload.document_hash)}
          />
        </View>
      );
      
    // ... other message types
  }
}
```

---

## Phase 3: MWA Transaction Signing (Week 12-15)

### 3.1 In-Chat Signing Flow

**File**: `src/components/SigningRequestCard.tsx`

```typescript
export function SigningRequestCard({ message }: { message: PlatformMessage }) {
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  
  const handleSign = async () => {
    setSigning(true);
    try {
      const action = message.actions.find(a => a.action === 'sign_mwa');
      await platformMessageHandler.handleAction(message, action);
      setSigned(true);
    } catch (error) {
      Alert.alert('Signing Failed', error.message);
    } finally {
      setSigning(false);
    }
  };
  
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Icon name="create" size={24} color="#2196F3" />
        <Text style={styles.cardTitle}>Transaction Signing Request</Text>
      </View>
      
      <View style={styles.txDetails}>
        <Text style={styles.label}>Transaction Type</Text>
        <Text style={styles.value}>{message.payload.transaction_type}</Text>
        
        <Text style={styles.label}>Platform</Text>
        <Text style={styles.value}>
          {message.platform === 'taketitle' ? 'TakeTitle' : 'TrueResolve'}
        </Text>
        
        {message.payload.amount && (
          <>
            <Text style={styles.label}>Amount</Text>
            <Text style={styles.value}>${message.payload.amount.toLocaleString()}</Text>
          </>
        )}
      </View>
      
      {signed ? (
        <View style={styles.signedBadge}>
          <Icon name="checkmark-circle" size={24} color="#4CAF50" />
          <Text style={styles.signedText}>Transaction Signed</Text>
        </View>
      ) : (
        <Button
          title="Sign with Mobile Wallet"
          onPress={handleSign}
          loading={signing}
          icon="create"
        />
      )}
    </View>
  );
}
```

### 3.2 MWA Integration Service

**File**: `src/services/mwa_service.ts`

```typescript
import { transact } from '@solana-mobile/mobile-wallet-adapter';

export class MwaService {
  /**
   * Sign transaction via MWA
   */
  async signTransaction(
    transaction: Transaction,
    context: SigningContext,
  ): Promise<SignedTransaction> {
    return await transact(async (wallet) => {
      // 1. Authorize if needed
      const authResult = await wallet.authorize({
        cluster: 'mainnet-beta',
        identity: {
          name: 'Cipher by eStream',
          uri: 'https://estream.dev',
          icon: 'https://estream.dev/icon.png',
        },
      });
      
      // 2. Sign transaction
      const signedTxs = await wallet.signTransactions({
        transactions: [transaction],
      });
      
      // 3. Return signed transaction
      return signedTxs[0];
    });
  }
  
  /**
   * Sign and send transaction
   */
  async signAndSendTransaction(
    transaction: Transaction,
    context: SigningContext,
  ): Promise<string> {
    return await transact(async (wallet) => {
      const authResult = await wallet.authorize({
        cluster: 'mainnet-beta',
        identity: { name: 'Cipher by eStream' },
      });
      
      // Sign and send in one step
      const txSigs = await wallet.signAndSendTransactions({
        transactions: [transaction],
      });
      
      return txSigs[0];
    });
  }
}
```

---

## Phase 4: Standalone Features (Week 16-19)

### 4.1 Person-to-Person Encrypted Messaging

**File**: `src/screens/DirectMessagesScreen.tsx`

```typescript
export function DirectMessagesScreen() {
  const { conversations } = useConversations();
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <Button
          icon="add"
          onPress={() => navigation.navigate('NewConversation')}
        />
      </View>
      
      <FlatList
        data={conversations}
        renderItem={({ item }) => (
          <ConversationCard
            conversation={item}
            onPress={() => navigation.navigate('Conversation', { id: item.id })}
          />
        )}
      />
      
      <View style={styles.footer}>
        <QuantumSecurityBadge />
        <Text style={styles.footerText}>
          All messages encrypted with Kyber1024 + Dilithium5
        </Text>
      </View>
    </View>
  );
}
```

### 4.2 Conversation Screen with Expiring Messages

**File**: `src/screens/ConversationScreen.tsx`

```typescript
export function ConversationScreen({ route }) {
  const { id } = route.params;
  const { messages, sendMessage } = useConversation(id);
  const [messageText, setMessageText] = useState('');
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  
  const handleSend = async () => {
    await sendMessage({
      text: messageText,
      expires_in: expiresIn,
    });
    
    setMessageText('');
  };
  
  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        renderItem={({ item }) => (
          <MessageBubble message={item} />
        )}
        inverted
      />
      
      {/* Composer */}
      <View style={styles.composer}>
        {/* Expiration Picker */}
        <TouchableOpacity onPress={() => showExpirationPicker()}>
          <Icon
            name="time"
            size={24}
            color={expiresIn ? '#2196F3' : '#666'}
          />
        </TouchableOpacity>
        
        <TextInput
          style={styles.input}
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Type a message..."
        />
        
        <Button
          icon="send"
          onPress={handleSend}
          disabled={!messageText}
        />
      </View>
      
      {expiresIn && (
        <Text style={styles.expirationInfo}>
          Message expires in {formatDuration(expiresIn)}
        </Text>
      )}
    </View>
  );
}
```

---

## Integration Points

### TakeTitle Integration

**Message Types**:
- Investment confirmations
- Signing requests
- Portfolio updates
- Governance proposals
- Transfer notifications

**Actions**:
- Sign investment transactions
- Vote on proposals
- View asset details (deep link)

### TrueResolve Integration

**Message Types**:
- New case assignments
- Evidence submitted
- AI analysis complete
- Decision rendered

**Actions**:
- View case details (deep link)
- Verify proofs
- Submit evidence

---

## Testing

### Unit Tests
- Message encryption/decryption
- Signature verification
- MWA signing flow

### Integration Tests
- Platform message delivery
- In-chat signing
- Deep linking to apps

### E2E Tests
```typescript
describe('Platform Messaging', () => {
  it('should receive and handle TakeTitle signing request', async () => {
    await element(by.id('platform-messages-tab')).tap();
    await element(by.id('message-0')).tap();
    await element(by.text('Sign with Mobile Wallet')).tap();
    
    // MWA flow (mocked)
    await element(by.text('Approve')).tap();
    
    await expect(element(by.text('Transaction Signed'))).toBeVisible();
  });
});
```

---

## Documentation

- [ ] User guide (platform messages)
- [ ] Developer guide (integration)
- [ ] MWA signing guide
- [ ] Security documentation

---

## Success Criteria

- [ ] Platform messages delivering reliably
- [ ] MWA signing working in-app
- [ ] TakeTitle integration functional
- [ ] TrueResolve integration functional
- [ ] Standalone messaging working
- [ ] App Store/Play Store published
- [ ] 1000+ active users
- [ ] 95%+ message delivery rate

---

*The quantum-secure communication layer for eStream ecosystem!* 🔐


