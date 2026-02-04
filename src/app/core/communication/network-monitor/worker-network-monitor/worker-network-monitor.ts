import { NetworkMonitor, NetworkStatus } from '../network-monitor.interface';
import {
  Observable,
  BehaviorSubject,
  interval,
  merge,
  startWith,
  map,
  distinctUntilChanged,
  shareReplay,
  Subscription,
  filter, EMPTY
} from 'rxjs';

export class WorkerNetworkMonitor implements NetworkMonitor {
  private statusSubject: BehaviorSubject<NetworkStatus> | undefined;
  private statusChanges$: Observable<NetworkStatus>;
  private subscriptions = new Subscription();
  private monitoringState = false;
  private externalPorts: MessagePort[] = [];
  private pollInterval = 2000; // 2 seconds

  constructor() {
    // Create status observable from polling and external messages
    this.statusChanges$ = merge(
      // Poll navigator.onLine periodically
      interval(this.pollInterval).pipe(
        startWith(0),
        map(() => navigator.onLine),
        distinctUntilChanged()
      ),
    ).pipe(
      map((isOnline): NetworkStatus => ({
        isOnline,
        timestamp: new Date()
      })),
      distinctUntilChanged((prev, curr) => prev.isOnline === curr.isOnline),
      shareReplay(1)
    );
  }

  /**
   * Broadcast status to all connected MessagePorts
   */
  private broadcastToExternalPorts(isOnline: boolean): void {
    this.externalPorts.forEach(port => {
      try {
        port.postMessage({
          type: 'NETWORK_STATUS',
          status: isOnline ? 'online' : 'offline'
        });
      } catch (error) {
        console.warn('Failed to broadcast network status to port:', error);
      }
    });
  }

  startMonitoring(): void {
    if (this.monitoringState) return;

    this.monitoringState = true;

    // Initial status
    const initialStatus: NetworkStatus = {
      isOnline: navigator.onLine,
      timestamp: new Date()
    };
    this.statusSubject = new BehaviorSubject<NetworkStatus>(initialStatus);

    // Subscribe to status changes
    const statusSubscription = this.statusChanges$.subscribe({
      next: (status) => {
        this.statusSubject?.next(status);
        this.broadcastToExternalPorts(status.isOnline);
      },
      error: (error) => {
        console.error('Error in shared network monitor:', error);
      }
    });

    this.subscriptions.add(statusSubscription);
  }

  stopMonitoring(): void {
    this.monitoringState = false;
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription(); // Reset for potential restart

    // Clear external ports
    this.externalPorts = [];

    if (this.statusSubject) {
      this.statusSubject.complete();
      this.statusSubject = undefined;
    }
  }

  /**
   * Add an external MessagePort for cross-context communication
   */
  addExternalPort(port: MessagePort): void {
    this.externalPorts.push(port);
  }

  /**
   * Remove an external MessagePort
   */
  removeExternalPort(port: MessagePort): void {
    const index = this.externalPorts.indexOf(port);
    if (index > -1) {
      this.externalPorts.splice(index, 1);
    }
  }

  getCurrentStatus(): NetworkStatus {
    if (!this.statusSubject) {
      // Return current navigator status when not monitoring
      return {
        isOnline: navigator.onLine,
        timestamp: new Date()
      };
    }
    return this.statusSubject.getValue();
  }

  getStatus$(): Observable<NetworkStatus> {
    if (!this.statusSubject) {
      return EMPTY;
    }
    return this.statusSubject.asObservable();
  }

  isMonitoring(): boolean {
    return this.monitoringState;
  }

  getOnline$(): Observable<NetworkStatus> {
    return this.getStatus$().pipe(
      filter(status => status.isOnline),
      distinctUntilChanged((prev, curr) => prev.isOnline === curr.isOnline)
    );
  }

  getOffline$(): Observable<NetworkStatus> {
    return this.getStatus$().pipe(
      filter(status => !status.isOnline),
      distinctUntilChanged((prev, curr) => prev.isOnline === curr.isOnline)
    );
  }
}
