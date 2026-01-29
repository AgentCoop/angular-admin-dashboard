// shared-worker.service.ts
import { Injectable, OnDestroy, NgZone, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Observable,
  Subject,
  BehaviorSubject,
  fromEvent,
  merge,
  timer,
  Subscription,
  EMPTY
} from 'rxjs';
import {
  filter,
  map,
  tap,
  takeUntil,
  share,
  catchError,
  timeout,
  distinctUntilChanged,
  debounceTime
} from 'rxjs/operators';
import { WorkerProvider } from './worker-provider';
import {
  WorkerMessage,
  WorkerMessageType,
  WorkerMessageDirection,
  ConnectionStatus,
  BroadcastOptions,
  TabInfo
} from './types';

@Injectable({ providedIn: 'root' })
export class SharedWorkerService implements OnDestroy {
  private worker: SharedWorker | null = null;
  private destroy$ = new Subject<void>();
  private messageSubject = new Subject<WorkerMessage>();
  private connectionSubject = new BehaviorSubject<ConnectionStatus>({
    isConnected: false,
    connectedTabs: 1
  });

  private tabId: string;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private pendingRequests = new Map<string, Subject<any>>();
  private heartbeatSubscription?: Subscription;

  // Cache for lazy initialization
  private _messages$: Observable<WorkerMessage> | null = null;
  private _connection$: Observable<ConnectionStatus> | null = null;

  // Public observables
  public tabCount$ = new BehaviorSubject<number>(1);
  public readonly messages$: Observable<WorkerMessage>;
  public readonly connection$: Observable<ConnectionStatus>;

  constructor(
    private workerProvider: WorkerProvider,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: any
  ) {
    // Use getters for lazy initialization
    this.messages$ = this.getMessagesObservable();
    this.connection$ = this.getConnectionObservable();

    if (isPlatformBrowser(this.platformId)) {
      this.tabId = this.generateTabId();
      this.initialize();
    } else {
      console.warn('SharedWorkerService: Running in non-browser environment');
      this.tabId = 'server-tab';
      //
    }
  }

  private initialize(): void {
    this.setupWorker();
    this.setupTabCommunication();
    this.setupMessageHandlers();
    this.startHeartbeat();
    this.setupAutoReconnect();
  }

  private getMessagesObservable(): Observable<WorkerMessage> {
    if (!this._messages$) {
      this._messages$ = this.messageSubject.pipe(
        share(),
        catchError(error => {
          console.error('Error in message stream:', error);
          return EMPTY;
        })
      );
    }
    return this._messages$;
  }

  private getConnectionObservable(): Observable<ConnectionStatus> {
    if (!this._connection$) {
      this._connection$ = this.connectionSubject.pipe(
        distinctUntilChanged((a, b) =>
          a.isConnected === b.isConnected &&
          a.connectedTabs === b.connectedTabs
        ),
        debounceTime(100),
        share()
      );
    }
    return this._connection$;
  }

  private generateTabId(): string {
    // Generate persistent tab ID
    const storageKey = 'angular_worker_tab_id';
    let tabId = sessionStorage.getItem(storageKey);

    if (!tabId) {
      tabId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      sessionStorage.setItem(storageKey, tabId);
    }

    return tabId;
  }

  private setupWorker(): void {
    try {
      this.worker = this.workerProvider.createWorker();

      this.ngZone.runOutsideAngular(() => {
        const message$ = fromEvent<MessageEvent>(this.worker!.port, 'message');
        const error$ = fromEvent<ErrorEvent>(this.worker!.port, 'messageerror');
        const close$ = fromEvent<CloseEvent>(this.worker!.port, 'close');

        merge(message$, error$, close$)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (event) => {
              this.ngZone.run(() => {
                if (event instanceof MessageEvent) {
                  this.handleWorkerMessage(event.data);
                } else if (event instanceof ErrorEvent) {
                  this.handleWorkerError(event);
                } else {
                  this.handleWorkerClose();
                }
              });
            },
            error: (error) => {
              this.ngZone.run(() => this.handleConnectionError(error));
            }
          });
      });

      this.worker.port.start();
      this.updateConnectionStatus(true);

      // Register tab with worker
      this.sendTabRegister();

    } catch (error) {
      console.error('Failed to setup SharedWorker:', error);
      this.handleConnectionError(error as Error);
    }
  }

  private sendTabRegister(): void {
    const tabInfo: TabInfo = {
      id: this.tabId,
      url: window.location.href,
      title: document.title,
      userAgent: navigator.userAgent,
      lastActive: Date.now(),
      isActive: true,
      metadata: {
        angular: true,
        timestamp: Date.now()
      }
    };

    // this.postMessage({
    //   type: WorkerMessageType.TAB_REGISTER,
    //   tabId: this.tabId,
    //   //tabInfo,
    //   //direction: WorkerMessageDirection.TO_WORKER,
    //   //timestamp: Date.now()
    // });
  }

  private setupTabCommunication(): void {
    // Visibility changes
    const handleVisibilityChange = () => {
      // this.postMessage({
      //   type: WorkerMessageType.TAB_VISIBILITY,
      //   tabId: this.tabId,
      //   //isVisible: document.visibilityState === 'visible',
      //   //direction: WorkerMessageDirection.TO_WORKER,
      //   //timestamp: Date.now()
      // });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Page focus/blur
    const handleFocusChange = () => {
      // this.postMessage({
      //   type: WorkerMessageType.TAB_HEARTBEAT,
      //   tabId: this.tabId,
      //   //isActive: document.hasFocus(),
      //   //direction: WorkerMessageDirection.TO_WORKER,
      //   //timestamp: Date.now()
      // });
    };

    window.addEventListener('focus', handleFocusChange);
    window.addEventListener('blur', handleFocusChange);

    // Cleanup
    this.destroy$.subscribe(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocusChange);
      window.removeEventListener('blur', handleFocusChange);
    });
  }

  private setupMessageHandlers(): void {
    // Handle connection messages
    this.messages$.pipe(
      filter(msg => msg.type === WorkerMessageType.WORKER_CONNECTED),
      takeUntil(this.destroy$)
    ).subscribe((msg) => {
      this.reconnectAttempts = 0;
      this.updateConnectionStatus(true, msg.workerId);
    });

    // Handle tab count updates
    // this.messages$.pipe(
    //   filter(msg => msg.type === 'TAB_COUNT_UPDATE'),
    //   takeUntil(this.destroy$)
    // ).subscribe((msg: any) => {
    //   this.tabCount$.next(msg.count);
    //   this.updateConnectionStatus(
    //     this.connectionSubject.value.isConnected,
    //     this.connectionSubject.value.workerId,
    //     msg.count
    //   );
    // });

    // Handle responses to pending requests
    this.messages$.pipe(
      filter(msg => msg.type === WorkerMessageType.RESPONSE && !!msg.correlationId),
      takeUntil(this.destroy$)
    ).subscribe((msg: any) => {
      const requestId = msg.correlationId;
      const responseSubject = this.pendingRequests.get(requestId);

      if (responseSubject) {
        if (msg.success) {
          responseSubject.next(msg.payload);
          responseSubject.complete();
        } else {
          responseSubject.error(new Error(msg.error || 'Request failed'));
        }
        this.pendingRequests.delete(requestId);
      }
    });

    // Handle broadcast messages
    // this.messages$.pipe(
    //   filter(msg => msg.type === WorkerMessageType.BROADCAST),
    //   takeUntil(this.destroy$)
    // ).subscribe((msg: any) => {
    //   // Emit to application
    //   this.messageSubject.next(msg);
    // });
  }

  private startHeartbeat(): void {
    // Send heartbeat every 30 seconds
    this.heartbeatSubscription = timer(0, 30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.connectionSubject.value.isConnected) {
          // this.postMessage({
          //   type: WorkerMessageType.PING,
          //   tabId: this.tabId,
          //   //direction: WorkerMessageDirection.TO_WORKER,
          //   //timestamp: Date.now()
          // });
        }
      });
  }

  private setupAutoReconnect(): void {
    this.connection$.pipe(
      filter(status => !status.isConnected),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.scheduleReconnection();
    });
  }

  private handleWorkerMessage(data: any): void {
    if (!data || !data.type) {
      console.warn('Invalid worker message:', data);
      return;
    }

    const message: WorkerMessage = {
      ...data,
      direction: WorkerMessageDirection.FROM_WORKER
    };

    switch (message.type) {
      case WorkerMessageType.WORKER_CONNECTED:
        console.log('Connected to SharedWorker:', (message as any).workerId);
        this.updateConnectionStatus(true, (message as any).workerId);
        break;

      case WorkerMessageType.PING:
        break;

      case WorkerMessageType.PONG:
        // Update latency
        const latency = Date.now() - message.timestamp;
        this.updateConnectionStatus(
          this.connectionSubject.value.isConnected,
          this.connectionSubject.value.workerId,
          this.connectionSubject.value.connectedTabs,
          latency
        );
        break;

      case WorkerMessageType.ERROR:
        console.error('Worker reported error:', (message as any).error);
        break;

      default:
        this.messageSubject.next(message);
    }
  }

  private handleWorkerError(event: ErrorEvent): void {
    console.error('Worker communication error:', event);
    this.updateConnectionStatus(false);
  }

  private handleWorkerClose(): void {
    console.log('Worker connection closed');
    this.updateConnectionStatus(false);
  }

  private handleConnectionError(error: Error): void {
    console.error('Worker connection error:', error);
    this.updateConnectionStatus(false);

    if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

      setTimeout(() => {
        this.setupWorker();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  private scheduleReconnection(): void {
    if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      setTimeout(() => {
        if (!this.connectionSubject.value.isConnected) {
          console.log('Attempting to reconnect to SharedWorker...');
          this.setupWorker();
        }
      }, 5000);
    }
  }

  private updateConnectionStatus(
    isConnected: boolean,
    workerId?: string,
    connectedTabs?: number,
    latency?: number
  ): void {
    const current = this.connectionSubject.value;
    const newStatus: ConnectionStatus = {
      isConnected,
      workerId: workerId || current.workerId,
      connectedTabs: connectedTabs || current.connectedTabs,
      lastMessageTime: Date.now(),
      latency: latency || current.latency
    };

    this.connectionSubject.next(newStatus);
  }

  // ============ Public API ============

  public postMessage(message: WorkerMessage): void {
    if (!this.worker || !this.connectionSubject.value.isConnected) {
      console.warn('SharedWorker not connected, message queued:', message.type);
      // TODO: Implement message queue for reconnection
      return;
    }

    try {
      // Ensure all required properties are set
      const fullMessage: WorkerMessage = {
        ...message,
        direction: WorkerMessageDirection.TO_WORKER,
        timestamp: Date.now(),
      };

      this.worker.port.postMessage(fullMessage);
    } catch (error) {
      console.error('Failed to post message to SharedWorker:', error);
      this.updateConnectionStatus(false);
    }
  }

  public broadcast<T>(payload: T, options?: BroadcastOptions): void {
    this.postMessage({
      type: WorkerMessageType.BROADCAST,
      payload,
      tabId: this.tabId,
      options,
      direction: WorkerMessageDirection.TO_WORKER,
      timestamp: Date.now(),
    });
  }

  public sendToTab<T>(targetTabId: string, payload: T): void {
    // this.postMessage({
    //   type: WorkerMessageType.TARGETED_MESSAGE,
    //   //targetTabId,
    //   //payload,
    //   tabId: this.tabId
    // });
  }

  public request<T = any, R = any>(
    type: string,
    payload?: T,
    timeoutMs: number = 10000
  ): Observable<R> {
    const correlationId = `${this.tabId}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    return new Observable<R>(subscriber => {
      const responseSubject = new Subject<R>();
      this.pendingRequests.set(correlationId, responseSubject);

      // Set timeout
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(correlationId)) {
          subscriber.error(new Error(`Request timeout after ${timeoutMs}ms`));
          this.pendingRequests.delete(correlationId);
        }
      }, timeoutMs);

      // Send request
      //this.postMessage({
      //   type: WorkerMessageType.REQUEST,
      //   //payload: { type, data: payload },
      //   correlationId,
      //   tabId: this.tabId
      //});

      // Subscribe to response
      const subscription = responseSubject.subscribe({
        next: (response) => subscriber.next(response),
        error: (error) => subscriber.error(error),
        complete: () => subscriber.complete()
      });

      // Cleanup
      return () => {
        clearTimeout(timeoutId);
        subscription.unsubscribe();
        this.pendingRequests.delete(correlationId);
      };
    });
  }

  public syncData<T>(key: string, value: T): void {
    // this.postMessage({
    //   type: WorkerMessageType.SYNC_DATA,
    //   //key,
    //   //value,
    //   tabId: this.tabId
    // });
  }

  public on<T>(messageType: WorkerMessageType | string): Observable<WorkerMessage & { payload: T }> {
    return this.messages$.pipe(
      filter(msg => msg.type === messageType),
      map(msg => msg as WorkerMessage & { payload: T })
    );
  }

  public getTabId(): string {
    return this.tabId;
  }

  public getConnectionStatus(): ConnectionStatus {
    return this.connectionSubject.value;
  }

  public reconnect(): void {
    if (this.worker) {
      this.workerProvider.destroyWorker();
      this.worker = null;
    }
    this.reconnectAttempts = 0;
    this.setupWorker();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Unregister tab
    if (this.connectionSubject.value.isConnected) {
      // this.postMessage({
      //   type: WorkerMessageType.TAB_UNREGISTER,
      //   tabId: this.tabId
      // });
    }

    // Cleanup
    if (this.heartbeatSubscription) {
      this.heartbeatSubscription.unsubscribe();
    }

    this.workerProvider.destroyWorker();
    this.tabCount$.complete();
    this.connectionSubject.complete();
    this.messageSubject.complete();

    // Cleanup pending requests
    this.pendingRequests.forEach(subject => {
      subject.error(new Error('Service destroyed'));
      subject.complete();
    });
    this.pendingRequests.clear();
  }
}
