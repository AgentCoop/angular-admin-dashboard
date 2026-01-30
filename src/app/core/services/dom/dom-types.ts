// app/core/services/dom/dom-shared-worker.types.ts
export interface SelectorTrackingOptions {
  rootElement?: HTMLElement;
  debounceTime?: number;
  autoStart?: boolean;
  observerConfig?: MutationObserverInit;
}

export interface SelectorTrackerEvent {
  type: 'added' | 'removed' | 'updated';
  elements: Element[];
  timestamp: Date;
  selector: string;
  totalCount: number;
}

export interface TrackedSelector {
  selector: string;
  elements: Element[];
  subscriptionCount: number;
}
