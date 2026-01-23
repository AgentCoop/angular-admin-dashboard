// enums/overlap.enum.ts

/**
 * Represents which side of a target element the source entered from
 * Provides type safety, utility methods, and better IDE support
 */
export enum OverlapEntrySide {
  /** Entered from the top edge */
  TOP = 'top',

  /** Entered from the bottom edge */
  BOTTOM = 'bottom',

  /** Entered from the left edge */
  LEFT = 'left',

  /** Entered from the right edge */
  RIGHT = 'right',

  /** Entered from a corner (multiple sides simultaneously) */
  CORNER = 'corner',

  /** Unknown or center entry */
  UNKNOWN = 'unknown',

  /** Source is fully contained within target from start */
  CONTAINED = 'contained',

  /** Source overlaps but exact entry cannot be determined */
  OVERLAP = 'overlap'
}

export interface OverlapResult {
  target: HTMLElement;
  isOverlapping: boolean;
  overlapRatio: number; // 0 to 1 (0% to 100%)
  overlapArea: number; // in pixels²
  overlapRect?: DOMRect; // Rectangle of overlapping area
  sourceRect: DOMRect;
  targetRect: DOMRect;
  percentOfSource: number; // What % of source is inside target
  percentOfTarget: number; // What % of target is covered by source
  entrySide: OverlapEntrySide;
  distanceToCenter: number; // Distance from source center to target center
  centerOffset: { x: number; y: number }; // Offset between centers
}

/**
 * Enum representing different methods for detecting entry side
 * Each method uses different algorithms with varying accuracy and performance
 */
export enum EntrySideDetectionMethod {
  /** Uses movement vector analysis (most accurate for drag operations) */
  VECTOR = 'vector',

  /** Uses proximity to edges detection (good for static elements) */
  PROXIMITY = 'proximity',

  /** Uses overlap rectangle analysis (precise but requires overlap data) */
  OVERLAP = 'overlap',

  /** Automatically chooses the best available method */
  AUTO = 'auto',
}

/**
 * Configuration for entry side detection
 */
export interface EntrySideDetectionConfig {
  method: EntrySideDetectionMethod;
  movementThreshold: number;
  proximityThreshold: number;
  enableLogging: boolean;
}

/**
 * Default configuration for entry side detection
 */
export const DEFAULT_ENTRY_SIDE_CONFIG: EntrySideDetectionConfig = {
  method: EntrySideDetectionMethod.AUTO,
  movementThreshold: 0.1,
  proximityThreshold: 5,
  enableLogging: false
};

/**
 * Type guard to check if a value is a valid OverlapEntrySide
 */
export function isOverlapEntrySide(value: any): value is OverlapEntrySide {
  return Object.values(OverlapEntrySide).includes(value);
}

/**
 * Gets all possible entry sides as an array
 */
export function getAllEntrySides(): OverlapEntrySide[] {
  return Object.values(OverlapEntrySide) as OverlapEntrySide[];
}

/**
 * Gets entry sides that are actual edges (not special cases)
 */
export function getEdgeEntrySides(): OverlapEntrySide[] {
  return [
    OverlapEntrySide.TOP,
    OverlapEntrySide.BOTTOM,
    OverlapEntrySide.LEFT,
    OverlapEntrySide.RIGHT
  ];
}

/**
 * Gets entry sides that are special cases
 */
export function getSpecialEntrySides(): OverlapEntrySide[] {
  return [
    OverlapEntrySide.CORNER,
    OverlapEntrySide.UNKNOWN,
    OverlapEntrySide.CONTAINED,
    OverlapEntrySide.OVERLAP
  ];
}

/**
 * Gets human-readable label for entry side
 */
export function getLabel(side: OverlapEntrySide): string {
  const labels: Record<OverlapEntrySide, string> = {
    [OverlapEntrySide.TOP]: 'Top',
    [OverlapEntrySide.BOTTOM]: 'Bottom',
    [OverlapEntrySide.LEFT]: 'Left',
    [OverlapEntrySide.RIGHT]: 'Right',
    [OverlapEntrySide.CORNER]: 'Corner',
    [OverlapEntrySide.UNKNOWN]: 'Unknown',
    [OverlapEntrySide.CONTAINED]: 'Contained',
    [OverlapEntrySide.OVERLAP]: 'Overlap'
  };
  return labels[side] || 'Unknown';
}

/**
 * Gets CSS class name for entry side
 */
export function getCssClass(side: OverlapEntrySide): string {
  const classes: Record<OverlapEntrySide, string> = {
    [OverlapEntrySide.TOP]: 'enter-from-top',
    [OverlapEntrySide.BOTTOM]: 'enter-from-bottom',
    [OverlapEntrySide.LEFT]: 'enter-from-left',
    [OverlapEntrySide.RIGHT]: 'enter-from-right',
    [OverlapEntrySide.CORNER]: 'enter-from-corner',
    [OverlapEntrySide.UNKNOWN]: 'enter-from-unknown',
    [OverlapEntrySide.CONTAINED]: 'enter-contained',
    [OverlapEntrySide.OVERLAP]: 'enter-overlap'
  };
  return classes[side] || '';
}

/**
 * Gets icon for entry side (for UI feedback)
 */
export function getIcon(side: OverlapEntrySide): string {
  const icons: Record<OverlapEntrySide, string> = {
    [OverlapEntrySide.TOP]: '↑',
    [OverlapEntrySide.BOTTOM]: '↓',
    [OverlapEntrySide.LEFT]: '←',
    [OverlapEntrySide.RIGHT]: '→',
    [OverlapEntrySide.CORNER]: '↗',
    [OverlapEntrySide.UNKNOWN]: '○',
    [OverlapEntrySide.CONTAINED]: '●',
    [OverlapEntrySide.OVERLAP]: '⊙'
  };
  return icons[side] || '○';
}

/**
 * Gets opposite side (useful for exit animations)
 */
export function getOpposite(side: OverlapEntrySide): OverlapEntrySide {
  const opposites: Record<OverlapEntrySide, OverlapEntrySide> = {
    [OverlapEntrySide.TOP]: OverlapEntrySide.BOTTOM,
    [OverlapEntrySide.BOTTOM]: OverlapEntrySide.TOP,
    [OverlapEntrySide.LEFT]: OverlapEntrySide.RIGHT,
    [OverlapEntrySide.RIGHT]: OverlapEntrySide.LEFT,
    [OverlapEntrySide.CORNER]: OverlapEntrySide.CORNER,
    [OverlapEntrySide.UNKNOWN]: OverlapEntrySide.UNKNOWN,
    [OverlapEntrySide.CONTAINED]: OverlapEntrySide.UNKNOWN,
    [OverlapEntrySide.OVERLAP]: OverlapEntrySide.UNKNOWN
  };
  return opposites[side] || OverlapEntrySide.UNKNOWN;
}

/**
 * Determines entry side from movement vector
 * @param dx Horizontal movement (positive = right, negative = left)
 * @param dy Vertical movement (positive = down, negative = up)
 */
export function fromVector(dx: number, dy: number): OverlapEntrySide {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const movementThreshold = 0.1; // Minimum movement to consider

  // Check if there's significant movement
  if (absDx < movementThreshold && absDy < movementThreshold) {
    return OverlapEntrySide.UNKNOWN;
  }

  // Check for corner entry (significant movement in both axes)
  // If movement ratio is close to 1, it's a corner entry
  const ratio = absDx / (absDy || 0.0001); // Avoid division by zero
  const isDiagonal = ratio > 0.7 && ratio < 1.3;

  if (absDx > 0 && absDy > 0 && isDiagonal) {
    return OverlapEntrySide.CORNER;
  }

  // Determine primary direction
  if (absDx > absDy) {
    return dx > 0 ? OverlapEntrySide.LEFT : OverlapEntrySide.RIGHT;
  } else {
    return dy > 0 ? OverlapEntrySide.TOP : OverlapEntrySide.BOTTOM;
  }
}

/**
 * Determines entry side based on rectangle proximity
 */
export function fromProximity(
  sourceRect: DOMRect,
  targetRect: DOMRect,
  threshold: number = 5
): OverlapEntrySide {
  const distances = {
    top: Math.abs(sourceRect.bottom - targetRect.top),
    bottom: Math.abs(sourceRect.top - targetRect.bottom),
    left: Math.abs(sourceRect.right - targetRect.left),
    right: Math.abs(sourceRect.left - targetRect.right)
  };

  // Find minimum distance
  const minDistance = Math.min(...Object.values(distances));

  // If no edge is within threshold, check if contained
  if (minDistance > threshold) {
    if (isContained(sourceRect, targetRect)) {
      return OverlapEntrySide.CONTAINED;
    }
    return OverlapEntrySide.OVERLAP;
  }

  // Check which edges are within threshold
  const closeEdges = Object.entries(distances)
    .filter(([_, distance]) => distance <= threshold)
    .map(([edge]) => edge);

  // Multiple close edges = corner
  if (closeEdges.length >= 2) {
    return OverlapEntrySide.CORNER;
  }

  // Single close edge
  if (closeEdges.length === 1) {
    switch (closeEdges[0]) {
      case 'top':
        return OverlapEntrySide.TOP;
      case 'bottom':
        return OverlapEntrySide.BOTTOM;
      case 'left':
        return OverlapEntrySide.LEFT;
      case 'right':
        return OverlapEntrySide.RIGHT;
    }
  }

  return OverlapEntrySide.UNKNOWN;
}

/**
 * Determines entry side based on overlap rectangle
 */
export function fromOverlapRect(
  sourceRect: DOMRect,
  targetRect: DOMRect,
  overlapRect: DOMRect
): OverlapEntrySide {
  if (overlapRect.width === 0 || overlapRect.height === 0) {
    return OverlapEntrySide.UNKNOWN;
  }

  // Calculate which edges are contributing to overlap
  const sourceEdges = {
    top: Math.abs(overlapRect.top - sourceRect.top) < 1,
    bottom: Math.abs(overlapRect.bottom - sourceRect.bottom) < 1,
    left: Math.abs(overlapRect.left - sourceRect.left) < 1,
    right: Math.abs(overlapRect.right - sourceRect.right) < 1
  };

  const targetEdges = {
    top: Math.abs(overlapRect.top - targetRect.top) < 1,
    bottom: Math.abs(overlapRect.bottom - targetRect.bottom) < 1,
    left: Math.abs(overlapRect.left - targetRect.left) < 1,
    right: Math.abs(overlapRect.right - targetRect.right) < 1
  };

  // Check for edge-to-edge contact
  const entryMap = [
    {source: 'bottom', target: 'top', side: OverlapEntrySide.TOP},
    {source: 'top', target: 'bottom', side: OverlapEntrySide.BOTTOM},
    {source: 'right', target: 'left', side: OverlapEntrySide.LEFT},
    {source: 'left', target: 'right', side: OverlapEntrySide.RIGHT}
  ];

  for (const entry of entryMap) {
    if (
      sourceEdges[entry.source as keyof typeof sourceEdges] &&
      targetEdges[entry.target as keyof typeof targetEdges]
    ) {
      return entry.side;
    }
  }

  // Check for corner or multiple edge contact
  const sourceEdgeCount = Object.values(sourceEdges).filter(Boolean).length;
  const targetEdgeCount = Object.values(targetEdges).filter(Boolean).length;

  if (sourceEdgeCount > 1 || targetEdgeCount > 1) {
    return OverlapEntrySide.CORNER;
  }

  // If source is fully inside target
  if (isContained(sourceRect, targetRect)) {
    return OverlapEntrySide.CONTAINED;
  }

  return OverlapEntrySide.OVERLAP;
}

/**
 * Smart detection that tries multiple methods
 */
export function detectEntrySide(
  sourceRect: DOMRect,
  targetRect: DOMRect,
  options: {
    previousSourceRect?: DOMRect;
    overlapRect?: DOMRect;
    movementThreshold?: number;
    proximityThreshold?: number;
  } = {}
): OverlapEntrySide {
  const {
    previousSourceRect,
    overlapRect,
    movementThreshold = 0.1,
    proximityThreshold = 5
  } = options;

  // Method 1: Use movement vector if available (most accurate for drag)
  if (previousSourceRect) {
    const dx = sourceRect.left - previousSourceRect.left;
    const dy = sourceRect.top - previousSourceRect.top;

    // Only use movement if significant
    if (Math.abs(dx) > movementThreshold || Math.abs(dy) > movementThreshold) {
      return fromVector(dx, dy);
    }
  }

  // Method 2: Use overlap rectangle analysis if available
  if (overlapRect && overlapRect.width > 0 && overlapRect.height > 0) {
    const overlapResult = fromOverlapRect(sourceRect, targetRect, overlapRect);
    if (overlapResult !== OverlapEntrySide.UNKNOWN) {
      return overlapResult;
    }
  }

  // Method 3: Use proximity detection (fallback)
  return fromProximity(sourceRect, targetRect, proximityThreshold);
}

/**
 * Gets animation properties for entry side
 */
export function getAnimationProperties(side: OverlapEntrySide): {
  name: string;
  duration: number;
  easing: string;
} {
  const animations: Record<OverlapEntrySide, any> = {
    [OverlapEntrySide.TOP]: {
      name: 'slideInTop',
      duration: 300,
      easing: 'ease-out'
    },
    [OverlapEntrySide.BOTTOM]: {
      name: 'slideInBottom',
      duration: 300,
      easing: 'ease-out'
    },
    [OverlapEntrySide.LEFT]: {
      name: 'slideInLeft',
      duration: 300,
      easing: 'ease-out'
    },
    [OverlapEntrySide.RIGHT]: {
      name: 'slideInRight',
      duration: 300,
      easing: 'ease-out'
    },
    [OverlapEntrySide.CORNER]: {
      name: 'pulse',
      duration: 500,
      easing: 'ease-in-out'
    },
    [OverlapEntrySide.CONTAINED]: {
      name: 'fadeIn',
      duration: 400,
      easing: 'ease-out'
    },
    [OverlapEntrySide.OVERLAP]: {
      name: 'fadeIn',
      duration: 200,
      easing: 'linear'
    },
    [OverlapEntrySide.UNKNOWN]: {
      name: 'fadeIn',
      duration: 200,
      easing: 'linear'
    }
  };

  return animations[side] || animations[OverlapEntrySide.UNKNOWN];
}


/**
 * Helper function to check if source is contained within target
 */
function isContained(sourceRect: DOMRect, targetRect: DOMRect): boolean {
  return (
    sourceRect.left >= targetRect.left &&
    sourceRect.right <= targetRect.right &&
    sourceRect.top >= targetRect.top &&
    sourceRect.bottom <= targetRect.bottom
  );
}

/**
 * Calculates entry side based on movement vector (more accurate during drag)
 */
function calculateEntrySideByMovement(
  currentRect: DOMRect,
  previousRect: DOMRect,
  targetRect: DOMRect
): OverlapEntrySide {
  // Calculate movement vector
  const dx = currentRect.left - previousRect.left;
  const dy = currentRect.top - previousRect.top;

  // If no movement, use proximity detection
  if (dx === 0 && dy === 0) {
    return calculateEntrySideByProximity(currentRect, targetRect);
  }

  // Use vector-based detection from our utils
  return fromVector(dx, dy);
}

/**
 * Calculates entry side based on proximity to target edges
 */
function calculateEntrySideByProximity(
  sourceRect: DOMRect,
  targetRect: DOMRect,
  overlapRect?: DOMRect
): OverlapEntrySide {

  // Calculate dynamic proximity threshold based on element sizes
  const proximityThreshold = calculateDynamicThreshold(sourceRect, targetRect);

  // Calculate distances to each edge
  const distances = {
    top: Math.abs(sourceRect.bottom - targetRect.top),
    bottom: Math.abs(sourceRect.top - targetRect.bottom),
    left: Math.abs(sourceRect.right - targetRect.left),
    right: Math.abs(sourceRect.left - targetRect.right)
  };

  // Check which edges are within threshold
  const isTopClose = distances.top < proximityThreshold;
  const isBottomClose = distances.bottom < proximityThreshold;
  const isLeftClose = distances.left < proximityThreshold;
  const isRightClose = distances.right < proximityThreshold;

  // Count how many sides are close
  const closeSides = [isTopClose, isBottomClose, isLeftClose, isRightClose]
    .filter(Boolean).length;

  // Determine entry side
  switch (closeSides) {
    case 0:
      // No sides close - could be center entry or fully contained
      return checkIfContained(sourceRect, targetRect)
        ? OverlapEntrySide.CONTAINED
        : OverlapEntrySide.UNKNOWN;

    case 1:
      // Single side entry
      if (isTopClose) return OverlapEntrySide.TOP;
      if (isBottomClose) return OverlapEntrySide.BOTTOM;
      if (isLeftClose) return OverlapEntrySide.LEFT;
      if (isRightClose) return OverlapEntrySide.RIGHT;
      break;

    case 2:
      // Two sides close - check if they form a corner
      if ((isTopClose && isLeftClose) || (isTopClose && isRightClose) ||
        (isBottomClose && isLeftClose) || (isBottomClose && isRightClose)) {
        return OverlapEntrySide.CORNER;
      }
      // Adjacent sides but not corner (e.g., top + bottom - impossible)
      break;

    case 3:
    case 4:
      // Multiple sides - treat as corner or special case
      return OverlapEntrySide.CORNER;
  }

  return OverlapEntrySide.UNKNOWN;
}

/**
 * Calculates dynamic proximity threshold based on element sizes
 * Smaller threshold for smaller elements, larger for bigger ones
 */
function calculateDynamicThreshold(sourceRect: DOMRect, targetRect: DOMRect): number {
  const minSize = Math.min(sourceRect.width, sourceRect.height, targetRect.width, targetRect.height);

  // Base threshold: 5px for medium elements, scaled for others
  if (minSize < 50) {
    return 3; // Small elements
  } else if (minSize > 200) {
    return 10; // Large elements
  } else {
    return 5; // Medium elements (default)
  }
}

/**
 * Checks if source is fully contained within target
 */
function checkIfContained(sourceRect: DOMRect, targetRect: DOMRect): boolean {
  return (
    sourceRect.top >= targetRect.top &&
    sourceRect.bottom <= targetRect.bottom &&
    sourceRect.left >= targetRect.left &&
    sourceRect.right <= targetRect.right
  );
}

/**
 * Alternative: Calculate entry side using overlap rectangle analysis
 */
function calculateEntrySideByOverlap(
  sourceRect: DOMRect,
  targetRect: DOMRect,
  overlapRect: DOMRect
): OverlapEntrySide {

  // Calculate which edges of the source are overlapping
  const sourceEdgesOverlapping = {
    top: Math.abs(overlapRect.top - sourceRect.top) < 1,
    bottom: Math.abs(overlapRect.bottom - sourceRect.bottom) < 1,
    left: Math.abs(overlapRect.left - sourceRect.left) < 1,
    right: Math.abs(overlapRect.right - sourceRect.right) < 1
  };

  // Calculate which edges of the target are being overlapped
  const targetEdgesOverlapped = {
    top: Math.abs(overlapRect.top - targetRect.top) < 1,
    bottom: Math.abs(overlapRect.bottom - targetRect.bottom) < 1,
    left: Math.abs(overlapRect.left - targetRect.left) < 1,
    right: Math.abs(overlapRect.right - targetRect.right) < 1
  };

  // Determine entry based on which source edge is inside target
  // and which target edge is being touched

  // Top entry: source bottom is overlapping AND touching target top
  if (sourceEdgesOverlapping.bottom && targetEdgesOverlapped.top) {
    return OverlapEntrySide.TOP;
  }

  // Bottom entry: source top is overlapping AND touching target bottom
  if (sourceEdgesOverlapping.top && targetEdgesOverlapped.bottom) {
    return OverlapEntrySide.BOTTOM;
  }

  // Left entry: source right is overlapping AND touching target left
  if (sourceEdgesOverlapping.right && targetEdgesOverlapped.left) {
    return OverlapEntrySide.LEFT;
  }

  // Right entry: source left is overlapping AND touching target right
  if (sourceEdgesOverlapping.left && targetEdgesOverlapped.right) {
    return OverlapEntrySide.RIGHT;
  }

  // Check for corners by counting edges
  const overlappingEdgesCount = Object.values(sourceEdgesOverlapping).filter(Boolean).length;
  const overlappedEdgesCount = Object.values(targetEdgesOverlapped).filter(Boolean).length;

  if (overlappingEdgesCount >= 2 || overlappedEdgesCount >= 2) {
    return OverlapEntrySide.CORNER;
  }

  return OverlapEntrySide.UNKNOWN;
}

/**
 * Main entry side calculation with fallback strategies
 */
export function getEntrySide(
  sourceRect: DOMRect,
  targetRect: DOMRect,
  options: {
    overlapRect?: DOMRect;
    previousSourceRect?: DOMRect;
    method?: EntrySideDetectionMethod;
  } = {}
): OverlapEntrySide {
  const {overlapRect, previousSourceRect, method = 'auto'} = options;

  // Handle each method explicitly without fallthrough
  switch (method) {
    case EntrySideDetectionMethod.VECTOR:
      return handleMovementMethod(sourceRect, targetRect, previousSourceRect, overlapRect);

    case EntrySideDetectionMethod.PROXIMITY:
      return calculateEntrySideByProximity(sourceRect, targetRect, overlapRect);

    case EntrySideDetectionMethod.OVERLAP:
      return handleOverlapMethod(sourceRect, targetRect, overlapRect);

    case EntrySideDetectionMethod.AUTO:
    default:
      return handleAutoMethod(sourceRect, targetRect, previousSourceRect, overlapRect);
  }
}

// Helper functions for each method
function handleMovementMethod(
  sourceRect: DOMRect,
  targetRect: DOMRect,
  previousSourceRect?: DOMRect,
  overlapRect?: DOMRect
): OverlapEntrySide {
  if (previousSourceRect) {
    return fromVector(
      sourceRect.left - previousSourceRect.left,
      sourceRect.top - previousSourceRect.top
    );
  }
  // Fallback to auto method
  return handleAutoMethod(sourceRect, targetRect, previousSourceRect, overlapRect);
}

function handleOverlapMethod(
  sourceRect: DOMRect,
  targetRect: DOMRect,
  overlapRect?: DOMRect
): OverlapEntrySide {
  if (overlapRect) {
    return calculateEntrySideByOverlap(sourceRect, targetRect, overlapRect);
  }
  // Fallback to auto method
  return handleAutoMethod(sourceRect, targetRect, undefined, overlapRect);
}

function handleAutoMethod(
  sourceRect: DOMRect,
  targetRect: DOMRect,
  previousSourceRect?: DOMRect,
  overlapRect?: DOMRect
): OverlapEntrySide {
  // Try methods in order of accuracy
  if (previousSourceRect) {
    return calculateEntrySideByMovement(sourceRect, previousSourceRect, targetRect);
  }
  if (overlapRect) {
    return calculateEntrySideByOverlap(sourceRect, targetRect, overlapRect);
  }
  return calculateEntrySideByProximity(sourceRect, targetRect);
}


/**
 * Universal overlap calculation between any two elements
 */
export function calculateOverlap(
  sourceRect: DOMRect,
  targetRect: DOMRect,
  targetElement: HTMLElement
): OverlapResult {
  // Calculate overlapping area
  const overlapX = Math.max(0,
    Math.min(sourceRect.right, targetRect.right) - Math.max(sourceRect.left, targetRect.left)
  );

  const overlapY = Math.max(0,
    Math.min(sourceRect.bottom, targetRect.bottom) - Math.max(sourceRect.top, targetRect.top)
  );

  const overlapArea = overlapX * overlapY;

  // Calculate areas
  const sourceArea = sourceRect.width * sourceRect.height;
  const targetArea = targetRect.width * targetRect.height;

  // Calculate overlap ratios
  const overlapRatio = sourceArea > 0 ? (overlapArea / sourceArea) : 0;
  const percentOfSource = sourceArea > 0 ? (overlapArea / sourceArea) * 100 : 0;
  const percentOfTarget = targetArea > 0 ? (overlapArea / targetArea) * 100 : 0;

  // Calculate overlapping rectangle coordinates
  let overlapRect: DOMRect | undefined;
  if (overlapArea > 0) {
    const overlapLeft = Math.max(sourceRect.left, targetRect.left);
    const overlapTop = Math.max(sourceRect.top, targetRect.top);
    const overlapRight = Math.min(sourceRect.right, targetRect.right);
    const overlapBottom = Math.min(sourceRect.bottom, targetRect.bottom);

    overlapRect = new DOMRect(
      overlapLeft,
      overlapTop,
      overlapRight - overlapLeft,
      overlapBottom - overlapTop
    );
  }

  // Calculate entry side
  const entrySide = getEntrySide(sourceRect, targetRect, { overlapRect });

  // Calculate center positions and offset
  const sourceCenter = {
    x: sourceRect.left + (sourceRect.width / 2),
    y: sourceRect.top + (sourceRect.height / 2)
  };

  const targetCenter = {
    x: targetRect.left + (targetRect.width / 2),
    y: targetRect.top + (targetRect.height / 2)
  };

  const distanceToCenter = Math.sqrt(
    Math.pow(targetCenter.x - sourceCenter.x, 2) +
    Math.pow(targetCenter.y - sourceCenter.y, 2)
  );

  const centerOffset = {
    x: targetCenter.x - sourceCenter.x,
    y: targetCenter.y - sourceCenter.y
  };

  return {
    target: targetElement,
    isOverlapping: overlapArea > 0,
    overlapRatio,
    overlapArea,
    overlapRect,
    sourceRect: new DOMRect(sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height),
    targetRect: new DOMRect(targetRect.x, targetRect.y, targetRect.width, targetRect.height),
    percentOfSource,
    percentOfTarget,
    entrySide,
    distanceToCenter,
    centerOffset
  };
}
