
// pubsub-worker.ts
/// <reference lib="webworker" />

import {AbstractSharedWorker} from '../abstract-shared-worker';
import {CentrifugeService} from '../../transport/centrifuge';
import {v7 as uuid} from 'uuid';
import {
  Message,
  MessageFactory,
  RpcMethodHandler, SharedWorkerMessageType,
  SharedWorkerMessageTypes
} from '../worker.types';
import {PubSubState, rpcSubscribeMethod, rpcSubscribeParams} from './pubsub.types';

export interface Config {
  url: string;
  token?: string;
  getToken?: (ctx: any) => Promise<string>
}

export class PubSubSharedWorker extends AbstractSharedWorker<Config, PubSubState> {
  private centrifugeService: CentrifugeService | null = null;
  private channelSubscriptions: Map<string, any> = new Map(); // Centrifuge subscriptions by channel

  constructor() {
    super();

    this.initializeCentrifuge();

    this.registerRpcMethod<rpcSubscribeParams, void>(rpcSubscribeMethod, this.rpcSubscribe.bind(this));
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

  /**
   * RPC: subscribe to a pub/sub channel.
   */
  private rpcSubscribe: RpcMethodHandler<rpcSubscribeParams, void>
    = async ({ centrifugoChannel, centrifugoToken }, { connectionId, signal }) => {

      if (!this.centrifugeService) {
        throw new Error('Centrifuge not initialized');
      }

      if (this.centrifugeService.hasSubscription(centrifugoChannel)) {
        return
      }

      const subscription = this.centrifugeService.createSubscription(centrifugoChannel, centrifugoToken);

      subscription.on('publication', (ctx: any) => {
        const m =  ctx.data as Message<typeof SharedWorkerMessageTypes.TAB_SYNC_DATA>;
        const { metadata } = m;
        if (metadata.workerUuid === this.workerUuid) { // our own message, discard
          return;
        }

        this.sendMessage(m);
      });

      subscription.subscribe();

      console.debug(
        `[PubSub] ${connectionId} subscribed to ${centrifugoChannel}`
      );
    };

  protected override getInitialState(): PubSubState {
    return {
      tabsConnected: 0,
    };
  }

  protected override handleMessage(data: Message, sourcePort: Worker | MessagePort, connectionId: string): void {
    super.handleMessage(data, sourcePort, connectionId);
  }

  protected upstreamPrepareMessage(m: Message<typeof SharedWorkerMessageTypes.TAB_SYNC_DATA>): Message {
    const { metadata, ...restMessage } = m;
    const { tabId, ...restMetadata } = metadata; // Extract and discard tabId

    const upstreamMessage: Message = {
      ...restMessage,
      metadata: {
        ...restMetadata,
        clientUuid: uuid(),
        workerUuid: this.workerUuid,
      }
    };

    return upstreamMessage;
  }

  protected override onTabSyncData(m: Message<typeof SharedWorkerMessageTypes.TAB_SYNC_DATA>) {
    const { upstreamChannel } = m.metadata;
    if (!upstreamChannel) {
      return;
    }

    // Get active subscription if any
    const subInfo = this.centrifugeService?.getSubscriptionInfo(upstreamChannel);
    if (!subInfo) {
      return;
    }

    const upstreamMessage = this.upstreamPrepareMessage(m);
    void subInfo.subscription.publish(upstreamMessage).catch((e) => {
      console.error('Failed to upstream message:', m);
    });
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
