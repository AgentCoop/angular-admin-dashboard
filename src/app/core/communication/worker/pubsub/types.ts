import {BaseWorkerState} from '@core/communication/worker';


export const PubSubMessageTypes = {
  // Subscription management
  SUBSCRIBE: 'SUBSCRIBE',
  UNSUBSCRIBE: 'UNSUBSCRIBE',
} as const;

// Type for all base messages
export type PubSubMessageType = typeof PubSubMessageTypes[keyof typeof PubSubMessageTypes];

export interface PubSubMessagePayloads {
  [PubSubMessageTypes.SUBSCRIBE]: {
    channel: string;
  };
}

export interface PubSubState extends BaseWorkerState { }
