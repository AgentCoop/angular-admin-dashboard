// hooks/hook-manager.ts
import {
  ExecutionStrategy,
  HookDescriptor,
  HookResult,
  HookType,
  RegisteredHook
} from './types';
import {v4 as uuid} from 'uuid';
import {WorkerMessageType, ExtendedMessagePort, WorkerMessage} from '../types';

interface HookManagerOptions {
  workerId: string;
}

export class HookManager {
  private hooks: Map<string, RegisteredHook> = new Map();
  private ports: Map<string, ExtendedMessagePort> = new Map();
  private portFinder?: (tabId: string) => MessagePort | undefined;

  constructor(private options: HookManagerOptions) { }

  setPortFinder(finder: (tabId: string) => MessagePort | undefined): void {
    this.portFinder = finder;
  }

  registerHook(hookId: string, descriptor: HookDescriptor, registeredBy: string): void {
    const hook: RegisteredHook = {
      id: hookId,
      descriptor: descriptor,
      registeredBy,
      timestamp: Date.now()
    };

    this.hooks.set(hookId, hook);
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
    message: WorkerMessage
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
          await this.executeAllTabsHooks(strategyHooks, message, results);
          break;

        case ExecutionStrategy.SINGLE_RANDOM:
        case ExecutionStrategy.SINGLE_OLDEST_TAB:
        case ExecutionStrategy.SINGLE_NEWEST_TAB:
          await this.executeSingleTabHooks(strategyHooks, message, results);
          break;

        case ExecutionStrategy.SINGLE_SPECIFIC_TAB:
          await this.executeSpecificTabHooks(strategyHooks, message, results);
          break;
      }
    }

    return { executed: true, results };
  }

  private async executeAllTabsHooks(
    hooks: RegisteredHook[],
    message: WorkerMessage,
    results: Map<string, HookResult>
  ): Promise<void> {
    for (const hook of hooks) {
      try {
        const result = await this.executeHookOnTab(hook.registeredBy, hook, message);
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
    message: WorkerMessage,
    results: Map<string, HookResult>
  ): Promise<void> {
    for (const hook of hooks) {
      const assignedTabId = this.selectTabByStrategy(hook.descriptor.strategy);

      if (assignedTabId) {
        try {
          // Forward execution to the assigned tab
          const result = await this.executeHookOnTab(assignedTabId, hook, message);
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

  private async executeSpecificTabHooks(
    hooks: RegisteredHook[],
    message: WorkerMessage,
    results: Map<string, HookResult>
  ): Promise<void> {
    for (const hook of hooks) {
      if (this.ports.has(hook.registeredBy)) {
        try {
          const result = await this.executeHookOnTab(hook.registeredBy, hook, message);
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
          error: `Target tab ${hook.registeredBy} not found`
        });
      }
    }
  }

  private async executeHookOnTab(
    tabId: string,
    hook: RegisteredHook,
    message: WorkerMessage,
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
        if (event.data.type === WorkerMessageType.HOOK_EXECUTION_RESULT &&
          event.data.correlationId === correlationId) {
          clearTimeout(timeoutId);
          port.removeEventListener('message', messageHandler);
          resolve(event.data.result);
        }
      };

      port.addEventListener('message', messageHandler);

      port.postMessage({
        type: WorkerMessageType.EXECUTE_HOOK,
        hookId: hook.id,
        descriptor: hook.descriptor,
        data: message,
        correlationId,
        timestamp: Date.now()
      });
    });
  }

  private ensureSingleTabHookAssignment(hookId: string, config: HookDescriptor): void {
    // Check if we need to assign or reassign this hook to a tab
    // const assignedTab = this.getAssignedTabForHook(hookId, config);
    //
    // // Notify the assigned tab that it's responsible for this hook
    // if (assignedTab && this.portFinder?.(assignedTab)) {
    //   this.portFinder(assignedTab)?.postMessage({
    //     type: 'HOOK_ASSIGNMENT',
    //     hookId,
    //     config,
    //     timestamp: Date.now()
    //   });
    // }
  }

  private selectTabByStrategy(strategy: ExecutionStrategy): string | null {
    if (this.ports.size === 0) return null;

    const portsArray = Array.from(this.ports.entries());

    switch (strategy) {
      case ExecutionStrategy.SINGLE_OLDEST_TAB:
        return portsArray.sort((a, b) => a[1].lastActive - b[1].lastActive)[0][0];

      case ExecutionStrategy.SINGLE_NEWEST_TAB:
        return portsArray.sort((a, b) => b[1].lastActive - a[1].lastActive)[0][0];

      case ExecutionStrategy.SINGLE_RANDOM:
        return portsArray[Math.floor(Math.random() * portsArray.length)][0];

      default:
        return portsArray[0][0];
    }
  }

  private getHooksByType(hookType: HookType): RegisteredHook[] {
    const result: RegisteredHook[] = [];

    this.hooks.forEach(hook => {
      if (hook.descriptor.type === hookType) {
        result.push(hook);
      }
    });

    return result;
  }

  private groupHooksByStrategy(hooks: RegisteredHook[]): Map<ExecutionStrategy, RegisteredHook[]> {
    const grouped = new Map<ExecutionStrategy, RegisteredHook[]>();

    hooks.forEach(hook => {
      const strategy = hook.descriptor.strategy;
      if (!grouped.has(strategy)) {
        grouped.set(strategy, []);
      }
      grouped.get(strategy)!.push(hook);
    });

    return grouped;
  }

  addPort(tabId: string, port: ExtendedMessagePort): void {
    this.ports.set(tabId, port);
  }

  removePort(tabId: string): void {
    this.ports.delete(tabId);

    // Unregister hooks from this tab
    this.unregisterHooksByTab(tabId);
  }
}
