// directives/draggable.directive.ts
import {
  Directive, ElementRef, EventEmitter, Output, Input,
  Renderer2, OnInit, OnDestroy, HostBinding, NgZone
} from '@angular/core';
import { fromEvent, Subscription, Subject } from 'rxjs';
import { takeUntil, filter, switchMap, take } from 'rxjs/operators';

export interface DragPosition {
  x: number;
  y: number;
  absoluteX: number;
  absoluteY: number;
  deltaX: number;
  deltaY: number;
  isDragging: boolean;
}

export interface DraggableDirectiveAPI {
  setPosition(x: number, y: number, animate?: boolean): void;
  getPosition(): { x: number; y: number };
  resetPosition(): void;
  setDisabled(disabled: boolean): void;
  getDelta(): { deltaX: number; deltaY: number };
  getCurrentDelta(): { deltaX: number; deltaY: number };
  getDragState(): { isDragging: boolean; startPosition: { x: number; y: number } };
  updateConfig(config: Partial<DraggableConfig>): void;
}

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

/**
 * Helper function to get element position in document coordinate system
 */
export function getElementDocumentPosition(element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

  return {
    x: rect.left + scrollX,
    y: rect.top + scrollY
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

  // State - all coordinates in document coordinate system
  private initialCursorPosition = { x: 0, y: 0 }; // Cursor position when drag starts
  private elementPosition = { x: 0, y: 0 }; // Element position when drag starts
  private currentPosition = { x: 0, y: 0 }; // Current element position
  private transformOffset = { x: 0, y: 0 }; // Current transform offset
  private currentDelta = { x: 0, y: 0 }; // Current delta from start
  private constrainedDelta = { x: 0, y: 0 }; // Delta after constraints applied

  // Element references
  private handleElement?: HTMLElement;
  private boundaryElement?: HTMLElement;
  private boundaryRect?: DOMRect; // In document coordinates
  private elementRect?: DOMRect; // Element dimensions

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.initializeElements();
    this.setupDrag();

    if (this.dragAutoPosition) {
      //this.calculateInitialPosition();
    } else {
      this.readElementPosition();
    }
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

    // Get boundary element
    if (this.dragBoundary) {
      if (typeof this.dragBoundary === 'string') {
        this.boundaryElement = document.querySelector(this.dragBoundary) as HTMLElement;
      } else {
        this.boundaryElement = this.dragBoundary;
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

    // Store element's current position and dimensions
    this.elementRect = this.elementRef.nativeElement.getBoundingClientRect();

    // Get boundary rectangle in document coordinates if exists
    if (this.boundaryElement) {
      const boundaryClientRect = this.boundaryElement.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;

      this.boundaryRect = new DOMRect(
        boundaryClientRect.left + scrollX,
        boundaryClientRect.top + scrollY,
        boundaryClientRect.width,
        boundaryClientRect.height
      );
    }

    // Reset offsets
    this.transformOffset = { x: 0, y: 0 };
    this.currentDelta = { x: 0, y: 0 };
    this.constrainedDelta = { x: 0, y: 0 };

    // Update cursor
    this.renderer.setStyle(this.handleElement, 'cursor', 'grabbing');

    // Disable transitions during drag for smooth movement
    this.renderer.setStyle(this.elementRef.nativeElement, 'transition', 'none');

    // Emit event inside Angular zone
    this.ngZone.run(() => {
      this.dragStart.emit(event);
    });
  }

  private onDragMove(event: PointerEvent) {
    if (!this.isDragging) return;

    event.preventDefault();

    // Get current cursor position in document coordinates
    const currentCursorPosition = getDocumentCoordinates(event);

    // Calculate the difference from initial cursor position
    const deltaX = event.clientX - this.initialCursorPosition.x;
    const deltaY = event.clientY - this.initialCursorPosition.y;

    // Store current raw delta
    this.currentDelta = { x: deltaX, y: deltaY };

    // Apply grid snapping to the delta
    let snappedDeltaX = deltaX;
    let snappedDeltaY = deltaY;

    if (this.dragSnapToGrid) {
      snappedDeltaX = Math.round(deltaX / this.dragGridSize) * this.dragGridSize;
      snappedDeltaY = Math.round(deltaY / this.dragGridSize) * this.dragGridSize;
    }

    // Calculate proposed new position (using SNAPPED delta, not raw delta)
    const proposedX = this.elementPosition.x + snappedDeltaX;
    const proposedY = this.elementPosition.y + snappedDeltaY;

    // Apply boundary constraints
    const constrained = this.applyBoundaryConstraints(proposedX, proposedY);

    // Calculate the actual movement after constraints (constrained delta)
    const actualDeltaX = constrained.x - this.elementPosition.x;
    const actualDeltaY = constrained.y - this.elementPosition.y;

    // Store constrained delta
    this.constrainedDelta = {
      x: actualDeltaX,
      y: actualDeltaY,
    };

    // Update transform offset (use constrained delta for visual transform)
    this.transformOffset = {
      x: deltaX,
      y: deltaY,
    };

    // Update current position (for boundary calculations and emit)
    this.currentPosition = { x: constrained.x, y: constrained.y };

    // Apply transform immediately
    this.applyTransform();

    // Emit event inside Angular zone
    this.ngZone.run(() => {
      this.dragMove.emit({
        x: this.transformOffset.x,
        y: this.transformOffset.y,
        deltaX: deltaX,
        deltaY: deltaY,
        absoluteX: constrained.x,
        absoluteY: constrained.y,
        isDragging: true
      });
    });
  }

  private onDragEnd(event: PointerEvent) {
    if (!this.isDragging) return;

    this.isDragging = false;

    // Release pointer capture
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);

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
      this.dragEnd.emit({
        x: this.transformOffset.x,
        y: this.transformOffset.y,
        deltaX: this.currentDelta.x,
        deltaY: this.currentDelta.y,
        absoluteX: this.currentPosition.x,
        absoluteY: this.currentPosition.y,
        isDragging: false
      });

      this.positionChanged.emit({
        x: this.currentPosition.x,
        y: this.currentPosition.y
      });
    });

    // Reset offsets
    this.transformOffset = { x: 0, y: 0 };
    this.currentDelta = { x: 0, y: 0 };
    this.constrainedDelta = { x: 0, y: 0 };

    // Clear cached rects
    this.boundaryRect = undefined;
    this.elementRect = undefined;
  }

  private applyBoundaryConstraints(proposedX: number, proposedY: number): { x: number; y: number } {
    if (!this.boundaryElement || !this.boundaryRect || !this.elementRect) {
      return { x: proposedX, y: proposedY };
    }

    // Constrain within boundaries (all in document coordinates)
    const minX = this.boundaryRect.left;
    const maxX = this.boundaryRect.right - this.elementRect.width;
    const minY = this.boundaryRect.top;
    const maxY = this.boundaryRect.bottom - this.elementRect.height;

    const constrainedX = Math.max(minX, Math.min(proposedX, maxX));
    const constrainedY = Math.max(minY, Math.min(proposedY, maxY));

    return {
      x: constrainedX,
      y: constrainedY
    };
  }

  private applyTransform() {
    if (this.dragUseTransform && this.isDragging) {
      // Apply transform during drag
      const transform = `translate(${this.transformOffset.x}px, ${this.transformOffset.y}px)`;
      //const transform = `translate(-50%, -50%)
      //translate(${this.transformOffset.x}px, ${this.transformOffset.y}px)`;
     // const transform = `translate(-50%, -50%); translate(100px, 200px)`;
      this.renderer.setStyle(this.elementRef.nativeElement, 'transform', transform);
    } else {
      this.resetTransform();
    }
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

  // Public API implementation

  /**
   * Get the raw delta (cursor movement without constraints)
   * This shows how much the cursor has moved from the start
   */
  getDelta(): { deltaX: number; deltaY: number } {
    return {
      deltaX: this.currentDelta.x,
      deltaY: this.currentDelta.y
    };
  }

  /**
   * Get the constrained delta (actual element movement after applying boundaries)
   * This shows how much the element has actually moved
   */
  getCurrentDelta(): { deltaX: number; deltaY: number } {
    return {
      deltaX: this.constrainedDelta.x,
      deltaY: this.constrainedDelta.y
    };
  }

  /**
   * Get the current drag state including start position
   */
  getDragState(): { isDragging: boolean; startPosition: { x: number; y: number } } {
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
  }
}

