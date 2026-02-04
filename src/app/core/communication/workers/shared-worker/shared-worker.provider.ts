// shared-worker-provider.ts
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '@env/environment';
import { Base64 } from 'js-base64';
import { v4 as uuid } from 'uuid';

@Injectable({ providedIn: 'root' })
export class SharedWorkerProvider {
  private workers: Map<string, SharedWorker> = new Map();
  private readonly isSupported: boolean;

  constructor(@Inject(PLATFORM_ID) private platformId: any) {
    this.isSupported = this.checkWorkerSupport();
  }

  private checkWorkerSupport(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    return typeof SharedWorker !== 'undefined';
  }

  /**
   * Create a shared worker with custom name and configuration
   * @param basename - Name of the worker file (without .js extension)
   * @param config - Configuration object for the worker
   * @returns SharedWorker instance
   */
  createWorker(basename: string, config?: any): SharedWorker {
    if (!this.isSupported) {
      throw new Error('SharedWorker is not supported in this environment');
    }

    // Generate unique worker instance ID
    const workerId = `${basename}-${uuid().substring(0, 8)}`;

    // Check if worker with this instance already exists
    if (this.workers.has(workerId)) {
      console.log(`Worker instance "${workerId}" already exists, reusing...`);
      return this.workers.get(workerId)!;
    }

    try {
      // Build worker URL with config encoded in base64
      const workerUrl = this.buildWorkerUrl(basename, config);

      console.log(`Creating SharedWorker "${workerId}" from: ${workerUrl}`, {
        config,
        workerName: basename,
        instanceId: workerId
      });

      const worker = new SharedWorker(workerUrl, {
        name: basename,
        type: 'module'
      });

      // Store worker with instance ID
      this.workers.set(workerId, worker);
      return worker;
    } catch (error) {
      console.error(`Failed to create SharedWorker "${workerId}":`, error);
      throw error;
    }
  }

  /**
   * Build worker URL with base64-encoded config and worker name
   */
  private buildWorkerUrl(basename: string, config?: any): string {
    const baseUrl = this.getWorkerBaseUrl(basename);

    if (!config) {
      return baseUrl;
    }

    try {
      // Convert config to JSON and encode with URL-safe base64
      const configJson = JSON.stringify(config);
      const encodedConfig = Base64.encodeURI(configJson);

      // Add config and worker name as query parameters
      const url = new URL(baseUrl, window.location.origin);

      // Add config parameter
      url.searchParams.set('config', encodedConfig);

      // Add timestamp for cache busting in development
      // if (!environment.production) {
      //   url.searchParams.set('t', Date.now().toString());
      // }

      // Add version for cache busting in production
      if (environment.production && environment.version) {
        url.searchParams.set('v', environment.version);
      }

      return url.toString();

    } catch (error) {
      console.warn('Failed to encode config, using base URL only:', error);
      return baseUrl;
    }
  }

  /**
   * Get the base URL for the worker script based on worker name
   */
  private getWorkerBaseUrl(workerName: string): string {
    // Default path: assets/js/<workerName>.js
    const fileName = `${workerName}.js`;
    const basePath = `/assets/js/${fileName}`;

    if (environment.production) {
      // Production: Use absolute URL with version
      const baseUrl = window.location.origin;
      return `${baseUrl}${basePath}`;
    } else {
      // Development: Use relative path
      return basePath;
    }
  }

  /**
   * Get a worker by instance ID
   */
  getWorker(instanceId: string): SharedWorker | null {
    return this.workers.get(instanceId) || null;
  }

  /**
   * Get all workers of a specific type
   */
  getWorkersByType(workerName: string): SharedWorker[] {
    const workers: SharedWorker[] = [];

    for (const [instanceId, worker] of this.workers.entries()) {
      if (instanceId.startsWith(`${workerName}-`)) {
        workers.push(worker);
      }
    }

    return workers;
  }

  /**
   * Destroy a specific worker instance
   */
  destroyWorker(instanceId: string): void {
    const worker = this.workers.get(instanceId);
    if (worker) {
      try {
        worker.port.close();
        console.log(`Worker "${instanceId}" destroyed`);
      } catch (error) {
        console.warn(`Error closing worker "${instanceId}" port:`, error);
      }
      this.workers.delete(instanceId);
    }
  }

  /**
   * Destroy all workers of a specific type
   */
  destroyWorkersByType(workerName: string): void {
    const instancesToDestroy: string[] = [];

    for (const instanceId of this.workers.keys()) {
      if (instanceId.startsWith(`${workerName}-`)) {
        instancesToDestroy.push(instanceId);
      }
    }

    instancesToDestroy.forEach(instanceId => {
      this.destroyWorker(instanceId);
    });

    console.log(`Destroyed ${instancesToDestroy.length} workers of type "${workerName}"`);
  }

  /**
   * Destroy all workers
   */
  destroyAllWorkers(): void {
    const instanceIds = Array.from(this.workers.keys());

    instanceIds.forEach(instanceId => {
      this.destroyWorker(instanceId);
    });

    console.log(`Destroyed all ${instanceIds.length} workers`);
  }

  /**
   * Check if worker is supported
   */
  isWorkerSupported(): boolean {
    return this.isSupported;
  }

  /**
   * Get all worker instance IDs
   */
  getWorkerInstanceIds(): string[] {
    return Array.from(this.workers.keys());
  }

  /**
   * Get number of active workers
   */
  getWorkerCount(): number {
    return this.workers.size;
  }

  /**
   * Get number of workers by type
   */
  getWorkerCountByType(workerName: string): number {
    return this.getWorkersByType(workerName).length;
  }
}
