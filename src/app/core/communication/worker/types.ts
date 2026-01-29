
// types.ts
export enum WorkerMessageType {
  WORKER_CONNECTED = 'WORKER_CONNECTED',
  BROADCAST = 'BROADCAST',
  PING = 'PING',
  PONG = 'PONG',
  TAB_INFO = 'TAB_INFO',
  TAB_CLOSED = 'TAB_CLOSED',
  SYNC_DATA = 'SYNC_DATA'
}

export interface BaseWorkerMessage {
  type: WorkerMessageType;
  timestamp: number;
  workerId?: string;
}

export interface WorkerConnectedMessage extends BaseWorkerMessage {
  type: WorkerMessageType.WORKER_CONNECTED;
  workerId: string;
}

export interface PingMessage extends BaseWorkerMessage {
  type: WorkerMessageType.PING;
}

export interface PongMessage extends BaseWorkerMessage {
  type: WorkerMessageType.PONG;
}

export interface TabInfoMessage extends BaseWorkerMessage {
  type: WorkerMessageType.TAB_INFO;
  tabId: string;
}

export interface BroadcastMessage<T = any> extends BaseWorkerMessage {
  type: WorkerMessageType.BROADCAST;
  payload: T;
  target?: string; // Optional specific tab ID
}

export interface SyncDataMessage<T = any> extends BaseWorkerMessage {
  type: WorkerMessageType.SYNC_DATA;
  key: string;
  value: T;
}

export type WorkerMessage =
  | WorkerConnectedMessage
  | PingMessage
  | PongMessage
  | TabInfoMessage
  | BroadcastMessage
  | SyncDataMessage;
