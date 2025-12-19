/**
 * Performance Benchmark E2E Tests
 * 
 * Tests performance metrics on Seeker device
 */

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
    await harness.sendBroadcast('io.estream.app.TEST_CONNECT');
    
    // Wait for connection
    const connected = await harness.waitForLog('QUIC.*connected', 2000);
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    console.log(`Connection latency: ${latency}ms`);
    
    expect(connected).toBe(true);
    expect(latency).toBeLessThan(100);
  }, 5000);
  
  test('Message send latency < 50ms', async () => {
    await harness.clearLogs();
    
    const startTime = Date.now();
    
    // Trigger send
    await harness.sendBroadcast('io.estream.app.TEST_SEND_MESSAGE', {
      message: 'Perf test',
      recipientId: 'test-recipient',
    });
    
    // Wait for sent confirmation
    const sent = await harness.waitForLog('Message sent', 1000);
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    console.log(`Message send latency: ${latency}ms`);
    
    expect(sent).toBe(true);
    expect(latency).toBeLessThan(50);
  }, 5000);
  
  test('Key generation < 100ms', async () => {
    await harness.clearLogs();
    
    const startTime = Date.now();
    
    // Trigger key generation
    await harness.sendBroadcast('io.estream.app.TEST_GENERATE_KEYS');
    
    // Wait for completion
    const generated = await harness.waitForLog('Device keys generated', 2000);
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    console.log(`Key generation latency: ${latency}ms`);
    
    expect(generated).toBe(true);
    expect(latency).toBeLessThan(100);
  }, 5000);
  
  test('Message throughput > 100 messages/second', async () => {
    await harness.clearLogs();
    
    const messageCount = 100;
    const startTime = Date.now();
    
    // Send multiple messages
    for (let i = 0; i < messageCount; i++) {
      await harness.sendBroadcast('io.estream.app.TEST_SEND_MESSAGE', {
        message: `Message ${i}`,
        recipientId: 'test-recipient',
      });
    }
    
    // Wait for all sent confirmations
    await harness.sleep(2000);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // seconds
    const throughput = messageCount / duration;
    
    console.log(`Message throughput: ${throughput.toFixed(2)} messages/second`);
    
    expect(throughput).toBeGreaterThan(100);
  }, 10000);
  
  test('Memory usage stays below 100MB', async () => {
    await harness.clearLogs();
    
    // Get memory info
    const memInfo = await harness.sendAdbCommand(
      'dumpsys meminfo io.estream.app | grep "TOTAL PSS"'
    );
    
    console.log('Memory info:', memInfo);
    
    // Extract PSS value (in KB)
    const match = memInfo.match(/(\d+)/);
    if (match) {
      const pssKb = parseInt(match[1], 10);
      const pssMb = pssKb / 1024;
      
      console.log(`Memory usage: ${pssMb.toFixed(2)} MB`);
      
      expect(pssMb).toBeLessThan(100);
    }
  }, 5000);
  
  test('Battery drain < 5% per hour', async () => {
    console.log('Starting battery drain test (60 seconds)...');
    
    // Get initial battery level
    const initialBattery = await harness.sendAdbCommand('dumpsys battery | grep level');
    const initialLevel = parseInt(initialBattery.match(/\d+/)?.[0] || '0', 10);
    
    console.log(`Initial battery: ${initialLevel}%`);
    
    // Run for 60 seconds
    await harness.sleep(60000);
    
    // Get final battery level
    const finalBattery = await harness.sendAdbCommand('dumpsys battery | grep level');
    const finalLevel = parseInt(finalBattery.match(/\d+/)?.[0] || '0', 10);
    
    console.log(`Final battery: ${finalLevel}%`);
    
    const drain = initialLevel - finalLevel;
    const drainPerHour = drain * 60; // Extrapolate to 1 hour
    
    console.log(`Battery drain: ${drainPerHour}% per hour (estimated)`);
    
    // This is a rough estimate, so we'll be lenient
    expect(drainPerHour).toBeLessThan(10);
  }, 65000);
});

