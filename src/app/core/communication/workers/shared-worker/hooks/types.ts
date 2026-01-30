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
  SINGLE_TAB = 'SINGLE_TAB',      // Execute on exactly one tab
  LEADER_ONLY = 'LEADER_ONLY',    // Execute only on leader tab
  SPECIFIC_TAB = 'SPECIFIC_TAB'   // Execute on specific tab
}

export enum LeaderSelection {
  OLDEST_TAB = 'OLDEST_TAB',      // Tab with oldest timestamp
  NEWEST_TAB = 'NEWEST_TAB',      // Tab with newest timestamp
  RANDOM = 'RANDOM',              // Random tab
  SPECIFIC_URL = 'SPECIFIC_URL',  // Tab with specific URL
  LOWEST_ID = 'LOWEST_ID'         // Tab with lowest alphanumeric ID
}

export interface HookConfig {
  type: HookType;
  strategy: ExecutionStrategy;
  leaderSelection?: LeaderSelection;
  targetTabId?: string;           // For SPECIFIC_TAB strategy
  description?: string;
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
  config: HookConfig;
  handler: HookHandler;
  registeredBy: string;           // tabId that registered the hook
  timestamp: number;
}
