// types.ts


export interface ExtendedMessagePort extends MessagePort {
  tabId: string;
  lastHeartbeat?: number;
  lastActive: number;
  isActive?: boolean;
}

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
  tabId?: string;
}

export interface ConnectionMessage extends BaseWorkerMessage {
  type: WorkerMessageType.WORKER_CONNECTED;
  workerId: string;
}

export interface TabRegisterMessage extends BaseWorkerMessage {
  type: WorkerMessageType.TAB_REGISTER;
  url: string;
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
  /**
   * Message type identifier for data synchronization operations.
   * Used by the Shared Worker to route messages to the appropriate handler.
   */
  type: WorkerMessageType.SYNC_DATA;

  /**
   * Unique key identifying the data being synchronized.
   * This acts as a storage identifier within the Shared Worker's data map.
   * Example: 'userPreferences', 'shoppingCart', 'sessionToken'
   */
  key: string;

  /**
   * The data value to be synchronized across all connected tabs.
   * Can be any serializable JavaScript type (object, array, primitive).
   * Generic type <T> allows for type-safe usage in TypeScript.
   *
   * @example
   * // String value
   * { key: 'theme', value: 'dark' }
   */
  value: T;

  /**
   * Optional operation type defining how the data should be processed.
   * Controls how the Shared Worker handles the incoming data.
   *
   * @default 'set' - Overwrites existing value with the new value
   *
   * @example 'set' - Replace entire value
   * { key: 'cart', value: newCart, operation: 'set' }
   *
   * @example 'update' - Merge/update partial data (useful for objects)
   * { key: 'userProfile', value: { avatar: 'new.jpg' }, operation: 'update' }
   * // Results in: { ...existingProfile, avatar: 'new.jpg' }
   *
   * @example 'delete' - Remove the key from shared-worker storage
   * { key: 'tempData', operation: 'delete' }
   * // Note: 'value' is ignored for delete operations
   */
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
  | ErrorMessage
;

export type OutgoingMessage = Omit<WorkerMessage, 'direction' | 'timestamp' | 'tabId'>;

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
