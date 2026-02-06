// types.ts

import {PubSubMessagePayloads, PubSubMessageTypes} from './pubsub/types';


export type AnyWorker = Worker | SharedWorker;
export type WorkerType = 'dedicated' | 'shared';
export type ServiceHandle = string;

export interface ExtendedMessagePort extends MessagePort {
  tabId: string;
  lastHeartbeat?: number;
  lastActive: number;
  isActive?: boolean;
}

export interface PortDescriptor {
  tabId?: string;
  lastActive: number;
  port: MessagePort | Worker;
}

export interface InvokeOptions {
  timeout?: number;     // Timeout in milliseconds
  onTimeout?: () => void; // Callback on timeout
}

export const DEFAULT_INVOKE_OPTIONS: Required<InvokeOptions> = {
  timeout: 2000,        // Default 2 seconds
  onTimeout: () => {},
};

export interface BaseWorkerState {
  tabsConnected: number;
}

export interface BroadcastOptions {
  channel?: string; // For any worker supporting pub/sub mechanism.
  exclude?: string[];
}

export const BaseMessageTypes = {
  //
  WORKER_CONNECTED: 'WORKER_CONNECTED',
  WORKER_STATE: 'WORKER_STATE',

  RPC_REQUEST: 'RPC_REQUEST',
  RPC_RESPONSE: 'RPC_RESPONSE',

  TAB_REGISTER: 'TAB_REGISTER',
  TAB_UNREGISTER: 'TAB_UNREGISTER',
  TAB_DATA: 'TAB_DATA',
  TAB_HEARTBEAT: 'TAB_HEARTBEAT',
  TAB_VISIBILITY: 'TAB_VISIBILITY',

  // System
  PING: 'PING',
  PONG: 'PONG',
  ERROR: 'ERROR',
} as const;

// Type for all base messages
export type BaseMessageType = typeof BaseMessageTypes[keyof typeof BaseMessageTypes];

export const SharedWorkerMessageTypes = {
  TAB_REGISTER: 'TAB_REGISTER',
  TAB_UNREGISTER: 'TAB_UNREGISTER',
  TAB_SYNC_DATA: 'TAB_SYNC_DATA',
} as const;

export type SharedWorkerMessageType = typeof SharedWorkerMessageTypes[keyof typeof SharedWorkerMessageTypes];

export const AllMessageTypes = {
  ...BaseMessageTypes,
  ...SharedWorkerMessageTypes,
  ...PubSubMessageTypes
} as const;

export type AllMessageTypes = typeof AllMessageTypes[keyof typeof AllMessageTypes]//keyof AllMessagePayloads;

export interface BaseMessagePayloads {
  [BaseMessageTypes.WORKER_CONNECTED]: {
    workerId: string;
    timestamp: number;
    capabilities: string[];
  };

  [BaseMessageTypes.RPC_REQUEST]: {
    methodName: string;
    data: any;
    requestId: string;
    timeout?: number;
  };

  [BaseMessageTypes.RPC_RESPONSE]: {
    requestId: string;
    result?: any;
    error?: any;
  };

  [BaseMessageTypes.WORKER_STATE]: {
    state: BaseWorkerState;
  };

  [BaseMessageTypes.PING]: {
    nonce?: string;
  };

  [BaseMessageTypes.PONG]: {
    latency: number;
  };

  [BaseMessageTypes.ERROR]: {
    code?: string;
    message: string;
  };
}

export type TabSyncDataOp = 'add' | 'remove' | 'update';

export interface SharedWorkerMessagePayloads {
  [SharedWorkerMessageTypes.TAB_REGISTER]: {
    url: string;
    userAgent?: string;
    sessionId?: string;
  };

  [SharedWorkerMessageTypes.TAB_UNREGISTER]: {
    tabId: string;
    reason?: 'closed' | 'navigated' | 'crashed';
  };

  [SharedWorkerMessageTypes.TAB_SYNC_DATA]: {
    key: string;
    value: any;
    op: TabSyncDataOp;
  };
}

export type AllMessagePayloads =
  & BaseMessagePayloads
  & SharedWorkerMessagePayloads
  & PubSubMessagePayloads;

// Message definition
export interface Message<T extends AllMessageTypes = AllMessageTypes> {
  type: T;
  payload: T extends keyof AllMessagePayloads ? AllMessagePayloads[T] : any;
  metadata: MessageMetadata;
}

export enum WorkerMessageDirection {
  TO_WORKER = 'TO_WORKER',
  FROM_WORKER = 'FROM_WORKER'
}

export interface MessageMetadata {
  direction: WorkerMessageDirection;
  timestamp: number;
  tabId?: string;
  broadcasted?: boolean;
  broadcast?: boolean;
  correlationId?: string;
  error?: string;
  result?: any;
}

export class MessageFactory {
  private static getDefaultDirection(): WorkerMessageDirection {
    // Worker environments don't have window
    return typeof window === 'undefined'
      ? WorkerMessageDirection.FROM_WORKER
      : WorkerMessageDirection.TO_WORKER;
  }

  static create<T extends keyof AllMessagePayloads>(
    type: T,
    payload: T extends keyof AllMessagePayloads ? AllMessagePayloads[T] : any,
    metadata: Partial<MessageMetadata> = {}
  ): Message<T> {
    return {
      type,
      payload,
      metadata: {
        direction: metadata.direction ?? this.getDefaultDirection(),
        timestamp: metadata.timestamp ?? Date.now(),
      },
    };
  }
}

export interface ConnectionStatus {
  isConnected: boolean;
  workerId?: string;
  connectedTabs: number;
  lastMessageTime?: number;
  latency?: number;
}
