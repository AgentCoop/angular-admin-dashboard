// services/centrifuge.service.ts
import { Injectable, signal, OnDestroy, NgZone, computed } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  Centrifuge,
  Subscription as CentrifugeSubscription,
  StreamPosition
} from 'centrifuge';

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

@Injectable({ providedIn: 'root' })
export class CentrifugeService implements OnDestroy {
  private centrifuge!: Centrifuge;
  private connectionState = signal<ConnectionState>(ConnectionState.DISCONNECTED);
  private reconnectAttempts = signal(0);
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000;
  private maxReconnectDelay = 30000;

  private reconnectTimeoutId: any = null;
  private healthCheckIntervalId: any = null;

  // Track all created subscriptions
  private activeSubscriptions = new Map<string, SubscriptionInfo>();
  private subscriptionCount = signal(0);

  // Public observables
  public connectionState$ = new BehaviorSubject<ConnectionState>(ConnectionState.DISCONNECTED);
  public isConnected = computed(() => this.connectionState() === ConnectionState.CONNECTED);
  public activeSubscriptionCount = computed(() => this.subscriptionCount());

  constructor(private ngZone: NgZone) {
    this.ngZone.runOutsideAngular(() => {
      this.setupConnectionMonitoring();
    });
  }

  get connection(): Centrifuge {
    return this.centrifuge;
  }

  /**
   * Initialize Centrifuge with correct options
   */
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

  /**
   * Create a recoverable by default subscription and track it
   */
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

    // Track the subscription
    this.trackSubscription(subscription, channel, token, options);

    return subscription;
  }

  /**
   * Create a basic subscription
   */
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

  /**
   * Track a subscription
   */
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
    this.subscriptionCount.set(this.activeSubscriptions.size);

    // Update last activity on publication
    subscription.on('publication', () => {
      const info = this.activeSubscriptions.get(channel);
      if (info) {
        info.lastActivity = new Date();
      }
    });

    // Handle subscription removal on unsubscribe
    subscription.on('unsubscribed', () => {
      this.removeSubscription(channel);
    });

    // Handle subscription errors
    subscription.on('error', (err) => {
      console.error(`Subscription error for channel ${channel}:`, err);
      const info = this.activeSubscriptions.get(channel);
      if (info) {
        info.isActive = false;
      }
    });

    console.log(`Tracked subscription for channel: ${channel}, total: ${this.activeSubscriptions.size}`);
  }

  /**
   * Close and remove a specific subscription by channel
   */
  public closeSubscription(channel: string): boolean {
    const subscriptionInfo = this.activeSubscriptions.get(channel);

    if (!subscriptionInfo) {
      console.warn(`Subscription not found for channel: ${channel}`);
      return false;
    }

    try {
      // Remove and unsubscribe from the subscription
      subscriptionInfo.subscription.unsubscribe();
      this.centrifuge.removeSubscription(subscriptionInfo.subscription);

      // Remove from tracking
      this.activeSubscriptions.delete(channel);
      this.subscriptionCount.set(this.activeSubscriptions.size);

      console.log(`Successfully closed subscription for channel: ${channel}`);
      return true;
    } catch (error) {
      console.error(`Error closing subscription for channel ${channel}:`, error);

      // Force remove from tracking even if unsubscribe fails
      this.activeSubscriptions.delete(channel);
      this.subscriptionCount.set(this.activeSubscriptions.size);

      return false;
    }
  }

  /**
   * Close and remove multiple subscriptions
   */
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

  /**
   * Close all active subscriptions
   */
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

  /**
   * Remove a subscription from tracking without unsubscribing
   * Useful when you want to manage subscription lifecycle externally
   */
  public removeSubscription(channel: string): boolean {
    const existed = this.activeSubscriptions.delete(channel);

    if (existed) {
      this.subscriptionCount.set(this.activeSubscriptions.size);
      console.log(`Removed subscription tracking for channel: ${channel}`);
    }

    return existed;
  }

  /**
   * Get information about a specific subscription
   */
  public getSubscriptionInfo(channel: string): SubscriptionInfo | null {
    return this.activeSubscriptions.get(channel) || null;
  }

  /**
   * Get all active subscriptions
   */
  public getAllSubscriptions(): SubscriptionInfo[] {
    return Array.from(this.activeSubscriptions.values());
  }

  /**
   * Get subscription by channel
   */
  public getSubscription(channel: string): CentrifugeSubscription | null {
    const info = this.activeSubscriptions.get(channel);
    return info?.subscription || null;
  }

  /**
   * Check if a subscription exists for a channel
   */
  public hasSubscription(channel: string): boolean {
    return this.activeSubscriptions.has(channel);
  }

  /**
   * Check if a subscription is active (subscribed state)
   */
  public isSubscriptionActive(channel: string): boolean {
    const info = this.activeSubscriptions.get(channel);
    if (!info) { return false; }

    const state = info.subscription.state;
    return state === 'subscribed' || state === 'subscribing';
  }

  /**
   * Resubscribe to a channel
   */
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

  /**
   * Clean up inactive subscriptions (older than specified hours)
   */
  public cleanupInactiveSubscriptions(maxAgeHours: number = 24): string[] {
    const now = new Date();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const cleanedUp: string[] = [];

    for (const [channel, info] of this.activeSubscriptions.entries()) {
      const age = now.getTime() - info.createdAt.getTime();

      // Close subscription if it's old AND hasn't been active recently
      if (age > maxAgeMs) {
        const lastActivityAge = info.lastActivity
          ? now.getTime() - info.lastActivity.getTime()
          : Infinity;

        // If no activity for maxAgeHours or no activity at all
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

  /**
   * Set up connection event handlers
   */
  private setupConnectionHandlers(): void {
    if (!this.centrifuge) { return; }

    this.centrifuge.on('connected', (ctx) => {
      this.ngZone.run(() => {
        console.log('WebSocket connected');
        this.connectionState.set(ConnectionState.CONNECTED);
        this.connectionState$.next(ConnectionState.CONNECTED);
        this.reconnectAttempts.set(0);
        this.stopReconnectAttempts();
        this.startHealthCheck();

        // Auto-resubscribe all tracked subscriptions when reconnected
        this.autoResubscribeOnReconnect();
      });
    });

    this.centrifuge.on('disconnected', (ctx) => {
      this.ngZone.run(() => {
        console.log('WebSocket disconnected', ctx.reason);
        this.connectionState.set(ConnectionState.DISCONNECTED);
        this.connectionState$.next(ConnectionState.DISCONNECTED);
        this.stopHealthCheck();

        // Mark all subscriptions as inactive
        this.markAllSubscriptionsInactive();

        // Start reconnection attempts
        this.scheduleReconnection();
      });
    });

    this.centrifuge.on('connecting', (ctx) => {
      this.ngZone.run(() => {
        console.log('WebSocket connecting...', ctx.reason);
        this.connectionState.set(ConnectionState.CONNECTING);
        this.connectionState$.next(ConnectionState.CONNECTING);
      });
    });

    this.centrifuge.on('error', (ctx) => {
      this.ngZone.run(() => {
        console.error('WebSocket error:', ctx.error);
        this.connectionState.set(ConnectionState.ERROR);
        this.connectionState$.next(ConnectionState.ERROR);
      });
    });
  }

  /**
   * Auto-resubscribe all active subscriptions when connection is restored
   */
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

  /**
   * Mark all subscriptions as inactive when disconnected
   */
  private markAllSubscriptionsInactive(): void {
    for (const info of this.activeSubscriptions.values()) {
      info.isActive = false;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnection(): void {
    this.stopReconnectAttempts();

    const attempts = this.reconnectAttempts();
    if (attempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, attempts),
      this.maxReconnectDelay
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);

    this.reconnectTimeoutId = setTimeout(() => {
      this.ngZone.run(() => {
        this.reconnectAttempts.update(a => a + 1);

        if (this.centrifuge && !this.isConnected()) {
          console.log('Attempting reconnection...');
          try {
            this.centrifuge.connect();
          } catch (error) {
            console.error('Reconnection attempt failed:', error);
            this.scheduleReconnection();
          }
        }
      });
    }, delay);
  }

  /**
   * Start health check
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckIntervalId = setInterval(() => {
      if (this.centrifuge && this.isConnected()) {
        console.log('Connection health check passed');
        // Optional: Check subscription health
        this.checkSubscriptionHealth();
      }
    }, 30000);
  }

  /**
   * Check health of all tracked subscriptions
   */
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

  /**
   * Stop health check
   */
  private stopHealthCheck(): void {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
  }

  /**
   * Stop reconnection attempts
   */
  private stopReconnectAttempts(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  /**
   * Monitor network status
   */
  private setupConnectionMonitoring(): void {
    window.addEventListener('online', () => {
      this.ngZone.run(() => {
        if (this.centrifuge && !this.isConnected()) {
          console.log('Network online, attempting reconnection...');
          this.reconnectAttempts.set(0);
          this.centrifuge.connect();
        }
      });
    });

    window.addEventListener('offline', () => {
      this.ngZone.run(() => {
        console.log('Network offline');
        this.connectionState.set(ConnectionState.DISCONNECTED);
        this.connectionState$.next(ConnectionState.DISCONNECTED);
        this.stopHealthCheck();
      });
    });
  }

  /**
   * Get subscription state
   */
  public getSubscriptionState(sub: CentrifugeSubscription): string {
    return sub.state;
  }

  /**
   * Check if subscription is recovering
   */
  public isSubscriptionRecovering(sub: CentrifugeSubscription): boolean {
    return sub.state === 'subscribing' &&
      (sub as any).recovering === true;
  }

  /**
   * Force reconnection
   */
  public forceReconnect(): void {
    if (this.centrifuge) {
      console.log('Manual reconnection triggered');
      this.stopReconnectAttempts();
      this.reconnectAttempts.set(0);
      this.disconnect();

      setTimeout(() => {
        if (this.centrifuge) {
          this.centrifuge.connect();
        }
      }, 100);
    }
  }

  /**
   * Disconnect and clean up all subscriptions
   */
  public disconnect(): void {
    this.stopReconnectAttempts();
    this.stopHealthCheck();

    // Close all subscriptions first
    this.closeAllSubscriptions();

    // Disconnect Centrifuge
    if (this.centrifuge) {
      try {
        this.centrifuge.disconnect();
      } catch (error) {
        console.warn('Error during disconnect:', error);
      }
    }
  }

  /**
   * Cleanup
   */
  ngOnDestroy(): void {
    this.disconnect();
    window.removeEventListener('online', () => {});
    window.removeEventListener('offline', () => {});
  }
}
