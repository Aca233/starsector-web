// Two-coordinate scaled norm: retain hypot's overflow/subnormal handling without
// its variadic accumulator. Capture the intrinsics, but respect a replaced hypot.
const builtinHypot = Math.hypot, normAbs = Math.abs, normSqrt = Math.sqrt;
const applyNorm = Reflect.apply;
const nativeNormIntrinsics = [[builtinHypot, "hypot"], [normAbs, "abs"], [normSqrt, "sqrt"]]
  .every(([fn, name]) => typeof fn === "function" && Function.prototype.toString.call(fn) === `function ${name}() { [native code] }`);
function norm2(x: number, y: number): number {
  const a = normAbs(x), b = normAbs(y);
  if (a === Infinity || b === Infinity) return Infinity;
  const max = a > b ? a : b;
  if (max === 0 && a === 0) return 0;
  const ratio = (a > b ? b : a) / max;
  return normSqrt(1 + ratio * ratio) * max;
}
/**
 * 高性能 2D 向量计算工具类 (Vector2)
 * 支持纯函数计算与零垃圾回收 (Zero Allocation) 内存复用
 */
export class Vector2 {
  declare public x: number;
  declare public y: number;

  constructor(x = 0, y = 0) {
    // The constructor owns initialization. Type-only declarations avoid emitting
    // two undefined class-field writes before these final coordinates.
    // Preserve own writable data fields even on subclasses/prototype accessors.
    if ('x' in (this as object) || 'y' in (this as object)) {
      Object.defineProperties(this, {
        x: { value: x, writable: true, enumerable: true, configurable: true },
        y: { value: y, writable: true, enumerable: true, configurable: true }
      });
    } else {
      this.x = x;
      this.y = y;
    }
  }

  public set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  public copy(v: Vector2): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  public clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  public add(v: Vector2): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  public addScaled(v: Vector2, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    return this;
  }

  public subScaled(v: Vector2, s: number): this {
    this.x -= v.x * s;
    this.y -= v.y * s;
    return this;
  }

  public sub(v: Vector2): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  public scale(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  public lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  public length(): number {
    const math = Math, hypot = math.hypot, x = this.x, y = this.y;
    return nativeNormIntrinsics && hypot === builtinHypot ? norm2(x, y) : applyNorm(hypot, math, [x, y]);
  }

  public normalize(): this {
    const len = this.length();
    if (len > 0.00001) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  public rotate(radians: number): this {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const rx = this.x * cos - this.y * sin;
    const ry = this.x * sin + this.y * cos;
    this.x = rx;
    this.y = ry;
    return this;
  }

  public dot(v: Vector2): number {
    return this.x * v.x + this.y * v.y;
  }

  public distanceTo(v: Vector2): number {
    const math = Math, hypot = math.hypot, x = this.x - v.x, y = this.y - v.y;
    return nativeNormIntrinsics && hypot === builtinHypot ? norm2(x, y) : applyNorm(hypot, math, [x, y]);
  }

  public heading(): number {
    return Math.atan2(this.y, this.x);
  }

  public static fromAngle(radians: number, length = 1): Vector2 {
    return new Vector2(Math.cos(radians) * length, Math.sin(radians) * length);
  }

  public static lerp(a: Vector2, b: Vector2, t: number, out = new Vector2()): Vector2 {
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    return out;
  }
}
