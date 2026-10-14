/** Bind completed native observations to the frozen one-time art dictionary.
 * This adapter has no Ship/CombatEngine constructors, clocks or rules callbacks. */
import type { ShipSpec } from '../../content/ShipSpec';
import { tacticalSystemIds, defenseSystemId } from '../../extensions/ship-systems/Loadout';
import { shipSystemDefinitions } from '../../extensions/ship-systems/Registry';
import type { TacticalOrder } from '../../simulation/CombatTypes';
import type { RustBodyHandle, RustCoreSnapshot } from './RustCoreProtocol';
import type { RustCompiledContent } from './RustContentCompiler';
import type { RustScenePublication } from './RustScenePublication';
import type { RustPresentationFacts, RustPresentationShipFact, RustPresentationSystemFact, RustPresentationWeaponFact } from './RustCombatPresentationFacts';
import { rustHandleKey } from './RustCombatPresentationData';

/** Mandatory actual native readers. Absence is an integration error, never an
 * invitation to infer dynamic state from the content or a previous display. */
export interface RustPresentationLive {
  readonly systems: readonly (Omit<RustPresentationSystemFact, 'definition'> & { readonly handle: RustBodyHandle; readonly available: boolean })[];
  readonly mounts: readonly (Pick<RustPresentationWeaponFact, 'componentId' | 'presentationRelativeAngle' | 'gravityTractor' | 'gravityDeflection'> & { readonly handle: RustBodyHandle })[];
  readonly poses: readonly { readonly handle: RustBodyHandle; readonly presentationPose: RustPresentationShipFact['presentationPose']; readonly teleportCameraOffset: RustPresentationShipFact['teleportCameraOffset'] }[];
  readonly ordnance: RustPresentationFacts['ordnance'];
  readonly layers: Pick<RustPresentationFacts['visuals'], 'mines' | 'projectileVisuals' | 'projectileFlight' | 'projectilePrediction' | 'localMuzzles' | 'localParticles'>;
  readonly audio: RustPresentationFacts['audio'];
}
export const RUST_DEFAULT_COMBAT_ENVIRONMENT = Object.freeze({ backgroundUrl: '/game-assets/graphics/backgrounds/background4.jpg', starCount: 0 });
export const RUST_ASTEROID_SPRITES = Object.freeze(['asteroid1.png', 'asteroid1.png', 'asteroid2.png', 'asteroid3.png', 'asteroid_big00.png'].map(name => '/game-assets/graphics/asteroids/' + name));

function contentIndex(content:RustCompiledContent){return {
  originals:new Map(content.entities.map(e=>[rustHandleKey(e.handle),e])),
  templates:new Map(content.dictionary.templates.map(e=>[e.key,e])),
  specs:new Map([...content.dictionary.ships,...content.dictionary.templates].map(e=>[e.key,e.spec])),
  lifecycles:new Map(content.commands.filter(c=>c.kind==='define-lifecycle').map(c=>[c.id,c])),
};}
const contentIndexes=new WeakMap<RustCompiledContent,ReturnType<typeof contentIndex>>();

export function rustCombatFacts(content: RustCompiledContent, snapshot: RustCoreSnapshot, scene: RustScenePublication,
  live: RustPresentationLive, epoch: number, revision: number): RustPresentationFacts {
  if (!snapshot.world || snapshot.tick !== scene.tick || snapshot.combatTime !== scene.time) throw Error('Rust scene/world publication barrier differs');
  let index=contentIndexes.get(content);if(!index){index=contentIndex(content);contentIndexes.set(content,index);}const {originals,templates,specs,lifecycles}=index;
  const bodies = new Map(snapshot.bodies.map(b => [rustHandleKey(b.handle), b]));
  const reads = new Map(scene.ships.map(s => [rustHandleKey(s.handle), s]));
  if (reads.size !== scene.ships.length || bodies.size !== snapshot.bodies.length) throw Error('Duplicate Rust publication handle');
  const read = (h: RustBodyHandle) => { const s = reads.get(rustHandleKey(h)); if (!s) throw Error('Unknown Rust semantic handle'); return s; };
  const stable = (h: RustBodyHandle) => read(h).stableId;
  const visuals = new Map(scene.visual.ships.map(s => [rustHandleKey(s.handle), s]));
  const poses = new Map(live.poses.map(s => [rustHandleKey(s.handle), s]));
  const systems = new Map(live.systems.map(s => [rustHandleKey(s.handle) + '/' + s.systemId, s]));
  const mounts = new Map(live.mounts.map(m => [rustHandleKey(m.handle) + '/' + m.componentId, m]));
  const ranges=new Map(scene.mounts.map(m=>[m.id+'/'+m.componentId+'/'+m.slotId,m]));
  if(ranges.size!==scene.mounts.length)throw Error('Duplicate Rust mount range observation');
  if (visuals.size !== scene.visual.ships.length || poses.size !== live.poses.length || systems.size !== live.systems.length || mounts.size !== live.mounts.length) throw Error('Duplicate Rust dynamic fact');
  let usedSystems = 0, usedMounts = 0;
  const ships: RustPresentationShipFact[] = scene.ships.map(source => {
    const key = rustHandleKey(source.handle), initial = originals.get(key), template = templates.get(source.specKey);
    const specKey = source.specKey || initial?.specKey, spec = specKey && specs.get(specKey);
    if (!specKey || !spec || initial && (initial.id !== source.id || initial.stableId !== source.stableId || initial.specKey !== specKey)
      || !initial && !template) throw Error('Rust birth content binding differs: ' + source.stableId);
    const body = bodies.get(key), visual = visuals.get(key), pose = poses.get(key);
    if (!body?.ship || body.id !== source.id || !visual || !pose) throw Error('Incomplete Rust live ship publication: ' + source.stableId);
    const bindings = initial?.mounts ?? template!.mounts;
    if (bindings.length !== body.ship.weapons?.mounts.length) throw Error('Rust mount topology differs');
    const ids = tacticalSystemIds(spec), allIds = [ids[0] ?? 'NONE', ...ids.slice(1), defenseSystemId(spec)];
    if (body.ship.systems.length !== allIds.length || source.primarySystemId !== 1 || source.defenseSystemId !== allIds.length) throw Error('Rust system topology differs');
    const facts = body.ship.systems.map((s, i): RustPresentationSystemFact => {
      const dynamic = systems.get(key + '/' + s.id), d = shipSystemDefinitions.get(allIds[i]);
      if (!dynamic || !d || s.id !== i + 1) throw Error('Missing Rust dynamic system fact'); usedSystems++;
      const lifecycle = initial ? lifecycles.get(s.specId)
        : template!.constructor.systems.find(slot => slot.id === s.id)?.definition;
      const maxCharges = lifecycle && 'kind' in lifecycle && lifecycle.kind === 'define-lifecycle' ? lifecycle.spec.maxCharges
        : lifecycle && 'maxCharges' in lifecycle ? lifecycle.maxCharges : undefined;
      if (maxCharges === undefined) throw Error('Missing immutable Rust lifecycle definition');
      return { systemId: s.id, definition: { type: d.id, name: d.name, description: d.description ?? '', available: dynamic.available,
        maxCharges, visuals: d.visuals, gravityField: d.gravityField, gravityCollapse: d.gravityCollapse, charges: d.charges, audio: d.audio },
        isActive: dynamic.isActive, activationFailureReason: dynamic.activationFailureReason, statusText: dynamic.statusText, passiveStatusText: dynamic.passiveStatusText,
        fortressVisualLevel: dynamic.fortressVisualLevel, pulseOffset: dynamic.pulseOffset, gravityControlHeld: dynamic.gravityControlHeld, gravityPolarity: dynamic.gravityPolarity,
        gravityField: dynamic.gravityField, gravityPush: dynamic.gravityPush, gravityManeuver: dynamic.gravityManeuver, teleportVisual: dynamic.teleportVisual };
    });
    const weaponFacts = bindings.map((binding): RustPresentationWeaponFact => {
      const slot = slotOf(spec, binding.sourceSlotId), dynamic = mounts.get(key + '/' + binding.componentId);
      const range = ranges.get(source.id+'/'+binding.componentId+'/'+binding.sourceSlotId);
      if (!dynamic || !range) throw Error('Missing Rust live mount observation'); usedMounts++;
      return { componentId: binding.componentId, weaponKey: binding.weaponKey, slotId: binding.sourceSlotId, relativePos: [slot.x, slot.y], mountType: slot.mountType,
        arcDeg: slot.arcDeg, baseAngleDeg: slot.baseAngleDeg, range: range.range, presentationRelativeAngle: dynamic.presentationRelativeAngle,
        gravityTractor: dynamic.gravityTractor, gravityDeflection: dynamic.gravityDeflection };
    });
    return { id: source.id, handle: source.handle, stableId: source.stableId, specKey, team: source.team, reserveInitial: undefined,
      parent: source.parent, sourceCarrier: source.sourceCarrier, previousPosition: source.previousPosition, previousFacing: source.previousFacing,
      playerTargetId: source.playerTarget ? stable(source.playerTarget) : null, visibilityMask: source.visibilityMask, visibilityOverflow: source.visibilityOverflow,
      isPhased: source.isPhased, shipName: source.shipName, flightDeckWingId: source.flightDeckWingId, isSystemDrone: source.isSystemDrone, sightRadius: source.sightRadius,
      isFiringMain: source.isFiringMain, fighterRecall: source.fighterRecall, combatWeaponRepairTimeMultiplier: source.combatWeaponRepairTimeMultiplier,
      flameoutRatio: source.flameoutRatio, significantEnemiesInRange: source.significantEnemiesInRange, phaseVisualAlpha: source.phaseVisualAlpha,
      phaseGhosts: visual.phaseGhosts, engineBoostLevel: visual.engineBoostLevel, previousEngineBoostLevel: visual.previousEngineBoostLevel,
      surfaceFeedback: visual.surfaceFeedback, shieldHitSegmentLevels: visual.shieldHitSegmentLevels, teleportCameraOffset: pose.teleportCameraOffset,
      presentationPose: pose.presentationPose, primarySystemId: source.primarySystemId, tacticalSystemIds: ids.map((_, i) => i + 1), defenseSystemId: source.defenseSystemId,
      systems: facts, mounts: weaponFacts };
  });
  if (usedSystems !== live.systems.length || usedMounts !== live.mounts.length || poses.size !== ships.length || visuals.size !== ships.length
    || scene.mounts.length !== usedMounts || bodies.size !== ships.length) throw Error('Rust fact membership differs');
  const orders = new Map<string, TacticalOrder>();
  for (const entry of scene.orders) {
    const unit = entry.unit === 'fleet' ? 'fleet' : stable(entry.unit); if (orders.has(unit)) throw Error('Duplicate Rust tactical assignment');
    orders.set(unit, { ...entry.order, targetShipId: entry.target ? stable(entry.target) : undefined });
  }
  const playerTeam = read(scene.player).team, enemyTeam = read(scene.enemy).team;
  const rows = scene.deployment.filter(r => r.handle.slot !== scene.enemy.slot || r.handle.generation !== scene.enemy.generation || scene.primaryEnemyDeployed)
    .map(r => ({ id: stable(r.handle), teamId: r.teamId, cost: r.cost, status: r.status }));
  const used = (team: number) => rows.filter(r => r.teamId === team && (r.status === 'deployed' || r.status === 'retreating')).reduce((sum, r) => sum + r.cost, 0);
  const wings = (side: number) => scene.wings.filter(w => w.side === side).map(w => ({ specId: w.specId, carrierId: stable(w.carrier), wingId: w.wingId, name: w.name, maxCrafts: w.maxCrafts, crr: w.crr }));
  const worldId = (id: number, generation: number) => { const s = scene.ships.find(s => s.id === id && s.handle.generation === generation); if (!s) throw Error('Unknown Rust loss identity'); return s.stableId; };
  return { version: 1, epoch, revision, tick: snapshot.tick, playerId: stable(scene.player), enemyId: stable(scene.enemy), manualWeaponId: stable(scene.manualWeapon), targetId: scene.target ? stable(scene.target) : null,
    rosters: { ships: scene.rosters.ships.map(stable), capitalShips: scene.rosters.capitalShips.map(stable), allCapitalShips: scene.rosters.allCapitalShips.map(stable),
      fighters: scene.rosters.fighters.map(stable), bombers: scene.rosters.bombers.map(stable) }, ships, playerWings: wings(0), enemyWings: wings(1),
    deployment: { available: true, enabled: scene.enabled, limit: scene.limit, rows: scene.enabled || scene.simulation ? rows : [], simulation: scene.simulation,
      simulationLimit: scene.simulationLimit, allyUsed: scene.simulation ? scene.simulationUsed[0] : used(playerTeam), enemyUsed: scene.simulation ? scene.simulationUsed[1] : used(enemyTeam) },
    tactical: { available: true, commandPoints: scene.commandPoints, selectedUnitId: scene.selection === null ? null : scene.selection === 'fleet' ? 'fleet' : stable(scene.selection), isTacticalMap: scene.map, orders },
    openBattlefield: scene.open, multiTeamBattle: scene.multiTeam, battleResult: scene.result, isBattleResultReady: scene.resultReady, notificationTime: scene.notificationTime,
    shipLossNotifications: snapshot.world.losses.map(loss => ({ id: worldId(loss.identity.id, loss.identity.generation), shipName: loss.shipName, hullName: loss.hullName,
      teamId: loss.team, time: loss.time, status: 'destroyed' })), environment: RUST_DEFAULT_COMBAT_ENVIRONMENT, cameraShakeIntensity: scene.visual.cameraShakeIntensity,
    asteroidSprites: RUST_ASTEROID_SPRITES, sceneTexts: scene.texts, radio: scene.radio,
    visuals: { ...scene.visual.visuals, ...live.layers }, ordnance: live.ordnance, audio: live.audio };
}
function slotOf(spec: ShipSpec, id: string) {
  const slot = [...spec.weaponSlots, ...(spec.systemWeaponSlots ?? [])].find(slot => slot.slotId === id);
  if (!slot) throw Error('Unknown compiled mount art slot: ' + id); return slot;
}
