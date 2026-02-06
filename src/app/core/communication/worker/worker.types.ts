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
  RPC_RESPONSE_RESULT: 'RPC_RESPONSE_RESULT',
  RPC_RESPONSE_ERROR: 'RPC_RESPONSE_ERROR',

  // TAB_REGISTER: 'TAB_REGISTER',
  // TAB_UNREGISTER: 'TAB_UNREGISTER',
  // TAB_DATA: 'TAB_DATA',
  // TAB_HEARTBEAT: 'TAB_HEARTBEAT',
  // TAB_VISIBILITY: 'TAB_VISIBILITY',

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
    args: any;
    requestId: string;
    timeout?: number;
  };

  [BaseMessageTypes.RPC_RESPONSE_RESULT]: {
    requestId: string;
    result: any;
    executionTime: number;
  };

  [BaseMessageTypes.RPC_RESPONSE_ERROR]: {
    requestId: string;
    error: string;
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
  upstreamChannel?: string;
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

// RPC method handler type
export type RpcMethodHandler<T = unknown, R = unknown> = (
  args: T,
  context: {
    connectionId: string;
    port: MessagePort | Worker;

    /**
     * AbortSignal triggered when:
     *  - RPC timeout occurs
     *  - caller disconnects
     *  - worker cancels the request
     *
     * Handlers MUST listen to this to stop long-running work.
     */
    signal: AbortSignal;
  }
) => Promise<R> | R;

// RPC method descriptor
export interface RpcMethodDescriptor<T = any, R = any> {
  handler: RpcMethodHandler<T, R>;
  timeout?: number;
}

export interface ConnectionStatus {
  isConnected: boolean;
  workerId?: string;
  connectedTabs: number;
  lastMessageTime?: number;
  latency?: number;
}
