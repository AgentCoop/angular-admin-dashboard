// src/math/vector/index.ts
export * from './vector-types';
export * from './vector2';
export * from './vector3';

// Re-export with aliases for convenience
export { Vector2 as Vec2 } from './vector2';
export { Vector3 as Vec3 } from './vector3';

// Export common constants
//export { VectorConstants } from './vector-constants';

// Export utility functions
//export * from './vector-utils';

// Type-only exports (if needed)
export type {
  IVector2,
  IVector3,
  VectorInput,
  NumericArray
} from './vector-types';
