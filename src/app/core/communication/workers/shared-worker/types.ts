// types.ts

import {PubSubMessagePayloads, PubSubMessageTypes} from './pubsub/types';

export interface ExtendedMessagePort extends MessagePort {
  tabId: string;
  lastHeartbeat?: number;
  lastActive: number;
  isActive?: boolean;
}

export interface BaseWorkerState {
  tabsConnected: number;
}

export interface BroadcastOptions {
  channel?: string; // For any worker supporting pub/sub mechanism.
  exclude?: string[];
}

export const BaseMessageTypes = {
  // Connection Management
  WORKER_CONNECTED: 'WORKER_CONNECTED',
  WORKER_STATE: 'WORKER_STATE',
  TAB_REGISTER: 'TAB_REGISTER',
  TAB_UNREGISTER: 'TAB_UNREGISTER',
  TAB_DATA: 'TAB_DATA',
  TAB_HEARTBEAT: 'TAB_HEARTBEAT',
  TAB_VISIBILITY: 'TAB_VISIBILITY',

  // Communication
  BROADCAST: 'BROADCAST',


  // System
  PING: 'PING',
  PONG: 'PONG',
  ERROR: 'ERROR',
} as const;

// Type for all base messages
export type BaseMessageType = typeof BaseMessageTypes[keyof typeof BaseMessageTypes];

export const AllMessageTypes = {
  ...BaseMessageTypes,
  ...PubSubMessageTypes
} as const;

export type AllMessageTypes = typeof AllMessageTypes[keyof typeof AllMessageTypes]//keyof AllMessagePayloads;

export interface BaseMessagePayloads {
  [BaseMessageTypes.WORKER_CONNECTED]: {
    workerId: string;
    timestamp: number;
    capabilities: string[];
  };

  [BaseMessageTypes.WORKER_STATE]: {
    state: BaseWorkerState;
  };

  [BaseMessageTypes.TAB_REGISTER]: {
    tabId: string;
    url: string;
    userAgent?: string;
    sessionId?: string;
  };

  [BaseMessageTypes.TAB_UNREGISTER]: {
    tabId: string;
    reason?: 'closed' | 'navigated' | 'crashed';
  };

  [BaseMessageTypes.TAB_DATA]: {
    key: string;
    value: any;
  };

  [BaseMessageTypes.TAB_HEARTBEAT]: {
    tabId: string;
    timestamp: number;
    memoryUsage?: number;
  };

  [BaseMessageTypes.BROADCAST]: {
    data: any;
    channel?: string;
    exclude?: string[];
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

export type AllMessagePayloads =
  & BaseMessagePayloads
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
