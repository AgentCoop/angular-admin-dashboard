// directives/draggable/dropzone.directive.ts
import {
  Directive, ElementRef, EventEmitter, Output, Input,
  OnInit, OnDestroy, HostBinding, inject
} from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { SelectorTrackerService } from '@core/services/dom';
import { DropzoneConfig, DropEvent, OverlapInfo } from './draggable-types';

@Directive({
  selector: '[appDropzone]',
  standalone: true,
  exportAs: 'appDropzone'
})
export class DropzoneDirective implements OnInit, OnDestroy {
  // Configuration inputs
  @Input() draggableSelector = '[appdraggable]';
  @Input() activeClass = 'dropzone-active';
  @Input() overlapThreshold = 0.3;
  @Input() requireDragging = true;
  @Input() useIntersectionObserver = true;

  // Default to document.body when not specified
  @Input() set observationRoot(value: HTMLElement | string | undefined) {
    if (value === undefined || value === null) {
      this._observationRoot = document.body;
    } else if (typeof value === 'string') {
      const element = document.querySelector(value) as HTMLElement;
      this._observationRoot = element || document.body;
    } else {
      this._observationRoot = value;
    }
  }
  get observationRoot(): HTMLElement {
    return this._observationRoot;
  }
  private _observationRoot: HTMLElement = document.body;

  // Event outputs
  @Output() dragEnter = new EventEmitter<DropEvent>();
  @Output() dragOver = new EventEmitter<DropEvent>();
  @Output() dragLeave = new EventEmitter<DropEvent>();
  @Output() drop = new EventEmitter<DropEvent>();
  @Output() overlapChange = new EventEmitter<OverlapInfo>();

  @HostBinding('class.dropzone') dropzoneClass = true;

  @HostBinding('class.dropzone-active')
  get isDropzoneActive(): boolean {
    return this.isActive;
  }

  // Service injection
  private selectorTracker = inject(SelectorTrackerService);

  // State management
  private isActive = false;
  private destroy$ = new Subject<void>();
  private draggableSubscription?: Subscription;
  private intersectionObserver?: IntersectionObserver;

  // Tracking collections
  private draggableElements = new Set<HTMLElement>();
  private overlappingDraggables = new Map<HTMLElement, OverlapInfo>();
  private dragStates = new Map<HTMLElement, boolean>();

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.setupSelectorTracker();
    this.setupDragListeners();
  }

  /**
   * Setup automatic observation using SelectorTrackerService
   */
  private setupSelectorTracker(): void {
    // Configure selector tracker for optimal draggable observation
    this.selectorTracker.configure({
      rootElement: this.observationRoot,
      debounceTime: 16, // Match animation frame rate
      autoStart: true,
      observerConfig: {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['appdraggable']
      }
    });

    // Subscribe to draggable element changes
    this.draggableSubscription = this.selectorTracker
      .trackSelector(this.draggableSelector)
      .pipe(takeUntil(this.destroy$))
      .subscribe(elements => {
        this.handleDraggableElementsChange(elements);
      });

    // Setup intersection observer if enabled
    if (this.useIntersectionObserver && 'IntersectionObserver' in window) {
      this.setupIntersectionObserver();
    }
  }

  /**
   * Handle changes in draggable elements from selector tracker
   */
  private handleDraggableElementsChange(elements: Element[]): void {
    const htmlElements = elements.filter(el => el instanceof HTMLElement) as HTMLElement[];

    // Calculate added and removed elements
    const newSet = new Set(htmlElements);
    const added = htmlElements.filter(el => !this.draggableElements.has(el));
    const removed = Array.from(this.draggableElements).filter(el => !newSet.has(el));

    // Add new elements
    added.forEach(element => {
      this.draggableElements.add(element);
      this.setupElementListeners(element);

      // Add to intersection observer if available
      if (this.intersectionObserver) {
        this.intersectionObserver.observe(element);
      }
    });

    // Remove old elements
    removed.forEach(element => {
      this.draggableElements.delete(element);
      this.overlappingDraggables.delete(element);
      this.dragStates.delete(element);

      // Remove from intersection observer if available
      if (this.intersectionObserver) {
        this.intersectionObserver.unobserve(element);
      }
    });

    // Re-check overlaps after elements change
    this.checkAllOverlaps();
  }

  /**
   * Setup IntersectionObserver for precise overlap detection
   */
  private setupIntersectionObserver(): void {
    const options: IntersectionObserverInit = {
      root: null,
      rootMargin: '0px',
      threshold: Array.from({ length: 21 }, (_, i) => i * 0.05) // 0, 0.05, 0.10, ..., 1.0
    };

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const element = entry.target as HTMLElement;

        // Skip if element is not tracked
        if (!this.draggableElements.has(element)) return;

        const overlapInfo = this.calculateOverlap(element);
        //console.log('overlapped, info: %o', overlapInfo);
        this.handleOverlapChange(element, overlapInfo);
      });

      this.updateActiveState();
    }, options);

    // Observe all current draggable elements
    this.draggableElements.forEach(element => {
      this.intersectionObserver?.observe(element);
    });
  }

  /**
   * Setup drag event listeners for each draggable element
   */
  private setupElementListeners(element: HTMLElement): void {
    // Listen for dragstart to track drag state
    element.addEventListener('dragstart', this.handleDragStart.bind(this, element));
    element.addEventListener('dragend', this.handleDragEnd.bind(this, element));

    // Listen for pointer events for manual drag tracking
    element.addEventListener('pointerdown', this.handlePointerDown.bind(this, element));
    element.addEventListener('pointermove', this.handlePointerMove.bind(this, element));
    element.addEventListener('pointerup', this.handlePointerUp.bind(this, element));
  }

  /**
   * Setup global drop listener
   */
  private setupDragListeners(): void {
    this.elementRef.nativeElement.addEventListener('pointerup', this.handleDrop.bind(this));
  }

  /**
   * Handle pointer events to track drag state
   */
  private handlePointerDown(element: HTMLElement, event: PointerEvent): void {
    if (event.button !== 0) return; // Only left mouse button

    this.dragStates.set(element, true);
    element.setPointerCapture(event.pointerId);

    // Initial overlap check
    this.checkElementOverlap(element);
  }

  private handlePointerMove(element: HTMLElement, event: PointerEvent): void {
    if (!this.dragStates.get(element)) return;

    // Throttled overlap check during drag
    requestAnimationFrame(() => {
      this.checkElementOverlap(element);
    });
  }

  private handlePointerUp(element: HTMLElement, event: PointerEvent): void {
    this.dragStates.set(element, false);
    element.releasePointerCapture(event.pointerId);

    // Final overlap check
    setTimeout(() => this.checkElementOverlap(element), 50);
  }

  private handleDragStart(element: HTMLElement): void {
    this.dragStates.set(element, true);
    this.checkElementOverlap(element);
  }

  private handleDragEnd(element: HTMLElement): void {
    this.dragStates.set(element, false);
    setTimeout(() => this.checkElementOverlap(element), 50);
  }

  /**
   * Check overlap for a specific element
   */
  private checkElementOverlap(element: HTMLElement): void {
    if (!document.contains(element)) return;

    const overlapInfo = this.calculateOverlap(element);
    this.handleOverlapChange(element, overlapInfo);
  }

  /**
   * Check overlaps for all elements
   */
  private checkAllOverlaps(): void {
    this.draggableElements.forEach(element => {
      if (document.contains(element)) {
        this.checkElementOverlap(element);
      }
    });
    this.updateActiveState();
  }

  /**
   * Calculate overlap between dropzone and draggable element
   */
  private calculateOverlap(draggable: HTMLElement): OverlapInfo {
    const dropzoneRect = this.elementRef.nativeElement.getBoundingClientRect();
    const draggableRect = draggable.getBoundingClientRect();

    // Calculate intersection
    const intersectLeft = Math.max(dropzoneRect.left, draggableRect.left);
    const intersectTop = Math.max(dropzoneRect.top, draggableRect.top);
    const intersectRight = Math.min(dropzoneRect.right, draggableRect.right);
    const intersectBottom = Math.min(dropzoneRect.bottom, draggableRect.bottom);

    const intersectWidth = Math.max(0, intersectRight - intersectLeft);
    const intersectHeight = Math.max(0, intersectBottom - intersectTop);
    const intersectArea = intersectWidth * intersectHeight;

    const draggableArea = draggableRect.width * draggableRect.height;
    const dropzoneArea = dropzoneRect.width * dropzoneRect.height;

    const overlapPercentage = Math.min(
      intersectArea / draggableArea,
      intersectArea / dropzoneArea
    );

    // Calculate distance between centers
    const dropzoneCenter = {
      x: dropzoneRect.left + dropzoneRect.width / 2,
      y: dropzoneRect.top + dropzoneRect.height / 2
    };

    const draggableCenter = {
      x: draggableRect.left + draggableRect.width / 2,
      y: draggableRect.top + draggableRect.height / 2
    };

    const distance = Math.sqrt(
      Math.pow(dropzoneCenter.x - draggableCenter.x, 2) +
      Math.pow(dropzoneCenter.y - draggableCenter.y, 2)
    );

    const isOverlapping = overlapPercentage >= this.overlapThreshold;

    return {
      isOverlapping,
      overlapPercentage,
      distance,
      boundingBox: draggableRect
    };
  }

  /**
   * Handle overlap state changes
   */
  private handleOverlapChange(element: HTMLElement, overlapInfo: OverlapInfo): void {
    const wasOverlapping = this.overlappingDraggables.get(element)?.isOverlapping || false;
    const isNowOverlapping = overlapInfo.isOverlapping;

    // Update tracking
    this.overlappingDraggables.set(element, overlapInfo);

    // Emit overlap change
    this.overlapChange.emit(overlapInfo);

    // Handle drag events based on state change
    if (wasOverlapping !== isNowOverlapping) {
      if (isNowOverlapping && !this.shouldIgnoreEvent(element)) {
        this.handleDragEnter(element, overlapInfo);
      } else if (!isNowOverlapping) {
        this.handleDragLeave(element);
      }
    } else if (isNowOverlapping && !this.shouldIgnoreEvent(element)) {
      this.handleDragOver(element, overlapInfo);
    }
  }

  /**
   * Handle drop event
   */
  private handleDrop = (event: PointerEvent): void => {
    // Find overlapping draggable
    for (const [draggable, overlapInfo] of this.overlappingDraggables.entries()) {
      if (overlapInfo.isOverlapping && !this.shouldIgnoreEvent(draggable)) {
        this.emitDropEvent(draggable, overlapInfo, event);
        this.setActive(false);
        break;
      }
    }
  };

  /**
   * Emit drag events
   */
  private handleDragEnter(draggable: HTMLElement, overlapInfo: OverlapInfo): void {
    this.dragEnter.emit(this.createDropEvent(draggable, overlapInfo));
  }

  private handleDragOver(draggable: HTMLElement, overlapInfo: OverlapInfo): void {
    this.dragOver.emit(this.createDropEvent(draggable, overlapInfo));
  }

  private handleDragLeave(draggable: HTMLElement): void {
    const overlapInfo = this.overlappingDraggables.get(draggable) || this.createEmptyOverlapInfo();
    this.dragLeave.emit(this.createDropEvent(draggable, overlapInfo));
  }

  private emitDropEvent(draggable: HTMLElement, overlapInfo: OverlapInfo, event?: PointerEvent): void {
    this.drop.emit({
      ...this.createDropEvent(draggable, overlapInfo),
      event
    });
  }

  /**
   * Create drop event object
   */
  private createDropEvent(draggable: HTMLElement, overlapInfo: OverlapInfo): DropEvent {
    return {
      dropzone: this.elementRef.nativeElement,
      draggable,
      overlapPercentage: overlapInfo.overlapPercentage,
      position: {
        x: draggable.getBoundingClientRect().left,
        y: draggable.getBoundingClientRect().top,
        isDragging: this.dragStates.get(draggable) || false
      }
    };
  }

  private createEmptyOverlapInfo(): OverlapInfo {
    return {
      isOverlapping: false,
      overlapPercentage: 0,
      distance: Infinity,
      boundingBox: new DOMRect()
    };
  }

  /**
   * Check if event should be ignored (e.g., not dragging)
   */
  private shouldIgnoreEvent(element: HTMLElement): boolean {
    return this.requireDragging && !this.dragStates.get(element);
  }

  /**
   * Update active state based on overlapping elements
   */
  private updateActiveState(): void {
    const hasOverlap = Array.from(this.overlappingDraggables.values())
      .some(info => info.isOverlapping);

    this.setActive(hasOverlap);
  }

  private setActive(active: boolean): void {
    if (this.isActive === active) return;
    this.isActive = active;
  }

  /**
   * Public API Methods
   */

  /** Get current overlap information for a specific draggable */
  getOverlapInfo(draggable: HTMLElement): OverlapInfo | null {
    return this.overlappingDraggables.get(draggable) || null;
  }

  /** Get all currently tracked draggable elements */
  getTrackedDraggables(): HTMLElement[] {
    return Array.from(this.draggableElements);
  }

  /** Get all overlapping draggables */
  getOverlappingDraggables(): HTMLElement[] {
    return Array.from(this.overlappingDraggables.entries())
      .filter(([_, info]) => info.isOverlapping)
      .map(([element]) => element);
  }

  /** Check if a specific draggable is overlapping */
  isDraggableOverlapping(draggable: HTMLElement): boolean {
    return this.overlappingDraggables.get(draggable)?.isOverlapping || false;
  }

  /** Manually trigger overlap check */
  checkOverlaps(): void {
    this.checkAllOverlaps();
  }

  /**
   * Cleanup
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Cleanup subscriptions
    this.draggableSubscription?.unsubscribe();

    // Cleanup intersection observer
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    // Cleanup event listeners
    this.draggableElements.forEach(element => {
      element.removeEventListener('dragstart', this.handleDragStart.bind(this, element));
      element.removeEventListener('dragend', this.handleDragEnd.bind(this, element));
      element.removeEventListener('pointerdown', this.handlePointerDown.bind(this, element));
      element.removeEventListener('pointermove', this.handlePointerMove.bind(this, element));
      element.removeEventListener('pointerup', this.handlePointerUp.bind(this, element));
    });

    this.elementRef.nativeElement.removeEventListener('pointerup', this.handleDrop);

    // Clear collections
    this.draggableElements.clear();
    this.overlappingDraggables.clear();
    this.dragStates.clear();
  }
}
