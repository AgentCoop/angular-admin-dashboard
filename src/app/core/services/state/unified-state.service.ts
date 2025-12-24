import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, map, debounceTime } from 'rxjs/operators';
import { isEqual } from 'lodash-es';

//
export interface UnifiedState {
  [namespace: string]: any;
}

export interface StateConfig<T = any> {
  namespace: string;
  initialState: T;
  debounceTime?: number;
  persist?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UnifiedStateService implements OnDestroy {
  private readonly ROOT_STORAGE_KEY = 'app_state_v1';
  private state$: BehaviorSubject<UnifiedState>;
  private persistSubscription: Subscription;
  private configs: Map<string, StateConfig> = new Map();

  constructor() {
    const savedState = this.loadFromStorage();
    const initialState = savedState || {};

    this.state$ = new BehaviorSubject<UnifiedState>(initialState);

    this.persistSubscription = this.state$
      .pipe(debounceTime(500))
      .subscribe(state => this.saveToStorage(state));
  }

  ngOnDestroy(): void {
    this.persistSubscription?.unsubscribe();
  }

  /**
   * Register a namespace with its configuration
   */
  registerNamespace<T>(config: StateConfig<T>): void {
    this.configs.set(config.namespace, config);

    const currentState = this.state$.value;
    if (!currentState[config.namespace]) {
      const newState = {
        ...currentState,
        [config.namespace]: config.initialState
      };
      this.state$.next(newState);
    }
  }

  /**
   * Get state for a namespace
   */
  getNamespaceState<T>(namespace: string): T | undefined {
    return this.state$.value[namespace] as T;
  }

  /**
   * Update state for a namespace
   */
  updateNamespaceState<T>(namespace: string, updater: (current: T) => T): void {
    const currentState = this.state$.value;
    const currentNamespaceState = currentState[namespace] as T;

    if (currentNamespaceState === undefined) {
      throw new Error(`Namespace "${namespace}" not registered`);
    }

    const newNamespaceState = updater(currentNamespaceState);

    if (!isEqual(currentNamespaceState, newNamespaceState)) {
      const newState = {
        ...currentState,
        [namespace]: newNamespaceState
      };
      this.state$.next(newState);
    }
  }

  /**
   * Set namespace state directly
   */
  setNamespaceState<T>(namespace: string, newState: T): void {
    this.updateNamespaceState(namespace, () => newState);
  }

  /**
   * Patch namespace state (partial update)
   */
  patchNamespaceState<T>(namespace: string, partialState: Partial<T>): void {
    this.updateNamespaceState<T>(namespace, current => ({
      ...current as any,
      ...partialState
    }));
  }

  /**
   * Reset namespace to initial state
   */
  resetNamespace(namespace: string): void {
    const config = this.configs.get(namespace);
    if (config) {
      this.setNamespaceState(namespace, config.initialState);
    }
  }

  /**
   * Reset all namespaces
   */
  resetAll(): void {
    const newState: UnifiedState = {};
    this.configs.forEach((config, namespace) => {
      newState[namespace] = config.initialState;
    });
    this.state$.next(newState);
  }

  /**
   * SELECT method with proper generics
   */
  select<T = any, R = any>(
    namespace: string,
    selector: (state: T) => R
  ): Observable<R> {
    return this.state$.pipe(
      map(state => state[namespace] as T),
      distinctUntilChanged((a, b) => isEqual(a, b)),
      map(selector),
      distinctUntilChanged((a, b) => isEqual(a, b))
    );
  }

  /**
   * FIXED: Watch for namespace changes with proper typing
   */
  namespaceChanges$<T>(namespace: string): Observable<T> {
    return this.state$.pipe(
      map(state => state[namespace] as T),
      distinctUntilChanged((a, b) => isEqual(a, b))
    );
  }

  /**
   * Alternative approach with explicit type assertion
   */
  getNamespaceObservable<T>(namespace: string): Observable<T> {
    return this.state$.pipe(
      map(state => state[namespace]),
      distinctUntilChanged((a, b) => isEqual(a, b))
    ) as Observable<T>;
  }

  /**
   * Get all state
   */
  getAllState(): UnifiedState {
    return { ...this.state$.value };
  }

  /**
   * Export state as JSON
   */
  exportState(): string {
    return JSON.stringify(this.state$.value, null, 2);
  }

  /**
   * Import state from JSON
   */
  importState(json: string): boolean {
    try {
      const importedState = JSON.parse(json);
      this.state$.next(importedState);
      return true;
    } catch (error) {
      console.error('Failed to import state', error);
      return false;
    }
  }

  private loadFromStorage(): UnifiedState | null {
    try {
      const serialized = localStorage.getItem(this.ROOT_STORAGE_KEY);
      return serialized ? JSON.parse(serialized) : null;
    } catch (error) {
      console.error('Error loading state from storage', error);
      return null;
    }
  }

  private saveToStorage(state: UnifiedState): void {
    try {
      const filteredState = Object.keys(state).reduce((acc, namespace) => {
        const config = this.configs.get(namespace);
        if (config?.persist !== false) {
          acc[namespace] = state[namespace];
        }
        return acc;
      }, {} as UnifiedState);

      localStorage.setItem(this.ROOT_STORAGE_KEY, JSON.stringify(filteredState));
    } catch (error) {
      console.error('Error saving state to storage', error);
    }
  }

  clearStorage(): void {
    localStorage.removeItem(this.ROOT_STORAGE_KEY);
  }
}
