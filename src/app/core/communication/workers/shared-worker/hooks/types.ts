// hooks/types.ts

export enum HookType {
  BEFORE_BROADCAST = 'BEFORE_BROADCAST',
  AFTER_BROADCAST = 'AFTER_BROADCAST',
  ON_CONNECT = 'ON_CONNECT',
  ON_DISCONNECT = 'ON_DISCONNECT',
  ON_SYNC_DATA = 'ON_SYNC_DATA',
  ON_TAB_REGISTER = 'ON_TAB_REGISTER',
  ON_TAB_UNREGISTER = 'ON_TAB_UNREGISTER'
}

export enum ExecutionStrategy {
  ALL_TABS = 'ALL_TABS',          // Execute on all tabs
  SINGLE_OLDEST_TAB = 'OLDEST_TAB',      // Execute on a tab with the oldest timestamp
  SINGLE_NEWEST_TAB = 'NEWEST_TAB',      // Execute on a tab with the newest timestamp
  SINGLE_RANDOM = 'RANDOM',              // Execute on a random tab
  SINGLE_SPECIFIC_TAB = 'SPECIFIC_TAB'   // Execute on specific tab
}

export interface HookDescriptor {
  type: HookType;
  strategy: ExecutionStrategy;
}

export interface HookHandler {
  (data: any): Promise<HookResult> | HookResult;
}

export interface HookResult {
  success: boolean;
  shouldContinue: boolean;
  data?: any;
  error?: string;
}

export interface RegisteredHook {
  id: string;
  descriptor: HookDescriptor;
  registeredBy: string;           // tabId that registered the hook
  timestamp: number;
}
