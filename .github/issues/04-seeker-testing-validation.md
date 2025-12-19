# Issue #4: Seeker Device Testing & Validation

**Epic**: Phase 1 - Messaging Integration  
**Priority**: P0 (Critical)  
**Estimated Effort**: 2-3 days  
**Depends On**: Issues #1, #2, #3

---

## Overview

Comprehensive testing and validation of the QUIC messaging system on real Seeker hardware. This includes automated test harness, manual testing scenarios, and performance validation.

**Test Environment**: 
- Seeker device connected via USB/ADB
- Local eStream node running (`127.0.0.1:5000`)
- Test harness for automated driving

---

## Goals

1. ✅ Automated test harness (drive from cursor)
2. ✅ QUIC connection tests
3. ✅ Message send/receive tests
4. ✅ Seed Vault integration tests
5. ✅ Platform messaging tests
6. ✅ Performance benchmarks
7. ✅ Network resilience tests

---

## Test Harness Architecture

```
┌─────────────────────────────────────────────────┐
│         Cursor (Test Driver)                    │
│  - Jest test suite                              │
│  - ADB commands                                 │
│  - Log monitoring                               │
└──────────────────┬──────────────────────────────┘
                   │ ADB
┌──────────────────▼──────────────────────────────┐
│         Seeker Device (Connected)               │
│  - estream-app running                          │
│  - QUIC client active                           │
│  - Seed Vault available                         │
└──────────────────┬──────────────────────────────┘
                   │ QUIC (127.0.0.1:5000)
┌──────────────────▼──────────────────────────────┐
│         eStream Node (Local)                    │
│  - Running on Mac (port forwarded)              │
│  - Test mode enabled                            │
└─────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Test Harness Setup

**__tests__/e2e/setup.ts**:
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class SeekerTestHarness {
  private deviceId: string;
  private nodeUrl: string;
  
  constructor(nodeUrl: string = '127.0.0.1:5000') {
    this.nodeUrl = nodeUrl;
  }
  
  async setup(): Promise<void> {
    // Check ADB connection
    const { stdout } = await execAsync('adb devices');
    const lines = stdout.split('\n').filter(l => l.includes('device'));
    if (lines.length === 0) {
      throw new Error('No Seeker device connected');
    }
    
    this.deviceId = lines[0].split('\t')[0];
    console.log(`Connected to Seeker: ${this.deviceId}`);
    
    // Forward QUIC port
    await execAsync(`adb -s ${this.deviceId} reverse tcp:5000 tcp:5000`);
    console.log('Port 5000 forwarded');
    
    // Launch estream-app
    await execAsync(`adb -s ${this.deviceId} shell am start -n io.estream.app/.MainActivity`);
    console.log('estream-app launched');
    
    // Wait for app to initialize
    await this.sleep(3000);
  }
  
  async teardown(): Promise<void> {
    // Close app
    await execAsync(`adb -s ${this.deviceId} shell am force-stop io.estream.app`);
    
    // Remove port forwarding
    await execAsync(`adb -s ${this.deviceId} reverse --remove tcp:5000`);
  }
  
  async sendAdbCommand(command: string): Promise<string> {
    const { stdout } = await execAsync(`adb -s ${this.deviceId} shell ${command}`);
    return stdout.trim();
  }
  
  async getLogs(tag: string = 'EstreamApp'): Promise<string[]> {
    const { stdout } = await execAsync(
      `adb -s ${this.deviceId} logcat -d -s ${tag}:V`
    );
    return stdout.split('\n').filter(l => l.trim());
  }
  
  async clearLogs(): Promise<void> {
    await execAsync(`adb -s ${this.deviceId} logcat -c`);
  }
  
  async installApp(apkPath: string): Promise<void> {
    await execAsync(`adb -s ${this.deviceId} install -r ${apkPath}`);
    console.log('App installed');
  }
  
  async pressButton(buttonId: string): Promise<void> {
    // Simulate UI interaction via adb input tap
    // Or use UI Automator
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 2. QUIC Connection Tests

**__tests__/e2e/quic-connection.test.ts**:
```typescript
import { SeekerTestHarness } from './setup';

describe('QUIC Connection Tests', () => {
  let harness: SeekerTestHarness;
  
  beforeAll(async () => {
    harness = new SeekerTestHarness();
    await harness.setup();
  }, 30000);
  
  afterAll(async () => {
    await harness.teardown();
  });
  
  test('should establish QUIC connection', async () => {
    await harness.clearLogs();
    
    // Trigger connection in app (via UI automation or intent)
    // For now, assume app auto-connects
    
    await harness.sleep(2000);
    
    const logs = await harness.getLogs();
    const connectedLog = logs.find(l => l.includes('QUIC connected'));
    
    expect(connectedLog).toBeDefined();
  });
  
  test('should reconnect after network change', async () => {
    // Disable Wi-Fi
    await harness.sendAdbCommand('svc wifi disable');
    await harness.sleep(1000);
    
    // Enable Wi-Fi
    await harness.sendAdbCommand('svc wifi enable');
    await harness.sleep(3000);
    
    const logs = await harness.getLogs();
    const reconnectedLog = logs.find(l => l.includes('QUIC reconnected'));
    
    expect(reconnectedLog).toBeDefined();
  });
  
  test('should maintain connection during cellular switch', async () => {
    // Test connection migration
  });
});
```

### 3. Message Send/Receive Tests

**__tests__/e2e/messaging.test.ts**:
```typescript
import { SeekerTestHarness } from './setup';
import { EstreamClient } from '../../src/services/quic/QuicClient';

describe('Messaging Tests', () => {
  let harness: SeekerTestHarness;
  let nodeClient: EstreamClient; // Server-side client to send to device
  
  beforeAll(async () => {
    harness = new SeekerTestHarness();
    await harness.setup();
    
    // Create node client (to send messages TO the device)
    nodeClient = new EstreamClient();
    await nodeClient.initialize();
  }, 30000);
  
  afterAll(async () => {
    await harness.teardown();
  });
  
  test('should send message from device', async () => {
    await harness.clearLogs();
    
    // Trigger send via UI automation
    // Or via intent with test message
    await harness.sendAdbCommand(
      'am broadcast -a io.estream.app.TEST_SEND_MESSAGE --es message "Hello from Seeker"'
    );
    
    await harness.sleep(1000);
    
    const logs = await harness.getLogs();
    const sentLog = logs.find(l => l.includes('Message sent'));
    
    expect(sentLog).toBeDefined();
  });
  
  test('should receive message on device', async () => {
    await harness.clearLogs();
    
    // Send message FROM node TO device
    const deviceId = await getDeviceId(harness);
    await nodeClient.sendMessage(deviceId, 'Hello to Seeker');
    
    await harness.sleep(1000);
    
    const logs = await harness.getLogs();
    const receivedLog = logs.find(l => l.includes('Message received'));
    
    expect(receivedLog).toBeDefined();
  });
  
  test('should queue messages when offline', async () => {
    // Disable Wi-Fi
    await harness.sendAdbCommand('svc wifi disable');
    await harness.sleep(1000);
    
    // Trigger send
    await harness.sendAdbCommand(
      'am broadcast -a io.estream.app.TEST_SEND_MESSAGE --es message "Queued message"'
    );
    
    await harness.sleep(1000);
    
    const logsOffline = await harness.getLogs();
    const queuedLog = logsOffline.find(l => l.includes('Message queued'));
    expect(queuedLog).toBeDefined();
    
    // Enable Wi-Fi
    await harness.sendAdbCommand('svc wifi enable');
    await harness.sleep(3000);
    
    const logsOnline = await harness.getLogs();
    const sentLog = logsOnline.find(l => l.includes('Message sent'));
    expect(sentLog).toBeDefined();
  });
});
```

### 4. Seed Vault Tests

**__tests__/e2e/seed-vault.test.ts**:
```typescript
import { SeekerTestHarness } from './setup';

describe('Seed Vault Tests', () => {
  let harness: SeekerTestHarness;
  
  beforeAll(async () => {
    harness = new SeekerTestHarness();
    await harness.setup();
  }, 30000);
  
  afterAll(async () => {
    await harness.teardown();
  });
  
  test('should detect Seed Vault', async () => {
    await harness.clearLogs();
    
    // Trigger vault check
    await harness.sendAdbCommand(
      'am broadcast -a io.estream.app.TEST_CHECK_VAULT'
    );
    
    await harness.sleep(1000);
    
    const logs = await harness.getLogs();
    const vaultLog = logs.find(l => l.includes('Seed Vault available: true'));
    
    expect(vaultLog).toBeDefined();
  });
  
  test('should generate device keys in Seed Vault', async () => {
    await harness.clearLogs();
    
    // Trigger key generation
    await harness.sendAdbCommand(
      'am broadcast -a io.estream.app.TEST_GENERATE_KEYS'
    );
    
    await harness.sleep(2000);
    
    const logs = await harness.getLogs();
    const keysLog = logs.find(l => l.includes('Device keys generated'));
    
    expect(keysLog).toBeDefined();
  });
  
  test('should sign message with Seed Vault', async () => {
    await harness.clearLogs();
    
    // Trigger signing
    await harness.sendAdbCommand(
      'am broadcast -a io.estream.app.TEST_SIGN_MESSAGE --es message "Test message"'
    );
    
    await harness.sleep(1000);
    
    const logs = await harness.getLogs();
    const signedLog = logs.find(l => l.includes('Message signed'));
    
    expect(signedLog).toBeDefined();
  });
});
```

### 5. Performance Benchmarks

**__tests__/e2e/performance.test.ts**:
```typescript
import { SeekerTestHarness } from './setup';

describe('Performance Benchmarks', () => {
  let harness: SeekerTestHarness;
  
  beforeAll(async () => {
    harness = new SeekerTestHarness();
    await harness.setup();
  }, 30000);
  
  afterAll(async () => {
    await harness.teardown();
  });
  
  test('QUIC connection latency < 100ms', async () => {
    await harness.clearLogs();
    
    const startTime = Date.now();
    
    // Trigger connection
    await harness.sendAdbCommand(
      'am broadcast -a io.estream.app.TEST_CONNECT'
    );
    
    // Wait for connection
    let connected = false;
    for (let i = 0; i < 20; i++) {
      await harness.sleep(50);
      const logs = await harness.getLogs();
      if (logs.some(l => l.includes('QUIC connected'))) {
        connected = true;
        break;
      }
    }
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    expect(connected).toBe(true);
    expect(latency).toBeLessThan(100);
    
    console.log(`Connection latency: ${latency}ms`);
  });
  
  test('Message send latency < 50ms', async () => {
    await harness.clearLogs();
    
    const startTime = Date.now();
    
    // Trigger send
    await harness.sendAdbCommand(
      'am broadcast -a io.estream.app.TEST_SEND_MESSAGE --es message "Perf test"'
    );
    
    // Wait for sent confirmation
    let sent = false;
    for (let i = 0; i < 10; i++) {
      await harness.sleep(10);
      const logs = await harness.getLogs();
      if (logs.some(l => l.includes('Message sent'))) {
        sent = true;
        break;
      }
    }
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    expect(sent).toBe(true);
    expect(latency).toBeLessThan(50);
    
    console.log(`Message send latency: ${latency}ms`);
  });
  
  test('Key generation < 100ms', async () => {
    await harness.clearLogs();
    
    const startTime = Date.now();
    
    // Trigger key generation
    await harness.sendAdbCommand(
      'am broadcast -a io.estream.app.TEST_GENERATE_KEYS'
    );
    
    // Wait for completion
    let generated = false;
    for (let i = 0; i < 20; i++) {
      await harness.sleep(10);
      const logs = await harness.getLogs();
      if (logs.some(l => l.includes('Device keys generated'))) {
        generated = true;
        break;
      }
    }
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    expect(generated).toBe(true);
    expect(latency).toBeLessThan(100);
    
    console.log(`Key generation latency: ${latency}ms`);
  });
});
```

### 6. Platform Messaging Tests

**__tests__/e2e/platform-messaging.test.ts**:
```typescript
import { SeekerTestHarness } from './setup';
import { PlatformMessagingService } from '../../src/services/messaging/platform';

describe('Platform Messaging Tests', () => {
  let harness: SeekerTestHarness;
  let platformService: PlatformMessagingService;
  
  beforeAll(async () => {
    harness = new SeekerTestHarness();
    await harness.setup();
    
    // Initialize platform service
    platformService = new PlatformMessagingService();
  }, 30000);
  
  afterAll(async () => {
    await harness.teardown();
  });
  
  test('should receive signing request', async () => {
    await harness.clearLogs();
    
    const deviceId = await getDeviceId(harness);
    
    // Send signing request FROM platform
    await platformService.requestSigning(
      deviceId,
      'req-123',
      'DeployGraph',
      'Deploy analytics graph',
      { nodes: 2, storage: '100GB' }
    );
    
    await harness.sleep(1000);
    
    const logs = await harness.getLogs();
    const requestLog = logs.find(l => l.includes('Signing request received'));
    
    expect(requestLog).toBeDefined();
  });
  
  test('should receive security alert', async () => {
    await harness.clearLogs();
    
    const deviceId = await getDeviceId(harness);
    
    // Send security alert FROM platform
    await platformService.sendSecurityAlert(
      deviceId,
      'New device paired',
      'A new device was just paired to your account',
      'high'
    );
    
    await harness.sleep(1000);
    
    const logs = await harness.getLogs();
    const alertLog = logs.find(l => l.includes('Security alert received'));
    
    expect(alertLog).toBeDefined();
  });
});
```

---

## Test Commands

```bash
# Install app on Seeker
npm run android:build
npm run android:install

# Run all E2E tests
npm run test:e2e

# Run specific test suite
npm run test:e2e -- quic-connection.test.ts

# Watch logs from Seeker
adb logcat -s EstreamApp:V

# Port forwarding
adb reverse tcp:5000 tcp:5000

# Launch app
adb shell am start -n io.estream.app/.MainActivity

# Send test broadcast
adb shell am broadcast -a io.estream.app.TEST_SEND_MESSAGE --es message "Test"
```

---

## Deliverables

1. ✅ Test harness for Seeker
2. ✅ QUIC connection tests
3. ✅ Message send/receive tests
4. ✅ Seed Vault integration tests
5. ✅ Performance benchmarks
6. ✅ Platform messaging tests
7. ✅ Test documentation

---

## Success Criteria

- [ ] All E2E tests pass on Seeker
- [ ] QUIC connection latency < 100ms
- [ ] Message send latency < 50ms
- [ ] Key generation < 100ms
- [ ] Seed Vault integration works
- [ ] Platform messages received correctly
- [ ] Network resilience validated

---

**Status**: ⏳ Not Started  
**Branch**: `feature/seeker-testing`

