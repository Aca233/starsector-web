import type { Ship } from '../../engine/simulation/Ship';
import type { Vector2 } from '../../engine/math/Vector2';

/** Match renderer backing pixels to CSS pixels, including resized/scaled canvases. */
export function contactAnchor(ship: Ship, canvas: HTMLCanvasElement | null | undefined, camera?: Vector2, zoom = 1, alpha = 1) {
  const width = canvas?.clientWidth || window.innerWidth, height = canvas?.clientHeight || window.innerHeight;
  const scaleX = width / (canvas?.width || width), scaleY = height / (canvas?.height || height);
  const pos = ship.interpolatedPos(alpha);
  return {
    x: (pos.x - (camera?.x ?? 0)) * zoom * scaleX + width / 2,
    y: (pos.y - (camera?.y ?? 0)) * zoom * scaleY + height / 2,
    radius: Math.max(28, ship.spec.collisionRadius * zoom * Math.max(scaleX, scaleY)), width, height,
  };
}

export const clampContact = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));
