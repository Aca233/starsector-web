import type { RustPresentationFacts } from './RustCombatPresentationFacts';
const required = (value: unknown, fields: readonly string[], context: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || fields.some(key => !Object.hasOwn(value, key))) throw Error('Incomplete Rust presentation ' + context);
  return value as Record<string, unknown>;
};
const unique = (keys: readonly (string | number)[], context: string) => { if (new Set(keys).size !== keys.length) throw Error('Duplicate Rust presentation ' + context); };
export function validateRustPresentationFacts(facts: RustPresentationFacts): void {
  required(facts, ['version', 'epoch', 'revision', 'tick', 'playerId', 'enemyId', 'manualWeaponId', 'targetId', 'rosters', 'ships', 'playerWings', 'enemyWings',
    'deployment', 'tactical', 'openBattlefield', 'multiTeamBattle', 'battleResult', 'isBattleResultReady', 'notificationTime', 'shipLossNotifications', 'environment',
    'cameraShakeIntensity', 'asteroidSprites', 'visuals', 'ordnance', 'audio', 'sceneTexts', 'radio'], 'frame');
  if (!Array.isArray(facts.sceneTexts) || !Array.isArray(facts.radio)) throw Error('Invalid Rust scene notifications');
  const rosters = ['ships', 'capitalShips', 'allCapitalShips', 'fighters', 'bombers'] as const;
  required(facts.rosters, rosters, 'rosters');
  for (const key of rosters) { if (!Array.isArray(facts.rosters[key])) throw Error('Invalid Rust semantic roster'); unique(facts.rosters[key], key); }
  if (!Array.isArray(facts.ships) || !Array.isArray(facts.playerWings) || !Array.isArray(facts.enemyWings) || !Array.isArray(facts.asteroidSprites)) throw Error('Invalid Rust fact arrays');
  required(facts.deployment, ['available', 'enabled', 'limit', 'rows', 'simulation', 'simulationLimit', 'allyUsed', 'enemyUsed'], 'deployment');
  required(facts.tactical, ['available', 'commandPoints', 'selectedUnitId', 'isTacticalMap', 'orders'], 'tactical');
  if (!(facts.tactical.orders instanceof Map) || !Array.isArray(facts.deployment.rows)) throw Error('Invalid Rust scene publication');
  unique(facts.deployment.rows.map(row => row.id), 'deployment rows');
  for (const row of facts.deployment.rows) if (!row.id || !Number.isSafeInteger(row.teamId) || row.teamId < 0 || !(row.cost > 0) || !Number.isFinite(row.cost)
    || !['reserve', 'deployed', 'retreating', 'retreated', 'destroyed'].includes(row.status)) throw Error('Invalid Rust deployment row');
  const visualKeys = ['particles', 'contrails', 'debris', 'explosions', 'hitGlows', 'empArcs', 'mines', 'muzzleFlashes', 'muzzleParticles', 'shieldRipples',
    'movingRayFades', 'trailStrips', 'projectileVisuals', 'projectileFlight', 'projectilePrediction', 'localMuzzles', 'localParticles'] as const;
  required(facts.visuals, visualKeys, 'visuals');
  for (const key of visualKeys) if (!['projectileFlight', 'projectileVisuals', 'projectilePrediction'].includes(key) && !Array.isArray(facts.visuals[key])) throw Error('Invalid Rust visual collection: ' + key);
  if (facts.visuals.projectileFlight !== undefined && !(facts.visuals.projectileFlight instanceof Map)) throw Error('Invalid Rust projectile flight layer');
  required(facts.audio, ['sequence', 'events'], 'audio');
  if (!Array.isArray(facts.audio.events)) throw Error('Invalid Rust audio publication');
  for (const event of facts.audio.events) {
    required(event, ['kind'], 'audio event');
    if (event.kind === 'muffled') { required(event, ['value'], 'muffled audio'); if (typeof event.value !== 'boolean') throw Error('Invalid Rust muffled audio'); }
    else if (event.kind === 'loop') { required(event, ['key', 'volume', 'active'], 'loop audio'); if (!event.key || !Number.isFinite(event.volume) || typeof event.active !== 'boolean') throw Error('Invalid Rust loop audio'); }
    else if (event.kind === 'play') {
      required(event, ['key', 'volume', 'rate'], 'play audio');
      if (!event.key || !Number.isFinite(event.volume) || !Number.isFinite(event.rate) || event.rate <= 0
        || event.position && (event.position.length !== 2 || !event.position.every(Number.isFinite))
        || event.listener && (event.listener.length !== 2 || !event.listener.every(Number.isFinite))
        || event.maxDistance !== undefined && (!Number.isFinite(event.maxDistance) || event.maxDistance <= 0)) throw Error('Invalid Rust play audio');
    } else throw Error('Unknown Rust audio kind');
  }
  required(facts.ordnance, ['projectiles', 'beams'], 'ordnance');
  for (const key of ['projectiles', 'beams'] as const) {
    if (!Array.isArray(facts.ordnance[key])) throw Error('Invalid Rust ordnance facts'); unique(facts.ordnance[key].map(x => x.serial), key);
    for (const row of facts.ordnance[key]) {
      required(row, ['serial', 'weaponKey', 'sourceSlotId', 'presentFields', ...(key === 'projectiles' ? ['isPlayer', 'presentation'] : ['maxDuration', 'scaleGlowBasedOnDamageEffectiveness'])], key + ' binding');
      if (!Number.isSafeInteger(row.serial) || row.serial <= 0 || !row.weaponKey || !Array.isArray(row.presentFields)) throw Error('Invalid Rust ordnance binding');
      unique(row.presentFields, key + ' presence');
    }
  }
  for (const ship of facts.ships) {
    required(ship, ['id', 'handle', 'stableId', 'specKey', 'team', 'reserveInitial', 'parent', 'sourceCarrier', 'previousPosition', 'previousFacing',
      'playerTargetId', 'visibilityMask', 'visibilityOverflow', 'isPhased', 'shipName', 'flightDeckWingId', 'isSystemDrone', 'sightRadius', 'isFiringMain', 'fighterRecall',
      'combatWeaponRepairTimeMultiplier', 'flameoutRatio', 'significantEnemiesInRange', 'phaseVisualAlpha', 'phaseGhosts', 'engineBoostLevel', 'previousEngineBoostLevel',
      'surfaceFeedback', 'shieldHitSegmentLevels', 'teleportCameraOffset', 'presentationPose', 'primarySystemId', 'tacticalSystemIds', 'defenseSystemId', 'systems', 'mounts'], 'ship');
    if (!Number.isSafeInteger(ship.id) || ship.id <= 0 || !ship.stableId || !ship.specKey || !Number.isSafeInteger(ship.team) || ship.team < 0
      || !Number.isSafeInteger(ship.handle.slot) || ship.handle.slot < 0 || !Number.isSafeInteger(ship.handle.generation) || ship.handle.generation <= 0
      || !Array.isArray(ship.previousPosition) || ship.previousPosition.length !== 2 || !ship.previousPosition.every(Number.isFinite) || !Number.isFinite(ship.previousFacing)
      || !(ship.shieldHitSegmentLevels instanceof Float32Array) || !Array.isArray(ship.mounts) || !Array.isArray(ship.systems) || !Array.isArray(ship.tacticalSystemIds)) throw Error('Invalid Rust display ship');
    unique(ship.systems.map(s => s.systemId), 'system'); unique(ship.mounts.map(m => m.componentId), 'mount');
    for (const system of ship.systems) {
      required(system, ['systemId', 'definition', 'isActive', 'activationFailureReason', 'statusText', 'passiveStatusText', 'fortressVisualLevel', 'pulseOffset',
        'gravityControlHeld', 'gravityPolarity', 'gravityField', 'gravityPush', 'gravityManeuver', 'teleportVisual'], 'system');
      required(system.definition, ['type', 'name', 'description', 'available', 'maxCharges', 'visuals', 'gravityField', 'gravityCollapse', 'charges', 'audio'], 'system definition');
    }
    for (const mount of ship.mounts) required(mount, ['componentId', 'weaponKey', 'slotId', 'relativePos', 'mountType', 'arcDeg', 'baseAngleDeg', 'range',
      'presentationRelativeAngle', 'gravityTractor', 'gravityDeflection'], 'mount');
  }
}
