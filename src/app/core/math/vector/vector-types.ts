// vector-shared-worker.types.ts
import { Vector2 } from '@core/math/vector/vector2';
import { Vector3 } from '@core/math/vector/vector3';

export type NumericArray = number[] | Float32Array | Float64Array;
export type VectorInput = Vector2 | Vector3 | number[] | { x: number; y: number; z?: number };

export interface IVector2 {
  x: number;
  y: number;

  // Core operations
  add(v: Vector2): Vector2;
  sub(v: Vector2): Vector2;
  mul(v: Vector2 | number): Vector2;
  div(v: Vector2 | number): Vector2;

  // Transformations
  normalize(): Vector2;
  scale(scalar: number): Vector2;
  rotate(angle: number, center?: Vector2): Vector2;
  rotateAround(point: Vector2, angle: number): Vector2;

  // 2D-specific operations
  dot(v: Vector2): number;
  cross(v: Vector2): number;  // Returns scalar (2D cross product)
  perpendicular(): Vector2;
  projectOnto(v: Vector2): Vector2;

  // Distance calculations
  distanceTo(v: Vector2): number;
  distanceToSquared(v: Vector2): number;
  manhattanDistanceTo(v: Vector2): number;

  // Utility
  clone(): Vector2;
  copy(v: Vector2): Vector2;
  equals(v: Vector2, epsilon?: number): boolean;
  toArray(): [number, number];
  toObject(): { x: number; y: number };
  toString(precision?: number): string;

  // Conversion
  toVector3(z?: number): Vector3;

  // Properties
  length: number;
  lengthSquared: number;
  angle: number;  // Angle from x-axis in radians
  normalized: Vector2;
  isZero: boolean;
  isFinite: boolean;

  // Swizzling (optional)
  yx?: Vector2;
}

export interface IVector3 {
  x: number;
  y: number;
  z: number;

  // Core operations
  add(v: Vector3): Vector3;
  sub(v: Vector3): Vector3;
  mul(v: Vector3 | number): Vector3;
  div(v: Vector3 | number): Vector3;

  // Transformations
  normalize(): Vector3;
  scale(scalar: number): Vector3;

  // 2D rotation (in XY plane) - OPTIONAL
  rotate?(angle: number, center?: Vector2 | Vector3): Vector3;

  // 3D-specific rotations
  rotateX(angle: number): Vector3;
  rotateY(angle: number): Vector3;
  rotateZ(angle: number): Vector3;
  rotateAroundAxis(axis: Vector3, angle: number): Vector3;

  // 3D-specific operations
  cross(v: Vector3): Vector3;  // Returns vector (3D cross product)
  dot(v: Vector3): number;
  projectOnto(v: Vector3): Vector3;
  projectOntoPlane(normal: Vector3): Vector3;
  reflect(normal: Vector3): Vector3;

  // Distance calculations
  distanceTo(v: Vector3): number;
  distanceToSquared(v: Vector3): number;
  manhattanDistanceTo(v: Vector3): number;

  // Utility
  clone(): Vector3;
  copy(v: Vector3): Vector3;
  equals(v: Vector3, epsilon?: number): boolean;
  toArray(): [number, number, number];
  toObject(): { x: number; y: number; z: number };
  toString(precision?: number): string;

  // Conversion
  toVector2(): Vector2;

  // Properties
  length: number;
  lengthSquared: number;
  angle?: number;  // OPTIONAL: angle in XY plane
  normalized: Vector3;
  isZero: boolean;
  isFinite: boolean;

  // Coordinate systems
  spherical: { radius: number; theta: number; phi: number };
  cylindrical: { radius: number; theta: number; height: number };

  // Swizzling (optional)
  xy?: Vector2;
  xz?: Vector2;
  yz?: Vector2;
  yx?: Vector2;
  zx?: Vector2;
  zy?: Vector2;
  xyz?: Vector3;
  xzy?: Vector3;
  yxz?: Vector3;
  yzx?: Vector3;
  zxy?: Vector3;
  zyx?: Vector3;
}

// COMMON TYPE GUARDS
export function isVector2(value: any): value is Vector2 {
  return value instanceof Vector2 || (value && typeof value.x === 'number' && typeof value.y === 'number');
}

export function isVector3(value: any): value is Vector3 {
  return value instanceof Vector3 || (value && typeof value.x === 'number' && typeof value.y === 'number' && typeof value.z === 'number');
}

// OPERATION RESULT TYPES
export type VectorOperationResult<T extends Vector2 | Vector3> =
  T extends Vector2 ? Vector2 :
    T extends Vector3 ? Vector3 : never;

// UTILITY TYPES
export type VectorDimensions<T> =
  T extends Vector2 ? 2 :
    T extends Vector3 ? 3 : never;

export type VectorComponents<T> =
  T extends Vector2 ? [number, number] :
    T extends Vector3 ? [number, number, number] : never;
