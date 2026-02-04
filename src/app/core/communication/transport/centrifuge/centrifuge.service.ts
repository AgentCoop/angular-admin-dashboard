import {
  Centrifuge,
  Subscription as CentrifugeSubscription,
  StreamPosition
} from 'centrifuge';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { NetworkMonitor, NetworkMonitorFactory } from '../../network-monitor';
import { map } from 'rxjs/operators';

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export interface SubscriptionInfo {
  subscription: CentrifugeSubscription;
  channel: string;
  token?: string;
  options: any;
  createdAt: Date;
  lastActivity?: Date;
  isActive: boolean;
}

export class CentrifugeService {
  private centrifuge!: Centrifuge;

  // Network Monitor Integration
  private readonly networkMonitor: NetworkMonitor;
  private networkMonitorSubscriptions: Subscription[] = [];

  // RxJS Subjects for reactive state
  private connectionStateSubject = new BehaviorSubject<ConnectionState>(ConnectionState.DISCONNECTED);
  private subscriptionCountSubject = new BehaviorSubject<number>(0);
  private reconnectAttemptsSubject = new BehaviorSubject<number>(0);

  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000;
  private maxReconnectDelay = 30000;

  private reconnectTimeoutId: any = null;
  private healthCheckIntervalId: any = null;

  private activeSubscriptions = new Map<string, SubscriptionInfo>();

  // Public Observables
  public connectionState$: Observable<ConnectionState>;
  public subscriptionCount$: Observable<number>;
  public reconnectAttempts$: Observable<number>;
  public isConnected$: Observable<boolean>;

  constructor(
    networkMonitor?: NetworkMonitor // Optional dependency injection
  ) {
    // Initialize Network Monitor
    this.networkMonitor = networkMonitor || NetworkMonitorFactory.autoCreate();
    this.startNetworkMonitoring();

    this.connectionState$ = this.connectionStateSubject.asObservable();
    this.subscriptionCount$ = this.subscriptionCountSubject.asObservable();
    this.reconnectAttempts$ = this.reconnectAttemptsSubject.asObservable();
    this.isConnected$ = this.connectionState$.pipe(
      map(state => state === ConnectionState.CONNECTED)
    );
  }

  /**
   * Get the current network monitor instance
   */
  public getNetworkMonitor(): NetworkMonitor {
    return this.networkMonitor;
  }

  /**
   * Start network monitoring and set up event handlers
   */
  private startNetworkMonitoring(): void {
    if (!this.networkMonitor.isMonitoring()) {
      this.networkMonitor.startMonitoring();
    }

    // Subscribe to online events specifically
    const onlineSub = this.networkMonitor.getOnline$().subscribe(() => {
      this.onNetworkBackOnline();
    });

    // Subscribe to offline events specifically
    const offlineSub = this.networkMonitor.getOffline$().subscribe(() => {
      this.onNetworkOffline();
    });

    this.networkMonitorSubscriptions.push(onlineSub, offlineSub);
  }

  /**
   * Stop network monitoring and clean up subscriptions
   */
  private stopNetworkMonitoring(): void {
    // Unsubscribe from all network monitor observables
    this.networkMonitorSubscriptions.forEach(sub => sub.unsubscribe());
    this.networkMonitorSubscriptions = [];

    // Stop the network monitor
    if (this.networkMonitor.isMonitoring()) {
      this.networkMonitor.stopMonitoring();
    }
  }

  /**
   * Handle network going offline
   */
  private onNetworkOffline(): void {
    console.log('Network is offline - pausing connection attempts');

    // Stop all reconnection attempts
    this.stopReconnectAttempts();

    // Stop health checks
    this.stopHealthCheck();

    // Update connection state if we were connected
    if (this.isConnected) {
      this.connectionStateSubject.next(ConnectionState.DISCONNECTED);
    }

    // Mark all subscriptions as inactive
    this.markAllSubscriptionsInactive();

    // Disconnect Centrifuge if connected
    if (this.centrifuge && this.isConnected) {
      console.log('Disconnecting Centrifuge due to network offline');
      this.centrifuge.disconnect();
    }
  }

  /**
   * Handle network coming back online
   */
  private onNetworkBackOnline(): void {
    console.log('Network is back online - attempting to reconnect');

    const currentStatus = this.networkMonitor.getCurrentStatus();
    console.log('Current network status:', currentStatus);

    // Reset reconnect attempts
    this.reconnectAttemptsSubject.next(0);

    // Clear any pending reconnect attempts
    this.stopReconnectAttempts();

    // Attempt to reconnect if we have a Centrifuge instance
    if (this.centrifuge && !this.isConnected) {
      console.log('Initiating network-aware reconnection');

      // Small delay to ensure network is stable
      setTimeout(() => {
        if (currentStatus.isOnline) {
          this.forceReconnect();
        } else {
          console.log('Network went offline again before reconnection');
        }
      }, 500);
    }
  }

  get connection(): Centrifuge {
    return this.centrifuge;
  }

  get connectionState(): ConnectionState {
    return this.connectionStateSubject.value;
  }

  get subscriptionCount(): number {
    return this.subscriptionCountSubject.value;
  }

  get reconnectAttempts(): number {
    return this.reconnectAttemptsSubject.value;
  }

  get isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  public connect(url: string, token: string, getToken?: (ctx: any) => Promise<string>): void {
    this.disconnect();

    const options: any = {
      protocol: 'json' as const,
      debug: true,
      token: token || null,
      getToken: getToken || null,
      data: null,
      minReconnectDelay: 1000,
      maxReconnectDelay: 10000,
      timeout: 5000,
      maxServerPingDelay: 10000,
    };

    this.centrifuge = new Centrifuge(url, options);
    this.setupConnectionHandlers();
    this.centrifuge.connect();
  }

  public createRecoverableSubscription(
    channel: string,
    token?: string,
    options: Partial<{
      getToken: (ctx: any) => Promise<string>;
      data: any;
      since: StreamPosition;
      minResubscribeDelay: number;
      maxResubscribeDelay: number;
      positioned: boolean;
      recoverable: boolean;
      joinLeave: boolean;
      [key: string]: any;
    }> = {}
  ): CentrifugeSubscription {
    if (!this.centrifuge) {
      throw new Error('WebSocket not initialized');
    }

    const subscriptionOptions: any = {
      token: token || null,
      getToken: options.getToken || null,
      data: options.data || null,
      since: options.since || null,
      minResubscribeDelay: options.minResubscribeDelay || 1000,
      maxResubscribeDelay: options.maxResubscribeDelay || 10000,
      positioned: options.positioned !== undefined ? options.positioned : true,
      recoverable: options.recoverable !== undefined ? options.recoverable : true,
      joinLeave: options.joinLeave !== undefined ? options.joinLeave : true,
    };

    console.log('Creating subscription with options:', {
      channel,
      ...subscriptionOptions,
      token: token ? '***' : 'null'
    });

    const subscription = this.centrifuge.newSubscription(channel, subscriptionOptions);

    this.trackSubscription(subscription, channel, token, options);

    return subscription;
  }

  public createSubscription(
    channel: string,
    token?: string,
    data?: any
  ): CentrifugeSubscription {
    return this.createRecoverableSubscription(channel, token, {
      data,
      recoverable: true,
      positioned: true,
      joinLeave: true
    });
  }

  private trackSubscription(
    subscription: CentrifugeSubscription,
    channel: string,
    token?: string,
    options: any = {}
  ): void {
    const subscriptionInfo: SubscriptionInfo = {
      subscription,
      channel,
      token,
      options,
      createdAt: new Date(),
      isActive: true
    };

    this.activeSubscriptions.set(channel, subscriptionInfo);
    this.subscriptionCountSubject.next(this.activeSubscriptions.size);

    subscription.on('publication', () => {
      const info = this.activeSubscriptions.get(channel);
      if (info) {
        info.lastActivity = new Date();
      }
    });

    subscription.on('unsubscribed', () => {
      this.removeSubscription(channel);
    });

    subscription.on('error', (err) => {
      console.error(`Subscription error for channel ${channel}:`, err);
      const info = this.activeSubscriptions.get(channel);
      if (info) {
        info.isActive = false;
      }
    });

    console.log(`Tracked subscription for channel: ${channel}, total: ${this.activeSubscriptions.size}`);
  }

  public closeSubscription(channel: string): boolean {
    const subscriptionInfo = this.activeSubscriptions.get(channel);

    if (!subscriptionInfo) {
      console.warn(`Subscription not found for channel: ${channel}`);
      return false;
    }

    try {
      subscriptionInfo.subscription.unsubscribe();
      this.centrifuge.removeSubscription(subscriptionInfo.subscription);

      this.activeSubscriptions.delete(channel);
      this.subscriptionCountSubject.next(this.activeSubscriptions.size);

      console.log(`Successfully closed subscription for channel: ${channel}`);
      return true;
    } catch (error) {
      console.error(`Error closing subscription for channel ${channel}:`, error);

      this.activeSubscriptions.delete(channel);
      this.subscriptionCountSubject.next(this.activeSubscriptions.size);

      return false;
    }
  }

  public closeSubscriptions(channels: string[]): { success: string[], failed: string[] } {
    const success: string[] = [];
    const failed: string[] = [];

    channels.forEach(channel => {
      if (this.closeSubscription(channel)) {
        success.push(channel);
      } else {
        failed.push(channel);
      }
    });

    return { success, failed };
  }

  public closeAllSubscriptions(): { closed: number, errors: number } {
    const channels = Array.from(this.activeSubscriptions.keys());
    let closed = 0;
    let errors = 0;

    channels.forEach(channel => {
      if (this.closeSubscription(channel)) {
        closed++;
      } else {
        errors++;
      }
    });

    console.log(`Closed ${closed} subscriptions with ${errors} errors`);
    return { closed, errors };
  }

  public removeSubscription(channel: string): boolean {
    const existed = this.activeSubscriptions.delete(channel);

    if (existed) {
      this.subscriptionCountSubject.next(this.activeSubscriptions.size);
      console.log(`Removed subscription tracking for channel: ${channel}`);
    }

    return existed;
  }

  public getSubscriptionInfo(channel: string): SubscriptionInfo | null {
    return this.activeSubscriptions.get(channel) || null;
  }

  public getAllSubscriptions(): SubscriptionInfo[] {
    return Array.from(this.activeSubscriptions.values());
  }

  public getSubscription(channel: string): CentrifugeSubscription | null {
    const info = this.activeSubscriptions.get(channel);
    return info?.subscription || null;
  }

  public hasSubscription(channel: string): boolean {
    return this.activeSubscriptions.has(channel);
  }

  public isSubscriptionActive(channel: string): boolean {
    const info = this.activeSubscriptions.get(channel);
    if (!info) { return false; }

    const state = info.subscription.state;
    return state === 'subscribed' || state === 'subscribing';
  }

  public resubscribe(channel: string): boolean {
    const info = this.activeSubscriptions.get(channel);

    if (!info) {
      console.warn(`Cannot resubscribe - subscription not found for channel: ${channel}`);
      return false;
    }

    try {
      info.subscription.subscribe();
      info.isActive = true;
      console.log(`Resubscribed to channel: ${channel}`);
      return true;
    } catch (error) {
      console.error(`Error resubscribing to channel ${channel}:`, error);
      info.isActive = false;
      return false;
    }
  }

  public cleanupInactiveSubscriptions(maxAgeHours: number = 24): string[] {
    const now = new Date();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const cleanedUp: string[] = [];

    for (const [channel, info] of this.activeSubscriptions.entries()) {
      const age = now.getTime() - info.createdAt.getTime();

      if (age > maxAgeMs) {
        const lastActivityAge = info.lastActivity
          ? now.getTime() - info.lastActivity.getTime()
          : Infinity;

        if (lastActivityAge > maxAgeMs || !info.lastActivity) {
          if (this.closeSubscription(channel)) {
            cleanedUp.push(channel);
          }
        }
      }
    }

    console.log(`Cleaned up ${cleanedUp.length} inactive subscriptions`);
    return cleanedUp;
  }

  private setupConnectionHandlers(): void {
    if (!this.centrifuge) { return; }

    this.centrifuge.on('connected', (ctx) => {
      console.log('WebSocket connected');
      this.connectionStateSubject.next(ConnectionState.CONNECTED);
      this.reconnectAttemptsSubject.next(0);
      this.stopReconnectAttempts();
      this.startHealthCheck();
      this.autoResubscribeOnReconnect();
    });

    this.centrifuge.on('disconnected', (ctx) => {
      console.log('WebSocket disconnected', ctx.reason);
      this.connectionStateSubject.next(ConnectionState.DISCONNECTED);
      this.stopHealthCheck();
      this.markAllSubscriptionsInactive();
      this.scheduleReconnection();
    });

    this.centrifuge.on('connecting', (ctx) => {
      console.log('WebSocket connecting...', ctx.reason);
      this.connectionStateSubject.next(ConnectionState.CONNECTING);
    });

    this.centrifuge.on('error', (ctx) => {
      console.error('WebSocket error:', ctx.error);
      this.connectionStateSubject.next(ConnectionState.ERROR);
    });
  }

  private autoResubscribeOnReconnect(): void {
    console.log('Auto-resubscribing active subscriptions...');

    let resubscribed = 0;
    let failed = 0;

    for (const [channel, info] of this.activeSubscriptions.entries()) {
      if (info.isActive) {
        try {
          info.subscription.subscribe();
          resubscribed++;
        } catch (error) {
          console.error(`Failed to auto-resubscribe to channel ${channel}:`, error);
          info.isActive = false;
          failed++;
        }
      }
    }

    console.log(`Auto-resubscribed ${resubscribed} subscriptions, ${failed} failed`);
  }

  private markAllSubscriptionsInactive(): void {
    for (const info of this.activeSubscriptions.values()) {
      info.isActive = false;
    }
  }

  private scheduleReconnection(): void {
    this.stopReconnectAttempts();

    const currentAttempts = this.reconnectAttempts;
    if (currentAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, currentAttempts),
      this.maxReconnectDelay
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${currentAttempts + 1}/${this.maxReconnectAttempts})`);

    this.reconnectTimeoutId = setTimeout(() => {
      const newAttempts = currentAttempts + 1;
      this.reconnectAttemptsSubject.next(newAttempts);

      if (this.centrifuge && !this.isConnected) {
        console.log('Attempting reconnection...');
        try {
          this.centrifuge.connect();
        } catch (error) {
          console.error('Reconnection attempt failed:', error);
          this.scheduleReconnection();
        }
      }
    }, delay);
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckIntervalId = setInterval(() => {
      if (this.centrifuge && this.isConnected) {
        console.log('Connection health check passed');
        this.checkSubscriptionHealth();
      }
    }, 30000);
  }

  private checkSubscriptionHealth(): void {
    let healthy = 0;
    let unhealthy = 0;

    for (const [channel, info] of this.activeSubscriptions.entries()) {
      const state = info.subscription.state;
      if (state === 'subscribed') {
        healthy++;
      } else if (state === 'unsubscribed') {
        unhealthy++;
        console.warn(`Unhealthy subscription detected: ${channel} (state: ${state})`);
      }
    }

    if (unhealthy > 0) {
      console.log(`Subscription health: ${healthy} healthy, ${unhealthy} unhealthy`);
    }
  }

  private stopHealthCheck(): void {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
  }

  private stopReconnectAttempts(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  public getSubscriptionState(sub: CentrifugeSubscription): string {
    return sub.state;
  }

  public isSubscriptionRecovering(sub: CentrifugeSubscription): boolean {
    return sub.state === 'subscribing' &&
      (sub as any).recovering === true;
  }

  public forceReconnect(): void {
    if (this.centrifuge) {
      console.log('Manual reconnection triggered');
      this.stopReconnectAttempts();
      this.reconnectAttemptsSubject.next(0);
      this.disconnect();

      setTimeout(() => {
        if (this.centrifuge) {
          this.centrifuge.connect();
        }
      }, 100);
    }
  }

  public disconnect(): void {
    this.stopReconnectAttempts();
    this.stopHealthCheck();

    this.closeAllSubscriptions();

    if (this.centrifuge) {
      try {
        this.centrifuge.disconnect();
      } catch (error) {
        console.warn('Error during disconnect:', error);
      }
    }
  }
}
