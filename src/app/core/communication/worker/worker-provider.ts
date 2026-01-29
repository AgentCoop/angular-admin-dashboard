// worker-provider.ts
import { Injectable, NgZone } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WorkerProvider {
  private worker: SharedWorker | null = null;
  private readonly workerUrl = 'shared-worker.js';

  constructor(private ngZone: NgZone) {}

  createWorker(): SharedWorker {
    if (typeof SharedWorker === 'undefined') {
      throw new Error('SharedWorker not supported in this browser');
    }

    if (!this.worker) {
      this.worker = new SharedWorker(this.workerUrl);
      this.setupErrorHandling();
    }

    return this.worker;
  }

  private setupErrorHandling() {
    if (this.worker) {
      this.worker.addEventListener('error', (error) => {
        console.error('SharedWorker error:', error);
      });
    }
  }

  destroyWorker() {
    if (this.worker) {
      this.worker.port.close();
      this.worker = null;
    }
  }
}
