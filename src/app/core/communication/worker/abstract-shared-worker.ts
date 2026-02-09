// shared-worker-base.ts
import { AbstractWorker } from './abstract-worker';
import {
  Message,
  BaseWorkerState,
  SharedWorkerMessageTypes
} from './worker.types';
import { v4 as uuid } from 'uuid';

declare const self: SharedWorkerGlobalScope;

export abstract class AbstractSharedWorker<C extends any, S extends BaseWorkerState = BaseWorkerState>
  extends AbstractWorker<C, S> {

  protected workerType: 'shared' = 'shared';

  protected constructor() {
    super();

    // Set up connection handler
    self.onconnect = this.handleConnection.bind(this);

    // Start heartbeat for connection health check
    //this.startHeartbeat();

    // Handle global errors
    self.onerror = this.handleError.bind(this);
  }

  protected handleConnection(event: MessageEvent): void {
    const port = event.ports[0];
    const connectionId = uuid();

    // Store port with connection ID initially
    this.addPort(connectionId, port);

    console.log(`[${this.workerType}] New connection (${connectionId}). Total: ${this.ports.size}`);

    // Set up message handler
    port.onmessage = (e: MessageEvent<Message>) => {
      console.log(`[${this.workerType}] Message from ${connectionId}:`, e.data);

      if (e.data) {
        this.handleMessage(e.data, port, connectionId);
      }
    };

    // Handle port closure
    port.onmessageerror = (error) => {
      console.error(`[${this.workerType}] Message error from ${connectionId}:`, error);
      this.removePort(connectionId);
    };

    port.start();
  }

  protected onTabSyncData(m: Message<typeof SharedWorkerMessageTypes.TAB_SYNC_DATA>): void {
    console.log('TabSyncData data:', m);
  }

  protected override handleMessage(m: Message, sourcePort: Worker | MessagePort, connectionId: string): void {
    switch (m.type) {
      case SharedWorkerMessageTypes.TAB_REGISTER:
        this.handleTabRegister(m as Message<typeof SharedWorkerMessageTypes.TAB_REGISTER>, connectionId);
        break;

      case SharedWorkerMessageTypes.TAB_UNREGISTER:
        this.handleTabUnregister(connectionId);
        break;

      case SharedWorkerMessageTypes.TAB_SYNC_DATA:
        this.handleTabSyncData(m as Message<typeof SharedWorkerMessageTypes.TAB_SYNC_DATA>);
        break;

      default:
        super.handleMessage(m, sourcePort, connectionId);
    }
  }

  private handleTabRegister(
    data: Message<typeof SharedWorkerMessageTypes.TAB_REGISTER>,
    connectionId: string
  ): void {
    const { tabId } = data.metadata;

    if (!tabId) {
      console.error('[SharedWorker] Tab register missing tabId');
      this.sendErrorMessage('Missing tabId in registration');
      return;
    }

    this.updatePortDescriptor(connectionId, { tabId });
    this.updateState({
      tabsConnected: this.ports.size,
    });
  }

  private handleTabUnregister(connectionId: string): void {
    if (this.ports.has(connectionId)) {
      this.ports.delete(connectionId);

      this.updateState({
        tabsConnected: this.ports.size
      });
      console.log(`[SharedWorker] Tab unregistered: ${connectionId}`);
    }
  }

  private handleTabSyncData(
    m: Message<typeof SharedWorkerMessageTypes.TAB_SYNC_DATA>,
  ): void {
    this.onTabSyncData(m);

    this.sendMessage(m);
  }

  private removePort(connectionId: string): void {
    if (this.ports.has(connectionId)) {
      this.ports.delete(connectionId);
      this.updateState({
        tabsConnected: this.ports.size,
      });

      console.log(`[${this.workerType}] Port removed: ${connectionId}. Remaining: ${this.ports.size}`);
    }
  }

  protected handleError(error: ErrorEvent): void {
    console.error(`[${this.workerType}] Global error:`, error);
  }

}
