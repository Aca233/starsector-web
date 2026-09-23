import type { CombatEngine } from '../engine/simulation/CombatEngine';

/** Authority/diagnostic restore contract ONLY. Production viewers use the
 * explicit LanDisplaySnapshot decoder, never this legacy Ship/component codec. */
export type CombatSnapshotTarget = Pick<CombatEngine,
  'allCapitalShips' | 'combatShips' | 'ships' | 'fighters' | 'bombers' | 'findHostile'
  | 'combatTime' | 'cameraShakeIntensity' | 'battleResult' | 'environment' | 'projectiles' | 'beams'
> & {
  readonly deployment: Pick<CombatEngine['deployment'], 'enabled' | 'isReserve' | 'applySnapshot'>;
  readonly droneSystem: Pick<CombatEngine['droneSystem'], 'drones'>;
  readonly fxSystem: Pick<CombatEngine['fxSystem'],
    'particles' | 'contrails' | 'explosions' | 'hitGlows' | 'movingRayFades' | 'empArcs'
    | 'muzzleFlashes' | 'muzzleParticles' | 'floatingTexts' | 'debris' | 'shieldRipples' | 'hulkFragments'>;
  readonly contrailEngine: CombatEngine['contrailEngine'];
  readonly asteroidSystem: Pick<CombatEngine['asteroidSystem'], 'asteroids'>;
  readonly nebulaSystem: Pick<CombatEngine['nebulaSystem'], 'nebulae'>;
  readonly mineSystem: Pick<CombatEngine['mineSystem'], 'mines'>;
};
