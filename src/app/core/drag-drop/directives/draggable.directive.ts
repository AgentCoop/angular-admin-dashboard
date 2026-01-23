// directives/draggable.directive.ts
import {
  Directive, ElementRef, EventEmitter, Output, Input,
  Renderer2, OnInit, OnDestroy, HostBinding, NgZone,
  inject
} from '@angular/core';

import { calculateOverlap, OverlapResult } from '@core/dom/overlap';
import { fromEvent, Subscription, Subject } from 'rxjs';
import {takeUntil, filter, switchMap, take, debounceTime} from 'rxjs/operators';

import {
  OverlapEvent, OverlapHistory, OverlapTargetConfig, OverlapInfo,
  DraggableDirectiveAPI,
  DragPosition,
  DragDropService, DragStartEvent, DragEventType
} from '@core/drag-drop';

export interface DraggableConfig {
  dragHandle?: HTMLElement | string;
  dragBoundary?: HTMLElement | string;
  dragDisabled: boolean;
  dragSnapToGrid: boolean;
  dragGridSize: number;
  dragUseTransform: boolean;
  dragConvertToAbsolute: boolean;
  dragAutoPosition: boolean;
}

/**
 * Helper function to get mouse coordinates in document coordinate system
 * This accounts for page scrolling
 */
export function getDocumentCoordinates(event: PointerEvent | MouseEvent): { x: number; y: number } {
  // Use pageX/pageY for document coordinates (includes scroll offset)
  // Fallback to clientX/clientY + scroll offset for compatibility
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

  return {
    x: event.pageX !== undefined ? event.pageX : event.clientX + scrollX,
    y: event.pageY !== undefined ? event.pageY : event.clientY + scrollY
  };
}

@Directive({
  selector: '[appDraggable]',
  standalone: true,
  exportAs: 'appDraggable'
})
export class DraggableDirective implements OnInit, OnDestroy, DraggableDirectiveAPI {
  @Input() dragHandle?: HTMLElement | string;
  @Input() dragBoundary?: HTMLElement | string;
  @Input() dragDisabled = false;
  @Input() dragSnapToGrid = false;
  @Input() dragGridSize = 10;
  @Input() dragUseTransform = true;
  @Input() dragConvertToAbsolute = true;
  @Input() dragAutoPosition = false;
  @Input() dropzoneSelector = '[uiDropzone]';

  @Input() overlapTargetSelector = null;
  @Input() overlapDetectionEnabled = true;
  @Input() overlapChangeThreshold = 0.05; // 5% change triggers overlap-change event
  @Input() minimumOverlapRatio = 0.01; // 1% minimum overlap to trigger
  @Input() autoAddOverlapClasses = true;

  // Event outputs for overlap detection
  @Output() overlapEnter = new EventEmitter<OverlapEvent>();
  @Output() overlapLeave = new EventEmitter<OverlapEvent>();
  @Output() overlapChange = new EventEmitter<OverlapEvent>();
  @Output() overlap = new EventEmitter<OverlapEvent>();


  @Output() dragStart = new EventEmitter<PointerEvent>();
  @Output() dragMove = new EventEmitter<DragPosition>();
  @Output() dragEnd = new EventEmitter<DragPosition>();
  @Output() positionChanged = new EventEmitter<{ x: number; y: number }>();

  @HostBinding('class.dragging') isDragging = false;
  @HostBinding('style.position') position = 'absolute';
  @HostBinding('style.user-select') userSelect = 'none';
  @HostBinding('style.touch-action') touchAction = 'none';

  private dragSubscriptions = new Subscription();
  private destroy$ = new Subject<void>();

  // Intersection Observer for dropzone detection
  private intersectionDropzonesObserver?: IntersectionObserver;
  private observedDropzones = new Set<HTMLElement>();
  private overlappingDropzones = new Set<HTMLElement>();

  // Dropzone tracking via selector tracker
  private dropzoneElements = new Map<HTMLElement, {
    overlapPercentage: number;
    isOverlapping: boolean;
  }>();

  // State - all coordinates in document coordinate system
  private initialCursorPosition = { x: 0, y: 0 }; // Cursor position when drag starts
  private elementPosition = { x: 0, y: 0 }; // Element position when drag starts
  private currentPosition = { x: 0, y: 0 }; // Current element position
  private transformOffset = { x: 0, y: 0 }; // Current transform offset
  private currentDelta = { x: 0, y: 0 }; // Current delta from start
  private constrainedDelta = { x: 0, y: 0 }; // Delta after constraints applied

  // Element references
  private handleElement?: HTMLElement;

  // New inputs for overlap detection

  // Overlap detection properties
  private overlapTargets = new Map<HTMLElement, {
    overlapPercentage: number;
    isOverlapping: boolean;
    config?: OverlapTargetConfig;
  }>();

  private previousOverlapStates = new Map<HTMLElement, boolean>();
  private overlapHistory = new Map<HTMLElement, OverlapHistory>();
  private overlapCheckInterval?: number;
  private isCheckingOverlap = false;

  // Services
  private dragDropService = inject(DragDropService);

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private ngZone: NgZone
  ) {}

  get element(): HTMLElement {
      return this.elementRef.nativeElement;
  }

  ngOnInit() {
    this.initializeElements();
    this.setupDrag();

    // Setup overlap targets if enabled
    if (this.overlapDetectionEnabled) {
      this.initializeOverlapTargets();
    }

    if (this.dragAutoPosition) {
      //this.calculateInitialPosition();
    } else {
      this.readElementPosition();
    }
  }

  ngAfterViewInit() {
    this.dragDropService.registerDraggable(this);
  }

  private initializeElements() {
    // Get handle element
    if (this.dragHandle) {
      if (typeof this.dragHandle === 'string') {
        this.handleElement = this.elementRef.nativeElement.querySelector(this.dragHandle) as HTMLElement;
      } else {
        this.handleElement = this.dragHandle;
      }
    }

    // Default to element itself if no handle specified
    if (!this.handleElement) {
      this.handleElement = this.elementRef.nativeElement;
    }

    // Set cursor
    this.renderer.setStyle(this.handleElement, 'cursor', 'grab');
  }

  private readElementPosition() {
    // Read current position from element's style (already in document coordinates)
    const style = window.getComputedStyle(this.elementRef.nativeElement);
    const left = parseFloat(style.left) || 0;
    const top = parseFloat(style.top) || 0;

    this.elementPosition = { x: left, y: top };
  }

  private setupDrag() {
    this.ngZone.runOutsideAngular(() => {
      const mousedown$ = fromEvent<PointerEvent>(this.handleElement!, 'pointerdown').pipe(
        filter(event => !this.dragDisabled && event.button === 0), // Left click only
        filter(() => !this.isDragging)
      );

      const drag$ = mousedown$.pipe(
        switchMap(startEvent => {
          this.onDragStart(startEvent);

          const mousemove$ = fromEvent<PointerEvent>(document, 'pointermove');
          const mouseup$ = fromEvent<PointerEvent>(document, 'pointerup');

          return mousemove$.pipe(
            takeUntil(mouseup$.pipe(
              take(1),
              switchMap(endEvent => {
                this.onDragEnd(endEvent);
                return [];
              })
            ))
          );
        })
      );

      this.dragSubscriptions.add(
        drag$.subscribe(moveEvent => {
          this.onDragMove(moveEvent);
        })
      );
    });
  }

  private onDragStart(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();

    this.isDragging = true;

    // Capture pointer for consistent dragging
    (event.target as HTMLElement).setPointerCapture(event.pointerId);

    // Store initial cursor position in document coordinates
    this.initialCursorPosition = { x: event.clientX, y: event.clientY };

    this.readElementPosition();

    // Start overlap detection
    if (this.overlapDetectionEnabled) {
      this.initializeOverlapTargets();
    }

    // Reset offsets
    this.transformOffset = { x: 0, y: 0 };

    // Update cursor
    this.renderer.setStyle(this.handleElement, 'cursor', 'grabbing');

    // Disable transitions during drag for smooth movement
    this.renderer.setStyle(this.elementRef.nativeElement, 'transition', 'none');


    // Create and emit drag start event
    const dragStartEvent: DragStartEvent = {
      type: DragEventType.DRAG_START,
      draggable: this,
      timestamp: performance.now(),
      pointerEvent: event,
    };

    // Emit event inside Angular zone
    this.ngZone.run(() => {
      this.dragStart.emit(event);
      this.dragDropService.dispatchDragStart(dragStartEvent);
    });
  }

  private onDragMove(event: PointerEvent) {
    if (!this.isDragging) return;

    event.preventDefault();

    // Calculate the difference from initial cursor position
    const deltaX = event.clientX - this.initialCursorPosition.x;
    const deltaY = event.clientY - this.initialCursorPosition.y;

    // Store current raw delta
    this.currentDelta = { x: deltaX, y: deltaY };

    // Update transform offset (use constrained delta for visual transform)
    this.transformOffset = {
      x: deltaX,
      y: deltaY,
    };

    // Apply transform immediately
    this.applyTransform();

    if (this.overlapDetectionEnabled) {
      this.startOverlapDetection();
    }

    // Emit event inside Angular zone
    this.ngZone.run(() => {
      // this.dragMove.emit({
      //   x: this.transformOffset.x,
      //   y: this.transformOffset.y,
      //   deltaX: deltaX,
      //   deltaY: deltaY,
      //   isDragging: true
      // });
    });
  }

  private onDragEnd(event: PointerEvent) {
    if (!this.isDragging) return;

    this.isDragging = false;

    // Release pointer capture
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);

    //this.stopDropzonesIntersectionObserver();

    this.stopOverlapDetection();

    // Reset cursor
    this.renderer.setStyle(this.handleElement, 'cursor', 'grab');

    // Convert transform to absolute position if enabled
    if (this.dragConvertToAbsolute && (this.transformOffset.x !== 0 || this.transformOffset.y !== 0)) {
      this.convertToAbsolutePosition();
    } else {
      // Reset transform
      this.resetTransform();
    }

    // Update element start position to match current position (for next drag)
    this.elementPosition = { ...this.currentPosition };

    // Emit final position
    this.ngZone.run(() => {
      // this.dragEnd.emit({
      // });

      this.positionChanged.emit({
        x: this.currentPosition.x,
        y: this.currentPosition.y
      });
    });

    // Reset offsets
    this.transformOffset = { x: 0, y: 0 };
    this.currentDelta = { x: 0, y: 0 };
    this.constrainedDelta = { x: 0, y: 0 };
  }


  /**
   * Initializes overlap targets based on selector
   */
  private initializeOverlapTargets(): void {
    const targets = this.getOverlapTargets();

    targets.forEach(target => {
      this.overlapTargets.set(target, {
        overlapPercentage: 0,
        isOverlapping: false
      });

      this.previousOverlapStates.set(target, false);

      this.overlapHistory.set(target, {
        lastEnterTime: 0,
        lastLeaveTime: 0,
        totalOverlapTime: 0,
        overlapCount: 0,
        lastOverlapRatio: 0
      });

      // Add data attribute for identification
      target.setAttribute('data-overlap-registered', 'true');
    });

    console.log(`Initialized ${targets.length} overlap targets`);
  }

  /**
   * Gets all overlap target elements
   */
  private getOverlapTargets(): HTMLElement[] {
    // Use configured selector or fallback to the service
    if (this.overlapTargetSelector) {
      return Array.from(
        document.querySelectorAll(this.overlapTargetSelector)
      ) as HTMLElement[];
    }

    return this.dragDropService.getOverlapTargetElements();
  }

  /**
   * Starts checking for overlaps (called during drag)
   */
  private startOverlapDetection(): void {
    if (!this.overlapDetectionEnabled || this.isCheckingOverlap) return;

    this.isCheckingOverlap = true;
    //this.initializeOverlapTargets();

    // Use requestAnimationFrame for smooth, frame-synced checking
    const checkOverlaps = () => {
      if (!this.isDragging || !this.isCheckingOverlap) return;

      this.checkElementOverlap();

      if (this.isDragging && this.isCheckingOverlap) {
        requestAnimationFrame(checkOverlaps);
      }
    };

    requestAnimationFrame(checkOverlaps);
  }

  /**
   * Stops overlap detection
   */
  private stopOverlapDetection(): void {
    this.isCheckingOverlap = false;

    // Reset all overlap states
    this.resetOverlapStates();
  }

  /**
   * Checks for overlap between this element and all registered targets
   */
  private checkElementOverlap(): void {
    const sourceRect = this.element.getBoundingClientRect();

    // Skip if source has zero area
    if (sourceRect.width === 0 || sourceRect.height === 0) {
      return;
    }

    this.overlapTargets.forEach((_, target) => {
      const targetRect = target.getBoundingClientRect();

      // Skip if target has zero area or is not visible
      if (targetRect.width === 0 || targetRect.height === 0) {
        return;
      }

      // Calculate overlap
      const overlapResult = calculateOverlap(sourceRect, targetRect, target);

      // Determine if overlapping now
      const isNowOverlapping = overlapResult.isOverlapping &&
        overlapResult.overlapRatio >= this.minimumOverlapRatio;
      const wasOverlapping = this.previousOverlapStates.get(target) || false;

      // Update history tracking
      this.updateOverlapHistory(target, isNowOverlapping, overlapResult.overlapRatio);

      // Handle state transitions
      if (isNowOverlapping && !wasOverlapping) {
        this.handleOverlapEnter(target, overlapResult);
      } else if (!isNowOverlapping && wasOverlapping) {
        this.handleOverlapLeave(target, overlapResult);
      } else if (isNowOverlapping && wasOverlapping) {
        this.handleOverlapChange(target, overlapResult);
      }

      // Always emit continuous overlap while inside
      if (isNowOverlapping) {
        this.handleContinuousOverlap(target, overlapResult);
      }

      // Update previous state
      this.previousOverlapStates.set(target, isNowOverlapping);

      // Update tracking map
      const targetInfo = this.overlapTargets.get(target);
      if (targetInfo) {
        targetInfo.overlapPercentage = overlapResult.overlapRatio * 100;
        targetInfo.isOverlapping = isNowOverlapping;
      }
    });
  }

  /**
   * Updates overlap interaction history
   */
  private updateOverlapHistory(
    target: HTMLElement,
    isNowOverlapping: boolean,
    currentRatio: number
  ): void {
    let history = this.overlapHistory.get(target);
    if (!history) {
      history = {
        lastEnterTime: 0,
        lastLeaveTime: 0,
        totalOverlapTime: 0,
        overlapCount: 0,
        lastOverlapRatio: 0
      };
      this.overlapHistory.set(target, history);
    }

    const now = Date.now();

    if (isNowOverlapping && history.lastEnterTime === 0) {
      // First entry
      history.lastEnterTime = now;
      history.overlapCount++;
    } else if (!isNowOverlapping && history.lastEnterTime > 0) {
      // Exiting after overlap
      history.lastLeaveTime = now;
      history.totalOverlapTime += (now - history.lastEnterTime);
      history.lastEnterTime = 0;
    }

    history.lastOverlapRatio = currentRatio;
  }

  /**
   * Handles source entering target area
   */
  private handleOverlapEnter(target: HTMLElement, overlapResult: OverlapResult): void {
    // Log for debugging
    console.log('OVERLAP ENTER:', {
      target: target.className || target.id || 'unnamed',
      source: this.element.className || this.element.id || 'unnamed',
      ratio: `${(overlapResult.overlapRatio * 100).toFixed(1)}%`,
      area: `${overlapResult.overlapArea.toFixed(0)}px²`,
      entrySide: overlapResult.entrySide
    });

    // Add visual classes if enabled
    if (this.autoAddOverlapClasses) {
      target.classList.add('overlap-target-active');
      target.classList.add('overlap-enter');
      this.element.classList.add('overlapping-target');
    }

    // Emit Angular event
    this.emitOverlapEvent({
      type: 'enter',
      target,
      overlapResult,
      timestamp: Date.now(),
      source: this.element
    });

    // Dispatch custom DOM event
    this.dispatchOverlapEvent('overlapEnter', target, overlapResult);
  }

  /**
   * Handles source leaving target area
   */
  private handleOverlapLeave(target: HTMLElement, overlapResult: OverlapResult): void {
    console.log('OVERLAP LEAVE:', {
      target: target.className || target.id || 'unnamed',
      source: this.element.className || this.element.id || 'unnamed',
      timeInside: this.getTimeInsideTarget(target),
      totalOverlaps: this.overlapHistory.get(target)?.overlapCount || 0
    });

    // Remove visual classes if enabled
    if (this.autoAddOverlapClasses) {
      target.classList.remove('overlap-target-active', 'overlap-low', 'overlap-medium', 'overlap-high');
      target.classList.add('overlap-leave');
      this.element.classList.remove('overlapping-target');

      // Remove leave class after animation
      setTimeout(() => {
        target.classList.remove('overlap-leave');
      }, 300);
    }

    // Emit Angular event
    this.emitOverlapEvent({
      type: 'leave',
      target,
      overlapResult,
      timestamp: Date.now(),
      source: this.element
    });

    // Dispatch custom DOM event
    this.dispatchOverlapEvent('overlapLeave', target, overlapResult);
  }

  /**
   * Handles overlap percentage change while inside target
   */
  private handleOverlapChange(target: HTMLElement, overlapResult: OverlapResult): void {
    const targetInfo = this.overlapTargets.get(target);
    const history = this.overlapHistory.get(target);

    if (!targetInfo || !history) return;

    const previousRatio = history.lastOverlapRatio;
    const currentRatio = overlapResult.overlapRatio;
    const ratioChange = Math.abs(currentRatio - previousRatio);

    // Only trigger if change is significant
    if (ratioChange >= this.overlapChangeThreshold) {
      console.log('OVERLAP CHANGE:', {
        target: target.className || target.id || 'unnamed',
        previous: `${(previousRatio * 100).toFixed(1)}%`,
        current: `${(currentRatio * 100).toFixed(1)}%`,
        change: `${(ratioChange * 100).toFixed(1)}%`
      });

      // Update visual intensity
      if (this.autoAddOverlapClasses) {
        this.updateOverlapIntensity(target, currentRatio);
      }

      // Emit change event
      this.emitOverlapEvent({
        type: 'overlap-change',
        target,
        overlapResult,
        timestamp: Date.now(),
        source: this.element
      });

      // Dispatch custom DOM event
      this.dispatchOverlapEvent('overlapChange', target, overlapResult);
    }
  }

  /**
   * Handles continuous overlap (called on every check while overlapping)
   */
  private handleContinuousOverlap(target: HTMLElement, overlapResult: OverlapResult): void {
    // Emit continuous overlap event for real-time tracking
    this.emitOverlapEvent({
      type: 'overlap',
      target,
      overlapResult,
      timestamp: Date.now(),
      source: this.element
    });
  }

  /**
   * Updates visual intensity based on overlap ratio
   */
  private updateOverlapIntensity(target: HTMLElement, overlapRatio: number): void {
    // Remove all intensity classes
    target.classList.remove('overlap-low', 'overlap-medium', 'overlap-high');

    // Add appropriate intensity class
    if (overlapRatio >= 0.7) {
      target.classList.add('overlap-high');
    } else if (overlapRatio >= 0.3) {
      target.classList.add('overlap-medium');
    } else if (overlapRatio > 0) {
      target.classList.add('overlap-low');
    }
  }

  /**
   * Emits overlap events through Angular's change detection
   */
  private emitOverlapEvent(event: OverlapEvent): void {
    this.ngZone.run(() => {
      // Emit through appropriate output based on type
      switch (event.type) {
        case 'enter':
          this.overlapEnter.emit(event);
          break;
        case 'leave':
          this.overlapLeave.emit(event);
          break;
        case 'overlap-change':
          this.overlapChange.emit(event);
          break;
        case 'overlap':
          this.overlap.emit(event);
          break;
      }

      // Also emit through service if available
      if (this.dragDropService) {
        //this.dragDropService.dispatchOverlapEvent(event);
      }
    });
  }

  /**
   * Dispatches custom DOM events for non-Angular listeners
   */
  private dispatchOverlapEvent(eventName: string, target: HTMLElement, overlapResult: OverlapResult): void {
    const event = new CustomEvent(eventName, {
      detail: {
        source: this.element,
        target,
        overlapResult,
        timestamp: Date.now()
      },
      bubbles: true,
      cancelable: true
    });

    this.element.dispatchEvent(event);
    target.dispatchEvent(event);
  }

  /**
   * Gets the total time spent inside a target
   */
  private getTimeInsideTarget(target: HTMLElement): string {
    const history = this.overlapHistory.get(target);
    if (!history) return '0ms';

    let totalTime = history.totalOverlapTime;

    // Add current overlap time if still inside
    if (history.lastEnterTime > 0) {
      totalTime += (Date.now() - history.lastEnterTime);
    }

    if (totalTime < 1000) {
      return `${totalTime}ms`;
    } else {
      return `${(totalTime / 1000).toFixed(2)}s`;
    }
  }

  /**
   * Resets all overlap states
   */
  private resetOverlapStates(): void {
    // Remove visual classes from all targets
    this.overlapTargets.forEach((_, target) => {
      if (this.autoAddOverlapClasses) {
        target.classList.remove(
          'overlap-target-active',
          'overlap-enter',
          'overlap-leave',
          'overlap-low',
          'overlap-medium',
          'overlap-high'
        );
      }
    });

    // Remove visual class from this element
    this.element.classList.remove('overlapping-target');

    // Reset tracking maps (but keep history)
    this.previousOverlapStates.clear();

    // Update overlapTargets to mark all as not overlapping
    this.overlapTargets.forEach((info, target) => {
      info.isOverlapping = false;
      info.overlapPercentage = 0;
    });
  }

  private applyTransform() {
    // Apply transform during drag
    const transform = `translate(${this.transformOffset.x}px, ${this.transformOffset.y}px)`;
    // const transform = `translate(-50%, -50%); translate(100px, 200px)`;
    this.renderer.setStyle(this.elementRef.nativeElement, 'transform', transform);
  }

  private convertToAbsolutePosition() {
    // Apply absolute positioning
    const absX = this.elementPosition.x + this.transformOffset.x;
    const absY = this.elementPosition.y + this.transformOffset.y;
    this.renderer.setStyle(this.elementRef.nativeElement, 'left', `${absX}px`);
    this.renderer.setStyle(this.elementRef.nativeElement, 'top', `${absY}px`);

    this.resetTransform();
  }

  private resetTransform() {
    this.renderer.setStyle(this.elementRef.nativeElement, 'transform', 'none');

    // Re-enable transitions
    this.renderer.removeStyle(this.elementRef.nativeElement, 'transition');
  }

  /**
   * Returns intersection thresholds based on precision mode
   *
   * @param {boolean} highPrecisionMode - When true, returns more granular thresholds
   * @returns {number[]} Array of threshold values between 0 and 1
   */
  private getIntersectionThresholds(highPrecisionMode: boolean = true): number[] {
    if (highPrecisionMode) {
      // High precision: 21 steps (0%, 5%, 10%, ..., 100%)
      return Array.from({ length: 21 }, (_, i) => i * 0.05);
    }

    // Default precision: 11 steps (0%, 10%, 20%, ..., 100%)
    return Array.from({ length: 11 }, (_, i) => i * 0.1);
  }

  // Public API implementation

  /**
   * Get the current drag state including start position
   */
  getState(): { isDragging: boolean; startPosition: { x: number; y: number } } {
    return {
      isDragging: this.isDragging,
      startPosition: { ...this.elementPosition }
    };
  }

  setPosition(x: number, y: number, animate = false): void {
    this.ngZone.run(() => {
      if (animate) {
        this.renderer.setStyle(this.elementRef.nativeElement, 'transition', 'left 0.3s ease, top 0.3s ease');
      }

      this.currentPosition = { x, y };
      this.elementPosition = { x, y };
      this.renderer.setStyle(this.elementRef.nativeElement, 'left', `${x}px`);
      this.renderer.setStyle(this.elementRef.nativeElement, 'top', `${y}px`);

      this.positionChanged.emit({ x, y });

      if (animate) {
        // Remove transition after animation completes
        setTimeout(() => {
          this.renderer.removeStyle(this.elementRef.nativeElement, 'transition');
        }, 300);
      }
    });
  }

  getPosition(): { x: number; y: number } {
    return { ...this.currentPosition };
  }

  resetPosition(): void {
    this.setPosition(0, 0, true);
  }

  setDisabled(disabled: boolean): void {
    this.dragDisabled = disabled;
    this.renderer.setStyle(
      this.handleElement,
      'cursor',
      disabled ? 'default' : 'grab'
    );
  }

  updateConfig(config: Partial<DraggableConfig>): void {
    Object.assign(this, config);
    this.initializeElements(); // Re-initialize if needed
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.dragSubscriptions.unsubscribe();
    this.dragDropService.unregisterDraggable(this);
  }
}

