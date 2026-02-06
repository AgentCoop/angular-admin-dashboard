// dedicated-worker-base.ts

import { BaseMessageTypes, Message, MessageFactory, BaseWorkerState } from './worker.types';
import {AbstractWorker} from './abstract-worker';

declare const self: DedicatedWorkerGlobalScope;

export abstract class DedicatedWorkerBase<C extends any, S extends BaseWorkerState = BaseWorkerState>
  extends AbstractWorker<C, S> {

  protected connections: Map<string, Worker> = new Map();
  protected workerType: 'dedicated' = 'dedicated';

  protected declare readonly self: DedicatedWorkerGlobalScope;

  protected constructor() {
    super();
  }
}
