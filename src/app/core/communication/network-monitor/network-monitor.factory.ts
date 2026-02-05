import { WindowNetworkMonitor, WorkerNetworkMonitor, NetworkMonitor } from './index';

export class NetworkMonitorFactory {
  /**
   * Create appropriate network monitor based on context
   */
  static create(context: 'window' | 'worker'): NetworkMonitor {
    switch (context) {
      case 'window':
        return new WindowNetworkMonitor();
      case 'worker':
        return new WorkerNetworkMonitor();
      default:
        throw new Error(`Unknown context: ${context}`);
    }
  }

  /**
   * Auto-detect context and create appropriate monitor
   */
  static autoCreate(): NetworkMonitor {
    // Check if we're in a window context
    if (typeof window !== 'undefined') {
      return new WindowNetworkMonitor();
    } else {
      // Assume worker context
      return new WorkerNetworkMonitor();
    }
  }
}
