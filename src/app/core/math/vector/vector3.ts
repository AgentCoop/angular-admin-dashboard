// vector3.ts
import { IVector3, VectorInput, NumericArray } from './vector-types';
import { Vector2 } from './vector2';

export class Vector3 implements IVector3 {
  public x: number;
  public y: number;
  public z: number;

  // Static constants
  static readonly ZERO = new Vector3(0, 0, 0);
  static readonly ONE = new Vector3(1, 1, 1);
  static readonly UP = new Vector3(0, 1, 0);
  static readonly DOWN = new Vector3(0, -1, 0);
  static readonly LEFT = new Vector3(-1, 0, 0);
  static readonly RIGHT = new Vector3(1, 0, 0);
  static readonly FORWARD = new Vector3(0, 0, 1);
  static readonly BACK = new Vector3(0, 0, -1);
  static readonly INFINITY = new Vector3(Infinity, Infinity, Infinity);

  // Constructors
  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  // Static factory methods
  static fromArray(arr: NumericArray): Vector3 {
    return new Vector3(arr[0] || 0, arr[1] || 0, arr[2] || 0);
  }

  static fromObject(obj: { x: number; y: number; z: number }): Vector3 {
    return new Vector3(obj.x, obj.y, obj.z);
  }

  static fromVector2(v: Vector2, z: number = 0): Vector3 {
    return new Vector3(v.x, v.y, z);
  }

  static fromSpherical(radius: number, theta: number, phi: number): Vector3 {
    const sinTheta = Math.sin(theta);
    return new Vector3(
      radius * sinTheta * Math.cos(phi),
      radius * sinTheta * Math.sin(phi),
      radius * Math.cos(theta)
    );
  }

  static fromCylindrical(radius: number, theta: number, height: number): Vector3 {
    return new Vector3(
      radius * Math.cos(theta),
      radius * Math.sin(theta),
      height
    );
  }

  static random(scale: number = 1): Vector3 {
    // Generate random point on unit sphere
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    return Vector3.fromSpherical(scale, theta, phi);
  }

  static lerp(a: Vector3, b: Vector3, t: number): Vector3 {
    return a.clone().lerp(b, t);
  }

  static slerp(a: Vector3, b: Vector3, t: number): Vector3 {
    const dot = a.dot(b);
    const theta = Math.acos(Math.min(Math.max(dot, -1), 1)) * t;
    const relative = b.sub(a.scale(dot)).normalize();
    return a.scale(Math.cos(theta)).add(relative.scale(Math.sin(theta)));
  }

  // Core operations (from Vector2 interface)
  add(v: Vector3 | number): Vector3 {
    if (typeof v === 'number') {
      this.x += v;
      this.y += v;
      this.z += v;
    } else {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
    }
    return this;
  }

  sub(v: Vector3 | number): Vector3 {
    if (typeof v === 'number') {
      this.x -= v;
      this.y -= v;
      this.z -= v;
    } else {
      this.x -= v.x;
      this.y -= v.y;
      this.z -= v.z;
    }
    return this;
  }

  mul(v: Vector3 | number): Vector3 {
    if (typeof v === 'number') {
      this.x *= v;
      this.y *= v;
      this.z *= v;
    } else {
      this.x *= v.x;
      this.y *= v.y;
      this.z *= v.z;
    }
    return this;
  }

  div(v: Vector3 | number): Vector3 {
    if (typeof v === 'number') {
      if (v === 0) throw new Error('Division by zero');
      this.x /= v;
      this.y /= v;
      this.z /= v;
    } else {
      if (v.x === 0 || v.y === 0 || v.z === 0) {
        throw new Error('Division by zero');
      }
      this.x /= v.x;
      this.y /= v.y;
      this.z /= v.z;
    }
    return this;
  }

  // 3D-specific operations
  cross(v: Vector3): Vector3 {
    return new Vector3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }

  dot(v: Vector3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  // Distance calculations
  distanceTo(v: Vector3): number {
    return Math.sqrt(this.distanceToSquared(v));
  }

  distanceToSquared(v: Vector3): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }

  manhattanDistanceTo(v: Vector3): number {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z);
  }

  // Transformations
  normalize(): Vector3 {
    const len = this.length;
    if (len > 0) {
      this.div(len);
    }
    return this;
  }

  scale(scalar: number): Vector3 {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }

  // 3D rotations
  rotateX(angle: number, center: Vector3 = Vector3.ZERO): Vector3 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const y = this.y - center.y;
    const z = this.z - center.z;

    this.y = y * cos - z * sin + center.y;
    this.z = y * sin + z * cos + center.z;

    return this;
  }

  rotateY(angle: number, center: Vector3 = Vector3.ZERO): Vector3 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const x = this.x - center.x;
    const z = this.z - center.z;

    this.x = x * cos + z * sin + center.x;
    this.z = -x * sin + z * cos + center.z;

    return this;
  }

  rotateZ(angle: number, center: Vector3 = Vector3.ZERO): Vector3 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const x = this.x - center.x;
    const y = this.y - center.y;

    this.x = x * cos - y * sin + center.x;
    this.y = x * sin + y * cos + center.y;

    return this;
  }

  rotateAroundAxis(axis: Vector3, angle: number): Vector3 {
    // Rodrigues' rotation formula
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const axisNorm = axis.normalize();

    const dot = this.dot(axisNorm);
    const cross = this.cross(axisNorm);

    return axisNorm.scale(dot * (1 - cos))
      .add(this.scale(cos))
      .add(cross.scale(sin));
  }

  rotateAxis(axis: Vector3, angle: number): Vector3 {
    // Rodrigues' rotation formula
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const axisNorm = axis.normalized;

    const dot = this.dot(axisNorm);
    const cross = this.cross(axisNorm);

    return axisNorm.scale(dot * (1 - cos))
      .add(this.scale(cos))
      .add(cross.scale(sin));
  }

  // Interpolation
  lerp(v: Vector3, t: number): Vector3 {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    this.z += (v.z - this.z) * t;
    return this;
  }

  // Clamping
  clamp(min: Vector3, max: Vector3): Vector3 {
    this.x = Math.max(min.x, Math.min(max.x, this.x));
    this.y = Math.max(min.y, Math.min(max.y, this.y));
    this.z = Math.max(min.z, Math.min(max.z, this.z));
    return this;
  }

  // Component-wise operations
  floor(): Vector3 {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    this.z = Math.floor(this.z);
    return this;
  }

  ceil(): Vector3 {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    this.z = Math.ceil(this.z);
    return this;
  }

  round(): Vector3 {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    this.z = Math.round(this.z);
    return this;
  }

  abs(): Vector3 {
    this.x = Math.abs(this.x);
    this.y = Math.abs(this.y);
    this.z = Math.abs(this.z);
    return this;
  }

  negate(): Vector3 {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  // Projections
  projectOnto(v: Vector3): Vector3 {
    const scalar = this.dot(v) / v.lengthSquared;
    return v.clone().scale(scalar);
  }

  projectOntoPlane(normal: Vector3): Vector3 {
    const projection = this.projectOnto(normal);
    return this.clone().sub(projection);
  }

  // Reflections
  reflect(normal: Vector3): Vector3 {
    const dot = this.dot(normal);
    this.x -= 2 * dot * normal.x;
    this.y -= 2 * dot * normal.y;
    this.z -= 2 * dot * normal.z;
    return this;
  }

  // Utility methods
  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  copy(v: Vector3): Vector3 {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  set(x: number, y: number, z: number = this.z): Vector3 {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  equals(v: Vector3, epsilon: number = 0.0001): boolean {
    return (
      Math.abs(this.x - v.x) < epsilon &&
      Math.abs(this.y - v.y) < epsilon &&
      Math.abs(this.z - v.z) < epsilon
    );
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  toVector2(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  toObject(): { x: number; y: number; z: number } {
    return { x: this.x, y: this.y, z: this.z };
  }

  toString(precision: number = 3): string {
    return `Vector3(${this.x.toFixed(precision)}, ${this.y.toFixed(precision)}, ${this.z.toFixed(precision)})`;
  }

  // Properties (getters)
  get length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  get lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  get normalized(): Vector3 {
    return this.clone().normalize();
  }

  get isZero(): boolean {
    return this.x === 0 && this.y === 0 && this.z === 0;
  }

  get isFinite(): boolean {
    return Number.isFinite(this.x) && Number.isFinite(this.y) && Number.isFinite(this.z);
  }

  // Spherical coordinates
  get spherical(): { radius: number; theta: number; phi: number } {
    const radius = this.length;
    return {
      radius,
      theta: radius > 0 ? Math.acos(this.z / radius) : 0,
      phi: Math.atan2(this.y, this.x)
    };
  }

  // Cylindrical coordinates
  get cylindrical(): { radius: number; theta: number; height: number } {
    return {
      radius: Math.sqrt(this.x * this.x + this.y * this.y),
      theta: Math.atan2(this.y, this.x),
      height: this.z
    };
  }

  // Swizzling (GLSL-style)
  get xy(): Vector2 { return new Vector2(this.x, this.y); }
  get xz(): Vector2 { return new Vector2(this.x, this.z); }
  get yz(): Vector2 { return new Vector2(this.y, this.z); }
  get yx(): Vector2 { return new Vector2(this.y, this.x); }
  get zx(): Vector2 { return new Vector2(this.z, this.x); }
  get zy(): Vector2 { return new Vector2(this.z, this.y); }
  get xyz(): Vector3 { return this.clone(); }
  get xzy(): Vector3 { return new Vector3(this.x, this.z, this.y); }
  get yxz(): Vector3 { return new Vector3(this.y, this.x, this.z); }
  get yzx(): Vector3 { return new Vector3(this.y, this.z, this.x); }
  get zxy(): Vector3 { return new Vector3(this.z, this.x, this.y); }
  get zyx(): Vector3 { return new Vector3(this.z, this.y, this.x); }
}
