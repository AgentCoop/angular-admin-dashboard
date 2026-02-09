import {BaseWorkerState, Message, SharedWorkerMessageTypes} from '@core/communication/worker';

export interface rpcSubscribeParams {
  topic: string,
  centrifugoChannel: string,
  centrifugoToken: string
}
export const rpcSubscribeMethodName = 'subscribe';

export interface PubSubConfig {
  url: string;
  token?: string;
  getToken?: (ctx: any) => Promise<string>
}

export interface PubSubState extends BaseWorkerState { }
