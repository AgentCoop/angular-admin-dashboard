// hooks/hook-manager.ts
import {
  HookType,
  ExecutionStrategy,
  LeaderSelection,
  HookConfig,
  HookHandler,
  HookResult,
  RegisteredHook
} from './types';
import { v4 as uuid } from 'uuid';

interface PortInfo {
  tabId: string;
  port: MessagePort;
  lastActive: number;
  url?: string;
}

interface HookManagerOptions {
  workerId: string;
}

export class HookManager {
  private hooks: Map<string, RegisteredHook> = new Map();
  private ports: Map<string, PortInfo> = new Map();
  private leaderTabId: string | null = null;
  private portFinder?: (tabId: string) => MessagePort | undefined;

  constructor(private options: HookManagerOptions) {
    this.initializeLeaderElection();
  }

  setPortFinder(finder: (tabId: string) => MessagePort | undefined): void {
    this.portFinder = finder;
  }

  registerHook(config: HookConfig, handler: HookHandler, tabId: string): string {
    const hookId = uuid();

    const hook: RegisteredHook = {
      id: hookId,
      config,
      handler,
      registeredBy: tabId,
      timestamp: Date.now()
    };

    this.hooks.set(hookId, hook);

    // If this is a SINGLE_TAB hook, ensure it's assigned to the appropriate tab
    if (config.strategy === ExecutionStrategy.SINGLE_TAB) {
      this.ensureSingleTabHookAssignment(hookId, config);
    }

    return hookId;
  }

  unregisterHook(hookId: string): boolean {
    return this.hooks.delete(hookId);
  }

  unregisterHooksByTab(tabId: string): void {
    const hooksToRemove: string[] = [];

    this.hooks.forEach((hook, hookId) => {
      if (hook.registeredBy === tabId) {
        hooksToRemove.push(hookId);
      }
    });

    hooksToRemove.forEach(hookId => this.hooks.delete(hookId));
  }

  async executeHooks(
    hookType: HookType,
    data: any
  ): Promise<{ executed: boolean; results: Map<string, HookResult> }> {
    const hooks = this.getHooksByType(hookType);
    const results = new Map<string, HookResult>();

    if (hooks.length === 0) {
      return { executed: false, results };
    }

    // Group hooks by execution strategy
    const groupedHooks = this.groupHooksByStrategy(hooks);

    // Execute hooks based on strategy
    for (const [strategy, strategyHooks] of groupedHooks) {
      switch (strategy) {
        case ExecutionStrategy.ALL_TABS:
          await this.executeAllTabsHooks(strategyHooks, data, results);
          break;

        case ExecutionStrategy.SINGLE_TAB:
          await this.executeSingleTabHooks(strategyHooks, data, results);
          break;

        case ExecutionStrategy.LEADER_ONLY:
          await this.executeLeaderOnlyHooks(strategyHooks, data, results);
          break;

        case ExecutionStrategy.SPECIFIC_TAB:
          await this.executeSpecificTabHooks(strategyHooks, data, results);
          break;
      }
    }

    return { executed: true, results };
  }

  private async executeAllTabsHooks(
    hooks: RegisteredHook[],
    data: any,
    results: Map<string, HookResult>
  ): Promise<void> {
    for (const hook of hooks) {
      try {
        const result = await hook.handler(data);
        results.set(hook.id, result);
      } catch (error) {
        results.set(hook.id, {
          success: false,
          shouldContinue: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  private async executeSingleTabHooks(
    hooks: RegisteredHook[],
    data: any,
    results: Map<string, HookResult>
  ): Promise<void> {
    for (const hook of hooks) {
      const assignedTabId = this.getAssignedTabForHook(hook.id, hook.config);

      if (assignedTabId && this.ports.has(assignedTabId)) {
        try {
          // Forward execution to the assigned tab
          const result = await this.executeHookOnTab(assignedTabId, hook, data);
          results.set(hook.id, result);
        } catch (error) {
          results.set(hook.id, {
            success: false,
            shouldContinue: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      } else {
        // No suitable tab found, mark as failed
        results.set(hook.id, {
          success: false,
          shouldContinue: true,
          error: 'No suitable tab available for execution'
        });
      }
    }
  }

  private async executeLeaderOnlyHooks(
    hooks: RegisteredHook[],
    data: any,
    results: Map<string, HookResult>
  ): Promise<void> {
    if (!this.leaderTabId || !this.ports.has(this.leaderTabId)) {
      // No leader available
      hooks.forEach(hook => {
        results.set(hook.id, {
          success: false,
          shouldContinue: true,
          error: 'No leader tab available'
        });
      });
      return;
    }

    for (const hook of hooks) {
      try {
        const result = await this.executeHookOnTab(this.leaderTabId!, hook, data);
        results.set(hook.id, result);
      } catch (error) {
        results.set(hook.id, {
          success: false,
          shouldContinue: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  private async executeSpecificTabHooks(
    hooks: RegisteredHook[],
    data: any,
    results: Map<string, HookResult>
  ): Promise<void> {
    for (const hook of hooks) {
      if (!hook.config.targetTabId) {
        results.set(hook.id, {
          success: false,
          shouldContinue: true,
          error: 'No target tab specified'
        });
        continue;
      }

      if (this.ports.has(hook.config.targetTabId)) {
        try {
          const result = await this.executeHookOnTab(hook.config.targetTabId, hook, data);
          results.set(hook.id, result);
        } catch (error) {
          results.set(hook.id, {
            success: false,
            shouldContinue: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      } else {
        results.set(hook.id, {
          success: false,
          shouldContinue: true,
          error: `Target tab ${hook.config.targetTabId} not found`
        });
      }
    }
  }

  private async executeHookOnTab(
    tabId: string,
    hook: RegisteredHook,
    data: any
  ): Promise<HookResult> {
    const port = this.portFinder?.(tabId);

    if (!port) {
      return {
        success: false,
        shouldContinue: false,
        error: `Cannot communicate with tab ${tabId}`
      };
    }

    return new Promise((resolve, reject) => {
      const correlationId = uuid();
      const timeoutId = setTimeout(() => {
        reject(new Error(`Hook execution timeout for tab ${tabId}`));
      }, 10000);

      const messageHandler = (event: MessageEvent) => {
        if (event.data.type === 'HOOK_EXECUTION_RESULT' &&
          event.data.correlationId === correlationId) {
          clearTimeout(timeoutId);
          port.removeEventListener('message', messageHandler);
          resolve(event.data.result);
        }
      };

      port.addEventListener('message', messageHandler);

      port.postMessage({
        type: 'EXECUTE_HOOK',
        hookId: hook.id,
        hookConfig: hook.config,
        data,
        correlationId,
        timestamp: Date.now()
      });
    });
  }

  private getAssignedTabForHook(hookId: string, config: HookConfig): string | null {
    // For now, we'll use leader selection. In a real implementation,
    // you might want to persist this assignment across worker restarts.
    return this.selectTabByStrategy(config.leaderSelection || LeaderSelection.OLDEST_TAB);
  }

  private ensureSingleTabHookAssignment(hookId: string, config: HookConfig): void {
    // Check if we need to assign or reassign this hook to a tab
    const assignedTab = this.getAssignedTabForHook(hookId, config);

    // Notify the assigned tab that it's responsible for this hook
    if (assignedTab && this.portFinder?.(assignedTab)) {
      this.portFinder(assignedTab)?.postMessage({
        type: 'HOOK_ASSIGNMENT',
        hookId,
        config,
        timestamp: Date.now()
      });
    }
  }

  private selectTabByStrategy(strategy: LeaderSelection): string | null {
    if (this.ports.size === 0) return null;

    const portsArray = Array.from(this.ports.entries());

    switch (strategy) {
      case LeaderSelection.OLDEST_TAB:
        return portsArray.sort((a, b) => a[1].lastActive - b[1].lastActive)[0][0];

      case LeaderSelection.NEWEST_TAB:
        return portsArray.sort((a, b) => b[1].lastActive - a[1].lastActive)[0][0];

      case LeaderSelection.RANDOM:
        return portsArray[Math.floor(Math.random() * portsArray.length)][0];

      case LeaderSelection.LOWEST_ID:
        return portsArray.sort((a, b) => a[0].localeCompare(b[0]))[0][0];

      case LeaderSelection.SPECIFIC_URL:
        // This would require additional logic to match URLs
        return null;

      default:
        return portsArray[0][0];
    }
  }

  private getHooksByType(hookType: HookType): RegisteredHook[] {
    const result: RegisteredHook[] = [];

    this.hooks.forEach(hook => {
      if (hook.config.type === hookType) {
        result.push(hook);
      }
    });

    return result;
  }

  private groupHooksByStrategy(hooks: RegisteredHook[]): Map<ExecutionStrategy, RegisteredHook[]> {
    const grouped = new Map<ExecutionStrategy, RegisteredHook[]>();

    hooks.forEach(hook => {
      const strategy = hook.config.strategy;
      if (!grouped.has(strategy)) {
        grouped.set(strategy, []);
      }
      grouped.get(strategy)!.push(hook);
    });

    return grouped;
  }

  private initializeLeaderElection(): void {
    // Leader election logic - elect the oldest tab as leader
    setInterval(() => {
      if (this.ports.size === 0) {
        this.leaderTabId = null;
        return;
      }

      const newLeader = this.selectTabByStrategy(LeaderSelection.OLDEST_TAB);

      if (newLeader !== this.leaderTabId) {
        this.leaderTabId = newLeader;
        this.notifyLeaderChange(newLeader);
      }
    }, 10000); // Check every 10 seconds
  }

  private notifyLeaderChange(newLeaderId: string | null): void {
    // Notify all tabs about leader change
    this.ports.forEach((portInfo, tabId) => {
      const port = this.portFinder?.(tabId);
      if (port) {
        port.postMessage({
          type: 'LEADER_CHANGE',
          leaderTabId: newLeaderId,
          timestamp: Date.now()
        });
      }
    });
  }

  updatePortInfo(tabId: string, port: MessagePort, url?: string): void {
    this.ports.set(tabId, {
      tabId,
      port,
      lastActive: Date.now(),
      url
    });

    // Re-evaluate single tab hook assignments when tabs change
    this.reevaluateSingleTabHooks();
  }

  removePort(tabId: string): void {
    this.ports.delete(tabId);

    // Unregister hooks from this tab
    this.unregisterHooksByTab(tabId);

    // If this was the leader, re-elect
    if (tabId === this.leaderTabId) {
      this.leaderTabId = null;
      this.initializeLeaderElection();
    }

    // Re-evaluate single tab hook assignments
    this.reevaluateSingleTabHooks();
  }

  private reevaluateSingleTabHooks(): void {
    // Reassign single-tab hooks when tabs change
    this.hooks.forEach((hook, hookId) => {
      if (hook.config.strategy === ExecutionStrategy.SINGLE_TAB) {
        this.ensureSingleTabHookAssignment(hookId, hook.config);
      }
    });
  }
}
