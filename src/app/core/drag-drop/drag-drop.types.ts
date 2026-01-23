// src/app/core/drag-drop/drag-drop.types.ts
import { InjectionToken } from '@angular/core';
import {OverlapResult} from '@core/dom/overlap';

interface DirectiveAPI {
  get element(): HTMLElement;
}

export interface DraggableDirectiveAPI extends DirectiveAPI {
  getState(): { isDragging: boolean; startPosition: { x: number; y: number } };
}

export interface DropzoneDirectiveAPI extends  DirectiveAPI {

}

export interface OverlapTargetAPI extends DirectiveAPI {

}

// Main configuration interface
export interface DragDropConfig {
  dragZIndex: number;
  dragGhostOpacity: number;
  dragTransition: string;
  dropzoneHoverClass: string;
  dropzoneActiveClass: string;
  useCustomPreview: boolean;
  previewComponent?: any;
  boundaryPadding: number;
  autoScroll: boolean;
  scrollSpeed: number;
  scrollThreshold: number;
  dragSnapToGrid?: boolean;
  dragGridSize?: number;
}

// Default configuration
export const DEFAULT_DRAG_DROP_CONFIG: DragDropConfig = {
  dragZIndex: 9999,
  dragGhostOpacity: 0.5,
  dragTransition: 'transform 0.2s ease',
  dropzoneHoverClass: 'dropzone-hover',
  dropzoneActiveClass: 'dropzone-active',
  useCustomPreview: false,
  boundaryPadding: 10,
  autoScroll: true,
  scrollSpeed: 10,
  scrollThreshold: 50,
  dragSnapToGrid: false,
  dragGridSize: 10
};

// Injection token
export const DRAG_DROP_CONFIG = new InjectionToken<DragDropConfig>('DragDropConfig', {
  providedIn: 'root',
  factory: () => DEFAULT_DRAG_DROP_CONFIG
});

// Drag event data interface
export interface DragData {
  id: string;
  type: string;
  payload: any;
  groupId?: string;
  sourceElement: HTMLElement;
}

// Drag event interface
export interface DragEvent {
  event: MouseEvent | TouchEvent;
  dragId: string;
  data: DragData;
  source: HTMLElement;
  dropzoneId?: string;
  position: { x: number; y: number };
}

// Dropzone configuration
export interface DropzoneConfig {
  acceptGroup?: string | string[];
  hoverClass: string;
  activeClass: string;
  canDrop?: (data: DragData) => boolean;
}

// Drag state model
export interface DragState {
  id: string;
  data: DragData;
  element: HTMLElement;
  isDragging: boolean;
  startTime: number;
  startPosition: { x: number; y: number };
  currentPosition: { x: number; y: number };
}

// Position types (reuse from your existing directive)
export interface DragPosition {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  absoluteX: number;
  absoluteY: number;
  isDragging: boolean;
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



export interface OverlapTargetConfig {
  selector?: string;
  activeClass?: string;
  overlapClass?: string;
  enterClass?: string;
  leaveClass?: string;
  minimumOverlapRatio?: number;
  emitEvents?: boolean;
}

export interface OverlapEvent {
  type: 'enter' | 'leave' | 'overlap' | 'overlap-change';
  target: HTMLElement;
  overlapResult: OverlapResult;
  timestamp: number;
  source: HTMLElement;
}

export interface OverlapHistory {
  lastEnterTime: number;
  lastLeaveTime: number;
  totalOverlapTime: number;
  overlapCount: number;
  lastOverlapRatio: number;
}
