
// network-monitor/index.ts
export type { NetworkMonitor, NetworkStatus } from './network-monitor.interface';

export { WorkerNetworkMonitor } from '@core/communication/network-monitor/worker-network-monitor/worker-network-monitor';
export { WindowNetworkMonitor } from './window-network-monitor/window-network-monitor';

export { NetworkMonitorFactory } from './network-monitor.factory';
