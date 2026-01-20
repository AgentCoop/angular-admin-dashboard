// directives/draggable-types.ts



// core/directives/draggable/drag-position.interface.ts
export interface DragPosition {
  /** Current X position relative to the drag boundary */
  x: number;
  /** Current Y position relative to the drag boundary */
  y: number;
  /** Absolute X position relative to the viewport */
  absoluteX: number;
  /** Absolute Y position relative to the viewport */
  absoluteY: number;
  /** Change in X position since drag start */
  deltaX: number;
  /** Change in Y position since drag start */
  deltaY: number;
  /** Whether the element is currently being dragged */
  isDragging: boolean;
  /** Velocity in pixels per second */
  velocity?: {
    x: number;
    y: number;
    magnitude: number;
  };
  /** Timestamp of the last update */
  timestamp?: number;
}

export interface DragBoundary {
  /** Minimum X position */
  minX: number;
  /** Maximum X position */
  maxX: number;
  /** Minimum Y position */
  minY: number;
  /** Maximum Y position */
  maxY: number;
}

export interface DragConstraints {
  /** Boundary element or coordinates */
  boundary?: HTMLElement | DragBoundary;
  /** Whether to snap to grid */
  snapToGrid?: boolean;
  /** Grid size for snapping */
  gridSize?: number;
  /** Minimum distance to start dragging */
  dragThreshold?: number;
  /** Whether to use CSS transforms instead of position */
  useTransform?: boolean;
  /** Axis restriction */
  axis?: 'x' | 'y' | 'both';
  /** Inertia factor (0-1, where 0 = no inertia, 1 = full inertia) */
  inertia?: number;
  /** Maximum speed in pixels per second */
  maxSpeed?: number;
}

export interface DragState {
  /** Whether dragging is currently active */
  isDragging: boolean;
  /** Whether the element has been dragged at all */
  hasDragged: boolean;
  /** Original position before drag started */
  startPosition: { x: number; y: number };
  /** Current position */
  currentPosition: { x: number; y: number };
  /** Total distance dragged */
  totalDistance: number;
  /** Total time spent dragging */
  totalTime: number;
  /** Start time of drag */
  startTime?: number;
  /** End time of drag */
  endTime?: number;
}

export interface DragEvent {
  /** The element being dragged */
  element: HTMLElement;
  /** Current drag position and state */
  position: DragPosition;
  /** Original mouse/pointer event */
  originalEvent: PointerEvent | MouseEvent | TouchEvent;
  /** Type of drag event */
  type: 'start' | 'move' | 'end' | 'cancel';
  /** Boundary information if constrained */
  boundary?: {
    isAtBoundary: boolean;
    boundaries: {
      top: boolean;
      right: boolean;
      bottom: boolean;
      left: boolean;
    };
  };
  /** Grid snapping information if enabled */
  gridSnap?: {
    snapped: boolean;
    originalX: number;
    originalY: number;
    snappedX: number;
    snappedY: number;
  };
}

export interface DropzoneConfig {
  /** CSS selector for draggable elements */
  draggableSelector: string;
  /** Class added to dropzone when active */
  activeClass: string;
  /** Minimum overlap percentage required (0-1) */
  overlapThreshold: number;
  /** Only trigger events when element is actually being dragged */
  requireDragging: boolean;
  /** Use IntersectionObserver API for better performance */
  useIntersectionObserver: boolean;
  /** Root element to observe draggables within */
  observationRoot?: HTMLElement;
}

export interface DropEvent {
  dropzone: HTMLElement;
  draggable: HTMLElement;
  overlapPercentage: number;
  position: { x: number; y: number; isDragging: boolean };
  event?: PointerEvent;
}

export interface OverlapInfo {
  isOverlapping: boolean;
  overlapPercentage: number;
  distance: number;
  boundingBox: DOMRect;
}
