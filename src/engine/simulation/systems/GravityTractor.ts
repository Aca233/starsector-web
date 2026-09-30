import { Vector2 } from '../../math/Vector2';
import { signedAngle } from '../../math/Angles';
import { segmentCircleEntry } from '../../math/Geometry';
import { weaponMuzzle, shipSegmentEntry } from '../../ai/FireControlGeometry';
import { pointInHull, segmentHullHit, polygonArea } from '../../visual/HulkGeometry';
import type { FireControlWorld } from '../../ai/AutofireController';
import type { Ship } from '../Ship';
import type { Projectile, WeaponMount } from '../Weapon';
import type { Asteroid, HulkFragment } from '../CombatTypes';
import type { GravityTarget, GravityTractorState } from '../GravityTractorState';
import { bindProjectileSource } from './weapon/OutgoingDamage';
import { sameTeam } from '../CombatTeams';
import { combatWeaponRange } from '../WeaponRange';

export interface GravityWorld {
  ships: readonly Ship[];
  projectiles?: readonly Projectile[];
  asteroids?: readonly Asteroid[];
  hulkFragments?: readonly HulkFragment[];
}
export interface GravityBody {
  target: GravityTarget;
  pos: Vector2;
  vel: Vector2;
  radius: number;
  mass: number;
  fixed: boolean;
  ship?: Ship;
  projectile?: Projectile;
  asteroid?: Asteroid;
  hulk?: HulkFragment;
}
export const liveGravityShip = (s: Ship) => !s.isDead && s.hullHp > 0 && !s.isRetreated && !s.isDocked && !s.isPhased;
export const gravityProjectileSupported = (p: Projectile) => !p.didDamage && !p.collisionDisabled && !p.isMine && !p.isFlare && !p.isHullExplosion
  && p.spawnType !== 'BALLISTIC_AS_BEAM' && (p.isRocket || p.spawnType === 'BALLISTIC' || p.spawnType === 'PLASMA');
export const projectileGravityMass = (p: Projectile) => Math.max(.4, p.radius * p.radius + (p.baseDamage ?? p.damage) / 180);
export const sameGravityTarget = (a?: GravityTarget, b?: GravityTarget) => !!a && !!b && a.kind === b.kind && a.id === b.id;

export function resolveGravityBody(target: GravityTarget, world: GravityWorld): GravityBody | undefined {
  if (target.kind === 'SHIP') {
    const ship = world.ships.find(s => s.id === target.id);
    if (!ship || !liveGravityShip(ship)) return;
    const root = ship.assemblyRoot;
    if (!liveGravityShip(root)) return;
    const members = world.ships.filter(s => s.assemblyRoot === root && liveGravityShip(s));
    return { target: { kind: 'SHIP', id: root.id }, pos: root.pos, vel: root.vel,
      radius: Math.max(root.spec.collisionRadius, ...members.map(s => root.pos.distanceTo(s.pos) + s.spec.collisionRadius)),
      mass: members.reduce((n, s) => n + Math.max(1, s.spec.mass), 0) || root.spec.mass,
      fixed: root.spec.sourceHullTraits?.includes('GRAVITY_FIXED') ?? false, ship: root };
  }
  if (target.kind === 'PROJECTILE') {
    const p = world.projectiles?.find(p => p.id === target.id);
    if (!p || !gravityProjectileSupported(p) || p.rangeRemaining <= 0 || (p.fadeProgress ?? 0) > 0) return;
    return { target, pos: p.pos, vel: p.vel, radius: p.radius, mass: projectileGravityMass(p), fixed: false, projectile: p };
  }
  if (target.kind === 'ASTEROID') {
    const a = world.asteroids?.find(a => a.id === target.id && a.hp > 0);
    if (a) return { target, pos: a.pos, vel: a.vel, radius: a.radius, mass: a.mass, fixed: !!a.gravityFixed, asteroid: a };
    return;
  }
  const h = world.hulkFragments?.find(h => h.id === target.id);
  if (h) return { target, pos: h.pos, vel: h.vel, radius: h.collisionRadius,
    mass: Math.max(50, h.sourceShip.spec.mass * Math.abs(polygonArea(h.bounds)) / Math.max(1, Math.abs(polygonArea(h.sourceShip.spec.bounds.map(([x,y]) => new Vector2(x,y)))))),
    fixed: !!h.gravityFixed, hulk: h };
}
function hulkHit(h: HulkFragment, start: Vector2, end: Vector2): number | null {
  return segmentHullHit(start.clone().sub(h.pos).rotate(-h.facingRad).add(h.localOffset),
    end.clone().sub(h.pos).rotate(-h.facingRad).add(h.localOffset), h.bounds);
}
function contactEntry(body: GravityBody, start: Vector2, end: Vector2): number | null {
  return body.ship ? shipSegmentEntry(body.ship, start, end) : body.hulk ? hulkHit(body.hulk, start, end)
    : segmentCircleEntry(start, end, body.pos, body.radius);
}
export function gravityLineClear(owner: Ship, body: GravityBody, muzzle: Vector2, world: GravityWorld): boolean {
  const limit = contactEntry(body, muzzle, body.pos) ?? 1;
  for (const ship of world.ships) {
    if (ship.assemblyRoot === owner.assemblyRoot || ship.assemblyRoot === body.ship?.assemblyRoot || !liveGravityShip(ship)) continue;
    const t = shipSegmentEntry(ship, muzzle, body.pos);
    if (t !== null && t < limit - 1e-5) return false;
  }
  for (const a of world.asteroids ?? []) {
    if (a === body.asteroid || a.hp <= 0) continue;
    const t = segmentCircleEntry(muzzle, body.pos, a.pos, a.radius);
    if (t !== null && t < limit - 1e-5) return false;
  }
  for (const h of world.hulkFragments ?? []) {
    if (h === body.hulk) continue;
    const t = hulkHit(h, muzzle, body.pos);
    if (t !== null && t < limit - 1e-5) return false;
  }
  return true;
}
function available(owner: Ship, mount: WeaponMount, body: GravityBody, world: GravityWorld): boolean {
  const muzzle = weaponMuzzle(owner, mount), angle = body.pos.clone().sub(muzzle).heading();
  const hit = contactEntry(body, muzzle, body.pos);
  return body.ship !== owner.assemblyRoot && hit !== null && muzzle.distanceTo(Vector2.lerp(muzzle, body.pos, hit)) <= combatWeaponRange(owner, mount.spec)
    && Math.abs(signedAngle(angle - owner.facingRad - mount.baseAngleDeg * Math.PI / 180)) <= mount.arcDeg * Math.PI / 360 + 1e-6
    && ((mount.mountType==='HARDPOINT' && !!mount.spec.gravityTractor?.tidalDamagePerSecond) || Math.abs(signedAngle(angle - mount.currentAngleRad)) <= .14 + Math.asin(Math.min(1, body.radius / Math.max(1, muzzle.distanceTo(body.pos)))))
    && gravityLineClear(owner, body, muzzle, world);
}
function candidates(owner: Ship, point: Vector2, world: GravityWorld, ai: boolean): GravityBody[] {
  const rows: { body: GravityBody; score: number }[] = [];
  const add = (target: GravityTarget, tolerance: number) => {
    const body = resolveGravityBody(target, world); if (!body || body.ship === owner.assemblyRoot) return;
    if (ai && (!body.ship || sameTeam(owner, body.ship))) return;
    const d = point.distanceTo(body.pos);
    let inside = d <= body.radius;
    if (body.ship) inside = shipSegmentEntry(body.ship, point, point) !== null;
    if (body.hulk) inside = pointInHull(point.clone().sub(body.hulk.pos).rotate(-body.hulk.facingRad).add(body.hulk.localOffset), body.hulk.bounds);
    if (!inside && d > body.radius + tolerance) return;
    rows.push({ body, score: inside ? (body.projectile ? -500 : -1000) + d / Math.max(1, body.radius) : d - body.radius });
  };
  for (const s of world.ships) if (s.assemblyRoot === s) add({kind:'SHIP',id:s.id}, 12);
  for (const a of world.asteroids ?? []) add({kind:'ASTEROID',id:a.id}, 8);
  for (const h of world.hulkFragments ?? []) add({kind:'HULK',id:h.id}, 8);
  for (const p of world.projectiles ?? []) add({kind:'PROJECTILE',id:p.id}, 36);
  return rows.sort((a,b) => a.score-b.score || `${a.body.target.kind}:${a.body.target.id}`.localeCompare(`${b.body.target.kind}:${b.body.target.id}`)).map(r=>r.body);
}
export function releaseGravityTractor(mount: WeaponMount, reason = '已释放'): GravityTarget | undefined {
  const state = mount.gravityTractor; if (!state) return;
  const target = state.phase === 'HOLD' ? state.target : undefined;
  if (state.phase !== 'IDLE') mount.cooldownTimer = Math.max(mount.cooldownTimer, mount.spec.gravityTractor?.recovery ?? 1);
  state.phase = 'IDLE'; state.target = undefined; state.capture = 0; state.age = 0; state.damageClock = 0; state.waitRelease = true; state.status = reason;
  mount.glowAlpha = 0; mount.triggerHeld = false;
  return target;
}
export function releaseShipGravityTractors(owner: Ship): GravityTarget[] {
  return owner.weapons.filter(m=>!!m.spec.gravityTractor).map(m=>releaseGravityTractor(m, '排斥释放 · 松键后重抓')).filter((t): t is GravityTarget => !!t);
}
function captureProjectile(p: Projectile, owner: Ship): void {
  p.gravityOriginalSourceShipId ??= p.sourceShipId;
  p.sourceShipId = owner.id; p.isPlayer = owner.isPlayer; p.teamId = owner.teamId;
  p.gravityCapturedBy = owner.id; p.gravityCoupling = 'MASS_DRIVER';
  p.isGuided = false; p.inertialFlight = true; p.engineAcceleration = 0; p.maxSpeed = undefined; p.gravityDeflected = true;
  // Clear native locked targets; bind the actual source cache as well as wire fields.
  p.targetShipId = undefined; p.targetProjectileId = undefined;
  bindProjectileSource(p, owner);
}
export function updateGravityTractorInput(dt: number, owner: Ship, mount: WeaponMount, world: FireControlWorld, trigger: boolean): void {
  const spec = mount.spec.gravityTractor!;
  const state: GravityTractorState = mount.gravityTractor ??= {phase:'IDLE',capture:0,age:0,anchorX:0,anchorY:0,contactX:0,contactY:0,waitRelease:false,status:'待捕获'};
  const ai = owner.fireControlMode !== 'MANUAL';
  // A group change or autofire toggle while LMB is down is not a new command edge.
  const rawHeld = ai ? trigger && mount.cooldownTimer <= 0 : owner.isFiringMain;
  if (!rawHeld) state.waitRelease = false;
  if (!trigger || mount.isDisabled || !liveGravityShip(owner) || owner.retreating || owner.flux.isVenting || owner.flux.isOverloaded || (owner.runtimeModifiers.value.disableSystems ?? 0) > 0 || !owner.system.canFireWeapon(mount)) {
    if (state.phase !== 'IDLE') releaseGravityTractor(mount);
    if (!rawHeld) state.waitRelease = false;
    return;
  }
  if (state.waitRelease || mount.cooldownTimer > 0) return;
  const point = ai && owner.currentTargetShip ? owner.currentTargetShip.pos : owner.aimTargetWorld;
  if (state.phase === 'HOLD') {
    const body = state.target && resolveGravityBody(state.target, world);
    if (!body || !available(owner,mount,body,world) || state.age >= spec.holdTime) { releaseGravityTractor(mount,'连接中断 · 松键后重抓'); return; }
    const anchor = new Vector2(state.anchorX,state.anchorY), toward = point.clone().sub(anchor);
    const distance = toward.length(); if (distance > 0) anchor.addScaled(toward, Math.min(1,spec.anchorSpeed*dt/distance));
    const muzzle = weaponMuzzle(owner,mount), fromMuzzle = anchor.clone().sub(muzzle);
    const range = combatWeaponRange(owner, mount.spec);
    if (fromMuzzle.length() > range) anchor.copy(muzzle).add(fromMuzzle.normalize().scale(range));
    state.anchorX=anchor.x; state.anchorY=anchor.y; state.contactX=body.pos.x; state.contactY=body.pos.y;
    state.age += dt; mount.glowAlpha=.7; mount.triggerHeld=true;
    return;
  }
  const latched=state.phase==='CAPTURE' && state.target?.kind==='PROJECTILE' ? resolveGravityBody(state.target,world) : undefined;
  const selected = latched && point.distanceTo(latched.pos)<=latched.radius+90 && available(owner,mount,latched,world)
    ? latched : candidates(owner, point, world, ai).find(body=>available(owner,mount,body,world));
  if (!selected) { state.phase='IDLE';state.target=undefined;state.capture=0;state.status='对准实体捕获';mount.glowAlpha=0;return; }
  if (!sameGravityTarget(state.target,selected.target)) {state.target=selected.target;state.capture=0;}
  state.phase='CAPTURE'; state.capture+=dt; state.contactX=selected.pos.x;state.contactY=selected.pos.y;state.targetRadius=selected.radius;
  const required = selected.projectile ? spec.projectileCaptureTime : spec.captureTime;
  mount.glowAlpha=.35*Math.min(1,state.capture/required);
  const kind=selected.projectile?'弹体':selected.ship?(sameTeam(owner,selected.ship)?'友舰':'敌舰'):selected.hulk?'残骸':selected.fixed?'固定锚':'岩石';
  state.status=`${kind} · 捕获${Math.min(100,Math.floor(state.capture/required*100))}%`;
  if (state.capture < required) return;
  // Reservation precedes ownership/connection changes; cannot cause overload.
  if (owner.flux.totalFlux + 60 > owner.flux.maxFlux) {releaseGravityTractor(mount,'幅能不足');return;}
  owner.flux.increaseFlux(60,false);
  if (selected.projectile) captureProjectile(selected.projectile,owner);
  if (selected.hulk) selected.hulk.gravityManaged=true;
  state.phase='HOLD';state.age=0;state.damageClock=0;state.anchorX=selected.pos.x;state.anchorY=selected.pos.y;
  state.status=selected.fixed?'固定锚 · 反牵本舰':selected.target.kind==='SHIP' && sameTeam(owner,selected.ship!)?'友舰牵引':selected.projectile?'弹体已接管':'实体牵引';
  mount.triggerHeld=true;
}
