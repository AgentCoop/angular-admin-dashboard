// app/core/services/dom/selector-tracker.service.ts
import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, map, shareReplay } from 'rxjs/operators';
import { SelectorTrackingOptions, SelectorTrackerEvent, TrackedSelector } from './dom-types';

@Injectable({ providedIn: 'root' })
export class SelectorTrackerService implements OnDestroy {
  private observer: MutationObserver | null = null;
  private trackedSelectors = new Map<string, TrackedSelector>();
  private eventsSubject = new Subject<SelectorTrackerEvent>();
  private elementsSubject = new BehaviorSubject<Map<string, Element[]>>(new Map());
  private isObserving = false;
  private options: SelectorTrackingOptions;
  private defaultObserverConfig: MutationObserverInit = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'id', 'style'] // Watch common attribute changes
  };

  constructor(private ngZone: NgZone) {
    this.options = {
      rootElement: document.body,
      debounceTime: 50,
      autoStart: false,
      observerConfig: this.defaultObserverConfig
    };
  }

  /**
   * Configure the tracker service
   */
  configure(options: Partial<SelectorTrackingOptions>): void {
    this.options = { ...this.options, ...options };

    // Update debounce time if changed
    if (options.debounceTime !== undefined) {
      this.options.debounceTime = options.debounceTime;
    }

    // Restart observer if config changed and we're already observing
    if (this.isObserving) {
      this.stopObserving();
      this.startObserving();
    }
  }

  /**
   * Start tracking elements matching a selector
   */
  trackSelector(selector: string): Observable<Element[]> {
    // Initialize tracking for this selector if not already tracked
    if (!this.trackedSelectors.has(selector)) {
      this.trackedSelectors.set(selector, {
        selector,
        elements: [],
        subscriptionCount: 0
      });
    }

    const tracked = this.trackedSelectors.get(selector)!;
    tracked.subscriptionCount++;

    // Start observing if this is the first subscription and autoStart is enabled
    if (!this.isObserving && this.options.autoStart) {
      this.startObserving();
    }

    // Create observable for this specific selector
    return this.elementsSubject.pipe(
      map(selectorsMap => selectorsMap.get(selector) || []),
      distinctUntilChanged((prev, curr) => {
        if (prev.length !== curr.length) return false;
        return prev.every((el, index) => el === curr[index]);
      }),
      debounceTime(this.options.debounceTime || 0),
      shareReplay(1)
    );
  }

  /**
   * Stop tracking a selector
   */
  untrackSelector(selector: string): void {
    const tracked = this.trackedSelectors.get(selector);
    if (tracked) {
      tracked.subscriptionCount--;

      if (tracked.subscriptionCount <= 0) {
        this.trackedSelectors.delete(selector);

        // Update elements subject
        const currentMap = this.elementsSubject.getValue();
        currentMap.delete(selector);
        this.elementsSubject.next(currentMap);

        // Stop observing if no selectors left
        if (this.trackedSelectors.size === 0) {
          this.stopObserving();
        }
      }
    }
  }

  /**
   * Get all currently tracked selectors
   */
  getTrackedSelectors(): string[] {
    return Array.from(this.trackedSelectors.keys());
  }

  /**
   * Get current elements for a selector synchronously
   */
  getElements(selector: string): Element[] {
    return this.trackedSelectors.get(selector)?.elements || [];
  }

  /**
   * Get all tracked elements from all selectors
   * Returns Map<selector, elements[]>
   */
  getAllElements(): Map<string, Element[]> {
    const result = new Map<string, Element[]>();

    this.trackedSelectors.forEach((tracked, selector) => {
      result.set(selector, tracked.elements);
    });

    return result;
  }

  /**
   * Start observing DOM changes
   */
  startObserving(rootElement?: HTMLElement): void {
    if (this.isObserving) {
      return;
    }

    const root = rootElement || this.options.rootElement;
    if (!root) {
      console.warn('No root element provided for SelectorTrackerService');
      return;
    }

    // Initial scan for all tracked selectors
    this.scanAllSelectors();

    // Create observer
    this.observer = new MutationObserver(() => {
      this.ngZone.runOutsideAngular(() => {
        this.handleDomMutation();
      });
    });

    // Start observing
    const config = this.options.observerConfig || this.defaultObserverConfig;
    this.observer.observe(root, config);
    this.isObserving = true;

    console.log(`SelectorTrackerService started observing ${this.trackedSelectors.size} selectors`);
  }

  /**
   * Stop observing DOM changes
   */
  stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      this.isObserving = false;
      console.log('SelectorTrackerService stopped observing');
    }
  }

  /**
   * Manually trigger a scan
   */
  manualScan(): void {
    this.scanAllSelectors();
  }

  /**
   * Scan for elements matching a specific selector
   */
  private scanSelector(selector: string): Element[] {
    try {
      const root = this.options.rootElement || document;
      return Array.from(root.querySelectorAll(selector));
    } catch (error) {
      console.error(`Invalid selector: ${selector}`, error);
      return [];
    }
  }

  /**
   * Scan all tracked selectors
   */
  private scanAllSelectors(): void {
    const updatedMap = new Map<string, Element[]>();
    const changes: SelectorTrackerEvent[] = [];

    this.trackedSelectors.forEach((tracked, selector) => {
      const oldElements = tracked.elements;
      const newElements = this.scanSelector(selector);

      // Check for changes
      if (this.hasElementsChanged(oldElements, newElements)) {
        tracked.elements = newElements;
        updatedMap.set(selector, newElements);

        // Determine change type
        const added = newElements.filter(el => !oldElements.includes(el));
        const removed = oldElements.filter(el => !newElements.includes(el));

        let changeType: 'added' | 'removed' | 'updated' = 'updated';
        if (added.length > 0 && removed.length === 0) changeType = 'added';
        else if (removed.length > 0 && added.length === 0) changeType = 'removed';

        // Emit event
        const event: SelectorTrackerEvent = {
          type: changeType,
          elements: newElements,
          timestamp: new Date(),
          selector,
          totalCount: newElements.length
        };

        changes.push(event);
      }
    });

    // Update subjects
    if (updatedMap.size > 0) {
      this.ngZone.run(() => {
        this.elementsSubject.next(new Map([...this.elementsSubject.getValue(), ...updatedMap]));

        // Emit all events
        changes.forEach(event => {
          this.eventsSubject.next(event);
        });
      });
    }
  }

  /**
   * Handle DOM mutations
   */
  private handleDomMutation(): void {
    this.scanAllSelectors();
  }

  /**
   * Check if elements have changed
   */
  private hasElementsChanged(oldElements: Element[], newElements: Element[]): boolean {
    if (oldElements.length !== newElements.length) return true;

    // Check if any elements are different
    return oldElements.some((oldEl, index) => oldEl !== newElements[index]);
  }

  /**
   * Get events observable
   */
  get events(): Observable<SelectorTrackerEvent> {
    return this.eventsSubject.asObservable();
  }

  /**
   * Get a specific event stream
   */
  getEventsForSelector(selector: string): Observable<SelectorTrackerEvent> {
    return this.eventsSubject.pipe(
      filter(event => event.selector === selector)
    );
  }

  ngOnDestroy(): void {
    this.stopObserving();
    this.eventsSubject.complete();
    this.elementsSubject.complete();
    this.trackedSelectors.clear();
  }
}
