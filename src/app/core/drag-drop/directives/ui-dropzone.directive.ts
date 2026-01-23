// directives/draggable/ui-dropzone.directive.ts
import {
  Directive, ElementRef, EventEmitter, Output, Input,
  OnInit, AfterViewInit, OnDestroy, HostBinding, inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { DragDropService, DropzoneDirectiveAPI, DraggableDirectiveAPI } from '@core/drag-drop';
import { OverlapResult } from '@core/dom/overlap';

// ===== Event Type Enum =====

export enum DropzoneEventType {
  DRAG_ENTER = 'dragEnter',
  DRAG_OVER = 'dragOver',
  DRAG_LEAVE = 'dragLeave',
  DROP = 'drop',
  OVERLAP_CHANGE = 'overlapChange',
  THRESHOLD = 'threshold',
  STATE_CHANGE = 'stateChange'
}

// ===== Base and Specific Event Interfaces =====

export interface BaseDropzoneEvent {
  type: DropzoneEventType;
  dropzone: HTMLElement;
  draggable?: DraggableDirectiveAPI;
  overlapInfo?: OverlapResult;
  timestamp: Date;
  dropzoneData?: any;
  draggableData?: any;
}

export interface DropzoneDragEnterEvent extends BaseDropzoneEvent {
  type: DropzoneEventType.DRAG_ENTER;
  draggable: DraggableDirectiveAPI;
  overlapInfo: OverlapResult;
  accepted: boolean;
  rejected: boolean;
  thresholdReached: boolean;
}

export interface DropzoneDragOverEvent extends BaseDropzoneEvent {
  type: DropzoneEventType.DRAG_OVER;
  draggable: DraggableDirectiveAPI;
  overlapInfo: OverlapResult;
  accepted: boolean;
  rejected: boolean;
  thresholdReached: boolean;
  isThresholdCrossing: boolean;
}

export interface DropzoneDragLeaveEvent extends BaseDropzoneEvent {
  type: DropzoneEventType.DRAG_LEAVE;
  draggable: DraggableDirectiveAPI;
  overlapInfo: OverlapResult;
  accepted: boolean;
  rejected: boolean;
  thresholdReached: boolean;
  completelyLeft: boolean;
}

export interface DropzoneDropEvent extends BaseDropzoneEvent {
  type: DropzoneEventType.DROP;
  draggable: DraggableDirectiveAPI;
  overlapInfo: OverlapResult;
  accepted: boolean;
  rejected: boolean;
  dropPosition: {
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  };
}

export interface DropzoneOverlapChangeEvent extends BaseDropzoneEvent {
  type: DropzoneEventType.OVERLAP_CHANGE;
  overlapPercentage: number;
  isOverlapping: boolean;
  thresholdCrossed?: boolean;
}

export interface DropzoneThresholdEvent extends BaseDropzoneEvent {
  type: DropzoneEventType.THRESHOLD;
  overlapPercentage: number;
  direction: 'entered' | 'exited';
}

export interface DropzoneStateChangeEvent extends BaseDropzoneEvent {
  type: DropzoneEventType.STATE_CHANGE;
  state: string;
  previousState: string;
  overlap: number;
}

// Union type for all possible events
export type DropzoneEvent =
  | DropzoneDragEnterEvent
  | DropzoneDragOverEvent
  | DropzoneDragLeaveEvent
  | DropzoneDropEvent
  | DropzoneOverlapChangeEvent
  | DropzoneThresholdEvent
  | DropzoneStateChangeEvent;

// ===== State Enum =====

export enum DropzoneState {
  IDLE = 'idle',
  ACTIVE = 'active',
  DRAG_ENTER = 'dragEnter',
  DRAG_OVER = 'dragOver',
  DRAG_LEAVE = 'dragLeave',
  THRESHOLD_REACHED = 'thresholdReached',
  ACCEPTING = 'accepting',
  REJECTING = 'rejecting',
  DROPPING = 'dropping'
}

// ===== Directive Implementation =====

@Directive({
  selector: '[uiDropzone]',
  standalone: true,
  exportAs: 'uiDropzone'
})
export class UiDropzoneDirective implements OnInit, AfterViewInit, OnDestroy, DropzoneDirectiveAPI {
  // ===== Configuration Inputs =====

  @Input() overlapThreshold = 50;
  @Input() requireDragging = true;
  @Input() animateTransitions = true;
  @Input() showPlaceholder = true;
  @Input() showGhost = true;
  @Input() acceptElementTypes: string[] = ['*'];
  @Input() maxElements: number | null = null;
  @Input() autoReorder = true;
  @Input() dropzoneId?: string;
  @Input() dropzoneData: any = {};
  @Input() disabled = false;

  // ===== CSS Class Inputs =====

  @Input() dropzoneClass = 'dropzone';
  @Input() disabledClass = 'dropzone-disabled';
  @Input() enabledClass = 'dropzone-enabled';
  @Input() activeClass = 'dropzone-active';
  @Input() dragEnterClass = 'dropzone-drag-enter';
  @Input() dragOverClass = 'dropzone-drag-over';
  @Input() dragLeaveClass = 'dropzone-drag-leave';
  @Input() thresholdReachedClass = 'dropzone-threshold-reached';
  @Input() acceptClass = 'dropzone-accept';
  @Input() rejectClass = 'dropzone-reject';
  @Input() acceptHoverClass = 'dropzone-accept-hover';
  @Input() rejectHoverClass = 'dropzone-reject-hover';
  @Input() placeholderClass = 'dropzone-placeholder';
  @Input() ghostClass = 'dropzone-ghost';
  @Input() reorderClass = 'dropzone-reorder';
  @Input() enterAnimationClass = 'dropzone-enter-animation';
  @Input() leaveAnimationClass = 'dropzone-leave-animation';
  @Input() dropAnimationClass = 'dropzone-drop-animation';

  // ===== Event Outputs =====

  @Output() dragEnter = new EventEmitter<DropzoneDragEnterEvent>();
  @Output() dragOver = new EventEmitter<DropzoneDragOverEvent>();
  @Output() dragLeave = new EventEmitter<DropzoneDragLeaveEvent>();
  @Output() drop = new EventEmitter<DropzoneDropEvent>();
  @Output() overlapChange = new EventEmitter<DropzoneOverlapChangeEvent>();
  @Output() thresholdReached = new EventEmitter<DropzoneThresholdEvent>();
  @Output() thresholdExited = new EventEmitter<DropzoneThresholdEvent>();
  @Output() stateChange = new EventEmitter<DropzoneStateChangeEvent>();

  // ===== Host Bindings =====

  @HostBinding('class')
  get hostClasses(): string {
    const classes = [this.dropzoneClass];

    if (this.disabled) {
      classes.push(this.disabledClass);
    } else {
      classes.push(this.enabledClass);
    }

    if (this.currentState !== DropzoneState.IDLE) {
      classes.push(this.activeClass);
    }

    switch (this.currentState) {
      case DropzoneState.DRAG_ENTER:
        classes.push(this.dragEnterClass);
        break;
      case DropzoneState.DRAG_OVER:
        classes.push(this.dragOverClass);
        break;
      case DropzoneState.DRAG_LEAVE:
        classes.push(this.dragLeaveClass);
        break;
    }

    if (this.isThresholdReached) {
      classes.push(this.thresholdReachedClass);
    }

    if (this.isAccepting) {
      classes.push(this.acceptClass);
      if (this.currentState === DropzoneState.DRAG_OVER) {
        classes.push(this.acceptHoverClass);
      }
    } else if (this.isRejecting) {
      classes.push(this.rejectClass);
      if (this.currentState === DropzoneState.DRAG_OVER) {
        classes.push(this.rejectHoverClass);
      }
    }

    return classes.filter(c => c).join(' ');
  }

  @HostBinding('attr.data-dropzone-id')
  get dataDropzoneId(): string | null {
    return this.dropzoneId || null;
  }

  @HostBinding('attr.aria-dropeffect')
  get ariaDropeffect(): string {
    return this.disabled ? 'none' : 'move';
  }

  @HostBinding('attr.aria-disabled')
  get ariaDisabled(): string {
    return this.disabled ? 'true' : 'false';
  }

  @HostBinding('attr.tabindex')
  tabIndex = this.disabled ? -1 : 0;

  // ===== State Management =====

  private currentState: DropzoneState = DropzoneState.IDLE;
  private previousState: DropzoneState = DropzoneState.IDLE;
  private isThresholdReached = false;
  private isAccepting = false;
  private isRejecting = false;

  private currentDraggable: DraggableDirectiveAPI | null = null;
  private currentOverlapInfo: OverlapResult | null = null;
  private placeholderElement: HTMLElement | null = null;
  private ghostElement: HTMLElement | null = null;

  private destroy$ = new Subject<void>();
  private dragDropService = inject(DragDropService);

  constructor(private elementRef: ElementRef<HTMLElement>) { }

  get element(): HTMLElement {
    return this.elementRef.nativeElement;
  }

  ngOnInit(): void {
    this.initializeDropzone();
    this.dragDropService.registerOverlapTarget(this);
    this.dragDropService.onDragStart().subscribe((e) => {
      console.log('dragging started %o', e);
    })
  }

  ngAfterViewInit(): void {
    this.createPlaceholderElement();
  }

  // ===== Initialization =====

  private initializeDropzone(): void {
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', 'Drop zone for UI elements');
    this.element.setAttribute('aria-live', 'polite');
  }

  // ===== Public API Methods =====

  public handleDragEnter(draggable: DraggableDirectiveAPI, overlapInfo: OverlapResult): void {
    if (this.disabled) return;

    this.updateState(DropzoneState.DRAG_ENTER);
    this.currentDraggable = draggable;
    this.currentOverlapInfo = overlapInfo;

    // Validate draggable
    this.validateDraggable(draggable);

    // Check threshold
    const thresholdReached = overlapInfo.percentOfTarget >= this.overlapThreshold;
    if (thresholdReached && !this.isThresholdReached) {
      this.handleThresholdEntered(overlapInfo);
    }

    // Apply enter animation
    if (this.animateTransitions) {
      this.applyTemporaryClass(this.enterAnimationClass, 300);
    }

    // Show placeholder if accepting
    if (this.showPlaceholder && this.isAccepting) {
      this.showPlaceholderElement(draggable);
    }

    // Emit dragEnter event
    const event: DropzoneDragEnterEvent = {
      type: DropzoneEventType.DRAG_ENTER,
      dropzone: this.element,
      draggable,
      overlapInfo,
      accepted: this.isAccepting,
      rejected: this.isRejecting,
      thresholdReached,
      timestamp: new Date(),
      dropzoneData: this.dropzoneData,
      //draggableData: draggable.getData?.()
    };

    this.dragEnter.emit(event);
    this.emitStateChange();
  }

  public handleDragOver(draggable: DraggableDirectiveAPI, overlapInfo: OverlapResult): void {
    if (this.disabled || this.currentState === DropzoneState.IDLE) return;

    this.updateState(DropzoneState.DRAG_OVER);
    this.currentOverlapInfo = overlapInfo;

    // Check threshold crossing
    const thresholdReached = overlapInfo.percentOfTarget >= this.overlapThreshold;
    const isThresholdCrossing = this.isThresholdReached !== thresholdReached;

    if (isThresholdCrossing) {
      if (thresholdReached) {
        this.handleThresholdEntered(overlapInfo);
      } else {
        this.handleThresholdExited(overlapInfo);
      }
    }

    // Update placeholder position
    if (this.placeholderElement && this.isAccepting) {
      this.updatePlaceholderPosition(overlapInfo);
    }

    // Emit overlap change event
    const overlapChangeEvent: DropzoneOverlapChangeEvent = {
      type: DropzoneEventType.OVERLAP_CHANGE,
      dropzone: this.element,
      draggable,
      overlapInfo,
      overlapPercentage: overlapInfo.percentOfTarget,
      isOverlapping: thresholdReached,
      thresholdCrossed: isThresholdCrossing,
      timestamp: new Date(),
      dropzoneData: this.dropzoneData,
      //draggableData: draggable.getData?.()
    };

    this.overlapChange.emit(overlapChangeEvent);

    // Emit dragOver event
    const dragOverEvent: DropzoneDragOverEvent = {
      type: DropzoneEventType.DRAG_OVER,
      dropzone: this.element,
      draggable,
      overlapInfo,
      accepted: this.isAccepting,
      rejected: this.isRejecting,
      thresholdReached,
      isThresholdCrossing,
      timestamp: new Date(),
      dropzoneData: this.dropzoneData,
      //draggableData: draggable.getData?.()
    };

    this.dragOver.emit(dragOverEvent);
    this.emitStateChange();
  }

  public handleDragLeave(draggable: DraggableDirectiveAPI, overlapInfo: OverlapResult): void {
    if (this.disabled || this.currentState === DropzoneState.IDLE) return;

    this.updateState(DropzoneState.DRAG_LEAVE);

    // Apply leave animation
    if (this.animateTransitions) {
      this.applyTemporaryClass(this.leaveAnimationClass, 300);
    }

    // Hide placeholder
    this.hidePlaceholderElement();

    const completelyLeft = overlapInfo.percentOfTarget === 0;

    // Emit dragLeave event
    const event: DropzoneDragLeaveEvent = {
      type: DropzoneEventType.DRAG_LEAVE,
      dropzone: this.element,
      draggable,
      overlapInfo,
      accepted: this.isAccepting,
      rejected: this.isRejecting,
      thresholdReached: this.isThresholdReached,
      completelyLeft,
      timestamp: new Date(),
      dropzoneData: this.dropzoneData,
      //draggableData: draggable.getData?.()
    };

    this.dragLeave.emit(event);
    this.emitStateChange();

    // Reset if completely left
    if (completelyLeft) {
      setTimeout(() => {
        if (this.currentState === DropzoneState.DRAG_LEAVE) {
          this.resetState();
        }
      }, 50);
    }
  }

  public handleDrop(draggable: DraggableDirectiveAPI, overlapInfo: OverlapResult): void {
    if (this.disabled || this.currentState === DropzoneState.IDLE) return;

    // Apply drop animation
    if (this.animateTransitions) {
      this.applyTemporaryClass(this.dropAnimationClass, 500);
    }

    // Hide placeholder
    this.hidePlaceholderElement();

    // Calculate drop position
    const dropPosition = this.calculateDropPosition(overlapInfo);

    // Emit drop event if accepted
    if (this.isAccepting) {
      const event: DropzoneDropEvent = {
        type: DropzoneEventType.DROP,
        dropzone: this.element,
        draggable,
        overlapInfo,
        accepted: this.isAccepting,
        rejected: this.isRejecting,
        dropPosition,
        timestamp: new Date(),
        dropzoneData: this.dropzoneData,
        //draggableData: draggable.getData?.()
      };

      this.drop.emit(event);

      // Apply reorder animation
      if (this.autoReorder) {
        this.applyTemporaryClass(this.reorderClass, 300);
      }
    }

    this.resetState();
  }

  // ===== Helper Methods =====

  private validateDraggable(draggable: DraggableDirectiveAPI): void {
    try {
      const draggableElement = draggable.element;
      const elementType = draggableElement.getAttribute('data-element-type') || 'generic';

      const acceptsType = this.acceptElementTypes.includes('*') ||
        this.acceptElementTypes.includes(elementType);

      const currentElementCount = this.element.querySelectorAll('[appdraggable]').length;
      const respectsMaxElements = !this.maxElements || currentElementCount < this.maxElements;

      this.isAccepting = acceptsType && respectsMaxElements;
      this.isRejecting = !this.isAccepting;
    } catch (error) {
      this.isAccepting = false;
      this.isRejecting = true;
    }
  }

  private handleThresholdEntered(overlapInfo: OverlapResult): void {
    this.isThresholdReached = true;

    const event: DropzoneThresholdEvent = {
      type: DropzoneEventType.THRESHOLD,
      dropzone: this.element,
      draggable: this.currentDraggable!,
      overlapInfo,
      overlapPercentage: overlapInfo.percentOfTarget,
      direction: 'entered',
      timestamp: new Date(),
      dropzoneData: this.dropzoneData
    };

    this.thresholdReached.emit(event);
  }

  private handleThresholdExited(overlapInfo: OverlapResult): void {
    this.isThresholdReached = false;

    const event: DropzoneThresholdEvent = {
      type: DropzoneEventType.THRESHOLD,
      dropzone: this.element,
      draggable: this.currentDraggable!,
      overlapInfo,
      overlapPercentage: overlapInfo.percentOfTarget,
      direction: 'exited',
      timestamp: new Date(),
      dropzoneData: this.dropzoneData
    };

    this.thresholdExited.emit(event);
  }

  private updateState(newState: DropzoneState): void {
    this.previousState = this.currentState;
    this.currentState = newState;
  }

  private emitStateChange(): void {
    const event: DropzoneStateChangeEvent = {
      type: DropzoneEventType.STATE_CHANGE,
      dropzone: this.element,
      draggable: this.currentDraggable || undefined,
      overlapInfo: this.currentOverlapInfo || undefined,
      state: this.currentState,
      previousState: this.previousState,
      overlap: this.currentOverlapInfo?.percentOfTarget || 0,
      timestamp: new Date(),
      dropzoneData: this.dropzoneData
    };

    this.stateChange.emit(event);
  }

  private resetState(): void {
    this.currentState = DropzoneState.IDLE;
    this.previousState = DropzoneState.IDLE;
    this.isThresholdReached = false;
    this.isAccepting = false;
    this.isRejecting = false;
    this.currentDraggable = null;
    this.currentOverlapInfo = null;
    this.hidePlaceholderElement();
    this.emitStateChange();
  }

  private applyTemporaryClass(className: string, duration: number): void {
    this.element.classList.add(className);
    setTimeout(() => {
      this.element.classList.remove(className);
    }, duration);
  }

  private calculateDropPosition(overlapInfo: OverlapResult): {
    x: number; y: number; clientX: number; clientY: number;
  } {
    const rect = this.element.getBoundingClientRect();
    return {
      x: 0,//overlapInfo.centerX - rect.left,
      y: 0,//overlapInfo.centerY - rect.top,
      clientX: 0,//overlapInfo.centerX,
      clientY: 0,//overlapInfo.centerY
    };
  }

  // ===== Placeholder Methods =====

  private createPlaceholderElement(): void {
    if (!this.showPlaceholder) return;

    this.placeholderElement = document.createElement('div');
    this.placeholderElement.className = this.placeholderClass;
    this.placeholderElement.style.position = 'absolute';
    this.placeholderElement.style.pointerEvents = 'none';
    this.placeholderElement.style.opacity = '0.5';
    this.placeholderElement.style.display = 'none';
    this.element.appendChild(this.placeholderElement);
  }

  private showPlaceholderElement(draggable: DraggableDirectiveAPI): void {
    if (!this.placeholderElement || !this.isAccepting) return;

    const draggableElement = draggable.element;
    const rect = draggableElement.getBoundingClientRect();
    const parentRect = this.element.getBoundingClientRect();

    this.placeholderElement.style.width = `${rect.width}px`;
    this.placeholderElement.style.height = `${rect.height}px`;
    this.placeholderElement.style.left = `${rect.left - parentRect.left}px`;
    this.placeholderElement.style.top = `${rect.top - parentRect.top}px`;
    this.placeholderElement.style.display = 'block';
  }

  private updatePlaceholderPosition(overlapInfo: OverlapResult): void {
    if (!this.placeholderElement) return;

    const rect = this.element.getBoundingClientRect();
    //this.placeholderElement.style.left = `${overlapInfo.centerX - rect.left - 50}px`;
    //this.placeholderElement.style.top = `${overlapInfo.centerY - rect.top - 25}px`;
  }

  private hidePlaceholderElement(): void {
    if (this.placeholderElement) {
      this.placeholderElement.style.display = 'none';
    }
  }

  // ===== Cleanup =====

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.placeholderElement && this.placeholderElement.parentNode) {
      this.placeholderElement.parentNode.removeChild(this.placeholderElement);
    }

    this.dragDropService.unregisterOverlapTarget(this);
  }
}
