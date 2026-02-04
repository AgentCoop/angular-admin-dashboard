import { NetworkMonitor, NetworkStatus } from '../network-monitor.interface';
import {
  Observable,
  BehaviorSubject,
  fromEvent,
  merge,
  startWith,
  map,
  distinctUntilChanged,
  shareReplay,
  Subscription,
  filter,
  EMPTY
} from 'rxjs';

export class WindowNetworkMonitor implements NetworkMonitor {
  private statusSubject: BehaviorSubject<NetworkStatus> | undefined;
  private statusChanges$: Observable<NetworkStatus>;
  private subscriptions = new Subscription();
  private monitoringState = false;

  constructor() {
    // Create the status observable from window events
    // (but don't initialize subject yet - wait for startMonitoring)
    this.statusChanges$ = merge(
      fromEvent(window, 'online').pipe(map(() => true)),
      fromEvent(window, 'offline').pipe(map(() => false))
    ).pipe(
      startWith(navigator.onLine),
      distinctUntilChanged(),
      map((isOnline): NetworkStatus => ({
        isOnline,
        timestamp: new Date()
      })),
      shareReplay(1)
    );
  }

  startMonitoring(): void {
    if (this.monitoringState) return;

    this.monitoringState = true;

    const initialStatus: NetworkStatus = {
      isOnline: navigator.onLine,
      timestamp: new Date()
    };
    this.statusSubject = new BehaviorSubject<NetworkStatus>(initialStatus);

    // Subscribe to status changes and forward to subject
    const statusSubscription = this.statusChanges$.subscribe({
      next: (status) => {
        this.statusSubject?.next(status);
      },
      error: (error) => {
        console.error('Error in network status stream:', error);
      }
    });

    this.subscriptions.add(statusSubscription);
  }

  stopMonitoring(): void {
    if (!this.monitoringState) return;

    this.monitoringState = false;

    // Complete the BehaviorSubject
    if (this.statusSubject) {
      this.statusSubject.complete();
      this.statusSubject = undefined;
    }

    // Unsubscribe from all subscriptions
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription(); // Reset for potential restart
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
