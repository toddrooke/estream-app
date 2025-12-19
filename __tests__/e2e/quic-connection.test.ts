/**
 * QUIC Connection E2E Tests
 * 
 * Tests QUIC connectivity on Seeker device
 */

import { SeekerTestHarness } from './setup';

describe('QUIC Connection Tests', () => {
  let harness: SeekerTestHarness;
  
  beforeAll(async () => {
    harness = new SeekerTestHarness();
    await harness.setup();
    
    // Print device info
    const deviceInfo = await harness.getDeviceInfo();
    console.log('Device Info:', deviceInfo);
  }, 30000);
  
  afterAll(async () => {
    await harness.teardown();
  });
  
  test('should establish QUIC connection', async () => {
    await harness.clearLogs();
    
    // Trigger connection test
    await harness.sendBroadcast('io.estream.app.TEST_CONNECT');
    
    // Wait for connection log
    const connected = await harness.waitForLog('QUIC.*connected', 5000);
    
    expect(connected).toBe(true);
    
    // Verify in logs
    const logs = await harness.getLogs();
    const connectedLog = logs.find(l => l.toLowerCase().includes('quic') && l.toLowerCase().includes('connect'));
    
    console.log('Connection log:', connectedLog);
  }, 10000);
  
  test('should reconnect after network change', async () => {
    // Disable Wi-Fi
    console.log('Disabling Wi-Fi...');
    await harness.setWifi(false);
    await harness.sleep(2000);
    
    await harness.clearLogs();
    
    // Enable Wi-Fi
    console.log('Enabling Wi-Fi...');
    await harness.setWifi(true);
    await harness.sleep(5000);
    
    // Wait for reconnection
    const reconnected = await harness.waitForLog('reconnect', 10000);
    
    expect(reconnected).toBe(true);
  }, 20000);
  
  test('should maintain connection for 30 seconds', async () => {
    await harness.clearLogs();
    
    // Trigger connection
    await harness.sendBroadcast('io.estream.app.TEST_CONNECT');
    await harness.sleep(1000);
    
    // Wait 30 seconds
    console.log('Waiting 30 seconds...');
    await harness.sleep(30000);
    
    // Check for disconnection
    const logs = await harness.getLogs();
    const disconnected = logs.some(l => l.toLowerCase().includes('disconnect'));
    
    expect(disconnected).toBe(false);
  }, 35000);
  
  test('should handle connection errors gracefully', async () => {
    await harness.clearLogs();
    
    // Try to connect to invalid address
    await harness.sendBroadcast('io.estream.app.TEST_CONNECT', {
      nodeAddr: '192.0.2.1:5000', // TEST-NET-1 (guaranteed to fail)
    });
    
    // Wait for error log
    const errorLogged = await harness.waitForLog('error|failed', 5000);
    
    expect(errorLogged).toBe(true);
    
    // Verify app didn't crash
    const logs = await harness.getLogs();
    const crashed = logs.some(l => l.includes('FATAL'));
    
    expect(crashed).toBe(false);
  }, 10000);
});

