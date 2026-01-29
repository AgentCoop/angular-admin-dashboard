// types.ts
export enum WorkerMessageType {
  // Connection Management
  WORKER_CONNECTED = 'WORKER_CONNECTED',
  TAB_REGISTER = 'TAB_REGISTER',
  TAB_UNREGISTER = 'TAB_UNREGISTER',
  TAB_HEARTBEAT = 'TAB_HEARTBEAT',
  TAB_VISIBILITY = 'TAB_VISIBILITY',

  // Communication
  BROADCAST = 'BROADCAST',
  TARGETED_MESSAGE = 'TARGETED_MESSAGE',
  REQUEST = 'REQUEST',
  RESPONSE = 'RESPONSE',

  // State Management
  STATE_UPDATE = 'STATE_UPDATE',
  STATE_REQUEST = 'STATE_REQUEST',
  STATE_RESPONSE = 'STATE_RESPONSE',

  // System
  PING = 'PING',
  PONG = 'PONG',
  ERROR = 'ERROR',

  // Sync
  SYNC_DATA = 'SYNC_DATA',
  SYNC_REQUEST = 'SYNC_REQUEST'
}

export enum WorkerMessageDirection {
  TO_WORKER = 'TO_WORKER',
  FROM_WORKER = 'FROM_WORKER'
}

export interface BaseWorkerMessage {
  type: WorkerMessageType;
  timestamp: number;
  direction: WorkerMessageDirection;
  correlationId?: string;
  metadata?: Record<string, any>;
  tabId: string;
}

export interface ConnectionMessage extends BaseWorkerMessage {
  type: WorkerMessageType.WORKER_CONNECTED;
  workerId: string;
  connectedTabs: number;
}

export interface TabRegisterMessage extends BaseWorkerMessage {
  type: WorkerMessageType.TAB_REGISTER;
  tabInfo: TabInfo;
}

export interface TabUnregisterMessage extends BaseWorkerMessage {
  type: WorkerMessageType.TAB_UNREGISTER;
}

export interface TabHeartbeatMessage extends BaseWorkerMessage {
  type: WorkerMessageType.TAB_HEARTBEAT;
  isActive: boolean;
}

export interface TabVisibilityMessage extends BaseWorkerMessage {
  type: WorkerMessageType.TAB_VISIBILITY;
  isVisible: boolean;
}

export interface BroadcastMessage<T = any> extends BaseWorkerMessage {
  type: WorkerMessageType.BROADCAST;
  payload: T;
  sender?: string;
  target?: string; // Optional specific tab ID
  options?: BroadcastOptions;
}

export interface TargetedMessage<T = any> extends BaseWorkerMessage {
  type: WorkerMessageType.TARGETED_MESSAGE;
  payload: T;
  targetTabId: string;
  sender?: string;
}

export interface RequestMessage<T = any> extends BaseWorkerMessage {
  type: WorkerMessageType.REQUEST;
  payload: T;
  responseType?: string;
  timeout?: number;
}

export interface ResponseMessage<T = any> extends BaseWorkerMessage {
  type: WorkerMessageType.RESPONSE;
  payload: T;
  requestId?: string;
  success: boolean;
  error?: string;
}

export interface SyncDataMessage<T = any> extends BaseWorkerMessage {
  type: WorkerMessageType.SYNC_DATA;
  key: string;
  value: T;
  operation?: 'set' | 'update' | 'delete';
}

export interface PingMessage extends BaseWorkerMessage {
  type: WorkerMessageType.PING;
}

export interface PongMessage extends BaseWorkerMessage {
  type: WorkerMessageType.PONG;
}

export interface ErrorMessage extends BaseWorkerMessage {
  type: WorkerMessageType.ERROR;
  error: string;
  code?: string;
  originalMessage?: BaseWorkerMessage;
}

// Union type for all messages
export type WorkerMessage =
  | ConnectionMessage
  | TabRegisterMessage
  | TabUnregisterMessage
  | TabHeartbeatMessage
  | TabVisibilityMessage
  | BroadcastMessage
  | TargetedMessage
  | RequestMessage
  | ResponseMessage
  | SyncDataMessage
  | PingMessage
  | PongMessage
  | ErrorMessage;

// Supporting interfaces
export interface TabInfo {
  id: string;
  url?: string;
  title?: string;
  userAgent?: string;
  lastActive: number;
  isActive: boolean;
  metadata?: Record<string, any>;
}

export interface BroadcastOptions {
  excludeSelf?: boolean;
  ttl?: number;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  requireAck?: boolean;
}

export interface ConnectionStatus {
  isConnected: boolean;
  workerId?: string;
  connectedTabs: number;
  lastMessageTime?: number;
  latency?: number;
}

export interface WorkerConfig {
  heartbeatInterval?: number;
  maxInactivityTime?: number;
  enableLogging?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}
