// worker-proxy.service.ts
import {Inject, Injectable, NgZone, OnDestroy, PLATFORM_ID} from '@angular/core';
import {Observable, Subject, fromEvent, takeUntil, Subscription} from 'rxjs';
import {mergeWith, share, filter} from 'rxjs/operators';
import {
  ServiceHandle,
  WorkerType,
  AnyWorker,
  ExtendedMessagePort,
  Message,
  MessageFactory,
  BaseMessageTypes,
  InvokeOptions,
  DEFAULT_INVOKE_OPTIONS, SharedWorkerMessageTypes,
  MessageMetadata, TabSyncDataOp, WorkerMessageDirection,
} from './worker.types';
import {environment} from '@env/environment';
import {Base64} from 'js-base64';
import {isPlatformBrowser} from '@angular/common';
import {v4 as uuid} from 'uuid';

@Injectable({
  providedIn: 'root'
})
export class WorkerProxyService implements OnDestroy {
  private workers = new Map<string, Worker>();
  private sharedWorkers = new Map<string, SharedWorker>();
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void,
    reject: (reason: any) => void
  }>();

  private tabSyncDataSubject = new Subject<{
    key: string;
    value: any;
    op: 'add' | 'remove' | 'update';
    metadata: MessageMetadata;
  }>();
  private tabSyncDataSubscriptions = new Map<string, Observable<any>>();
  private tabSyncDataObservable$ = this.tabSyncDataSubject.asObservable();

  private heartbeatSubscription?: Subscription;

  private destroy$ = new Subject<void>();
  private readonly tabId: string;

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.workers.forEach(worker => worker.terminate());
    this.sharedWorkers.forEach(worker => worker.port.close());
    this.pendingRequests.clear();

    this.tabSyncDataSubject.complete();
    this.tabSyncDataSubscriptions.clear();
  }

  constructor(
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: any
  ) {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('WorkerProxyService: running in non-browser environment');
    }

    this.tabId = uuid();

    this.setupUnloadHandler();
  }

  /**
   * Check if SharedWorker is supported in the current browser
   */
  isSharedWorkerSupported(): boolean {
    return typeof SharedWorker !== 'undefined';
  }

  /**
   * Check if Web Workers are supported in the current browser
   */
  isWorkerSupported(): boolean {
    return typeof Worker !== 'undefined';
  }

  /**
   * Check if any type of worker is available
   */
  isAnyWorkerAvailable(): boolean {
    return this.isWorkerSupported() || this.isSharedWorkerSupported();
  }

  /**
   * Check if a specific worker type is available
   */
  isWorkerTypeAvailable(type: WorkerType): boolean {
    if (type === 'shared') {
      return this.isSharedWorkerSupported();
    } else {
      return this.isWorkerSupported();
    }
  }

  /**
   * Get the base URL for the worker script based on worker name
   */
  private getWorkerBaseUrl(workerName: string): string {
    // Default path: assets/js/<workerName>.js
    const fileName = `${workerName}.js`;
    const basePath = `/assets/js/${fileName}`;

    if (environment.production) {
      // Production: Use absolute URL with version
      const baseUrl = window.location.origin;
      return `${baseUrl}${basePath}`;
    } else {
      // Development: Use relative path
      return basePath;
    }
  }

  /**
   * Build worker URL with base64-encoded config and worker name
   */
  private buildWorkerUrl(basename: string, config?: any): string {
    const baseUrl = this.getWorkerBaseUrl(basename);

    if (!config) {
      return baseUrl;
    }

    try {
      // Convert config to JSON and encode with URL-safe base64
      const configJson = JSON.stringify(config);
      const encodedConfig = Base64.encodeURI(configJson);

      // Add config and worker name as query parameters
      const url = new URL(baseUrl, window.location.origin);

      // Add config parameter
      url.searchParams.set('config', encodedConfig);

      // Add timestamp for cache busting in development
      // if (!environment.production) {
      //   url.searchParams.set('t', Date.now().toString());
      // }

      // Add version for cache busting in production
      if (environment.production && environment.version) {
        url.searchParams.set('v', environment.version);
      }

      return url.toString();

    } catch (error) {
      console.warn('Failed to encode config, using base URL only:', error);
      return baseUrl;
    }
  }

  private subscribeToEvents(
    handle: ServiceHandle,
    message$: Observable<MessageEvent>,
    error$: Observable<ErrorEvent>,
    close$: Observable<CloseEvent>
  ): void {
    message$
      .pipe(
        mergeWith(error$, close$),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (event) => {
          this.ngZone.run(() => {
            if (event instanceof MessageEvent) {
              this.handleWorkerMessage(event.data);
            } else if (event instanceof ErrorEvent) {
              this.handleWorkerError(handle, event);
            } else {
              this.handleWorkerClose(handle);
            }
          });
        },
        error: (error) => {
          this.ngZone.run(() => this.handleConnectionError(handle, error));
        }
      });
  }

  private handleWorkerError(handle: ServiceHandle, event: ErrorEvent): void {
    console.error('Worker communication error:', event);
    //this.updateConnectionStatus(false);
  }

  private handleWorkerClose(handle: ServiceHandle): void {
    console.log('Worker connection closed');
    //this.updateConnectionStatus(false);
  }

  private handleConnectionError(handle: ServiceHandle, error: Error): void {
    console.error('Worker connection error:', error);
  }

  private setupSharedWorker(handle: ServiceHandle, worker: SharedWorker): void {
    // Register worker
    this.sharedWorkers.set(handle, worker);

    this.ngZone.runOutsideAngular(() => {
      const message$ = fromEvent<MessageEvent>(worker.port, 'message');
      const error$ = fromEvent<ErrorEvent>(worker.port, 'messageerror');
      const close$ = fromEvent<CloseEvent>(worker.port, 'close');

      this.subscribeToEvents(handle, message$, error$, close$);
    });

    worker.port.start();

    // Register tab
    const registerTabMessage = MessageFactory.create(SharedWorkerMessageTypes.TAB_REGISTER,
      {
        url: window.location.href
      });
    this.sendMessage(worker.port, registerTabMessage);
  }

  private setupDedicatedWorker(handle: ServiceHandle, worker: Worker): void {
    // Register
    this.workers.set(handle, worker);

    this.ngZone.runOutsideAngular(() => {
      const message$ = fromEvent<MessageEvent>(worker, 'message');
      const error$ = fromEvent<ErrorEvent>(worker, 'error');
      const close$ = fromEvent<CloseEvent>(worker, 'close');

      this.subscribeToEvents(handle, message$, error$, close$);
    });
  }

  /*
    * Create and register a dedicated worker by name
  */
  createDedicatedWorker(name: string, config?: any): ServiceHandle {
    const handle = uuid();

    // Build worker URL with config encoded in base64
    const workerUrl = this.buildWorkerUrl(name, config);

    console.log(`Creating Worker "${handle}" from: ${workerUrl}`);

    const worker = new Worker(workerUrl, {
      name: `dedicated-${name}`,
      type: 'module'
    });

    this.setupDedicatedWorker(handle, worker);

    return handle;
  }

  /*
    * Create and register a shared worker by name
  */
  createSharedWorker(name: string, config?: any): ServiceHandle {
    const handle = uuid();

    // Build worker URL with config encoded in base64
    const workerUrl = this.buildWorkerUrl(name, config);

    console.log(`Creating SharedWorker "${handle}" from: ${workerUrl}`);

    const worker = new SharedWorker(workerUrl, {
      name: `shared-${name}`,
      type: 'module'
    });

    this.setupSharedWorker(handle, worker);

    return handle;
  }

  private handleWorkerMessage(m: Message) {
    switch (m.type) {
      case SharedWorkerMessageTypes.TAB_SYNC_DATA:
        this.handleTabDataSync(m as Message<typeof SharedWorkerMessageTypes.TAB_SYNC_DATA>);
        break;


      case BaseMessageTypes.RPC_RESPONSE:
        this.handleRpcResponse(m as Message<typeof BaseMessageTypes.RPC_RESPONSE>);
        break;

      default:

    }
  }

  private handleTabDataSync(m: Message<typeof SharedWorkerMessageTypes.TAB_SYNC_DATA>) {
    const { key, value, op } = m.payload;

    this.tabSyncDataSubject.next({key, metadata: m.metadata, op, value});
  }

  private handleRpcResponse(m: Message<typeof BaseMessageTypes.RPC_RESPONSE>) {
    const { requestId, result, error } = m.payload;
    const pendingRequest = this.pendingRequests.get(requestId!);

    if (pendingRequest) {
      if (error) {
        pendingRequest.reject(new Error(error));
      } else {
        pendingRequest.resolve(result);
      }
      this.pendingRequests.delete(requestId);
    }
  }

  private setupUnloadHandler(): void {
    // Handle tab/window close
    const handleBeforeUnload = () => {
      this.sendUnregisterTab();
    };

    // Use both beforeunload and pagehide for better coverage
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
  }

  private sendUnregisterTab(): void {
    this.sharedWorkers.forEach(worker => {
      try {
        // Send immediate unregister message
        const unregisterMessage = MessageFactory.create(SharedWorkerMessageTypes.TAB_UNREGISTER,
          {
            tabId: this.tabId,
          });
        worker.port.postMessage(unregisterMessage);
      } catch (error) {
        console.warn('Failed to send unregister message:', error);
      }
    });
  }

  private sendMessage(port: MessagePort | Worker, m: Message): void {
    port.postMessage({
      ...m,
      metadata: {
        ...m.metadata,
        tabId: this.tabId,
      },
    });
  }

  // Public API
  //

  public getTabId(): string {
    return this.tabId;
  }

  /**
   * Generic worker creation with availability checks
   */
  createWorker(name: string, type: WorkerType, config?: any): ServiceHandle {
    // Check if requested worker type is available
    if (!this.isWorkerTypeAvailable(type)) {
      const errorMessage = type === 'shared'
        ? 'SharedWorker API not supported in this browser'
        : 'Web Worker API not supported in this browser';
      throw new Error(errorMessage);
    }

    if (type === 'shared') {
      return this.createSharedWorker(name, config);
    } else {
      return this.createDedicatedWorker(name, config);
    }
  }

  /**
   * Terminate a worker
   */
  terminateWorker(handle: string): void {
    const dedicatedWorker = this.workers.get(handle);
    if (dedicatedWorker) {
      dedicatedWorker.terminate();
      this.workers.delete(handle);
      return;
    }

    const sharedWorker = this.sharedWorkers.get(handle);
    if (sharedWorker) {
      sharedWorker.port.close();
      this.sharedWorkers.delete(handle);
    }
  }

  /**
   * Invoke a method on a worker service
   */
  invoke<T>(
    serviceHandle: string,
    methodName: string,
    data: any,
    options: InvokeOptions = {}
  ): Promise<T> {
    // Merge with defaults
    const opts = { ...DEFAULT_INVOKE_OPTIONS, ...options };

    return new Promise<T>((resolve, reject) => {
      const requestId = uuid();

      // Set up timeout
      let timeoutId: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        this.pendingRequests.delete(requestId);
      };

      // Set timeout
      timeoutId = setTimeout(() => {
        cleanup();
        opts.onTimeout(); // Call timeout callback
        reject(new Error(`Request timeout after ${opts.timeout}ms: ${methodName}`));
      }, opts.timeout);

      // Store the promise callbacks
      this.pendingRequests.set(requestId, {
        resolve: (result: T) => {
          cleanup();
          resolve(result);
        },
        reject: (error: Error) => {
          cleanup();
          reject(error);
        }
      });

      const message = MessageFactory.create(BaseMessageTypes.RPC_REQUEST, {
        requestId,
        methodName,
        data,
      });

      // Send to appropriate worker type
      try {
        const dedicatedWorker = this.workers.get(serviceHandle);
        if (dedicatedWorker) {
          this.sendMessage(dedicatedWorker, message);
          return;
        }

        const sharedWorker = this.sharedWorkers.get(serviceHandle);
        if (sharedWorker) {
          this.sendMessage(sharedWorker.port, message);
          return;
        }

        cleanup();
        reject(new Error(`Worker with handle "${serviceHandle}" not found`));

      } catch (error) {
        cleanup();
        reject(new Error(`Failed to send message: ${error}`));
      }
    });
  }

  /**
   * Synchronize tab data across all tabs via a shared worker.
   * This method sends a data synchronization message to a shared worker,
   * which then broadcasts it to all other connected tabs. This enables
   * real-time data sharing and consistency across multiple browser tabs.
   *
   * @param {ServiceHandle} handle - The unique identifier of the shared worker
   *                                obtained from createSharedWorker()
   * @param {string} key - The identifier for the data being synchronized.
   *                      Use dot notation for hierarchical data (e.g., 'user.profile.name')
   *                      Follow naming conventions: kebab-case or camelCase
   * @param {any} value - The data value to synchronize. Can be any JSON-serializable type.
   *                     For complex objects, ensure they can be properly serialized.
   * @param {TabSyncDataOp} op - The operation type indicating the change:
   *                            - 'add': Add new data (creates or overwrites)
   *                            - 'update': Update existing data (partial or full)
   *                            - 'remove': Remove data (sets to null or deletes)
   *
   * @throws {Error} If:
   *                 - The handle doesn't correspond to a valid shared worker
   *                 - The shared worker connection is closed or errored
   *                 - Message serialization fails (circular references, etc.)
   */
  syncTabData(handle: ServiceHandle, key: string, value: any, op: TabSyncDataOp): void {
    // Validate the shared worker exists before attempting to send data
    const sharedWorker = this.sharedWorkers.get(handle);

    if (!sharedWorker) {
      // Throw a descriptive error to help with debugging
      throw new Error(
        `Cannot sync tab data: No shared worker found with handle "${handle}".`
      );
    }

    // Validate the key is a non-empty string
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      throw new Error(
        `Invalid sync key: "${key}". ` +
        'Key must be a non-empty string. Use dot notation for hierarchical data.'
      );
    }

    try {
      const syncDataMsg = MessageFactory.create(SharedWorkerMessageTypes.TAB_SYNC_DATA, {
        key,
        value,
        op
      }, {
        tabId: this.tabId, // Include the sender's tab ID for context
      });

      // Send the message to the shared worker
      // The worker will broadcast it to all other connected tabs
      sharedWorker.port.postMessage(syncDataMsg);
    } catch (error) {
      // Handle serialization errors (e.g., circular references in value)
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to sync tab data for key "${key}": ${errorMessage}. ` +
        'Ensure the value is JSON-serializable (no circular references, functions, or Symbols).'
      );
    }
  }

  onTabSyncData<T extends any>(key: string): Observable<{
    value: T;
    op: 'add' | 'remove' | 'update';
    metadata: MessageMetadata;
  }> {
    // Create a cached observable for this key if it doesn't exist
    if (!this.tabSyncDataSubscriptions.has(key)) {
      const keyObservable$ = this.tabSyncDataObservable$.pipe(
        filter(data => data.key === key),
        share()
      );

      this.tabSyncDataSubscriptions.set(key, keyObservable$);
    }

    return this.tabSyncDataSubscriptions.get(key)!;
  }
}
