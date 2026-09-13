import { Vector2 } from '../math/Vector2';

/** Refresh-rate independent camera follow helper. */
export class CameraController {
  // Matches the old 0.1-per-frame feel at 60 Hz while remaining time based.
  private static readonly RESPONSE_PER_SECOND = -Math.log(0.9) * 60;

  public smoothingAlpha(dt: number): number {
    const safeDt = Math.max(0, Math.min(0.1, dt));
    return 1 - Math.exp(-CameraController.RESPONSE_PER_SECOND * safeDt);
  }

  public follow(current: Vector2, target: Vector2, dt: number): void {
    const alpha = this.smoothingAlpha(dt);
    current.x += (target.x - current.x) * alpha;
    current.y += (target.y - current.y) * alpha;
  }
}
