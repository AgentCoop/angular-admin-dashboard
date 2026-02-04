
// pubsub.ts
/// <reference lib="webworker" />

import { ExtendedMessagePort, BaseWorkerMessage } from '../';
import { SharedWorker } from '../shared-worker';
//import { WorkerMessageType, WorkerMessageDirection, PubSubPublishMessage } from './shared-worker-base';
import { CentrifugeService } from '../../../transport/centrifuge';

export class PubSubSharedWorker extends SharedWorker {
  private centrifugeService: CentrifugeService | null = null;
  private centrifugeConfig: { url: string; token?: string; getToken?: (ctx: any) => Promise<string> } | null = null;
  private channelSubscriptions: Map<string, any> = new Map(); // Centrifuge subscriptions by channel
  private tabChannels: Map<string, Set<string>> = new Map(); // tabId -> Set<channels>

  constructor() {
    super();
    console.log('[PubSubSharedWorker] Initialized');
  }

  // Configure Centrifuge
  public configureCentrifuge(config: {
    url: string;
    token?: string;
    getToken?: (ctx: any) => Promise<string>
  }): void {
    this.centrifugeConfig = config;
    console.log('[PubSubSharedWorker] Centrifuge configured');
  }

  // Initialize Centrifuge connection
  private async initializeCentrifuge(): Promise<void> {
    if (!this.centrifugeConfig || this.centrifugeService) {
      return;
    }

    try {
      this.centrifugeService = new CentrifugeService();
      this.centrifugeService.connect(
        this.centrifugeConfig.url,
        this.centrifugeConfig.token || '',
        this.centrifugeConfig.getToken
      );

      // Listen to connection state
      this.centrifugeService.connectionState$.subscribe(state => {
        console.log(`[PubSubSharedWorker] Centrifuge connection state: ${state}`);
      });

      console.log('[PubSubSharedWorker] Centrifuge service initialized');
    } catch (error) {
      console.error('[PubSubSharedWorker] Failed to initialize Centrifuge:', error);
    }
  }

  // Setup connection for a tab
  protected async setupConnection(port: ExtendedMessagePort, tabId: string): Promise<void> {
    // Initialize Centrifuge if not already done
    if (this.centrifugeConfig && !this.centrifugeService) {
      await this.initializeCentrifuge();
    }

    // Initialize tab channels tracking
    this.tabChannels.set(tabId, new Set());

    console.log(`[PubSubSharedWorker] Setup connection for tab ${tabId}`);
  }

  // Cleanup
  public override cleanup(): void {
    // Cleanup Centrifuge
    if (this.centrifugeService) {
      this.centrifugeService.disconnect();
      this.centrifugeService = null;
    }

    // Cleanup subscriptions
    this.channelSubscriptions.clear();
    this.tabChannels.clear();

    // Call parent cleanup
    super.cleanup();

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
