// app/core/services/dom/click-outside.service.ts
import {
  Injectable,
  NgZone,
  OnDestroy,
  Renderer2,
  RendererFactory2
} from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import { filter, map, share, takeUntil, throttleTime } from 'rxjs/operators';

export interface ClickOutsideEvent {
  target: Element;
  clickedElement: Element;
  event: MouseEvent;
  timestamp: Date;
}

export interface ClickOutsideConfig {
  /**
   * Elements to exclude from click outside detection
   * Can be CSS selectors or Element references
   */
  exclude?: (string | Element)[];
  /**
   * Whether to listen to mousedown instead of click
   * Useful for dropdowns that should close on mousedown
   */
  listenToMousedown?: boolean;
  /**
   * Throttle time in milliseconds
   */
  throttleTime?: number;
  /**
   * Ignore events from certain selectors (e.g., buttons in modal)
   */
  ignoreSelectors?: string[];
  /**
   * Whether to capture events in capture phase
   */
  useCapture?: boolean;
  /**
   * Stop propagation of the click event
   */
  stopPropagation?: boolean;
  /**
   * Prevent default behavior
   */
  preventDefault?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ClickOutsideService implements OnDestroy {
  private renderer: Renderer2;
  private clickListener: (() => void) | null = null;
  private mousedownListener: (() => void) | null = null;
  private touchStartListener: (() => void) | null = null;
  private clickSubject = new Subject<ClickOutsideEvent>();
  private activeObservers = new Map<Element, Subscription>();
  private destroy$ = new Subject<void>();

  private defaultConfig: ClickOutsideConfig = {
    listenToMousedown: false,
    throttleTime: 0,
    useCapture: true,
    stopPropagation: false,
    preventDefault: false
  };

  constructor(
    private ngZone: NgZone,
    rendererFactory: RendererFactory2
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  /**
   * Listen for clicks outside of a specific element
   */
  listen(
    element: Element,
    config: ClickOutsideConfig = {}
  ): Observable<MouseEvent> {
    const mergedConfig = { ...this.defaultConfig, ...config };

    // Create observable for this element
    const clickOutside$ = this.clickSubject.pipe(
      filter(event => {
        // Check if click is outside the target element
        const isOutside = !element.contains(event.clickedElement);

        // Check if click is on excluded elements
        const isExcluded = this.isExcluded(event.clickedElement, mergedConfig);

        // Check if click is on ignore selectors
        const isIgnored = this.isIgnored(event.clickedElement, mergedConfig);

        return isOutside && !isExcluded && !isIgnored;
      }),
      map(event => event.event),
      throttleTime(mergedConfig.throttleTime || 0),
      takeUntil(this.destroy$),
      share()
    );

    // Start listening if not already started
    if (this.activeObservers.size === 0) {
      this.startGlobalListening(mergedConfig);
    }

    // Track this observer
    const subscription = clickOutside$.subscribe();
    this.activeObservers.set(element, subscription);

    return clickOutside$;
  }

  /**
   * Listen for clicks outside multiple elements
   */
  listenMultiple(
    elements: Element[],
    config: ClickOutsideConfig = {}
  ): Observable<{ event: MouseEvent; clickedOutsideAll: boolean }> {
    const mergedConfig = { ...this.defaultConfig, ...config };

    return this.clickSubject.pipe(
      filter(event => {
        // Check if click is outside ALL tracked elements
        const isOutsideAll = elements.every(el => !el.contains(event.clickedElement));

        // Check exclusions
        const isExcluded = this.isExcluded(event.clickedElement, mergedConfig);
        const isIgnored = this.isIgnored(event.clickedElement, mergedConfig);

        return isOutsideAll && !isExcluded && !isIgnored;
      }),
      map(event => ({
        event: event.event,
        clickedOutsideAll: true
      })),
      throttleTime(mergedConfig.throttleTime || 0),
      takeUntil(this.destroy$)
    );
  }

  /**
   * Stop listening for clicks outside a specific element
   */
  unlisten(element: Element): void {
    const subscription = this.activeObservers.get(element);
    if (subscription) {
      subscription.unsubscribe();
      this.activeObservers.delete(element);
    }

    // Stop global listening if no more observers
    if (this.activeObservers.size === 0) {
      this.stopGlobalListening();
    }
  }

  /**
   * Stop listening for clicks outside all elements
   */
  unlistenAll(): void {
    this.activeObservers.forEach(subscription => subscription.unsubscribe());
    this.activeObservers.clear();
    this.stopGlobalListening();
  }

  /**
   * Check if click is on an excluded element
   */
  private isExcluded(element: Element, config: ClickOutsideConfig): boolean {
    if (!config.exclude) return false;

    return config.exclude.some(exclusion => {
      if (typeof exclusion === 'string') {
        // Check if element matches selector or is inside matching element
        return element.matches(exclusion) || element.closest(exclusion) !== null;
      } else {
        // Check if element is the excluded element or inside it
        return exclusion === element || exclusion.contains(element);
      }
    });
  }

  /**
   * Check if click is on an ignored selector
   */
  private isIgnored(element: Element, config: ClickOutsideConfig): boolean {
    if (!config.ignoreSelectors) return false;

    return config.ignoreSelectors.some(selector => {
      return element.matches(selector) || element.closest(selector) !== null;
    });
  }

  /**
   * Start global event listeners
   */
  private startGlobalListening(config: ClickOutsideConfig): void {
    this.ngZone.runOutsideAngular(() => {
      const eventName = config.listenToMousedown ? 'mousedown' : 'click';

      // Mouse events
      this.clickListener = this.renderer.listen(
        'document',
        eventName,
        (event: MouseEvent) => this.handleClick(event, config)
      );

      // Touch events for mobile
      this.touchStartListener = this.renderer.listen(
        'document',
        'touchstart',
        (event: TouchEvent) => this.handleTouch(event, config)
      );

      // Optional mousedown listener for better responsiveness
      if (eventName === 'click') {
        this.mousedownListener = this.renderer.listen(
          'document',
          'mousedown',
          (event: MouseEvent) => this.handleMouseDown(event, config)
        );
      }
    });
  }

  /**
   * Handle click events
   */
  private handleClick(event: MouseEvent, config: ClickOutsideConfig): void {
    if (config.preventDefault) {
      event.preventDefault();
    }

    if (config.stopPropagation) {
      event.stopPropagation();
    }

    const clickedElement = event.target as Element;
    const target = event.currentTarget as Element;

    this.ngZone.run(() => {
      this.clickSubject.next({
        target,
        clickedElement,
        event,
        timestamp: new Date()
      });
    });
  }

  /**
   * Handle touch events
   */
  private handleTouch(event: TouchEvent, config: ClickOutsideConfig): void {
    if (config.preventDefault) {
      event.preventDefault();
    }

    if (config.stopPropagation) {
      event.stopPropagation();
    }

    // Convert touch event to mouse event for consistency
    const touch = event.touches[0] || event.changedTouches[0];
    const mockMouseEvent = new MouseEvent('click', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
      cancelable: true
    });

    const clickedElement = document.elementFromPoint(
      touch.clientX,
      touch.clientY
    ) as Element;

    if (clickedElement) {
      Object.defineProperty(mockMouseEvent, 'target', {
        value: clickedElement,
        writable: false
      });

      this.ngZone.run(() => {
        this.clickSubject.next({
          target: document.documentElement,
          clickedElement,
          event: mockMouseEvent,
          timestamp: new Date()
        });
      });
    }
  }

  /**
   * Handle mousedown events
   */
  private handleMouseDown(event: MouseEvent, config: ClickOutsideConfig): void {
    // Early escape for certain elements
    if (event.button !== 0) return; // Only left clicks

    // Additional pre-processing if needed
    if (config.preventDefault) {
      event.preventDefault();
    }
  }

  /**
   * Stop global event listeners
   */
  private stopGlobalListening(): void {
    if (this.clickListener) {
      this.clickListener();
      this.clickListener = null;
    }

    if (this.mousedownListener) {
      this.mousedownListener();
      this.mousedownListener = null;
    }

    if (this.touchStartListener) {
      this.touchStartListener();
      this.touchStartListener = null;
    }
  }

  /**
   * Check if click is inside element
   */
  isClickInside(element: Element, event: MouseEvent): boolean {
    const clickedElement = event.target as Element;
    return element === clickedElement || element.contains(clickedElement);
  }

  /**
   * Manually trigger a click outside event
   */
  triggerClickOutside(element: Element, mockEvent?: Partial<MouseEvent>): void {
    const event = mockEvent || { type: 'click' } as any;
    const clickedElement = document.createElement('div');

    this.ngZone.run(() => {
      this.clickSubject.next({
        target: element,
        clickedElement,
        event,
        timestamp: new Date()
      });
    });
  }

  /**
   * Get all currently observed elements
   */
  getObservedElements(): Element[] {
    return Array.from(this.activeObservers.keys());
  }

  /**
   * Check if element is being observed
   */
  isObserved(element: Element): boolean {
    return this.activeObservers.has(element);
  }

  ngOnDestroy(): void {
    this.unlistenAll();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
