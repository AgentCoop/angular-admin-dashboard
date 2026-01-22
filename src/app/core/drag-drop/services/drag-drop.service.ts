// services/drag-drop.service.ts
import { Injectable, Inject, Optional, InjectionToken, inject } from '@angular/core';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import { filter, takeUntil, debounceTime } from 'rxjs/operators';

import {
  DraggableDirectiveAPI, DragData, DragEvent, DragState, DragDropConfig, DEFAULT_DRAG_DROP_CONFIG,
  DropzoneDirectiveAPI, OverlapTargetAPI
} from '@core/drag-drop';

export const DRAG_DROP_CONFIG = new InjectionToken<DragDropConfig>('DragDropConfig');

@Injectable({
  providedIn: 'root'
})
export class DragDropService {
  // Registry using references as keys
  private draggables = new Set<DraggableDirectiveAPI>();
  private overlapTargets = new Set<OverlapTargetAPI>();

  // State streams
  private dragStart$ = new Subject<DragEvent>();
  private dragMove$ = new Subject<DragEvent>();
  private dragEnd$ = new Subject<DragEvent>();
  private drop$ = new Subject<DragEvent>();

  // Active drag state
  private currentDrag = new BehaviorSubject<DragState | null>(null);

  // Configuration
  private config: DragDropConfig;

  constructor(
    @Optional() @Inject(DRAG_DROP_CONFIG) config?: DragDropConfig
  ) {
    this.config = { ...DEFAULT_DRAG_DROP_CONFIG, ...config };
    this.setupGlobalListeners();
  }

  // Public API
  public onDragStart(): Observable<DragEvent> {
    return this.dragStart$.asObservable();
  }

  public onDragMove(): Observable<DragEvent> {
    return this.dragMove$.asObservable();
  }

  public onDragEnd(): Observable<DragEvent> {
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
  public dispatchDragStart(event: DragEvent): void {
    this.dragStart$.next(event);
    // this.currentDrag.next({
    //   id: event.dragId,
    //   data: event.data,
    //   element: event.source,
    //   isDragging: true,
    //   startTime: Date.now()
    // });
  }

  public dispatchDragMove(event: DragEvent): void {
    this.dragMove$.next(event);
  }

  public dispatchDragEnd(event: DragEvent): void {
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
}
