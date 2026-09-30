/** Shared landing geometry; presentation never mutates the authority. */
export const HYPERION_REACTOR = {capacity:100,regen:3,yamato:60,jump:75,jumpRange:1800} as const;
export const JUMP_TOO_NEAR = '落点过近（至少200）';
export const JUMP_TOO_FAR = '落点超出跃迁范围';
type Point = { readonly x: number; readonly y: number };
export interface JumpObstacleShip { readonly id: string; readonly pos: Point; readonly spec: { readonly collisionRadius: number; readonly hullSize?: string } }
export interface JumpObstacleWorld {
  readonly ships: readonly JumpObstacleShip[];
  readonly asteroids?: readonly { readonly pos: Point; readonly radius: number; readonly hp?: number }[];
}
export function hyperionJumpPointFailure(ship: JumpObstacleShip, point: Point, range: number, world?: JumpObstacleWorld): string | undefined {
  if (![point.x,point.y,ship.pos.x,ship.pos.y,range].every(Number.isFinite) || range <= 0) return '落点坐标无效';
  const distance = Math.hypot(point.x-ship.pos.x, point.y-ship.pos.y);
  if (distance < 200) return JUMP_TOO_NEAR;
  if (distance > range + 1e-6) return JUMP_TOO_FAR;
  if (!world) return undefined;
  if (!world.asteroids) return '落点环境尚未就绪';
  const radius = Math.max(1, ship.spec.collisionRadius);
  for (const other of world.ships) {
    if (other.id === ship.id || other.spec.hullSize === 'FIGHTER') continue;
    if (Math.hypot(point.x-other.pos.x,point.y-other.pos.y) < radius+other.spec.collisionRadius+1) return '落点被舰船占用';
  }
  for (const asteroid of world.asteroids) {
    if (asteroid.hp !== undefined && asteroid.hp <= 0) continue;
    if (Math.hypot(point.x-asteroid.pos.x,point.y-asteroid.pos.y) < radius+asteroid.radius+1) return '落点被小行星占用';
  }
}
/** Entering targeting does not require an aim yet; every other readiness failure still applies. */
export function jumpTargetingEntryFailure(system: { readonly activationFailureReason?: string }): string | undefined {
  const reason = system.activationFailureReason;
  return reason === JUMP_TOO_NEAR || reason === JUMP_TOO_FAR ? undefined : reason;
}
