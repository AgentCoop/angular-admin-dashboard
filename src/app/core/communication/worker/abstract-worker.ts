import {
  BaseMessageTypes,
  Message,
  MessageFactory,
  BaseWorkerState, PortDescriptor
} from './worker.types';
import { Base64 } from 'js-base64';

/**
 * Abstract base class for all worker types (SharedWorker and DedicatedWorker).
 * Provides common functionality for state management, configuration, and messaging.
 *
 * @template C - Configuration type passed to the worker
 * @template S - State type that extends BaseWorkerState
 */
export abstract class AbstractWorker<C extends any, S extends BaseWorkerState = BaseWorkerState> {
  private _state: S;

  /**
   * Map of all connected ports, keyed by connectionId.
   * - For SharedWorker: Multiple entries (one per tab connection)
   * - For DedicatedWorker: Single entry (the worker itself)
   */
  protected ports: Map<string, PortDescriptor> = new Map();

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

    // Initialize worker configuration from URL parameters
    const { config } = this.decodeUrlParams();
    this.config = config;
  }

  /**
   * Abstract method that derived classes must implement to provide initial state.
   * This ensures all worker implementations start with a valid initial state.
   */
  protected abstract getInitialState(): S;

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

    try {
      this.ports.forEach(d => d.port.postMessage(m));
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
