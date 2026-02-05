// shared-worker.ts
/// <reference lib="webworker" />

import {
  ExtendedMessagePort,
  BaseMessageTypes, Message, MessageFactory, BaseWorkerState
} from './types';
import { v4 as uuid } from 'uuid';
import {Base64} from 'js-base64';

declare const self: SharedWorkerGlobalScope;

export abstract class WorkerBase<C extends any, S extends BaseWorkerState = BaseWorkerState> {
  private ports: Map<string, ExtendedMessagePort> = new Map(); // keyed by connectionId
  private readonly workerId: string;
  private heartbeatInterval?: number;

  private _state: S;

  get state(): Readonly<S> {
    return this._state;
  }

  protected config: C;

  protected constructor() {
    this.workerId = uuid();
    console.log('SHARED WORKER: Initialized with ID: %s, location: %s', this.workerId, self.location.href)

    this._state = this.getInitialState();

    // Set up connection handler
    self.onconnect = this.handleConnection.bind(this);

    // Start heartbeat for connection health check
    this.startHeartbeat();

    // Handle global errors
    self.onerror = this.handleError.bind(this);

    // Initialize worker configuration
    const { config } = this.decodeUrlParams();

    this.config = config;
  }

  // Abstract method for derived classes to provide initial state
  protected abstract getInitialState(): S;

  /**
   * Helper to decode params from the URL in worker context
   */
  private decodeUrlParams(): { config: any } {
    if (typeof self === 'undefined') {
      return { config: null };
    }

    try {
      const url = new URL(self.location.href);
      const configParam = url.searchParams.get('config');

      if (!configParam) {
        return { config: null };
      }

      // Decode URL-safe base64
      const json = Base64.decode(configParam);
      const config = JSON.parse(json);

      return { config };

    } catch (error) {
      console.warn('Failed to decode config from URL:', error);
      return { config: null };
    }
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
    port.onmessage = (e: MessageEvent<Message>) => {
      console.log('[SharedWorker] Message from', connectionId, ':', e.data);

      if (e.data) {
        this.handleMessage(e.data, port, connectionId);
      }
    };

    // Handle port closure
    port.onmessageerror = (error) => {
      console.error('[SharedWorker] Message error from', connectionId, ':', error);
      this.removePort(connectionId);
    };

    port.start();
  }

  protected handleMessage(m: Message, sourcePort: ExtendedMessagePort, connectionId: string): void {
    // Update heartbeat on any message
    sourcePort.lastHeartbeat = Date.now();

    switch (m.type) {
      case BaseMessageTypes.TAB_REGISTER:
        this.handleTabRegister(m as Message<typeof BaseMessageTypes.TAB_REGISTER>, sourcePort, connectionId);
        break;

      case BaseMessageTypes.TAB_UNREGISTER:
        this.handleTabUnregister(connectionId);
        break;

      case BaseMessageTypes.TAB_DATA:
        this.handleTabDataMessage(m as Message<typeof BaseMessageTypes.TAB_DATA>, sourcePort);
        break;

      case BaseMessageTypes.PING:
        this.handlePing(sourcePort);
        break;

      default:
        console.warn('[SharedWorker] Unknown message type:', m.type);
        this.sendError(sourcePort, `Unknown message type: ${m.type}`);
    }
  }

  private handleTabRegister(
    data: Message<typeof BaseMessageTypes.TAB_REGISTER>,
    port: ExtendedMessagePort,
    connectionId: string
  ): void {
    const { payload: { tabId } } = data;

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

    this.updateState({
      tabsConnected: this.ports.size,
    });

    console.log(`[SharedWorker] Tab registered: ${tabId}. Total tabs: ${this.getActiveTabsCount()}`);
  }

  private handleTabUnregister(connectionId: string): void {
    if (this.ports.has(connectionId)) {
      const tabId = this.ports.get(connectionId)!.tabId;

      this.ports.delete(connectionId);

      this.updateState({
        tabsConnected: this.getActiveTabsCount()
      });
      console.log(`[SharedWorker] Tab unregistered: ${connectionId}. Remaining: ${this.getActiveTabsCount()}`);
    }
  }

  private handleTabDataMessage(
    m: Message<typeof BaseMessageTypes.TAB_DATA>,
    sourcePort: ExtendedMessagePort,
  ): void {
    const { metadata } = m;

    if (metadata.broadcast) {
      this.broadcastMessage(m, sourcePort);
    } else {
      // todo: single target
    }
  }

  private handlePing(port: ExtendedMessagePort): void {
    this.sendPong(port);
  }

  private broadcastMessage(
    m: Message,
    excludePort?: ExtendedMessagePort,
  ): void {
    this.ports.forEach((port, tabId) => {
      if (excludePort && port === excludePort) {
        return;
      }

      const broadcastMsg: Message = {
        ...m,
        metadata: {
          ...m.metadata,
          broadcasted: true,
        }
      };

      this.sendMessage(port, broadcastMsg);
    });
  }

  private sendPing(port: ExtendedMessagePort): void {
    this.sendMessage(port, MessageFactory.create(
      BaseMessageTypes.PING, { }
    ));
  }

  private sendPong(port: ExtendedMessagePort): void {
    this.sendMessage(port, MessageFactory.create(
      BaseMessageTypes.PONG, {
        latency: 0,
      }
    ));
  }

  private sendError(port: ExtendedMessagePort, message: string): void {
    this.sendMessage(port, MessageFactory.create(
      BaseMessageTypes.ERROR, {
        message
      }
    ));
  }

  private sendMessage(port: ExtendedMessagePort, m: Message): void {
    try {
      port.postMessage(m);
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
      this.removePort(portToRemove);
    }
  }

  private removePort(portId: string): void {
    if (this.ports.has(portId)) {
      this.ports.delete(portId);
      this.updateState({
        tabsConnected: this.ports.size,
      });

      console.log(`[SharedWorker] Port removed: ${portId}. Remaining: ${this.ports.size}`);
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
          this.sendPing(port);
        } catch (error) {
          console.log(`[SharedWorker] Tab ${tabId} connection lost`);
          this.ports.delete(tabId);
        }
      }
    });

    // Update tab count if any were removed
    if (this.ports.size !== this.state.tabsConnected) {
      this.updateState({
        tabsConnected: this.ports.size
      })
    }
  }

  protected updateState<K extends keyof S>(
    updates: Pick<S, K> | ((prev: S) => Pick<S, K>)
  ): void {
    const newState = {
      ...this._state,
      ...(typeof updates === 'function' ? updates(this._state) : updates),
      lastUpdate: Date.now()
    };

    this._state = newState;

    this.broadcastMessage(MessageFactory.create(
      BaseMessageTypes.WORKER_STATE, {
        state: newState,
      }
    ));
  }

  //
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

  public cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.ports.clear();

    console.log('[SharedWorker] Cleaned up');
  }
}
