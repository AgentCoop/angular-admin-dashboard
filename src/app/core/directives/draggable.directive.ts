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
  isDragging: boolean;
}

export interface DragConstraints {
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  element?: HTMLElement;
}

@Directive({
  selector: '[appDraggable]',
  standalone: true,
  exportAs: 'appDraggable' // Allows template reference
})
export class DraggableDirective implements OnInit, OnDestroy {
  @Input() dragHandle?: HTMLElement | string;
  @Input() dragBoundary?: HTMLElement | string;
  @Input() dragDisabled = false;
  @Input() dragSnapToGrid = false;
  @Input() dragGridSize = 10;
  @Input() dragUseTransform = true; // Use transform during drag
  @Input() dragConvertToAbsolute = true; // Convert to absolute on drop
  @Input() dragAutoPosition = false; // Auto-calc initial position

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

  // State
  private startPosition = { x: 0, y: 0 };
  private currentPosition = { x: 0, y: 0 };
  private transformOffset = { x: 0, y: 0 };
  private initialRect?: DOMRect;

  // Element references
  private handleElement?: HTMLElement;
  private boundaryElement?: HTMLElement;

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.initializeElements();
    this.setupDrag();

    if (this.dragAutoPosition) {
      this.calculateInitialPosition();
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

  private calculateInitialPosition() {
    // Get computed position to initialize coordinates
    const style = window.getComputedStyle(this.elementRef.nativeElement);
    const left = parseFloat(style.left) || 0;
    const top = parseFloat(style.top) || 0;

    this.currentPosition = { x: left, y: top };
    this.updateElementPosition();
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
    this.isDragging = true;

    // Capture pointer for consistent dragging
    (event.target as HTMLElement).setPointerCapture(event.pointerId);

    // Save initial positions
    this.initialRect = this.elementRef.nativeElement.getBoundingClientRect();
    this.startPosition = { x: event.clientX, y: event.clientY };

    // Reset transform offset for new drag session
    this.transformOffset = { x: 0, y: 0 };

    // Update cursor
    this.renderer.setStyle(this.handleElement, 'cursor', 'grabbing');

    // Emit event inside Angular zone
    this.ngZone.run(() => {
      this.dragStart.emit(event);
    });
  }

  private onDragMove(event: PointerEvent) {
    if (!this.isDragging) return;

    // Calculate delta
    const deltaX = event.clientX - this.startPosition.x;
    const deltaY = event.clientY - this.startPosition.y;

    // Apply grid snapping
    let newX = deltaX;
    let newY = deltaY;

    if (this.dragSnapToGrid) {
      newX = Math.round(deltaX / this.dragGridSize) * this.dragGridSize;
      newY = Math.round(deltaY / this.dragGridSize) * this.dragGridSize;
    }

    // Apply boundary constraints
    const constrained = this.applyBoundaryConstraints(newX, newY);

    // Update transform offset
    this.transformOffset = { x: constrained.x, y: constrained.y };

    // Update element position
    this.updateElementPosition();

    // Calculate absolute position
    const absoluteX = this.currentPosition.x + constrained.x;
    const absoluteY = this.currentPosition.y + constrained.y;

    // Emit event inside Angular zone
    this.ngZone.run(() => {
      this.dragMove.emit({
        x: constrained.x,
        y: constrained.y,
        absoluteX,
        absoluteY,
        isDragging: true
      });
    });

    // Request animation frame for smooth updates
    requestAnimationFrame(() => {
      this.applyTransform();
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

    // Calculate final absolute position
    const absoluteX = this.currentPosition.x;
    const absoluteY = this.currentPosition.y;

    // Emit final position
    this.ngZone.run(() => {
      this.dragEnd.emit({
        x: this.transformOffset.x,
        y: this.transformOffset.y,
        absoluteX,
        absoluteY,
        isDragging: false
      });

      this.positionChanged.emit({ x: absoluteX, y: absoluteY });
    });

    // Reset transform offset
    this.transformOffset = { x: 0, y: 0 };
  }

  private applyBoundaryConstraints(deltaX: number, deltaY: number): { x: number; y: number } {
    if (!this.boundaryElement || !this.initialRect) {
      return { x: deltaX, y: deltaY };
    }

    const boundaryRect = this.boundaryElement.getBoundingClientRect();

    // Calculate proposed absolute position
    const proposedLeft = this.currentPosition.x + deltaX;
    const proposedTop = this.currentPosition.y + deltaY;

    // Constrain within boundaries
    const minX = 0;
    const maxX = boundaryRect.width - this.initialRect.width;
    const minY = 0;
    const maxY = boundaryRect.height - this.initialRect.height;

    const constrainedX = Math.max(minX, Math.min(proposedLeft, maxX));
    const constrainedY = Math.max(minY, Math.min(proposedTop, maxY));

    // Return constrained deltas
    return {
      x: constrainedX - this.currentPosition.x,
      y: constrainedY - this.currentPosition.y
    };
  }

  private updateElementPosition() {
    // Update current position (absolute)
    if (this.dragConvertToAbsolute && !this.isDragging) {
      // Only update during drag if we're not converting to absolute
      this.currentPosition.x += this.transformOffset.x;
      this.currentPosition.y += this.transformOffset.y;
    }
  }

  private applyTransform() {
    if (this.dragUseTransform && this.isDragging) {
      // Apply transform during drag
      const transform = `translate(${this.transformOffset.x}px, ${this.transformOffset.y}px)`;
      this.renderer.setStyle(this.elementRef.nativeElement, 'transform', transform);

      // Disable transitions during drag for smooth movement
      this.renderer.setStyle(this.elementRef.nativeElement, 'transition', 'none');
    } else {
      this.resetTransform();
    }
  }

  private convertToAbsolutePosition() {
    // Calculate new absolute position
    const newX = this.currentPosition.x + this.transformOffset.x;
    const newY = this.currentPosition.y + this.transformOffset.y;

    // Update current position
    this.currentPosition = { x: newX, y: newY };

    // Apply absolute positioning
    this.renderer.setStyle(this.elementRef.nativeElement, 'left', `${newX}px`);
    this.renderer.setStyle(this.elementRef.nativeElement, 'top', `${newY}px`);

    // Reset transform
    this.resetTransform();

    // Re-enable transitions
    this.renderer.removeStyle(this.elementRef.nativeElement, 'transition');
  }

  private resetTransform() {
    this.renderer.setStyle(this.elementRef.nativeElement, 'transform', 'none');
  }

  /**
   * Public API: Set position programmatically
   */
  setPosition(x: number, y: number, animate = false) {
    this.ngZone.run(() => {
      if (animate) {
        this.renderer.setStyle(this.elementRef.nativeElement, 'transition', 'left 0.3s ease, top 0.3s ease');
      }

      this.currentPosition = { x, y };
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

  /**
   * Public API: Get current position
   */
  getPosition(): { x: number; y: number } {
    return { ...this.currentPosition };
  }

  /**
   * Public API: Reset to initial position
   */
  resetPosition() {
    this.setPosition(0, 0, true);
  }

  /**
   * Public API: Enable/disable dragging
   */
  setDisabled(disabled: boolean) {
    this.dragDisabled = disabled;
    this.renderer.setStyle(
      this.handleElement,
      'cursor',
      disabled ? 'default' : 'grab'
    );
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.dragSubscriptions.unsubscribe();
  }
}
