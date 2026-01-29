// src/environments/environment.base.ts
export interface Environment {
  production: boolean;
  version: string;
  apiUrl: string;
  workerUrl?: string;
  enableWorker?: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  features: {
    enableWorker: boolean;
    enableAnalytics: boolean;
    enableDebugTools: boolean;
  };
  workerConfig: {
    heartbeatInterval: number;
    maxReconnectAttempts: number;
    reconnectDelay: number;
    enableLogging: boolean;
  };
}

// Default/base configuration
export const baseEnvironment: Environment = {
  production: false,
  version: '1.0.0',
  apiUrl: 'http://localhost:3000/api',
  logLevel: 'debug',
  features: {
    enableWorker: true,
    enableAnalytics: false,
    enableDebugTools: true
  },
  workerConfig: {
    heartbeatInterval: 30000, // 30 seconds
    maxReconnectAttempts: 5,
    reconnectDelay: 1000,
    enableLogging: true
  }
};
