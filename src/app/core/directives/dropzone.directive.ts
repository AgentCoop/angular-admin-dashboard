// directives/dropzone.directive.ts
import {
  Directive, ElementRef, EventEmitter, Output, Input,
  Renderer2, OnInit, OnDestroy, HostBinding, NgZone,
  OnChanges, SimpleChanges, ContentChildren, QueryList,
  AfterContentInit, HostListener
} from '@angular/core';
import { Subject, Subscription, fromEvent, combineLatest } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';
import { DraggableDirective, DragPosition } from './draggable.directive';

export interface DropzoneConfig {
  dropzoneClass: string;
  activeClass: string;
  overlapThreshold: number; // 0-1: percentage overlap required
  requireDragging: boolean; // Only active when element is being dragged
  observeMultiple: boolean; // Observe multiple draggables
  useIntersectionObserver: boolean; // Use IntersectionObserver API
  checkInterval: number; // Fallback polling interval (ms)
}

export interface DropEvent {
  dropzone: HTMLElement;
  draggable: HTMLElement;
  draggableDirective?: DraggableDirective;
  overlapPercentage: number;
  position: DragPosition;
  event?: PointerEvent;
}

export interface OverlapInfo {
  isOverlapping: boolean;
  overlapPercentage: number;
  distance: number;
  boundingBox: DOMRect;
}

@Directive({
  selector: '[appDropzone]',
  standalone: true,
  exportAs: 'appDropzone'
})
export class DropzoneDirective implements OnInit, OnDestroy, AfterContentInit, OnChanges {
  @Input() dropzoneClass = 'dropzone';
  @Input() activeClass = 'dropzone-active';
  @Input() overlapThreshold = 0.3; // 30% overlap required
  @Input() requireDragging = true;
  @Input() observeMultiple = true;
  @Input() useIntersectionObserver = true;
  @Input() checkInterval = 100; // ms for fallback polling

  @Output() dragEnter = new EventEmitter<DropEvent>();
  @Output() dragOver = new EventEmitter<DropEvent>();
  @Output() dragLeave = new EventEmitter<DropEvent>();
  @Output() drop = new EventEmitter<DropEvent>();
  @Output() overlapChange = new EventEmitter<OverlapInfo>();

  @HostBinding('class') get hostClasses(): string {
    return `${this.dropzoneClass} ${this.isActive ? this.activeClass : ''}`;
  }

  @ContentChildren(DraggableDirective, { descendants: true })
  draggableDirectives?: QueryList<DraggableDirective>;

  private isActive = false;
  private destroy$ = new Subject<void>();
  private intersectionObserver?: IntersectionObserver;
  private resizeObserver?: ResizeObserver;
  private checkIntervalId?: any;

  // Track which draggables are currently overlapping
  private overlappingDraggables = new Map<HTMLElement, OverlapInfo>();

  // Track all draggable elements (from directives and manually added)
  private draggableElements = new Set<HTMLElement>();
  private draggableDirectiveMap = new Map<HTMLElement, DraggableDirective>();

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.setupObservers();
    this.setupDropListeners();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['useIntersectionObserver'] || changes['checkInterval']) {
      this.cleanupObservers();
      this.setupObservers();
    }
  }

  ngAfterContentInit() {
    // Watch for draggable directives in content
    this.draggableDirectives?.changes
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateDraggableElements());

    this.updateDraggableElements();
  }

  private setupObservers() {
    if (this.useIntersectionObserver && 'IntersectionObserver' in window) {
      this.setupIntersectionObserver();
    } else {
      this.setupPollingObserver();
    }

    // Setup resize observer to handle element size changes
    this.setupResizeObserver();
  }

  private setupIntersectionObserver() {
    this.ngZone.runOutsideAngular(() => {
      const options: IntersectionObserverInit = {
        root: null, // Use viewport as root
        rootMargin: '0px',
        threshold: this.generateThresholds()
      };

      this.intersectionObserver = new IntersectionObserver((entries) => {
        this.ngZone.run(() => {
          this.handleIntersections(entries);
        });
      }, options);

      // Observe all draggable elements
      this.draggableElements.forEach(element => {
        this.intersectionObserver?.observe(element);
      });

      // Also observe the dropzone itself for coordinate calculations
      this.intersectionObserver.observe(this.elementRef.nativeElement);
    });
  }

  private generateThresholds(): number[] {
    // Generate thresholds from 0 to 1 in 0.05 increments
    const thresholds: number[] = [];
    for (let i = 0; i <= 20; i++) {
      thresholds.push(i * 0.05);
    }
    return thresholds;
  }

  private setupPollingObserver() {
    this.ngZone.runOutsideAngular(() => {
      this.checkIntervalId = setInterval(() => {
        this.ngZone.run(() => {
          this.checkForOverlaps();
        });
      }, this.checkInterval);
    });
  }

  private setupResizeObserver() {
    if ('ResizeObserver' in window) {
      this.ngZone.runOutsideAngular(() => {
        this.resizeObserver = new ResizeObserver(() => {
          this.ngZone.run(() => {
            // Re-check overlaps when element sizes change
            this.checkForOverlaps();
          });
        });

        this.resizeObserver.observe(this.elementRef.nativeElement);
        this.draggableElements.forEach(element => {
          this.resizeObserver?.observe(element);
        });
      });
    }
  }

  private setupDropListeners() {
    // Listen for drop events
    this.ngZone.runOutsideAngular(() => {
      fromEvent<PointerEvent>(this.elementRef.nativeElement, 'pointerup')
        .pipe(
          takeUntil(this.destroy$),
          filter(() => this.isActive)
        )
        .subscribe(event => {
          this.ngZone.run(() => this.handleDrop(event));
        });
    });
  }

  private updateDraggableElements() {
    // Clear existing
    this.draggableElements.clear();
    this.draggableDirectiveMap.clear();

    // Add draggables from content directives
    this.draggableDirectives?.forEach(directive => {
      const element = directive.elementRef.nativeElement;
      this.draggableElements.add(element);
      this.draggableDirectiveMap.set(element, directive);

      // Listen to drag events from draggable directives
      this.setupDraggableListeners(directive);
    });

    // Re-initialize observers with new elements
    this.cleanupObservers();
    this.setupObservers();
  }

  private setupDraggableListeners(draggable: DraggableDirective) {
    draggable.dragStart
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        // Force overlap check when drag starts
        this.checkForOverlaps();
      });

    draggable.dragMove
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(16) // ~60fps
      )
      .subscribe(() => {
        this.checkForOverlaps();
      });

    draggable.dragEnd
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        // Clear active state if no longer overlapping
        setTimeout(() => {
          if (!this.hasOverlappingDraggables()) {
            this.setActive(false);
          }
        }, 50);
      });
  }

  private handleIntersections(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      const target = entry.target as HTMLElement;

      // Skip if target is the dropzone itself
      if (target === this.elementRef.nativeElement) continue;

      if (this.draggableElements.has(target)) {
        const overlapInfo = this.calculateOverlap(target);
        const wasOverlapping = this.overlappingDraggables.has(target);
        const isNowOverlapping = overlapInfo.isOverlapping;

        this.overlappingDraggables.set(target, overlapInfo);

        // Emit overlap change
        this.overlapChange.emit(overlapInfo);

        // Handle enter/leave events
        if (!wasOverlapping && isNowOverlapping) {
          this.handleDragEnter(target, overlapInfo);
        } else if (wasOverlapping && !isNowOverlapping) {
          this.handleDragLeave(target);
        } else if (isNowOverlapping) {
          this.handleDragOver(target, overlapInfo);
        }
      }
    }

    this.updateActiveState();
  }

  private checkForOverlaps() {
    this.draggableElements.forEach(element => {
      // Skip if element is hidden or not in DOM
      if (!document.contains(element)) return;

      const overlapInfo = this.calculateOverlap(element);
      const wasOverlapping = this.overlappingDraggables.has(element);
      const isNowOverlapping = overlapInfo.isOverlapping;

      this.overlappingDraggables.set(element, overlapInfo);
      this.overlapChange.emit(overlapInfo);

      if (!wasOverlapping && isNowOverlapping) {
        this.handleDragEnter(element, overlapInfo);
      } else if (wasOverlapping && !isNowOverlapping) {
        this.handleDragLeave(element);
      } else if (isNowOverlapping) {
        this.handleDragOver(element, overlapInfo);
      }
    });

    this.updateActiveState();
  }

  private calculateOverlap(draggable: HTMLElement): OverlapInfo {
    const dropzoneRect = this.elementRef.nativeElement.getBoundingClientRect();
    const draggableRect = draggable.getBoundingClientRect();

    // Calculate intersection rectangle
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

  private handleDragEnter(draggable: HTMLElement, overlapInfo: OverlapInfo) {
    if (this.shouldIgnoreEvent(draggable)) return;

    const directive = this.draggableDirectiveMap.get(draggable);
    const dragState = directive?.getDragState();

    this.dragEnter.emit({
      dropzone: this.elementRef.nativeElement,
      draggable,
      draggableDirective: directive,
      overlapPercentage: overlapInfo.overlapPercentage,
      position: this.getDragPosition(directive)
    });
  }

  private handleDragOver(draggable: HTMLElement, overlapInfo: OverlapInfo) {
    if (this.shouldIgnoreEvent(draggable)) return;

    const directive = this.draggableDirectiveMap.get(draggable);

    this.dragOver.emit({
      dropzone: this.elementRef.nativeElement,
      draggable,
      draggableDirective: directive,
      overlapPercentage: overlapInfo.overlapPercentage,
      position: this.getDragPosition(directive)
    });
  }

  private handleDragLeave(draggable: HTMLElement) {
    const directive = this.draggableDirectiveMap.get(draggable);

    this.dragLeave.emit({
      dropzone: this.elementRef.nativeElement,
      draggable,
      draggableDirective: directive,
      overlapPercentage: 0,
      position: this.getDragPosition(directive)
    });
  }

  @HostListener('pointerup', ['$event'])
  private handleDrop(event: PointerEvent) {
    // Find which draggable (if any) is currently overlapping
    for (const [draggable, overlapInfo] of this.overlappingDraggables.entries()) {
      if (overlapInfo.isOverlapping && !this.shouldIgnoreEvent(draggable)) {
        const directive = this.draggableDirectiveMap.get(draggable);

        this.drop.emit({
          dropzone: this.elementRef.nativeElement,
          draggable,
          draggableDirective: directive,
          overlapPercentage: overlapInfo.overlapPercentage,
          position: this.getDragPosition(directive),
          event
        });

        this.setActive(false);
        break;
      }
    }
  }

  private shouldIgnoreEvent(draggable: HTMLElement): boolean {
    if (!this.requireDragging) return false;

    const directive = this.draggableDirectiveMap.get(draggable);
    return !directive || !directive.getDragState().isDragging;
  }

  private getDragPosition(directive?: DraggableDirective): DragPosition {
    if (!directive) {
      return {
        x: 0, y: 0,
        absoluteX: 0, absoluteY: 0,
        deltaX: 0, deltaY: 0,
        isDragging: false
      };
    }

    const position = directive.getPosition();
    const delta = directive.getCurrentDelta();
    const state = directive.getDragState();

    return {
      x: delta.deltaX,
      y: delta.deltaY,
      absoluteX: position.x,
      absoluteY: position.y,
      deltaX: delta.deltaX,
      deltaY: delta.deltaY,
      isDragging: state.isDragging
    };
  }

  private updateActiveState() {
    const hasOverlap = this.hasOverlappingDraggables();
    this.setActive(hasOverlap);
  }

  private hasOverlappingDraggables(): boolean {
    if (this.overlappingDraggables.size === 0) return false;

    for (const overlapInfo of this.overlappingDraggables.values()) {
      if (overlapInfo.isOverlapping) {
        return true;
      }
    }

    return false;
  }

  private setActive(active: boolean) {
    if (this.isActive === active) return;

    this.isActive = active;

    // Add/remove active class
    if (active) {
      this.renderer.addClass(this.elementRef.nativeElement, this.activeClass);
    } else {
      this.renderer.removeClass(this.elementRef.nativeElement, this.activeClass);
    }
  }

  /**
   * Public API: Manually add a draggable element to observe
   */
  addDraggable(element: HTMLElement, directive?: DraggableDirective) {
    this.draggableElements.add(element);
    if (directive) {
      this.draggableDirectiveMap.set(element, directive);
      this.setupDraggableListeners(directive);
    }

    // Re-initialize observers
    this.cleanupObservers();
    this.setupObservers();
  }

  /**
   * Public API: Remove a draggable element from observation
   */
  removeDraggable(element: HTMLElement) {
    this.draggableElements.delete(element);
    this.draggableDirectiveMap.delete(element);
    this.overlappingDraggables.delete(element);

    // Re-initialize observers
    this.cleanupObservers();
    this.setupObservers();
  }

  /**
   * Public API: Get current overlap information for a specific draggable
   */
  getOverlapInfo(draggable: HTMLElement): OverlapInfo | null {
    return this.overlappingDraggables.get(draggable) || null;
  }

  /**
   * Public API: Get all currently overlapping draggables
   */
  getOverlappingDraggables(): Map<HTMLElement, OverlapInfo> {
    return new Map(this.overlappingDraggables);
  }

  /**
   * Public API: Check if a specific draggable is overlapping
   */
  isDraggableOverlapping(draggable: HTMLElement): boolean {
    const info = this.overlappingDraggables.get(draggable);
    return info?.isOverlapping || false;
  }

  private cleanupObservers() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = undefined;
    }

    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = undefined;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanupObservers();
  }
}
