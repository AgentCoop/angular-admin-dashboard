import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { UnifiedService } from './unified.service';

@Injectable()
export abstract class NamespacedStateService<T> implements OnDestroy {
  // Make these protected properties (not abstract)
  protected readonly namespace: string;
  protected readonly initialState: T;

  protected subscriptions: Subscription[] = [];

  constructor(
    protected stateService: UnifiedService,
    namespace: string,
    initialState: T
  ) {
    // Pass namespace and initialState as constructor parameters
    this.namespace = namespace;
    this.initialState = initialState;

    // Register namespace on construction
    this.stateService.registerNamespace({
      namespace: this.namespace,
      initialState: this.initialState,
      persist: true,
      debounceTime: 300
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Select from namespace state
   */
  protected select<R>(selector: (state: T) => R): Observable<R> {
    return this.stateService.select<T, R>(this.namespace, selector);
  }

  /**
   * Get current state snapshot
   */
  getState(): T {
    const state = this.stateService.getNamespaceState<T>(this.namespace);
    return state || this.initialState;
  }

  /**
   * Update state
   */
  protected updateState(updater: (state: T) => T): void {
    this.stateService.updateNamespaceState<T>(this.namespace, updater);
  }

  /**
   * Set state directly
   */
  protected setState(newState: T): void {
    this.stateService.setNamespaceState<T>(this.namespace, newState);
  }

  /**
   * Patch state (partial update)
   */
  protected patchState(partialState: Partial<T>): void {
    this.stateService.patchNamespaceState<T>(this.namespace, partialState);
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.stateService.resetNamespace(this.namespace);
  }

  /**
   * Watch for state changes
   */
  stateChanges$(): Observable<T> {
    return this.stateService.namespaceChanges$<T>(this.namespace);
  }

  /**
   * Check if state has unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return (this.stateService as any).isNamespaceDirty?.(this.namespace) || false;
  }
}
