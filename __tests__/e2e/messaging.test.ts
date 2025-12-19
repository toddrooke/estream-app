/**
 * Messaging E2E Tests
 * 
 * Tests message send/receive on Seeker device
 */

import { SeekerTestHarness, extractDeviceIdFromLogs } from './setup';

describe('Messaging Tests', () => {
  let harness: SeekerTestHarness;
  
  beforeAll(async () => {
    harness = new SeekerTestHarness();
    await harness.setup();
  }, 30000);
  
  afterAll(async () => {
    await harness.teardown();
  });
  
  test('should send message from device', async () => {
    await harness.clearLogs();
    
    // Trigger send via broadcast
    await harness.sendBroadcast('io.estream.app.TEST_SEND_MESSAGE', {
      message: 'Hello from Seeker',
      recipientId: 'test-recipient',
    });
    
    // Wait for sent confirmation
    const sent = await harness.waitForLog('Message sent', 5000);
    
    expect(sent).toBe(true);
    
    // Verify in logs
    const logs = await harness.getLogs();
    const sentLog = logs.find(l => l.includes('Message sent'));
    
    console.log('Sent log:', sentLog);
  }, 10000);
  
  test('should queue messages when offline', async () => {
    // Disable Wi-Fi
    console.log('Disabling Wi-Fi...');
    await harness.setWifi(false);
    await harness.sleep(2000);
    
    await harness.clearLogs();
    
    // Trigger send
    await harness.sendBroadcast('io.estream.app.TEST_SEND_MESSAGE', {
      message: 'Queued message',
      recipientId: 'test-recipient',
    });
    
    await harness.sleep(1000);
    
    // Check for queued log
    const logs1 = await harness.getLogs();
    const queued = logs1.some(l => l.toLowerCase().includes('queue'));
    
    expect(queued).toBe(true);
    
    // Enable Wi-Fi
    console.log('Enabling Wi-Fi...');
    await harness.setWifi(true);
    await harness.sleep(5000);
    
    // Wait for sent confirmation
    const sent = await harness.waitForLog('Message sent', 10000);
    
    expect(sent).toBe(true);
  }, 25000);
  
  test('should handle send errors gracefully', async () => {
    await harness.clearLogs();
    
    // Try to send to invalid recipient
    await harness.sendBroadcast('io.estream.app.TEST_SEND_MESSAGE', {
      message: 'Test message',
      recipientId: '', // Invalid
    });
    
    // Wait for error log
    const errorLogged = await harness.waitForLog('error|failed', 5000);
    
    expect(errorLogged).toBe(true);
    
    // Verify app didn't crash
    const logs = await harness.getLogs();
    const crashed = logs.some(l => l.includes('FATAL'));
    
    expect(crashed).toBe(false);
  }, 10000);
  
  test('should persist messages across app restarts', async () => {
    await harness.clearLogs();
    
    // Send a message
    await harness.sendBroadcast('io.estream.app.TEST_SEND_MESSAGE', {
      message: 'Persistent message',
      recipientId: 'test-recipient',
    });
    
    await harness.sleep(1000);
    
    // Stop app
    await harness.sendAdbCommand('am force-stop io.estream.app');
    await harness.sleep(1000);
    
    // Restart app
    await harness.sendAdbCommand('am start -n io.estream.app/.MainActivity');
    await harness.sleep(3000);
    
    // Check if message queue was restored
    const restored = await harness.waitForLog('queue.*loaded|restored', 5000);
    
    expect(restored).toBe(true);
  }, 15000);
});

