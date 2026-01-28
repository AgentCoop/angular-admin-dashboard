// shared-worker.ts
/// <reference lib="webworker" />
import { WorkerMessage, WorkerMessageType } from './types';

declare const self: SharedWorkerGlobalScope;

interface ExtendedMessagePort extends MessagePort {
  tabId?: string;
}

const ports: Set<ExtendedMessagePort> = new Set();
let workerId = Math.random().toString(36).substring(2, 11);
let sharedData = new Map<string, any>();

// Handle new connections
self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0] as ExtendedMessagePort;
  ports.add(port);

  console.log(`[SharedWorker] New connection. Total: ${ports.size}`);

  port.onmessage = (e: MessageEvent<WorkerMessage>) => {
    if (e.data) {
      handleMessage(e.data, port);
    }
  };

  port.start();

  // Send welcome message
  port.postMessage({
    type: WorkerMessageType.WORKER_CONNECTED,
    workerId,
    timestamp: Date.now()
  });

  // Send current shared data to new connection
  if (sharedData.size > 0) {
    sharedData.forEach((value, key) => {
      port.postMessage({
        type: WorkerMessageType.SYNC_DATA,
        key,
        value,
        timestamp: Date.now()
      });
    });
  }
};

function handleMessage(data: WorkerMessage, sourcePort: ExtendedMessagePort): void {
  switch (data.type) {
    case WorkerMessageType.BROADCAST:
      broadcastMessage(data, sourcePort);
      break;

    case WorkerMessageType.PING:
      sendPong(sourcePort);
      break;

    case WorkerMessageType.TAB_INFO:
      updateTabInfo(data.tabId, sourcePort);
      break;

    case WorkerMessageType.SYNC_DATA:
      syncSharedData(data.key, data.value);
      broadcastSyncData(data.key, data.value, sourcePort);
      break;
  }
}

function broadcastMessage(message: WorkerMessage, sourcePort: ExtendedMessagePort): void {
  ports.forEach(port => {
    if (port !== sourcePort) {
      port.postMessage(message);
    }
  });
}

function sendPong(port: ExtendedMessagePort): void {
  port.postMessage({
    type: WorkerMessageType.PONG,
    timestamp: Date.now()
  });
}

function updateTabInfo(tabId: string | undefined, port: ExtendedMessagePort): void {
  if (tabId) {
    port.tabId = tabId;
    console.log(`[SharedWorker] Tab registered: ${tabId}`);
  }
}

function syncSharedData(key: string, value: any): void {
  sharedData.set(key, value);
}

function broadcastSyncData(key: string, value: any, sourcePort: ExtendedMessagePort): void {
  const message: WorkerMessage = {
    type: WorkerMessageType.SYNC_DATA,
    key,
    value,
    timestamp: Date.now()
  };

  ports.forEach(port => {
    if (port !== sourcePort) {
      port.postMessage(message);
    }
  });
}

// Clean up disconnected ports
setInterval(() => {
  ports.forEach(port => {
    try {
      port.postMessage({
        type: WorkerMessageType.PING,
        timestamp: Date.now()
      });
    } catch {
      ports.delete(port);
      console.log(`[SharedWorker] Port disconnected. Remaining: ${ports.size}`);
    }
  });
}, 30000);
