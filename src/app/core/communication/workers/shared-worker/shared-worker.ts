// shared-sharedWorker-shared-sharedWorker.ts
/// <reference lib="webworker" />

import { HookManager } from './hooks/hook-manager';
import {
  SyncDataMessage, WorkerMessage, WorkerMessageDirection, WorkerMessageType, ExtendedMessagePort,
  RegisterHookMessage, TabRegisterMessage, BroadcastMessage
} from './types';
import { v4 as uuid } from 'uuid';
import {HookType} from './hooks/types';

declare const self: SharedWorkerGlobalScope;

class SharedWorkerInstance {
  private ports: Map<string, ExtendedMessagePort> = new Map(); // keyed by connectionId
  private readonly workerId: string;
  private sharedData: Map<string, any> = new Map();
  private hookManager: HookManager;
  private heartbeatInterval?: number;
  private connectionCounter: number = 0;

  constructor() {
    this.workerId = uuid();
    console.log('SHARED WORKER: Initialized with ID: %s, location: %s', this.workerId, self.location.href);

    this.hookManager = new HookManager({
      workerId: this.workerId
    });

    // Set up port finder for callback support
    this.hookManager.setPortFinder(this.findPortByTabId.bind(this));

    // Set up connection handler
    self.onconnect = this.handleConnection.bind(this);

    // Start heartbeat for connection health check
    this.startHeartbeat();

    // Handle global errors
    self.onerror = this.handleError.bind(this);
  }

  private findPortByTabId(tabId: string): MessagePort | undefined {
    for (const port of this.ports.values()) {
      if (port.tabId === tabId) {
        return port;
      }
    }
    return undefined;
  }

  private handleConnection(event: MessageEvent): void {
    const port = event.ports[0] as ExtendedMessagePort;
    const connectionId = uuid();

    // Store port with connection ID initially
    this.ports.set(connectionId, port);

    console.log(`[SharedWorker] New connection (${connectionId}). Total: ${this.ports.size}`);

    // Set up message handler
    port.onmessage = async (e: MessageEvent<WorkerMessage>) => {
      console.log('[SharedWorker] Message from', connectionId, ':', e.data);

      if (e.data) {
        await this.handleMessage(e.data, port, connectionId);
      }
    };

    // Handle port closure
    port.onmessageerror = (error) => {
      console.error('[SharedWorker] Message error from', connectionId, ':', error);
      this.removePort(connectionId);
    };

    port.start();
  }

  private async handleMessage(data: WorkerMessage, sourcePort: ExtendedMessagePort, connectionId: string): Promise<void> {
    // Update heartbeat on any message
    sourcePort.lastHeartbeat = Date.now();

    switch (data.type) {
      case WorkerMessageType.TAB_REGISTER:
        this.handleTabRegister(data, sourcePort, connectionId);
        break;

      case WorkerMessageType.TAB_UNREGISTER:
        this.handleTabUnregister(connectionId);
        break;

      case WorkerMessageType.REGISTER_HOOK:
        this.handleRegisterHook(data, sourcePort);
        break;

      case WorkerMessageType.HOOK_EXECUTION_RESULT:
        console.log('hook execution result');
        break;

      case WorkerMessageType.BROADCAST:
        this.broadcastMessage(data, sourcePort);
        break;

      case WorkerMessageType.PING:
        this.handlePing(sourcePort);
        break;

      case WorkerMessageType.SYNC_DATA:
        this.handleSyncData(data, sourcePort);
        break;

      case WorkerMessageType.REQUEST:
        this.handleRequest(data, sourcePort);
        break;

      case WorkerMessageType.TARGETED_MESSAGE:
        this.handleTargetedMessage(data);
        break;

      default:
        console.warn('[SharedWorker] Unknown message type:', data.type);
        this.sendError(sourcePort, `Unknown message type: ${data.type}`);
    }
  }

  /**
   * Handle callback registration
   */
  private handleRegisterHook(message: RegisterHookMessage, sourcePort: ExtendedMessagePort): void {
    const { hookId, descriptor } = message;
    const tabId = sourcePort.tabId!;

    this.hookManager.registerHook(hookId, descriptor, tabId);
  }

  private handleTabRegister(data: TabRegisterMessage, port: ExtendedMessagePort, connectionId: string): void {
    const { tabId } = data;

    if (!tabId) {
      console.error('[SharedWorker] Tab register missing tabId');
      this.sendError(port, 'Missing tabId in registration');
      return;
    }

    // Update port with tabId
    port.tabId = tabId;
    port.isActive = true;
    port.lastActive = Date.now();

    this.ports.set(connectionId, port);

    console.log(`[SharedWorker] Tab registered: ${tabId}. Total tabs: ${this.getActiveTabsCount()}`);

    this.hookManager.addPort(tabId, port);

    // Notify all tabs about the new count
    this.broadcastTabCount();

    // Send current shared-sharedWorker data to new tab
    this.syncDataToTab(port);
  }

  private handleTabUnregister(connectionId: string): void {
    if (this.ports.has(connectionId)) {
      const tabId = this.ports.get(connectionId)!.tabId;

      this.ports.delete(connectionId);
      console.log(`[SharedWorker] Tab unregistered: ${connectionId}. Remaining: ${this.getActiveTabsCount()}`);

      this.hookManager.removePort(tabId);
      this.broadcastTabCount();
    }
  }

  private handlePing(port: ExtendedMessagePort): void {
    this.sendPong(port);
  }

  // Handle sync data
  //

  private handleSyncData(data: SyncDataMessage, sourcePort: ExtendedMessagePort): void {
    const { key, value, operation = 'set' } = data;

    if (!key || value === undefined) {
      console.warn('[SharedWorker] Invalid sync data - missing key or value');
      return;
    }

    // Process the data based on operation
    let newValue = value;
    let finalValue = value;
    const isNestedKey = key.includes('.');

    switch (operation) {
      case 'set':
        if (isNestedKey) {
          this.setNestedValue(key, value);
        } else {
          this.sharedData.set(key, value);
        }
        console.log(`[SharedWorker] Data set: ${key} =`, value);
        break;

      case 'update':
        if (isNestedKey) {
          newValue = this.updateNestedValue(key, value);
          finalValue = this.getNestedValue(key);
        } else {
          const current = this.sharedData.get(key);
          if (current !== undefined) {
            // Handle different update scenarios
            if (typeof current === 'object' && current !== null && typeof value === 'object') {
              // Merge objects
              newValue = { ...current, ...value };
            } else if (Array.isArray(current) && Array.isArray(value)) {
              // Merge arrays
              newValue = [...current, ...value];
            } else {
              // Replace
              newValue = value;
            }
            this.sharedData.set(key, newValue);
            finalValue = newValue;
          } else {
            this.sharedData.set(key, value);
            finalValue = value;
          }
        }
        console.log(`[SharedWorker] Data updated: ${key} =`, finalValue);
        break;

      case 'delete':
        if (isNestedKey) {
          this.deleteNestedValue(key);
        } else {
          this.sharedData.delete(key);
        }
        console.log(`[SharedWorker] Data deleted: ${key}`);
        // For delete operations, broadcast with undefined value
        finalValue = undefined;
        break;
    }

    // Broadcast to other tabs (skip if it was a delete on a non-existent nested path)
    if (operation !== 'delete' || finalValue !== undefined) {
      this.broadcastToOthers(sourcePort, {
        type: WorkerMessageType.SYNC_DATA,
        key,
        value: finalValue,
        operation,
        timestamp: Date.now(),
        direction: WorkerMessageDirection.FROM_WORKER
      });
    }
  }

  // Helper methods for nested operations
  //

  private setNestedValue(key: string, value: any): void {
    const parts = key.split('.');
    const rootKey = parts[0];
    const path = parts.slice(1);

    let root = this.sharedData.get(rootKey);
    if (!root || typeof root !== 'object') {
      root = {};
    }

    this.setValueAtPath(root, path, value);
    this.sharedData.set(rootKey, root);
  }

  private updateNestedValue(key: string, value: any): any {
    const parts = key.split('.');
    const rootKey = parts[0];
    const path = parts.slice(1);

    let root = this.sharedData.get(rootKey);
    if (!root || typeof root !== 'object') {
      root = {};
    }

    this.updateValueAtPath(root, path, value);
    this.sharedData.set(rootKey, root);

    return this.getNestedValue(key);
  }

  private deleteNestedValue(key: string): void {
    const parts = key.split('.');
    const rootKey = parts[0];
    const path = parts.slice(1);

    const root = this.sharedData.get(rootKey);
    if (!root || typeof root !== 'object') {
      return;
    }

    this.deleteValueAtPath(root, path);
    this.sharedData.set(rootKey, root);
  }

  private getNestedValue(key: string): any {
    const parts = key.split('.');
    const rootKey = parts[0];
    const path = parts.slice(1);

    const root = this.sharedData.get(rootKey);
    if (!root || typeof root !== 'object') {
      return undefined;
    }

    return this.getValueAtPath(root, path);
  }

  private setValueAtPath(obj: any, path: string[], value: any): void {
    let current = obj;

    // Navigate to the second-to-last key
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    // Set the final value
    const lastKey = path[path.length - 1];
    current[lastKey] = value;
  }

  private updateValueAtPath(obj: any, path: string[], value: any): void {
    let current = obj;

    // Navigate to the second-to-last key
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    const lastKey = path[path.length - 1];
    const existing = current[lastKey];

    // Handle different update scenarios
    if (existing !== undefined && typeof existing === 'object' && existing !== null && typeof value === 'object') {
      // Merge objects
      current[lastKey] = { ...existing, ...value };
    } else if (Array.isArray(existing) && Array.isArray(value)) {
      // Merge arrays
      current[lastKey] = [...existing, ...value];
    } else {
      // Replace
      current[lastKey] = value;
    }
  }

  private deleteValueAtPath(obj: any, path: string[]): void {
    let current = obj;

    // Navigate to the parent of the target
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        return; // Path doesn't exist
      }
      current = current[key];
    }

    const lastKey = path[path.length - 1];
    if (lastKey in current) {
      delete current[lastKey];
    }
  }

  private getValueAtPath(obj: any, path: string[]): any {
    let current = obj;

    for (const key of path) {
      if (current === null || current === undefined || typeof current !== 'object' || !(key in current)) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  // end of sync data helpers
  //

  private handleRequest(data: WorkerMessage, sourcePort: ExtendedMessagePort): void {
    const { requestId, payload, correlationId } = data as any;

    // Example request handling - customize based on your needs
    const response = {
      type: WorkerMessageType.RESPONSE,
      requestId,
      correlationId,
      success: true,
      payload: { message: `Processed request ${requestId}`, original: payload },
      timestamp: Date.now(),
      direction: WorkerMessageDirection.FROM_WORKER
    };

    //this.sendMessage(sourcePort, response);
  }

  private handleTargetedMessage(data: WorkerMessage): void {
    const { targetTabId, payload } = data as any;

    if (targetTabId && this.ports.has(targetTabId)) {
      const targetPort = this.ports.get(targetTabId)!;
      // this.sendMessage(targetPort, {
      //   type: WorkerMessageType.TARGETED_MESSAGE,
      //   payload,
      //   //sourceTabId: (data as any).tabId,
      //   timestamp: Date.now(),
      //   direction: WorkerMessageDirection.FROM_WORKER
      // });
    }
  }

  private async broadcastMessage(
    message: WorkerMessage,
    sourcePort: ExtendedMessagePort,
  ): Promise<void> {
    // Execute BEFORE_BROADCAST hook
    this.hookManager.executeHooks(HookType.BEFORE_BROADCAST, message);

    this.ports.forEach((port, tabId) => {
      if (port === sourcePort) {
        return;
      }

      // Create broadcast message
      const broadcastMsg: WorkerMessage = {
        ...message,
        timestamp: Date.now(),
        direction: WorkerMessageDirection.FROM_WORKER,
        tabId: port.tabId,
      };

      try {
        port.postMessage(broadcastMsg);
      } catch (error) {
        console.warn(`[SharedWorker] Failed to broadcast to tab ${tabId}:`, error);
      }
    });

    // Execute AFTER_BROADCAST hook
    this.hookManager.executeHooks(HookType.AFTER_BROADCAST, message);
  }

  private broadcastToOthers(sourcePort: ExtendedMessagePort, message: WorkerMessage): void {
    this.ports.forEach((port, tabId) => {
      if (port !== sourcePort) {
        port.postMessage(message);
      }
    });
  }

  private broadcastTabCount(): void {
    const count = this.getActiveTabsCount();
    const message: SyncDataMessage = {
      type: WorkerMessageType.SYNC_DATA,
      key: 'sys.tabCount',
      value: count,
      timestamp: Date.now(),
      direction: WorkerMessageDirection.FROM_WORKER
    };

    //this.broadcastMessage(message, this.po)
  }

  private syncDataToTab(port: ExtendedMessagePort): void {
    if (this.sharedData.size > 0) {
      this.sharedData.forEach((value, key) => {
        this.sendMessage(port, {
          type: WorkerMessageType.SYNC_DATA,
          key,
          value,
          timestamp: Date.now(),
          direction: WorkerMessageDirection.FROM_WORKER
        });
      });
    }
  }

  private sendWelcomeMessage(port: ExtendedMessagePort): void {
    this.sendMessage(port, {
      type: WorkerMessageType.WORKER_CONNECTED,
      workerId: this.workerId,
      timestamp: Date.now(),
      direction: WorkerMessageDirection.FROM_WORKER,
      //connectedTabs:  this.ports,
    });
  }

  private sendPong(port: ExtendedMessagePort): void {
    this.sendMessage(port, {
      type: WorkerMessageType.PONG,
      timestamp: Date.now(),
      direction: WorkerMessageDirection.FROM_WORKER
    });
  }

  private sendError(port: ExtendedMessagePort, error: string): void {
    this.sendMessage(port, {
      type: WorkerMessageType.ERROR,
      error,
      timestamp: Date.now(),
      direction: WorkerMessageDirection.FROM_WORKER
    });
  }

  private sendMessage(port: ExtendedMessagePort, message: WorkerMessage): void {
    try {
      port.postMessage(message);
    } catch (error) {
      console.error('[SharedWorker] Failed to send message:', error);
      // Try to identify and remove the broken port
      this.findAndRemoveBrokenPort(port);
    }
  }

  private findAndRemoveBrokenPort(brokenPort: ExtendedMessagePort): void {
    let portToRemove: string | null = null;

    this.ports.forEach((port, id) => {
      if (port === brokenPort) {
        portToRemove = id;
      }
    });

    if (portToRemove) {
      this.ports.delete(portToRemove);
      console.log(`[SharedWorker] Removed broken port: ${portToRemove}`);
      this.broadcastTabCount();
    }
  }

  private removePort(portId: string): void {
    if (this.ports.has(portId)) {
      this.ports.delete(portId);
      console.log(`[SharedWorker] Port removed: ${portId}. Remaining: ${this.ports.size}`);
      this.broadcastTabCount();
    }
  }

  private startHeartbeat(): void {
    // Clear any existing interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Check connections every 30 seconds
    this.heartbeatInterval = self.setInterval(() => {
      this.checkConnections();
    }, 30000);
  }

  private checkConnections(): void {
    const now = Date.now();
    const timeout = 90000; // 90 seconds without activity

    console.log(`[SharedWorker] Heartbeat check. Active tabs: ${this.getActiveTabsCount()}`);

    this.ports.forEach((port, tabId) => {
      if (port.lastHeartbeat && now - port.lastHeartbeat > timeout) {
        console.log(`[SharedWorker] Tab ${tabId} timeout, removing`);
        this.ports.delete(tabId);
      } else {
        // Send ping to test connection
        try {
          port.postMessage({
            type: WorkerMessageType.PING,
            timestamp: now,
            direction: WorkerMessageDirection.FROM_WORKER
          });
        } catch (error) {
          console.log(`[SharedWorker] Tab ${tabId} connection lost`);
          this.ports.delete(tabId);
        }
      }
    });

    // Update tab count if any were removed
    if (this.ports.size !== this.getActiveTabsCount()) {
      this.broadcastTabCount();
    }
  }

  private getActiveTabsCount(): number {
    // Count only ports with tabId (registered tabs)
    let count = 0;
    this.ports.forEach(port => {
      if (port.tabId) {
        count++;
      }
    });
    return count;
  }

  private handleError(error: ErrorEvent): void {
    console.error('[SharedWorker] Global error:', error);
  }

  // Public API methods (if needed)
  public getWorkerId(): string {
    return this.workerId;
  }

  public getTabCount(): number {
    return this.getActiveTabsCount();
  }

  public getSharedData(key: string): any {
    return this.sharedData.get(key);
  }

  public getAllSharedData(): Map<string, any> {
    return new Map(this.sharedData);
  }

  public cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.ports.clear();
    this.sharedData.clear();

    console.log('[SharedWorker] Cleaned up');
  }
}

// Create and export the SharedWorkerInstance instance
const sharedWorker = new SharedWorkerInstance();

// Export for potential debugging/testing
if (typeof self !== 'undefined') {
  (self as any).__sharedWorker = sharedWorker;
}
