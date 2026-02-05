// shared-worker-shared-worker.service.ts
import {Inject, Injectable, NgZone, OnDestroy, PLATFORM_ID} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {v4 as uuid} from 'uuid';
import {BehaviorSubject, EMPTY, fromEvent, merge, Observable, Subject, Subscription, timer} from 'rxjs';
import {catchError, debounceTime, distinctUntilChanged, filter, map, share, takeUntil} from 'rxjs/operators';
import {SharedWorkerProvider} from './shared-worker.provider';
import {
  BaseMessageTypes,
  Message,
  ConnectionStatus, MessageFactory,
  WorkerMessageDirection, BroadcastOptions, MessageMetadata,
} from './types';

@Injectable({ providedIn: 'root' })
export class SharedWorkerService implements OnDestroy {
  private worker: SharedWorker | null = null;
  private destroy$ = new Subject<void>();
  private messageSubject = new Subject<Message>();
  private connectionSubject = new BehaviorSubject<ConnectionStatus>({
    isConnected: false,
    connectedTabs: 1
  });

  private readonly tabId: string;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private heartbeatSubscription?: Subscription;

  // Cache for lazy initialization
  private _messages$: Observable<Message> | null = null;
  private _connection$: Observable<ConnectionStatus> | null = null;

  // Public observables
  public tabCount$ = new BehaviorSubject<number>(1);
  public readonly messages$: Observable<Message>;
  public readonly connection$: Observable<ConnectionStatus>;

  constructor(
    private workerProvider: SharedWorkerProvider,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: any
  ) {
    // Use getters for lazy initialization
    this.messages$ = this.getMessagesObservable();
    this.connection$ = this.getConnectionObservable();

    if (isPlatformBrowser(this.platformId)) {
      this.tabId = uuid();
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
    this.setupUnloadHandler();
  }

  private getMessagesObservable(): Observable<Message> {
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

  private setupWorker(): void {
    try {
      this.worker = this.workerProvider.createWorker('pubsub-worker', {
        'url': 'ws://localhost:8005/connection/websocket?format=json'
      });

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

      // Register tab with shared-worker
      this.sendTabRegister();

    } catch (error) {
      console.error('Failed to setup SharedWorker:', error);
      this.handleConnectionError(error as Error);
    }
  }

  private sendTabRegister(): void {
    const registerTabMessage = MessageFactory.create(BaseMessageTypes.TAB_REGISTER,
      {
        tabId: this.tabId,
        url: window.location.href
      });

    this.postMessage(registerTabMessage);
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
      filter(msg => msg.type === BaseMessageTypes.WORKER_CONNECTED),
      takeUntil(this.destroy$)
    ).subscribe((msg) => {
      this.reconnectAttempts = 0;
      //this.updateConnectionStatus(true, msg?.workerId);
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

  private setupUnloadHandler(): void {
    // Handle tab/window close
    const handleBeforeUnload = () => {
      this.unregisterTab();
    };

    // Use both beforeunload and pagehide for better coverage
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    // Cleanup - though this won't really fire since tab is closing
    this.destroy$.subscribe(() => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    });
  }

  private unregisterTab(): void {
    if (this.connectionSubject.value.isConnected) {
      try {
        // Send immediate unregister message
        const unregisterMessage = MessageFactory.create(BaseMessageTypes.TAB_UNREGISTER,
          {
            tabId: this.tabId,
          });

        this.postMessage(unregisterMessage);
      } catch (error) {
        console.warn('Failed to send unregister message:', error);
      }
    }
  }

  private handleWorkerMessage(m: Message): void {
    if (!m || !m.type) {
      console.warn('Invalid shared-worker message:', m);
      return;
    }

    const { metadata: { timestamp } } = m;
    console.log('worker message %o', m);

    switch (m.type) {
      case BaseMessageTypes.WORKER_CONNECTED:
        console.log('Connected to SharedWorker:', (m as any).workerId);
        this.updateConnectionStatus(true, (m as any).workerId);
        break;

      case BaseMessageTypes.PING:
        break;

      case BaseMessageTypes.PONG:
        // Update latency
        const latency = Date.now() - timestamp;
        this.updateConnectionStatus(
          this.connectionSubject.value.isConnected,
          this.connectionSubject.value.workerId,
          this.connectionSubject.value.connectedTabs,
          latency
        );
        break;

      case BaseMessageTypes.ERROR:
        console.error('Worker reported error:', (m as any).error);
        break;

      default:
        this.messageSubject.next(m);
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
        //this.setupWorker();
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
          //this.setupWorker();
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

  public sendData(key: string, value: any, options: { broadcast?: boolean } = {}) {
    const m = MessageFactory.create(BaseMessageTypes.TAB_DATA, {
      key, value
    });

    this.postMessage(m, options);
  }

  public postMessage(m: Message, options: { broadcast?: boolean } = {}): void {
    if (!this.worker || !this.connectionSubject.value.isConnected) {
      console.warn('SharedWorker not connected, message queued:', m.type);
      // TODO: Implement message queue for reconnection
      return;
    }

    try {
      // Create the enhanced message with proper metadata
      const fullMessage: Message = {
        ...m,
        metadata: {
          ...m.metadata,
          direction: WorkerMessageDirection.TO_WORKER,
          timestamp: m.metadata?.timestamp ?? Date.now(),
          tabId: this.tabId,
          broadcast: options.broadcast ?? false,
        }
      };

      this.worker.port.postMessage(fullMessage);
    } catch (error) {
      console.error('Failed to post message to SharedWorker:', error);
      this.updateConnectionStatus(false);
    }
  }

  public broadcast(data: any, options: BroadcastOptions = {}): void {
    const broadcastMessage = MessageFactory.create(
      BaseMessageTypes.BROADCAST,
      {
        ...options,
        data: data,
      }
    );

    this.postMessage(broadcastMessage);
  }

  public on<T>(messageType: string): Observable<T> {
    return this.messages$.pipe(
      filter(msg => msg.type === messageType),
      map(msg => msg.payload as T)
    );
  }

  public onAppData<T>(key: string): Observable<{ data: T; meta: MessageMetadata }> {
    return this.messages$.pipe(
      filter((msg): msg is Message<typeof BaseMessageTypes.TAB_DATA> =>
        msg.type === BaseMessageTypes.TAB_DATA
      ),
      filter(msg => msg.payload.key === key),
      map(msg => ({
        data: msg.payload.value as T,
        meta: msg.metadata
      }))
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
      //this.workerProvider.destroyWorker();
      this.worker = null;
    }
    this.reconnectAttempts = 0;
    //this.setupWorker();
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

    //this.workerProvider.destroyWorker();
    this.tabCount$.complete();
    this.connectionSubject.complete();
    this.messageSubject.complete();
  }
}
