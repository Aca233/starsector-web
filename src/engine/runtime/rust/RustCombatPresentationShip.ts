import { Vector2 } from '../../math/Vector2';
import { ProjectedRenderShip, ProjectedRenderSystem, ProjectedRenderWeapon } from '../../render/ProjectedRenderState';
import type { RenderWeapon } from '../../render/ShipRenderState';
import { RenderWeaponDictionary } from '../local/RenderWeaponDictionary';
import { HudContactRecord, type HudShip, type HudContact, type HudSystem } from '../CombatHudView';
import { shieldUnfoldRate, shieldVisualAlpha, shieldRenderArc, phaseEngaged, phaseCooldown, phaseSpeed } from '../../render/ShieldDisplayMath';
import type { RustBodySnapshot } from './RustCoreProtocol';
import { RustShipFlag } from './RustCoreProtocol';
import type { RustPresentationShipFact } from './RustCombatPresentationFacts';
import type { ShipSpec } from '../../content/ShipSpec';
import type { WeaponSpec } from '../../simulation/Weapon';
import { copyRustPresentationData as copy } from './RustCombatPresentationData';

const states = ['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'] as const;
const shieldTypes = ['NONE', 'FRONT', 'OMNI', 'PHASE'] as const;
const firingStates = ['IDLE', 'CHARGING', 'ACTIVE', 'CHARGEDOWN'] as const;
export interface RustPresentationShipRecords {
  render: ProjectedRenderShip; contact: HudContact; hud: HudShip; fact: RustPresentationShipFact;
}
const displayParts = new WeakSet<object>();
/** Only projection-created nodes may serve as writable storage. All properties
 * still come from this completed frame, including presence and insertion order. */
function retain<T extends object>(previous:object|undefined,current:T,used:Set<object>):T {
  if (!previous || !displayParts.has(previous) || used.has(previous) || Object.getPrototypeOf(previous)!==Object.getPrototypeOf(current)) {
    displayParts.add(current); used.add(current); return current;
  }
  used.add(previous);
  const keys=Object.keys(current);let index=0,changed=false;
  for(const key in previous) if(Object.hasOwn(previous,key)) {
    if(keys[index++]!==key)changed=true;
  }
  if(changed || index!==keys.length)
    for(const key in previous) if(Object.hasOwn(previous,key)) delete (previous as Record<string,unknown>)[key];
  Object.assign(previous,current);
  if(Array.isArray(current)) (previous as unknown as unknown[]).length=current.length;
  return previous as T;
}
function retainVector(previous:Vector2|undefined,x:number=0,y:number=0,used:Set<object>):Vector2 {
  if(previous && displayParts.has(previous) && !used.has(previous) && Object.getPrototypeOf(previous)===Vector2.prototype) {
    used.add(previous);let index=0,changed=false;
    for(const key in previous) if(Object.hasOwn(previous,key)) {
      if(key!==(index++===0?'x':'y'))changed=true;
    }
    if(changed || index!==2)
      for(const key in previous) if(Object.hasOwn(previous,key)) delete (previous as unknown as Record<string,unknown>)[key];
    previous.x=x;previous.y=y;return previous;
  }
  const current=new Vector2(x,y);displayParts.add(current);used.add(current);return current;
}
function retainCells<T extends Float32Array|Float64Array>(previous:T|undefined,current:T,used:Set<object>):T {
  if(previous && displayParts.has(previous) && !used.has(previous) && previous.constructor===current.constructor && previous.length===current.length){
    used.add(previous);previous.set(current);return previous;
  }
  const out=current.slice() as T;displayParts.add(out);used.add(out);return out;
}
function retainRanges(previous:Map<RenderWeapon,number>|undefined, rows:readonly RenderWeapon[], facts:RustPresentationShipFact['mounts'],used:Set<object>):Map<RenderWeapon,number> {
  const out=previous && displayParts.has(previous) && !used.has(previous) ? previous : new Map<RenderWeapon,number>();
  displayParts.add(out);used.add(out);out.clear();for(let i=0;i<rows.length;i++)out.set(rows[i],facts[i].range);return out;
}
export function rustPresentationShip(body: RustBodySnapshot, fact: RustPresentationShipFact, spec: ShipSpec,
  weapon: (key: string) => WeaponSpec, dictionary: RenderWeaponDictionary, previous?: RustPresentationShipRecords, borrowCompletedFact=false): RustPresentationShipRecords {
  if(!borrowCompletedFact) fact=copy(fact);
  const used=new Set<object>();
  const vector=(prior:Vector2|undefined,x:number,y:number)=>retainVector(prior,x,y,used);
  const s = body.ship;
  if (!s?.shield || !s.armor || !s.engines || !s.weapons || !s.readiness) throw Error('Incomplete Rust display ship domains: ' + fact.stableId);
  if (s.flux.length !== 19 || body.motion.length !== 22 || s.shield.length !== 64 || s.systems.length !== fact.systems.length || s.weapons.mounts.length !== fact.mounts.length)
    throw Error('Rust display ship width/binding differs: ' + fact.stableId);
  const a = s.armor.values, q = s.shield, f = s.flux, m = body.motion, wc = s.weapons.values;
  const firstIndex=<T,K>(rows:readonly T[],key:(row:T)=>K)=>{const index=new Map<K,T>();for(const row of rows){const k=key(row);if(!index.has(k))index.set(k,row);}return index;};
  const sourceSystems=firstIndex(s.systems,system=>system.id),sourceMounts=firstIndex(s.weapons.mounts,mount=>mount[0]);
  const sourceComponents=firstIndex(s.components,component=>component.id),factMounts=firstIndex(fact.mounts,mount=>mount.componentId);
  const previousMounts=previous&&firstIndex(previous.render.weapons,mount=>mount.slotId);
  const previousHudMounts=previous&&firstIndex(previous.hud.weapons,mount=>mount.slotId);
  const previousGroups=previous&&firstIndex(previous.render.weaponGroups,group=>group.index);
  const render = previous?.render ?? new ProjectedRenderShip();
  const hud = previous?.hud ?? new HudContactRecord() as HudShip;
  const contact = previous?.contact ?? new HudContactRecord() as HudContact;
  const armor = retain(previous?.hud.armor,{ cols: a[0], rows: a[1], cellWidth: a[2], cellHeight: a[3], minX: a[5], minY: a[6], maxCellArmor: a[7], dirtyVersion: a[12], cells: retainCells(previous?.hud.armor.cells,s.armor.cells,used) },used);
  const scars = retain(previous?.render.scorchMarks,s.armor.scars.map((r,i) => {
    const old=previous?.render.scorchMarks[i];
    return retain(old,{ cellIndex: r[0], localPos: vector(old?.localPos,r[1],r[2]), opacity: r[3], intensity: r[4], heat: r[5], justHit: r[6] === 1,
    flash: r[7], flashElapsed: r[8], phase: r[9], pulsePeriod: r[10], size: r[11], rotationRad: r[12], kind: (['cracks', 'burns', 'holes'] as const)[r[13]], variant: r[14] as 0 | 1 },used);
  }),used);
  const type = shieldTypes[q[0]], phaseState = states[q[14]];
  if (!type || !phaseState) throw Error('Invalid Rust shield display state');
  const active = q[6] === 1, alpha = shieldVisualAlpha(active, q[10], q[1], q[7], shieldUnfoldRate(type, q[2], q[12]));
  const v = q.slice(44, 63);
  const voidShield = q[39] === 1 ? retain(previous?.render.shield.voidShield,{ layers: v[0], integrityPerLayer: v[1], rechargePerSecond: v[2], hitDelay: v[3], restartDelay: v[4],
    integrity: v[5], rebuild: v[6], quietRemaining: v[7], restartRemaining: v[8], armed: v[9] === 1, suppressed: v[10] === 1, breaks: v[11],
    visualHitRemaining: v[12], visualHitAngle: v[13], visualHitStrength: v[14], visualBreakRemaining: v[15], visualRestartRemaining: v[16], visualShutdownRemaining: v[17], visualCollapse: v[18] === 1 },used) : undefined;
  const shield = retain(previous?.render.shield,{ type, voidShield, facingAngleRad: q[8], hitSegmentLevels: fact.shieldHitSegmentLevels,
    isPhaseEngaged: type === 'PHASE' && phaseEngaged(phaseState), isVisuallyDeployed: type !== 'NONE' && type !== 'PHASE' && q[7] > .01 && alpha > 0,
    phaseCooldownLevel: phaseCooldown(phaseState, q[19], q[23]), phaseEffectLevel: q[15], phaseState, radius: q[2], renderArcRad: shieldRenderArc(q[1], q[7]), visualAlpha: alpha,
    isActive: active, isRaiseRequested: voidShield?.armed ?? (active || q[11] === 1) },used);
  const flux = retain(previous?.render.flux,{ fluxPercent: Math.min(1, (f[8] + f[9]) / f[0]), totalFlux: f[8] + f[9], hardFlux: f[9], hullSize: spec.hullSize,
    isOverloaded: f[11] === 1, isVenting: f[14] === 1, maxFlux: f[0], overloadTimer: f[12], isEngineBoostActive: f[18] === 1 },used);
  const allSystems = retain(previous?.render.allSystems,fact.systems.map(factSystem => {
    const source = sourceSystems.get(factSystem.systemId); if (!source) throw Error('Missing Rust system display binding');
    const r = source.values, state = states[r[2]]; if (!state) throw Error('Invalid Rust lifecycle display state');
    const prior = previous?.render.allSystems.find((_, i) => previous.fact.systems[i]?.systemId === factSystem.systemId);
    return Object.assign(prior ?? new ProjectedRenderSystem(), { gravityPush: factSystem.gravityPush, gravityPolarity: factSystem.gravityPolarity,
      gravityControlHeld: factSystem.gravityControlHeld, activationSerial: r[9], available: factSystem.definition.available, disabled: r[16] === 1,
      effectLevel: r[3], fortressVisualLevel: factSystem.fortressVisualLevel, isActive: factSystem.isActive, state,
      teleportVisual: factSystem.teleportVisual, gravityField: factSystem.gravityField, gravityManeuver: factSystem.gravityManeuver,
      type: factSystem.definition.type, definition: retain(prior?.definition,{ visuals: factSystem.definition.visuals },used), pulseOffset: factSystem.pulseOffset });
  }),used);
  const systems = retain(previous?.hud.allSystems,fact.systems.map(factSystem => {
    const r = s.systems.find(system => system.id === factSystem.systemId)!.values, definition = factSystem.definition;
    const prior=previous?.hud.allSystems.find((_,i)=>previous.fact.systems[i]?.systemId===factSystem.systemId);
    return retain(prior,{ gravityField: factSystem.gravityField, activeTimer: r[6], gravityPush: factSystem.gravityPush, gravityPolarity: factSystem.gravityPolarity,
      gravityControlHeld: factSystem.gravityControlHeld, name: definition.name, type: definition.type, description: definition.description,
      state: states[r[2]], available: definition.available, disabled: r[16] === 1, isActive: factSystem.isActive, isCoolingDown: r[5] === 1,
      cooldownTimer: r[7], activationFailureReason: factSystem.activationFailureReason, charges: r[8], maxCharges: definition.maxCharges,
      statusText: factSystem.statusText, passiveStatusText: factSystem.passiveStatusText,
      definition: retain(prior?.definition,{ gravityField: definition.gravityField, gravityCollapse: definition.gravityCollapse, charges: definition.charges, audio: definition.audio },used) } satisfies HudSystem,used);
  }),used);
  const systemIndex = (id: number) => { const i = fact.systems.findIndex(system => system.systemId === id); if (i < 0) throw Error('Unknown Rust selected system'); return i; };
  const hudWeapons = retain(previous?.hud.weapons,fact.mounts.map(mountFact => {
    const r = sourceMounts.get(mountFact.componentId), c = sourceComponents.get(mountFact.componentId)?.values;
    if (!r || !c) throw Error('Missing Rust weapon/component display binding');
    const firingState = firingStates[r[23]]; if (!firingState) throw Error('Invalid Rust mount display state');
    const spec = weapon(mountFact.weaponKey);
    const prior=previousHudMounts?.get(mountFact.slotId);
    return retain(prior,{ slotId: mountFact.slotId, isDisabled: c[7] === 1, ammo: r[17], firingState, cooldownTimer: r[16], disabledTimer: c[10], isPermanentlyDisabled: c[8] === 1,
      gravityTractor: mountFact.gravityTractor, spec: retain(prior?.spec,{ id: spec.id, nameKey: spec.nameKey, maxAmmo: spec.maxAmmo, type: spec.type, soundLoopKey: spec.soundLoopKey,
        turretSpriteUrl: spec.turretSpriteUrl, hardpointSpriteUrl: spec.hardpointSpriteUrl, displayIconUrl: spec.displayIconUrl, mountSize: spec.mountSize, gravityTractor: spec.gravityTractor },used) },used);
  }),used);
  const weapons = retain(previous?.render.weapons,fact.mounts.map((mountFact, i) => {
    const r = sourceMounts.get(mountFact.componentId)!;
    const prior = previousMounts?.get(mountFact.slotId);
    return Object.assign(prior ?? new ProjectedRenderWeapon(), { arcDeg: mountFact.arcDeg, baseAngleDeg: mountFact.baseAngleDeg, currentAngleRad: r[15], currentSpreadDeg: r[31],
      glowAlpha: r[29], isDisabled: hudWeapons[i].isDisabled, loadedMissileLevels: r[32] === 1 ? retain(prior?.loadedMissileLevels,[r[33], r[34]] as const,used) : undefined,
      mountType: mountFact.mountType, recoil: r[28], relativePos: vector(prior?.relativePos,...mountFact.relativePos), slotId: mountFact.slotId,
      spec: dictionary.project(weapon(mountFact.weaponKey)), gravityTractor: mountFact.gravityTractor, gravityDeflection: mountFact.gravityDeflection,
      presentationRelativeAngle: mountFact.presentationRelativeAngle });
  }),used);
  const groups = retain(previous?.render.weaponGroups,s.weapons.groups.map(group => {
    const prior=previousGroups?.get(group.values[0]);return retain(prior,{ index: group.values[0], mode: group.values[1] === 1 ? 'ALTERNATING' as const : 'LINKED' as const,
    isAutofire: group.values[2] === 1, alternatingIndex: group.values[3], alternatingElapsed: group.values[4] === 1 ? group.values[5] : undefined,
    alternatingWasFiring: group.values[6] === 1 ? group.values[7] === 1 : undefined, alternatingJustSwitched: group.values[8] === 1 ? group.values[9] === 1 : undefined,
    weaponSlotIds: retain(prior?.weaponSlotIds,Array.from(group.members, id => { const mount = factMounts.get(id);
      if (!mount) throw Error('Unknown Rust group component'); return mount.slotId; }),used) },used);
  }),used);
  const common = { id: fact.stableId, spec, pos: vector(previous?.render.pos,m[0],m[1]), prevPos: vector(previous?.render.prevPos,...fact.previousPosition), vel: vector(previous?.render.vel,m[2],m[3]),
    facingRad: m[4], prevFacingRad: fact.previousFacing, teamId: fact.team, playerTargetId: fact.playerTargetId, hullHp: a[14], maxHullHp: a[13],
    currentCR: s.readiness.values[0], isDead: !!(s.flags & RustShipFlag.Dead), isDocked: !!(s.flags & RustShipFlag.Docked), isRetreated: !!(s.flags & RustShipFlag.Retreated),
    isPhased: fact.isPhased, retreating: !!(s.flags & RustShipFlag.Retreating), visibilityMask: fact.visibilityMask, visibilityOverflow: fact.visibilityOverflow, flightDeckWingId: fact.flightDeckWingId, flux };
  Object.assign(contact, common);
  const renderCommon = { ...common }; delete (renderCommon as Partial<typeof common>).currentCR; delete (renderCommon as Partial<typeof common>).isPhased;
  delete (renderCommon as Partial<typeof common>).retreating; delete (renderCommon as Partial<typeof common>).flightDeckWingId;
  Object.assign(render, renderCommon, { angularVelRad: m[5], isAttachedModule: fact.parent !== undefined, phaseGhosts: fact.phaseGhosts, phaseVisualAlpha: fact.phaseVisualAlpha,
    engineBoostLevel: fact.engineBoostLevel, prevEngineBoostLevel: fact.previousEngineBoostLevel, scorchMarks: scars, scorchMarkVersion: a[19], selectedGroupIndex: wc[22],
    fireControlMode: wc[3] === 1 ? 'MANUAL' : 'AI', surfaceFeedback: fact.surfaceFeedback, shield, armor: retain(previous?.render.armor,{ cellWidth: armor.cellWidth },used),
    engineController: retain(previous?.render.engineController,{ flameAccelerating: s.engines.values[9] === 1 },used), engineStatuses: retain(previous?.render.engineStatuses,s.engines.engines.map((r,i) => retain(previous?.render.engineStatuses[i],{ currentThrust: r[23], prevThrust: r[24], spread: r[25], prevSpread: r[26] },used)),used),
    weapons, weaponGroups: groups, system: allSystems[systemIndex(fact.primarySystemId)], allSystems,
    weaponRanges: retainRanges(previous?.render.weaponRanges,weapons,fact.mounts,used),
    presentationPose: fact.presentationPose ? retain(previous?.render.presentationPose,{ pos: vector(previous?.render.presentationPose?.pos,...fact.presentationPose.position), facing: fact.presentationPose.facing },used) : undefined });
  const ventRate = f[1] * f[6] * 2 * f[3];
  Object.assign(hud, common, { fireControlMode: render.fireControlMode, isFiringMain: fact.isFiringMain, throttle: m[9], brakeInput: m[8] === 1, strafeInput: m[10], turnInput: m[7],
    shipName: fact.shipName, selectedGroupIndex: wc[22], weaponGroups: groups, peakPerformanceRemaining: s.readiness.values[2],
    combatWeaponRepairTimeMultiplier: fact.combatWeaponRepairTimeMultiplier, fighterRecall: fact.fighterRecall, teleportCameraOffset: fact.teleportCameraOffset,
    scorchMarks: scars, scorchMarkVersion: a[19], hullPortrait: [], armor, shield: retain(previous?.hud.shield,{ type, isActive: active, isPhaseEngaged: shield.isPhaseEngaged, isRaiseRequested: shield.isRaiseRequested, voidShield },used),
    systems: retain(previous?.hud.systems,fact.tacticalSystemIds.map(id => systems[systemIndex(id)]),used), allSystems: systems, system: systems[systemIndex(fact.primarySystemId)],
    defenseSystem: fact.defenseSystemId === undefined ? undefined : systems[systemIndex(fact.defenseSystemId)], weapons: hudWeapons,
    phaseSpeedMultiplier: phaseSpeed(shield.isPhaseEngaged, f[0] > 0 ? f[9] / f[0] : 0, q[16], q[15]), significantEnemiesInRange: fact.significantEnemiesInRange,
    flameoutRatio: fact.flameoutRatio, timeToVent: ventRate > 0 ? flux.totalFlux / ventRate : 0 });
  return { render, contact, hud, fact: borrowCompletedFact?fact:copy(fact) };
}
