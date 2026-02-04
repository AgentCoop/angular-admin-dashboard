// network-monitor.interface.ts
import { Observable } from 'rxjs';

export interface NetworkStatus {
  /** Whether the network is currently online */
  isOnline: boolean;

  /** When this network status was recorded */
  timestamp: Date;
}

export interface NetworkMonitor {
  /**
   * Start monitoring network connectivity status.
   * Begins listening to browser online/offline events.
   */
  startMonitoring(): void;

  /**
   * Stop monitoring network connectivity status.
   * Cleans up event listeners and subscriptions.
   */
  stopMonitoring(): void;

  /**
   * Get the current network status synchronously.
   * @returns Current network status including online state and timestamp
   */
  getCurrentStatus(): NetworkStatus;

  /**
   * Get an observable stream of network status changes.
   * Emits a new value whenever network connectivity changes.
   * @returns Observable that emits NetworkStatus objects
   */
  getStatus$(): Observable<NetworkStatus>;

  /**
   * Check if monitoring is currently active.
   * @returns true if monitoring is started, false if stopped
   */
  isMonitoring(): boolean;

  /**
   * Get observable that emits only when network becomes online.
   * Filters out offline states and duplicate online states.
   * @returns Observable that emits only when network transitions to online
   */
  getOnline$(): Observable<NetworkStatus>;

  /**
   * Get observable that emits only when network becomes offline.
   * Filters out online states and duplicate offline states.
   * @returns Observable that emits only when network transitions to offline
   */
  getOffline$(): Observable<NetworkStatus>;
}
