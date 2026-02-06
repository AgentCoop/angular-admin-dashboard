
// pubsub.ts
/// <reference lib="webworker" />

import {AbstractSharedWorker} from '../abstract-shared-worker';
import {CentrifugeService} from '../../transport/centrifuge';
import {ExtendedMessagePort, Message} from '../worker.types';
import {PubSubState} from './types';

export interface Config {
  url: string;
  token?: string;
  getToken?: (ctx: any) => Promise<string>
}

export class PubSubSharedWorker extends AbstractSharedWorker<Config, PubSubState> {
  private centrifugeService: CentrifugeService | null = null;
  private channelSubscriptions: Map<string, any> = new Map(); // Centrifuge subscriptions by channel
  private tabChannels: Map<string, Set<string>> = new Map(); // tabId -> Set<channels>

  constructor() {
    super();

    this.initializeCentrifuge();
  }

  // Initialize Centrifuge connection
  private initializeCentrifuge(): void {
    if (!this.config || this.centrifugeService) {
      return;
    }

    try {
      this.centrifugeService = new CentrifugeService();
      this.centrifugeService.connect(
        this.config.url,
        this.config.token || '',
      );

      // Listen to connection state
      this.centrifugeService.connectionState$.subscribe(state => {
        console.log(`[PubSubSharedWorker] Centrifuge connection state: ${state}`);
      });

      console.log('[PubSubSharedWorker] Initialized, centrifuge config: %o', this.config);
    } catch (error) {
      console.error('[PubSubSharedWorker] Failed to initialize Centrifuge:', error);
    }
  }

  protected override getInitialState(): PubSubState {
    return {
      tabsConnected: 0,
    };
  }

  protected override handleMessage(data: Message, sourcePort: ExtendedMessagePort, connectionId: string): void {
    super.handleMessage(data, sourcePort, connectionId);
  }

  // Cleanup
  public override onTerminate(): void {
    // Cleanup Centrifuge
    if (this.centrifugeService) {
      this.centrifugeService.disconnect();
      this.centrifugeService = null;
    }

    // Cleanup subscriptions
    this.channelSubscriptions.clear();
    this.tabChannels.clear();

    // Call parent cleanup
    super.onTerminate();

    console.log('[PubSubSharedWorker] Cleaned up');
  }
}

// Create and export the shared worker instance
declare const self: SharedWorkerGlobalScope;

// Initialize the shared worker
const pubSubWorker = new PubSubSharedWorker();

// Export for debugging
if (typeof self !== 'undefined') {
  (self as any).__pubSubWorker = pubSubWorker;
}

export default pubSubWorker;
