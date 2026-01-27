// services/drag-drop.service.ts
import {Injectable, Inject, Optional, InjectionToken, NgZone} from '@angular/core';
import { Subject, Subscription, Observable, BehaviorSubject, fromEvent } from 'rxjs';
import { filter, takeUntil, take } from 'rxjs/operators';

import {
  DraggableDirectiveAPI, DragData, DragEvent, DragState, DragDropConfig, DEFAULT_DRAG_DROP_CONFIG,
  OverlapTargetAPI, DragStartEvent, DragEndEvent, DragMoveEvent, DragEventType
} from '@core/drag-drop';

export const DRAG_DROP_CONFIG = new InjectionToken<DragDropConfig>('DragDropConfig');

@Injectable({
  providedIn: 'root'
})
export class DragDropService {
  // Registry using references as keys
  private draggables = new Set<DraggableDirectiveAPI>();
  private draggablesSelection = new Set<DraggableDirectiveAPI>();
  private overlapTargets = new Set<OverlapTargetAPI>();

  private isDragging = false;
  private dragStartPosition: { x: number; y: number } | null = null;
  private activeDragSubscription: Subscription | null = null;

  // Selection tracking
  private selectionChange$ = new BehaviorSubject<DraggableDirectiveAPI[]>([]);

  // State streams
  private dragStart$ = new Subject<DragStartEvent>();
  private dragMove$ = new Subject<DragMoveEvent>();
  private dragEnd$ = new Subject<DragEndEvent>();
  private drop$ = new Subject<DragEvent>();

  // Active drag state
  private currentDrag = new BehaviorSubject<DragState | null>(null);

  // Configuration
  private config: DragDropConfig;

  constructor(
    private ngZone: NgZone,
  @Optional() @Inject(DRAG_DROP_CONFIG) config?: DragDropConfig
  ) {
    this.config = { ...DEFAULT_DRAG_DROP_CONFIG, ...config };
    this.setupDragListeners();
  }

  /**
   * Set up drag listeners when drag starts
   */
  private setupDragListeners(): void {
    // Clean up any existing drag listeners
    this.cleanupDragListeners();

    this.ngZone.runOutsideAngular(() => {
      // Create a new subscription for this drag session
      const dragSessionSub = new Subscription();

      // Use pointermove instead of mousemove for consistency
      const pointermove$ = fromEvent<PointerEvent>(document, 'pointermove');
      const pointerup$ = fromEvent<PointerEvent>(document, 'pointerup');
      const pointercancel$ = fromEvent<PointerEvent>(document, 'pointercancel');
      const escape$ = fromEvent<KeyboardEvent>(document, 'keydown');

      // 1. Pointer move handling
      dragSessionSub.add(
        pointermove$.pipe(
          filter(() => this.isDragging) // Only process if dragging
        ).subscribe(moveEvent => {
          this.handleDragMove(moveEvent);
        })
      );

      // 2. Pointer up handling
      dragSessionSub.add(
        pointerup$.pipe(
          filter(() => this.isDragging), // Only process if dragging
          take(1) // Take only the first pointerup
        ).subscribe(upEvent => {
          this.handleDragEnd(upEvent);
        })
      );

      // 3. Pointer cancel handling (for touch interruptions)
      dragSessionSub.add(
        pointercancel$.pipe(
          filter(() => this.isDragging),
          take(1)
        ).subscribe(() => {
          this.handleDragCancel();
        })
      );

      // 4. Escape key handling
      dragSessionSub.add(
        escape$.pipe(
          filter(event => event.key === 'Escape' && this.isDragging),
          take(1)
        ).subscribe(() => {
          this.handleDragCancel();
        })
      );

      this.activeDragSubscription = dragSessionSub;
    });
  }

  private cleanupDragListeners(): void {
    if (this.activeDragSubscription) {
      this.activeDragSubscription.unsubscribe();
      this.activeDragSubscription = null;
    }
  }

  private handleDragMove(event: PointerEvent): void {
    if (!this.isDragging) return;

    // Calculate delta from the start position
    // @ts-ignore
    const deltaX = event.clientX - this.dragStartPosition.x;
    // @ts-ignore
    const deltaY = event.clientY - this.dragStartPosition.y;

    // Create drag move event
    const dragMoveEvent: DragMoveEvent = {
      type: DragEventType.DRAG_MOVE,
      timestamp: performance.now(),
      selection: Array.from(this.draggablesSelection),
      deltaPointerPosition: { x: deltaX, y: deltaY },
    };

    this.dragMove$.next(dragMoveEvent);

    // Dispatch drag move event
    //this.dispatchDragMove(dragMoveEvent);

    // Run change detection if needed
    if (this.ngZone) {
      this.ngZone.run(() => {});
    }
  }

  private handleDragCancel(): void {
    if (!this.isDragging) return;

    const dragEndEvent: DragEndEvent = {
      type: DragEventType.DRAG_END,
      timestamp: performance.now(),
     // selection: Array.from(this.draggablesSelection),
    };

    this.dispatchDragEnd(dragEndEvent);
  }

  private handleDragEnd(event: MouseEvent): void {

    // Run change detection if needed
    if (this.ngZone) {
      this.ngZone.run(() => {});
    }
  }

  private emitSelectionChange(): void {
    this.selectionChange$.next(this.getCurrentSelection());
  }

  // Public API

  /**
   * Add a draggable to the current selection
   */
  public addToSelection(draggable: DraggableDirectiveAPI): void {
    if (!this.draggablesSelection.has(draggable)) {
      this.draggablesSelection.add(draggable);
      this.emitSelectionChange();
    }
  }

  /**
   * Remove a draggable from the current selection by reference
   */
  public removeFromSelection(draggable: DraggableDirectiveAPI): boolean {
    const removed = this.draggablesSelection.delete(draggable);
    if (removed) {
      this.emitSelectionChange();
    }
    return removed;
  }

  public onSelectionChange(): Observable<DraggableDirectiveAPI[]> {
    return this.selectionChange$.asObservable();
  }

  public getCurrentSelection(): DraggableDirectiveAPI[] {
    return Array.from(this.draggablesSelection);
  }

  public clearSelection(): void {
    this.draggablesSelection.clear();
    this.emitSelectionChange();
  }

  public onDragStart(): Observable<DragStartEvent> {
    return this.dragStart$.asObservable();
  }

  public onDragMove(): Observable<DragMoveEvent> {
    return this.dragMove$.asObservable();
  }

  public onDragEnd(): Observable<DragEndEvent> {
    return this.dragEnd$.asObservable();
  }

  public onDrop(): Observable<DragEvent> {
    return this.drop$.asObservable();
  }

  public getCurrentDrag(): Observable<DragState | null> {
    return this.currentDrag.asObservable();
  }

  public registerDraggable(draggable: DraggableDirectiveAPI): void {
    // Check if already registered
    if (this.draggables.has(draggable)) {
      console.warn('Draggable already registered:');
      return;
    }

    // Add to registry
    this.draggables.add(draggable);
  }

  /**
   * Unregister a draggable directive from the service
   * @param draggable The draggable directive API instance
   */
  public unregisterDraggable(draggable: DraggableDirectiveAPI): void {
    // Check if registered
    if (!this.draggables.has(draggable)) {
      console.warn('Draggable not registered:');
      return;
    }

    // Remove from registry
    this.draggables.delete(draggable);
  }


  /**
   * Registers a generic overlap target element
   */
  public registerOverlapTarget(target: OverlapTargetAPI): void {
    this.overlapTargets.add(target);
  }

  /**
   * Unregisters an overlap target element
   * @param target The overlap target or its ID
   */
  public unregisterOverlapTarget(target: OverlapTargetAPI): void {
    if (!this.overlapTargets.has(target)) {
      console.warn(`Overlap target  not found`);
      return;
    }

    this.overlapTargets.delete(target);
  }

  /**
   * Gets all registered overlap target elements
   * @returns Array of HTMLElement for all overlap targets
   */
  public getOverlapTargetElements(): HTMLElement[] {
    return Array.from(this.overlapTargets.values()).map(t => t.element);
  }

  /**
   * Get all registered draggable elements
   * @returns Array of HTMLElement for all draggables
   */
  public getDraggableElements(): HTMLElement[] {
    return Array.from(this.draggables).map(draggable => draggable.element);
  }

  // Event dispatching
  public dispatchDragStart(event: DragStartEvent): void {
    this.isDragging = true;
    this.setupDragListeners();

    this.dragStartPosition = event.initialPointerPosition;
    this.dragStart$.next(event);
  }

  public dispatchDragMove(event: DragMoveEvent): void {
    this.dragMove$.next(event);
  }

  public dispatchDragEnd(event: DragEndEvent): void {
    this.isDragging = false;
    this.draggablesSelection.clear();
    this.dragStartPosition = null;

    // Clean up drag listeners
    this.cleanupDragListeners();

    this.dragEnd$.next(event);
    this.currentDrag.next(null);
  }

  public dispatchDrop(event: DragEvent): void {
    this.drop$.next(event);
  }

  // Utility methods
  private setupGlobalListeners(): void {
    // Setup document-level listeners if needed
  }

  private generateId(): string {
    return `drag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Configuration
  public updateConfig(config: Partial<DragDropConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getConfig(): DragDropConfig {
    return { ...this.config };
  }

  public geTranslatedBounds(element: HTMLElement): DOMRect {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    // Quick check for translate
    let translateX = 0;
    let translateY = 0;

    if (style.transform.includes('translate')) {
      // Simple regex for translate(x, y)
      const match = style.transform.match(/translate\(([^)]+)\)/);
      if (match) {
        const args = match[1].split(',').map(a => a.trim());
        if (args.length >= 2) {
          translateX = parseFloat(args[0]) || 0;
          translateY = parseFloat(args[1]) || 0;
        } else if (args.length === 1) {
          const val = parseFloat(args[0]) || 0;
          translateX = val;
          translateY = val;
        }
      }
    }

    // Add scroll
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    return new DOMRect(
      rect.left + translateX + scrollX,
      rect.top + translateY + scrollY,
      rect.width,
      rect.height
    );
  }
}
