/**
 * Seeker Test Harness
 * 
 * Automated testing framework for Seeker device via ADB
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TestConfig {
  nodeUrl: string;
  packageName: string;
  logTag: string;
  setupTimeout: number;
}

export const DEFAULT_CONFIG: TestConfig = {
  nodeUrl: '127.0.0.1:5000',
  packageName: 'io.estream.app',
  logTag: 'EstreamApp',
  setupTimeout: 30000,
};

export class SeekerTestHarness {
  private deviceId: string | null = null;
  private config: TestConfig;
  
  constructor(config: Partial<TestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Setup test environment
   */
  async setup(): Promise<void> {
    console.log('[SeekerTestHarness] Setting up...');
    
    // Check ADB connection
    const { stdout } = await execAsync('adb devices');
    const lines = stdout.split('\n').filter(l => l.includes('device') && !l.includes('List'));
    
    if (lines.length === 0) {
      throw new Error('No Seeker device connected. Please connect device via USB and enable USB debugging.');
    }
    
    this.deviceId = lines[0].split('\t')[0];
    console.log(`[SeekerTestHarness] Connected to device: ${this.deviceId}`);
    
    // Forward QUIC port
    try {
      await execAsync(`adb -s ${this.deviceId} reverse tcp:5000 tcp:5000`);
      console.log('[SeekerTestHarness] Port 5000 forwarded');
    } catch (error) {
      console.warn('[SeekerTestHarness] Port forwarding failed (may already be forwarded)');
    }
    
    // Launch estream-app
    try {
      await execAsync(`adb -s ${this.deviceId} shell am start -n ${this.config.packageName}/.MainActivity`);
      console.log('[SeekerTestHarness] App launched');
    } catch (error) {
      console.warn('[SeekerTestHarness] App launch failed (may already be running)');
    }
    
    // Wait for app to initialize
    await this.sleep(3000);
    
    console.log('[SeekerTestHarness] Setup complete');
  }
  
  /**
   * Teardown test environment
   */
  async teardown(): Promise<void> {
    if (!this.deviceId) return;
    
    console.log('[SeekerTestHarness] Tearing down...');
    
    try {
      // Close app
      await execAsync(`adb -s ${this.deviceId} shell am force-stop ${this.config.packageName}`);
      console.log('[SeekerTestHarness] App stopped');
    } catch (error) {
      console.warn('[SeekerTestHarness] Failed to stop app');
    }
    
    try {
      // Remove port forwarding
      await execAsync(`adb -s ${this.deviceId} reverse --remove tcp:5000`);
      console.log('[SeekerTestHarness] Port forwarding removed');
    } catch (error) {
      console.warn('[SeekerTestHarness] Failed to remove port forwarding');
    }
    
    console.log('[SeekerTestHarness] Teardown complete');
  }
  
  /**
   * Send ADB shell command
   */
  async sendAdbCommand(command: string): Promise<string> {
    if (!this.deviceId) {
      throw new Error('Device not connected. Call setup() first.');
    }
    
    const { stdout } = await execAsync(`adb -s ${this.deviceId} shell ${command}`);
    return stdout.trim();
  }
  
  /**
   * Get logs from device
   */
  async getLogs(tag: string = this.config.logTag, maxLines: number = 1000): Promise<string[]> {
    if (!this.deviceId) {
      throw new Error('Device not connected. Call setup() first.');
    }
    
    const { stdout } = await execAsync(
      `adb -s ${this.deviceId} logcat -d -s ${tag}:V -t ${maxLines}`
    );
    return stdout.split('\n').filter(l => l.trim());
  }
  
  /**
   * Clear device logs
   */
  async clearLogs(): Promise<void> {
    if (!this.deviceId) {
      throw new Error('Device not connected. Call setup() first.');
    }
    
    await execAsync(`adb -s ${this.deviceId} logcat -c`);
  }
  
  /**
   * Install APK on device
   */
  async installApp(apkPath: string): Promise<void> {
    if (!this.deviceId) {
      throw new Error('Device not connected. Call setup() first.');
    }
    
    console.log(`[SeekerTestHarness] Installing ${apkPath}...`);
    await execAsync(`adb -s ${this.deviceId} install -r ${apkPath}`);
    console.log('[SeekerTestHarness] App installed');
  }
  
  /**
   * Send broadcast intent (for test triggers)
   */
  async sendBroadcast(action: string, extras: Record<string, string> = {}): Promise<void> {
    if (!this.deviceId) {
      throw new Error('Device not connected. Call setup() first.');
    }
    
    const extrasStr = Object.entries(extras)
      .map(([key, value]) => `--es ${key} "${value}"`)
      .join(' ');
    
    const command = `am broadcast -a ${action} ${extrasStr}`;
    await this.sendAdbCommand(command);
  }
  
  /**
   * Wait for log message
   */
  async waitForLog(
    pattern: string | RegExp,
    timeoutMs: number = 5000,
    checkIntervalMs: number = 100
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const logs = await this.getLogs();
      const found = logs.some(log => {
        if (typeof pattern === 'string') {
          return log.includes(pattern);
        } else {
          return pattern.test(log);
        }
      });
      
      if (found) {
        return true;
      }
      
      await this.sleep(checkIntervalMs);
    }
    
    return false;
  }
  
  /**
   * Get device info
   */
  async getDeviceInfo(): Promise<{
    model: string;
    androidVersion: string;
    buildNumber: string;
  }> {
    const model = await this.sendAdbCommand('getprop ro.product.model');
    const androidVersion = await this.sendAdbCommand('getprop ro.build.version.release');
    const buildNumber = await this.sendAdbCommand('getprop ro.build.display.id');
    
    return {
      model: model.trim(),
      androidVersion: androidVersion.trim(),
      buildNumber: buildNumber.trim(),
    };
  }
  
  /**
   * Enable/disable Wi-Fi
   */
  async setWifi(enabled: boolean): Promise<void> {
    const command = enabled ? 'svc wifi enable' : 'svc wifi disable';
    await this.sendAdbCommand(command);
  }
  
  /**
   * Take screenshot
   */
  async takeScreenshot(outputPath: string): Promise<void> {
    if (!this.deviceId) {
      throw new Error('Device not connected. Call setup() first.');
    }
    
    const devicePath = '/sdcard/screenshot.png';
    await this.sendAdbCommand(`screencap -p ${devicePath}`);
    await execAsync(`adb -s ${this.deviceId} pull ${devicePath} ${outputPath}`);
    await this.sendAdbCommand(`rm ${devicePath}`);
  }
  
  /**
   * Sleep helper
   */
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get device ID
   */
  getDeviceId(): string {
    if (!this.deviceId) {
      throw new Error('Device not connected. Call setup() first.');
    }
    return this.deviceId;
  }
}

/**
 * Helper to extract device ID from logs
 */
export async function extractDeviceIdFromLogs(harness: SeekerTestHarness): Promise<string | null> {
  const logs = await harness.getLogs();
  const deviceIdLog = logs.find(l => l.includes('Device ID:'));
  
  if (!deviceIdLog) {
    return null;
  }
  
  const match = deviceIdLog.match(/Device ID: ([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}

