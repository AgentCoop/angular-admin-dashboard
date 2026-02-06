import {BaseWorkerState} from '@core/communication/worker';

export interface rpcSubscribeParams {
  topic: string,
  centrifugoChannel: string,
  centrifugoToken: string
}

export const rpcSubscribeMethod = 'subscribe';

export interface PubSubState extends BaseWorkerState { }
