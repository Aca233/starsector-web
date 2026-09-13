/**
 * 高性能 2D 向量计算工具类 (Vector2)
 * 支持纯函数计算与零垃圾回收 (Zero Allocation) 内存复用
 */
export class Vector2 {
  public x: number;
  public y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
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
    return Math.hypot(this.x, this.y);
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
    return Math.hypot(this.x - v.x, this.y - v.y);
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
