// worker-provider.ts
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '@env/environment';

@Injectable({ providedIn: 'root' })
export class WorkerProvider {
  private worker: SharedWorker | null = null;
  private readonly workerId: string;
  private readonly isSupported: boolean;

  constructor(@Inject(PLATFORM_ID) private platformId: any) {
    this.workerId = `worker_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    this.isSupported = this.checkWorkerSupport();
  }

  private checkWorkerSupport(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    return typeof SharedWorker !== 'undefined';
  }

  createWorker(): SharedWorker {
    if (!this.isSupported) {
      throw new Error('SharedWorker is not supported in this environment');
    }

    if (this.worker) {
      return this.worker;
    }

    try {
      const workerUrl = this.getWorkerUrl();
      console.log(`Creating SharedWorker from: ${workerUrl}`);

      this.worker = new SharedWorker(workerUrl, {
        name: 'angular-desktop-ui',
        type: 'module'
      });

      return this.worker;
    } catch (error) {
      console.error('Failed to create SharedWorker:', error);
      throw error;
    }
  }

  private getWorkerUrl(): string {
    if (environment.production) {
      // Production: Use hashed bundle file
      const baseUrl = window.location.origin;
      return `${baseUrl}/assets/workers/shared-worker.js?v=${environment.version || '1.0.0'}`;
    } else {
      // Development: Use relative path
      return '/assets/workers/shared-worker.js';
    }
  }

  getWorker(): SharedWorker | null {
    return this.worker;
  }

  destroyWorker(): void {
    if (this.worker) {
      try {
        this.worker.port.close();
      } catch (error) {
        console.warn('Error closing worker port:', error);
      }
      this.worker = null;
    }
  }

  isWorkerSupported(): boolean {
    return this.isSupported;
  }

  getWorkerId(): string {
    return this.workerId;
  }
}
