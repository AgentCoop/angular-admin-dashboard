// dedicated-worker-base.ts

import { BaseWorkerState } from './worker.types';
import {AbstractWorker} from './abstract-worker';

declare const self: DedicatedWorkerGlobalScope;

export abstract class DedicatedWorkerBase<C extends any, S extends BaseWorkerState = BaseWorkerState>
  extends AbstractWorker<C, S> {

  protected declare readonly self: DedicatedWorkerGlobalScope;

  protected constructor() {
    super();
  }
}
