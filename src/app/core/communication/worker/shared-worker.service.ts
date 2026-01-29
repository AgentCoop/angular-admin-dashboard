// shared-worker.service.ts
import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { Observable, Subject, BehaviorSubject, fromEvent, merge } from 'rxjs';
import { filter, map, tap, takeUntil, share } from 'rxjs/operators';
import { WorkerProvider } from './worker-provider';

export interface WorkerMessage {
  type: string;
  payload?: any;
  timestamp: number;
  tabId?: string;
}

@Injectable({ providedIn: 'root' })
export class SharedWorkerService implements OnDestroy {
  private worker: SharedWorker | null = null;
  private destroy$ = new Subject<void>();
  private messageSubject = new Subject<WorkerMessage>();
  private connectionSubject = new BehaviorSubject<boolean>(false);
  private tabId: string;

  private _messages$: Observable<WorkerMessage> | null = null;
  private _connection$: Observable<boolean> | null = null;
  public tabCount$ = new BehaviorSubject<number>(1);

  constructor(
    private workerProvider: WorkerProvider,
    private ngZone: NgZone
  ) {
    this.tabId = this.generateTabId();
    this.setupWorker();
    this.setupTabCommunication();
  }

  get messages$(): Observable<WorkerMessage> {
    if (!this._messages$) {
      this._messages$ = this.messageSubject.pipe(
        share()
      );
    }
    return this._messages$;
  }

  get connection$(): Observable<boolean> {
    if (!this._connection$) {
      this._connection$ = this.connectionSubject.asObservable();
    }
    return this._connection$;
  }

  private generateTabId(): string {
    // Generate unique tab ID
    return `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private setupWorker() {
    try {
      this.worker = this.workerProvider.createWorker();
      const worker = this.workerProvider.createWorker();
      this.worker = worker;

      this.ngZone.runOutsideAngular(() => {
        // Listen for messages from worker
        const message$ = fromEvent<MessageEvent>(worker.port, 'message');

        message$.pipe(
          takeUntil(this.destroy$)
        ).subscribe((event: MessageEvent) => {
          this.ngZone.run(() => {
            this.handleWorkerMessage(event.data);
          });
        });
      });

      this.worker.port.start();
      this.connectionSubject.next(true);

    } catch (error) {
      console.error('Failed to setup SharedWorker:', error);
      this.connectionSubject.next(false);
    }
  }

  private setupTabCommunication() {
    // Send tab info to worker
    this.postMessage({
      type: 'TAB_INFO',
      tabId: this.tabId,
      //url: window.location.href,
      //userAgent: navigator.userAgent
    });

    // Listen for visibility changes
    document.addEventListener('visibilitychange', () => {
      this.postMessage({
        type: 'TAB_VISIBILITY',
        tabId: this.tabId,
        //isVisible: document.visibilityState === 'visible'
      });
    });

    // Notify when tab closes
    window.addEventListener('beforeunload', () => {
      this.postMessage({
        type: 'TAB_CLOSING',
        tabId: this.tabId
      });
    });
  }

  private handleWorkerMessage(data: any) {
    switch (data.type) {
      case 'WORKER_CONNECTED':
        console.log('Connected to SharedWorker:', data.workerId);
        break;

      case 'TAB_COUNT_UPDATE':
        this.tabCount$.next(data.count);
        break;

      case 'PONG':
        // Keep-alive response
        break;

      default:
        this.messageSubject.next(data);
    }
  }

  postMessage(message: Omit<WorkerMessage, 'timestamp'>) {
    if (!this.worker || !this.connectionSubject.value) {
      console.warn('SharedWorker not connected');
      return;
    }

    const fullMessage: WorkerMessage = {
      ...message,
      timestamp: Date.now()
    };

    try {
      this.worker.port.postMessage(fullMessage);
    } catch (error) {
      console.error('Failed to post message to SharedWorker:', error);
    }
  }

  broadcast(message: any) {
    this.postMessage({
      type: 'BROADCAST',
      payload: message
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    // Notify worker about tab destruction
    this.postMessage({
      type: 'TAB_DESTROYED',
      tabId: this.tabId
    });

    this.workerProvider.destroyWorker();
  }
}
