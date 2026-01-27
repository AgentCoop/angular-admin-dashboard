// vector2.ts
import { IVector2, VectorInput, NumericArray } from './vector-types';
import { Vector3 } from './vector3';

export class Vector2 implements IVector2 {
  public x: number;
  public y: number;

  // Static constants
  static readonly ZERO = new Vector2(0, 0);
  static readonly ONE = new Vector2(1, 1);
  static readonly UP = new Vector2(0, 1);
  static readonly DOWN = new Vector2(0, -1);
  static readonly LEFT = new Vector2(-1, 0);
  static readonly RIGHT = new Vector2(1, 0);
  static readonly INFINITY = new Vector2(Infinity, Infinity);

  // Constructors
  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  // Static factory methods
  static fromArray(arr: NumericArray): Vector2 {
    return new Vector2(arr[0] || 0, arr[1] || 0);
  }

  static fromObject(obj: { x: number; y: number }): Vector2 {
    return new Vector2(obj.x, obj.y);
  }

  static fromAngle(angle: number, length: number = 1): Vector2 {
    return new Vector2(
      Math.cos(angle) * length,
      Math.sin(angle) * length
    );
  }

  static random(scale: number = 1): Vector2 {
    const angle = Math.random() * Math.PI * 2;
    return Vector2.fromAngle(angle, Math.random() * scale);
  }

  static lerp(a: Vector2, b: Vector2, t: number): Vector2 {
    return a.clone().lerp(b, t);
  }

  static slerp(a: Vector2, b: Vector2, t: number): Vector2 {
    const dot = a.dot(b);
    const theta = Math.acos(Math.min(Math.max(dot, -1), 1)) * t;
    const relative = b.sub(a.scale(dot)).normalize();
    return a.scale(Math.cos(theta)).add(relative.scale(Math.sin(theta)));
  }

  // Core operations
  add(v: Vector2 | number): Vector2 {
    if (typeof v === 'number') {
      this.x += v;
      this.y += v;
    } else {
      this.x += v.x;
      this.y += v.y;
    }
    return this;
  }

  sub(v: Vector2 | number): Vector2 {
    if (typeof v === 'number') {
      this.x -= v;
      this.y -= v;
    } else {
      this.x -= v.x;
      this.y -= v.y;
    }
    return this;
  }

  mul(v: Vector2 | number): Vector2 {
    if (typeof v === 'number') {
      this.x *= v;
      this.y *= v;
    } else {
      this.x *= v.x;
      this.y *= v.y;
    }
    return this;
  }

  div(v: Vector2 | number): Vector2 {
    if (typeof v === 'number') {
      if (v === 0) throw new Error('Division by zero');
      this.x /= v;
      this.y /= v;
    } else {
      if (v.x === 0 || v.y === 0) throw new Error('Division by zero');
      this.x /= v.x;
      this.y /= v.y;
    }
    return this;
  }

  // Static operations (return new vectors)
  static add(a: Vector2, b: Vector2 | number): Vector2 {
    return a.clone().add(b);
  }

  static sub(a: Vector2, b: Vector2 | number): Vector2 {
    return a.clone().sub(b);
  }

  static mul(a: Vector2, b: Vector2 | number): Vector2 {
    return a.clone().mul(b);
  }

  static div(a: Vector2, b: Vector2 | number): Vector2 {
    return a.clone().div(b);
  }

  // Vector operations
  dot(v: Vector2): number {
    return this.x * v.x + this.y * v.y;
  }

  cross(v: Vector2): number {
    return this.x * v.y - this.y * v.x;
  }

  distanceTo(v: Vector2): number {
    return Math.sqrt(this.distanceToSquared(v));
  }

  distanceToSquared(v: Vector2): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  manhattanDistanceTo(v: Vector2): number {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y);
  }

  // Transformations
  normalize(): Vector2 {
    const len = this.length;
    if (len > 0) {
      this.div(len);
    }
    return this;
  }

  scale(scalar: number): Vector2 {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  rotateAround(point: Vector2, angle: number): Vector2 {
    // Same as rotate but with explicit center
    return this.rotate(angle, point);
  }

  perpendicular(): Vector2 {
    // Returns a vector perpendicular to this one (rotated 90° clockwise)
    return new Vector2(-this.y, this.x);
  }

  rotate(angle: number, center: Vector2 = Vector2.ZERO): Vector2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const x = this.x - center.x;
    const y = this.y - center.y;

    this.x = x * cos - y * sin + center.x;
    this.y = x * sin + y * cos + center.y;

    return this;
  }

  lerp(v: Vector2, t: number): Vector2 {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    return this;
  }

  clamp(min: Vector2, max: Vector2): Vector2 {
    this.x = Math.max(min.x, Math.min(max.x, this.x));
    this.y = Math.max(min.y, Math.min(max.y, this.y));
    return this;
  }

  floor(): Vector2 {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    return this;
  }

  ceil(): Vector2 {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    return this;
  }

  round(): Vector2 {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    return this;
  }

  abs(): Vector2 {
    this.x = Math.abs(this.x);
    this.y = Math.abs(this.y);
    return this;
  }

  negate(): Vector2 {
    this.x = -this.x;
    this.y = -this.y;
    return this;
  }

  // Projections
  projectOnto(v: Vector2): Vector2 {
    const scalar = this.dot(v) / v.lengthSquared;
    return v.clone().scale(scalar);
  }

  rejectFrom(v: Vector2): Vector2 {
    const projection = this.projectOnto(v);
    return this.clone().sub(projection);
  }

  // Reflections
  reflect(normal: Vector2): Vector2 {
    const dot = this.dot(normal);
    this.x -= 2 * dot * normal.x;
    this.y -= 2 * dot * normal.y;
    return this;
  }

  // Utility methods
  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  copy(v: Vector2): Vector2 {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  set(x: number, y: number): Vector2 {
    this.x = x;
    this.y = y;
    return this;
  }

  equals(v: Vector2, epsilon: number = 0.0001): boolean {
    return (
      Math.abs(this.x - v.x) < epsilon &&
      Math.abs(this.y - v.y) < epsilon
    );
  }

  toArray(): [number, number] {
    return [this.x, this.y];
  }

  toObject(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  toString(precision: number = 3): string {
    return `Vector2(${this.x.toFixed(precision)}, ${this.y.toFixed(precision)})`;
  }

  toVector3(z: number = 0): Vector3 {
    return new Vector3(this.x, this.y, z);
  }

  // Properties (getters)
  get length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  get lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  get angle(): number {
    return Math.atan2(this.y, this.x);
  }

  get normalized(): Vector2 {
    return this.clone().normalize();
  }

  get isZero(): boolean {
    return this.x === 0 && this.y === 0;
  }

  get isFinite(): boolean {
    return Number.isFinite(this.x) && Number.isFinite(this.y);
  }

  // Component accessors
  get width(): number { return this.x; }
  set width(value: number) { this.x = value; }

  get height(): number { return this.y; }
  set height(value: number) { this.y = value; }
}
