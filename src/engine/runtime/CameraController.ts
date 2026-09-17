import { Vector2 } from '../math/Vector2';

type CombatCanvas = Pick<HTMLCanvasElement, 'width' | 'height' | 'getBoundingClientRect'>;

/** CombatState + O0OO: ship anchor plus independently smoothed screen-relative mouse pan. */
export class CameraController {
  private pointer = new Vector2();
  private pointerActive = false;
  private offset = new Vector2();
  private targetOffset = new Vector2();

  public samplePointer(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) { this.suspendPointer(); return; }
    this.pointer.set(x, y);
    this.pointerActive = true;
  }

  /** Menus/maps/focus loss freeze pan, rather than steering toward their UI controls. */
  public suspendPointer(): void { this.pointerActive = false; }

  public reset(): void {
    this.suspendPointer();
    this.offset.set(0, 0);
    this.targetOffset.set(0, 0);
  }

  /** Free observation after flagship loss or settlement; menus/maps never move the camera. */
  public observe(current: Vector2, keys: Record<string, boolean>, zoom: number, dt: number, enabled = true): void {
    this.suspendPointer();
    if (!enabled || !(zoom > 0) || !Number.isFinite(zoom)) return;
    const x = Number(!!(keys.KeyD || keys.ArrowRight)) - Number(!!(keys.KeyA || keys.ArrowLeft));
    const y = Number(!!(keys.KeyS || keys.ArrowDown)) - Number(!!(keys.KeyW || keys.ArrowUp));
    const length = Math.hypot(x, y);
    const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
    if (length) {
      const step = 600 * safeDt / zoom / length;
      current.x += x * step; current.y += y * step;
    }
  }

  public follow(current: Vector2, focus: Vector2, canvas: CombatCanvas, zoom: number, dt: number, allowPointer = true): void {
    if (!allowPointer) this.suspendPointer();
    if (this.pointerActive) {
      const rect = canvas.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0 && canvas.width > 0 && canvas.height > 0 && Number.isFinite(zoom) && zoom > 0)
        || this.pointer.x < rect.left || this.pointer.x > rect.left + rect.width
        || this.pointer.y < rect.top || this.pointer.y > rect.top + rect.height) {
        this.suspendPointer();
      } else {
        const scaleX = canvas.width / rect.width / zoom;
        const scaleY = canvas.height / rect.height / zoom;
        // Native default mouse pan gain is 2. Never derive this from aimTargetWorld:
        // that includes the current camera offset and would create positive feedback.
        const x = (this.pointer.x - rect.left - rect.width / 2) * scaleX * 2;
        const y = (this.pointer.y - rect.top - rect.height / 2) * scaleY * 2;
        // O0OO ignores sub-threshold changes (14 * native zoom factor).
        if (Math.abs(x - this.targetOffset.x) >= 14 * scaleX
          || Math.abs(y - this.targetOffset.y) >= 14 * scaleY) this.targetOffset.set(x, y);
        const dx = this.targetOffset.x - this.offset.x, dy = this.targetOffset.y - this.offset.y;
        const distance = Math.hypot(dx, dy);
        const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
        // Utils.o00000 uses speed = 25 + distance. Integrate that law in time,
        // rather than stacking per-frame easing on both the ship and the cursor.
        if (distance > 0 && safeDt > 0) {
          const step = Math.min(distance, (distance + 25) * -Math.expm1(-safeDt));
          this.offset.x += dx / distance * step;
          this.offset.y += dy / distance * step;
        }
      }
    }
    current.set(focus.x + this.offset.x, focus.y + this.offset.y);
  }
}
