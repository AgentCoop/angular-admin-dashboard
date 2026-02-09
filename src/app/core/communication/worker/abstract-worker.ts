import {v4 as uuid} from 'uuid';
import { Base64 } from 'js-base64';
import {
  BaseMessageTypes,
  Message,
  MessageFactory,
  BaseWorkerState,
  PortDescriptor,
  Port,
  RpcMethodHandler,
  RpcMethodDescriptor,
} from './worker.types';

/**
 * Abstract base class for all worker types (SharedWorker and DedicatedWorker).
 * Provides common functionality for state management, configuration, and messaging.
 *
 * @template C - Configuration type passed to the worker
 * @template S - State type that extends BaseWorkerState
 */
export abstract class AbstractWorker<C extends any, S extends BaseWorkerState = BaseWorkerState> {
  private rpcMethods: Map<string, RpcMethodDescriptor> = new Map();
  private rpcTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  private _state: S;

  /**
   * Map of all connected ports, keyed by connectionId.
   * - For SharedWorker: Multiple entries (one per tab connection)
   * - For DedicatedWorker: Single entry (the worker itself)
   */
  protected ports: Map<string, PortDescriptor> = new Map();

  protected workerUuid: string;

  /**
   * Provides read-only access to the worker's current state.
   */
  get state(): Readonly<S> {
    return this._state;
  }

  /**
   * Configuration object passed to the worker during initialization.
   */
  protected config: C;

  /**
   * Creates a new AbstractWorker instance.
   * Initializes state and decodes configuration from URL parameters.
   *
   * @throws {Error} If initialization fails
   */
  protected constructor() {
    this._state = this.getInitialState();
    this.workerUuid = uuid();

    // Initialize worker configuration from URL parameters
    const { config } = this.decodeUrlParams();
    this.config = config;
  }

  /**
   * Abstract method that derived classes must implement to provide initial state.
   * This ensures all worker implementations start with a valid initial state.
   */
  protected abstract getInitialState(): S;

  protected handleMessage(m: Message, sourcePort: Port, connectionId: string): void {
    switch (m.type) {
      case BaseMessageTypes.RPC_REQUEST:
        void this.handleRpcRequest(
          m as Message<typeof BaseMessageTypes.RPC_REQUEST>,
          connectionId,
          sourcePort
        ).catch(err => {
          console.error('Unhandled RPC handler error:', err);
        });

        break;

      default:
        console.warn('Unknown message type:', m.type);
        this.sendErrorMessage(`Unknown message type: ${m.type}`);
    }
  }

  /**
   * Handle incoming RPC request from a client.
   */
  private async handleRpcRequest(
    message: Message<typeof BaseMessageTypes.RPC_REQUEST>,
    connectionId: string,
    sourcePort: Worker | MessagePort
  ): Promise<void> {
    const { requestId, methodName, args } = message.payload;
    const startTime = Date.now();

    try {
      if (!requestId) {
        throw new Error('Missing requestId in RPC request');
      }

      if (!methodName) {
        throw new Error('Missing method name in RPC request');
      }

      const methodDescriptor = this.rpcMethods.get(methodName);
      if (!methodDescriptor) {
        throw new Error(`Unknown RPC method: ${methodName}`);
      }

      const controller = new AbortController();
      const { signal } = controller;

      const timeout = methodDescriptor.timeout ?? 30_000;

      // Timeout promise
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(
            new Error(
              `RPC method "${methodName}" timed out after ${timeout}ms`
            )
          );
        }, timeout);

        this.rpcTimeouts.set(requestId, timeoutId);
      });

      // Handler execution
      const handlerPromise = Promise.resolve(
        methodDescriptor.handler(args ?? {}, {
          connectionId,
          port: sourcePort,
          signal,
        })
      );

      // Race handler vs timeout
      const result = await Promise.race([
        handlerPromise,
        timeoutPromise
      ]);

      // success → cancel timeout
      clearTimeout(timeoutId!);

      const executionTime = Date.now() - startTime;

      this.sendRpcResult(sourcePort, requestId, result, executionTime);
      console.debug(
        `RPC request completed: ${methodName} in ${executionTime}ms`
      );

    } catch (error) {
      console.error(
        `RPC request failed: ${methodName}`,
        error
      );

      const message =
        error instanceof Error ? error.message : String(error);

      this.sendRpcError(sourcePort, requestId, message);
    } finally {
      // Always cleanup timeout map
      const timeoutId = this.rpcTimeouts.get(requestId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.rpcTimeouts.delete(requestId);
      }
    }
  }

  /**
   * Adds a new port to the worker's port map.
   *
   * @param connectionId - Unique identifier for this connection
   * @param port - The port or worker instance
   * @returns The created PortDescriptor
   * @throws {Error} If connectionId already exists
   */
  protected addPort(
    connectionId: string,
    port: MessagePort | Worker,
  ): PortDescriptor {
    if (this.ports.has(connectionId)) {
      throw new Error(`Connection ID "${connectionId}" already exists`);
    }

    const now = Date.now();
    const descriptor: PortDescriptor = {
      port,
      lastActive: now,
    };

    this.ports.set(connectionId, descriptor);

    console.log(`Port added: ${connectionId}, total connections: ${this.ports.size}`);

    return descriptor;
  }

  /**
   * Register an RPC method that can be called from client tabs.
   *
   * @param methodName - Unique name for the method
   * @param descriptor - Method handler and metadata
   * @returns This worker instance for chaining
   */
  protected registerRpcMethod<T = any, R = any>(
    methodName: string,
    descriptor: RpcMethodDescriptor<T, R> | RpcMethodHandler<T, R>
  ): this {
    const methodDescriptor = typeof descriptor === 'function'
      ? { handler: descriptor }
      : descriptor;

    if (this.rpcMethods.has(methodName)) {
      console.warn(`Overwriting existing RPC method: ${methodName}`);
    }

    this.rpcMethods.set(methodName, methodDescriptor as RpcMethodDescriptor);
    console.debug(`Registered RPC method: ${methodName}`);

    return this;
  }

  /**
   * Updates metadata for a specific port.
   *
   * @param connectionId - The connection identifier
   * @param updates - Partial PortDescriptor to merge (excluding the port reference)
   * @returns Updated PortDescriptor or undefined if not found
   */
  protected updatePortDescriptor(
    connectionId: string,
    updates: Partial<Omit<PortDescriptor, 'port'>>
  ): PortDescriptor | undefined {
    const descriptor = this.ports.get(connectionId);
    if (!descriptor) {
      console.warn(`Attempted to update non-existent connection: ${connectionId}`);
      return undefined;
    }

    const updatedDescriptor: PortDescriptor = {
      ...descriptor,
      ...updates,
      // Ensure port reference is never overwritten
      port: descriptor.port
    };

    this.ports.set(connectionId, updatedDescriptor);
    return updatedDescriptor;
  }

  /**
   * Decodes configuration parameters from the worker's URL query string.
   * Configuration is expected to be Base64-encoded JSON in the 'config' query parameter.
   *
   * @returns An object containing the decoded configuration
   * @example
   * // URL: worker.js?config=eyJ1cmwiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSJ9
   * // Decoded: { url: "https://api.example.com" }
   */
  private decodeUrlParams(): { config: C } {
    // Guard clause for non-browser environments (e.g., Node.js tests)
    if (typeof self === 'undefined') {
      console.warn('Worker running in non-browser environment, no config available');
      return { config: {} as C };
    }

    try {
      const url = new URL(self.location.href);
      const configParam = url.searchParams.get('config');

      if (!configParam) {
        console.info('No configuration found in URL parameters');
        return { config: {} as C };
      }

      // Decode URL-safe Base64 to JSON string
      const json = Base64.decode(configParam);
      const config = JSON.parse(json) as C;

      console.debug('Successfully decoded worker configuration:', config);
      return { config };

    } catch (error) {
      console.error('Failed to decode configuration from URL:', error);

      // Return empty config instead of null to avoid null checks
      return { config: {} as C };
    }
  }

  /**
   * Sends a successful RPC result back to the calling port.
   *
   * @param sourcePort     The Worker/MessagePort that initiated the request
   * @param requestId      Correlation id to match the original RPC request
   * @param result         Handler result payload (must be structured-cloneable)
   * @param executionTime  Total execution duration in ms (for metrics/monitoring)
   */
  private sendRpcResult(
    sourcePort: Worker | MessagePort,
    requestId: string,
    result: unknown,
    executionTime: number
  ): void {
    const message = MessageFactory.create(
      BaseMessageTypes.RPC_RESPONSE_RESULT,
      {
        requestId,
        result,
        executionTime,
      }
    );

    // Target only the originating port (not broadcast)
    this.targetMessage(sourcePort, message);
  }

  /**
   * Sends an RPC error back to the caller.
   *
   * @param sourcePort     The Worker/MessagePort that initiated the request
   * @param requestId      Correlation id to match the original RPC request
   * @param error          Human-readable error message

   */
  private sendRpcError(
    sourcePort: Worker | MessagePort,
    requestId: string,
    error: string,
  ): void {
    const message = MessageFactory.create(
      BaseMessageTypes.RPC_RESPONSE_ERROR,
      {
        requestId,
        error,
      }
    );

    this.targetMessage(sourcePort, message);
  }

  /**
   * Sends an error message through the worker's port.
   * Used for reporting errors to connected clients/tabs.
   *
   * @param message - The error message to send
   * @example
   * this.sendMessageError('Failed to process request');
   */
  protected sendErrorMessage(message: string): void {
    const errorMessage = MessageFactory.create(
      BaseMessageTypes.ERROR,
      { message }
    );
    this.sendMessage(errorMessage);
  }

  /**
   * Sends a message through the worker's communication ports.
   * Handles errors gracefully to prevent worker crashes.
   *
   * @param m - The message to send
   * @returns void
   * @throws {Error} Only logs errors, doesn't propagate them
   */
  protected sendMessage(m: Message): void {
    // Check if ports are available before attempting to send
    if (!this.ports.size) {
      console.warn('Attempted to send message but port is not initialized:', m.type);
      return;
    }

    if (m.metadata.broadcast !== undefined && !m.metadata.broadcast) {
      return;
    }

    this.ports.forEach(d => this.targetMessage(d.port, m));
  }

  protected targetMessage(port: Port, m: Message): void {
    try {
      port.postMessage(m);
    } catch (error) {
      // Log error but don't crash the worker
      console.error('Failed to send message through worker port:', {
        error,
        messageType: m.type,
        messagePayload: m.payload
      });
    }
  }

  /**
   * Updates the worker's state and notifies all connected clients of the change.
   * Supports both direct object updates and functional updates based on previous state.
   *
   * @template K - Type of the state keys being updated
   * @param updates - Either partial state object or function that returns partial state
   * @example
   * // Direct update
   * this.updateState({ isConnected: true });
   *
   * // Functional update
   * this.updateState((prev) => ({
   *   messageCount: prev.messageCount + 1
   * }));
   */
  protected updateState<K extends keyof S>(
    updates: Pick<S, K> | ((prev: S) => Pick<S, K>)
  ): void {
    // Calculate new state based on update type
    const partialUpdate = typeof updates === 'function'
      ? updates(this._state)  // Compute update from previous state
      : updates;              // Use provided object directly

    // Create new state with updates and timestamp
    const newState: S = {
      ...this._state,
      ...partialUpdate,
      lastUpdate: Date.now()  // Always update timestamp on state change
    };

    // Update internal state reference
    this._state = newState;

    // Notify all connected clients of state change
    const stateMessage = MessageFactory.create(
      BaseMessageTypes.WORKER_STATE,
      { state: newState }
    );

    this.sendMessage(stateMessage);
  }

  /**
   * Called when the worker is being terminated.
   * Derived classes can override to clean up resources.
   */
  protected onTerminate(): void {
    console.log('Worker terminating, cleaning up resources...');
  }
}
