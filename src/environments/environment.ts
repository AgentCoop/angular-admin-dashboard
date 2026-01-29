// src/environments/environment.ts
import { Environment, baseEnvironment } from './environment.base';

export const environment: Environment = {
  ...baseEnvironment,
  production: false,
  version: `${baseEnvironment.version}-dev-${Date.now()}`,
  apiUrl: 'http://localhost:3000/api',
  workerUrl: '/assets/workers/shared-worker.js',

  logLevel: 'debug',

  features: {
    ...baseEnvironment.features,
    enableWorker: true,
    enableAnalytics: false,
    enableDebugTools: true
  },

  workerConfig: {
    ...baseEnvironment.workerConfig,
    heartbeatInterval: 30000,
    maxReconnectAttempts: 3,
    enableLogging: true
  }
};
