import { cursorGravityOwnsAim, gravityPolarity } from './GravityControlInput';
import { Vector2 } from '../../math/Vector2';
import { signedAngle } from '../../math/Angles';
import { isPointInPolygon, segmentCircleEntry } from '../../math/Geometry';
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
import { knownProjectionKeys } from '../../runtime/local/ProjectionArrays';

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

export function tupleBoundsArea(bounds: readonly [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < bounds.length; i++) {
    const a = bounds[i], b = bounds[(i + 1) % bounds.length];
    sum += a[0] * b[1] - a[1] * b[0];
  }
  return sum / 2;
}
export function shipGravityBody(ship: Ship, world: GravityWorld): GravityBody | undefined {
  if (!liveGravityShip(ship)) return;
  const root = ship.assemblyRoot;
  if (!liveGravityShip(root)) return;
  const members = world.ships.filter(s => s.assemblyRoot === root && liveGravityShip(s));
  return { target: { kind: 'SHIP', id: root.id }, pos: root.pos, vel: root.vel,
    radius: Math.max(root.spec.collisionRadius, ...members.map(s => root.pos.distanceTo(s.pos) + s.spec.collisionRadius)),
    mass: members.reduce((n, s) => n + Math.max(1, s.spec.mass), 0) || root.spec.mass,
    fixed: root.spec.sourceHullTraits?.includes('GRAVITY_FIXED') ?? false, ship: root };
}
export function projectileGravityBody(p: Projectile): GravityBody | undefined {
  if (!gravityProjectileSupported(p) || p.rangeRemaining <= 0 || (p.fadeProgress ?? 0) > 0) return;
  return { target: { kind: 'PROJECTILE', id: p.id }, pos: p.pos, vel: p.vel, radius: p.radius, mass: projectileGravityMass(p), fixed: false, projectile: p };
}
export function asteroidGravityBody(a: Asteroid): GravityBody | undefined {
  if (!(a.hp > 0)) return;
  return { target: { kind: 'ASTEROID', id: a.id }, pos: a.pos, vel: a.vel, radius: a.radius, mass: a.mass, fixed: !!a.gravityFixed, asteroid: a };
}
export function hulkGravityBody(h: HulkFragment): GravityBody {
  return { target: { kind: 'HULK', id: h.id }, pos: h.pos, vel: h.vel, radius: h.collisionRadius,
    mass: Math.max(50, h.sourceShip.spec.mass * Math.abs(polygonArea(h.bounds)) / Math.max(1, Math.abs(tupleBoundsArea(h.sourceShip.spec.bounds)))),
    fixed: !!h.gravityFixed, hulk: h };
}
export function resolveGravityBody(target: GravityTarget, world: GravityWorld): GravityBody | undefined {
  if (target.kind === 'SHIP') {
    const ship = world.ships.find(s => s.id === target.id);
    return ship ? shipGravityBody(ship, world) : undefined;
  }
  if (target.kind === 'PROJECTILE') {
    const p = world.projectiles?.find(p => p.id === target.id);
    return p ? projectileGravityBody(p) : undefined;
  }
  if (target.kind === 'ASTEROID') {
    const a = world.asteroids?.find(a => a.id === target.id && a.hp > 0);
    return a ? asteroidGravityBody(a) : undefined;
  }
  const h = world.hulkFragments?.find(h => h.id === target.id);
  if (h) return hulkGravityBody(h);
}
function hulkHit(h: HulkFragment, start: Vector2, end: Vector2): number | null {
  if (
    start.distanceTo(h.pos) > h.collisionRadius &&
    segmentCircleEntry(start, end, h.pos, h.collisionRadius) === null
  ) {
    return null;
  }
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
/** Rechecked by the authority force pass: restored IDs are not self-tow permission. */
export function gravitySelfTowAllowed(owner: Ship, mount: WeaponMount, body: GravityBody): boolean {
  return mount.spec.gravityTractor?.selfTow === true && owner.fireControlMode === 'MANUAL'
    && owner.assemblyRoot === owner && !owner.spec.isModuleHull && owner.spec.bounds.length >= 3
    && body.ship === owner && !body.fixed;
}
function available(owner: Ship, mount: WeaponMount, body: GravityBody, world: GravityWorld): boolean {
  // An internal self coupling is not a shot through the weapon's outward firing arc.
  if (body.ship === owner.assemblyRoot) return gravitySelfTowAllowed(owner, mount, body);
  const muzzle = weaponMuzzle(owner, mount), angle = body.pos.clone().sub(muzzle).heading();
  const hit = contactEntry(body, muzzle, body.pos);
  return hit !== null && muzzle.distanceTo(Vector2.lerp(muzzle, body.pos, hit)) <= combatWeaponRange(owner, mount.spec)
    && Math.abs(signedAngle(angle - owner.facingRad - mount.baseAngleDeg * Math.PI / 180)) <= mount.arcDeg * Math.PI / 360 + 1e-6
    && ((mount.mountType==='HARDPOINT' && !!mount.spec.gravityTractor?.tidalDamagePerSecond) || Math.abs(signedAngle(angle - mount.currentAngleRad)) <= .14 + Math.asin(Math.min(1, body.radius / Math.max(1, muzzle.distanceTo(body.pos)))))
    && gravityLineClear(owner, body, muzzle, world);
}
/** Distance to the visible body's real outline, never a large empty bounding circle. */
export function gravityPointerDistance(body: GravityBody, point: Vector2, world: GravityWorld): number {
  if (body.ship) {
    let best = Infinity;
    for (const ship of world.ships) {
      if (ship.assemblyRoot !== body.ship || !liveGravityShip(ship)) continue;
      const local = point.clone().sub(ship.pos).rotate(-ship.facingRad), bounds = ship.spec.bounds;
      if (bounds.length < 3) { best = Math.min(best,Math.max(0,local.length()-ship.spec.collisionRadius)); continue; }
      if (isPointInPolygon(local,bounds)) return 0;
      for (let i=0,j=bounds.length-1;i<bounds.length;j=i++) {
        const [ax,ay]=bounds[j],[bx,by]=bounds[i],dx=bx-ax,dy=by-ay;
        const t=Math.max(0,Math.min(1,((local.x-ax)*dx+(local.y-ay)*dy)/(dx*dx+dy*dy||1)));
        best=Math.min(best,Math.hypot(local.x-ax-t*dx,local.y-ay-t*dy));
      }
    }
    return best;
  }
  if (body.hulk) {
    const local=point.clone().sub(body.hulk.pos).rotate(-body.hulk.facingRad).add(body.hulk.localOffset),bounds=body.hulk.bounds;
    if (pointInHull(local,bounds)) return 0;
    let best=Infinity;
    for (let i=0,j=bounds.length-1;i<bounds.length;j=i++) {
      const a=bounds[j],b=bounds[i],dx=b.x-a.x,dy=b.y-a.y;
      const t=Math.max(0,Math.min(1,((local.x-a.x)*dx+(local.y-a.y)*dy)/(dx*dx+dy*dy||1)));
      best=Math.min(best,Math.hypot(local.x-a.x-t*dx,local.y-a.y-t*dy));
    }
    return best;
  }
  return Math.max(0,point.distanceTo(body.pos)-body.radius);
}
function candidates(owner: Ship, mount: WeaponMount, point: Vector2, world: GravityWorld, ai: boolean): GravityBody[] {
  const rows: { body: GravityBody; score: number }[] = [];
  const addBody = (body: GravityBody | undefined, tolerance: number) => {
    if (!body) return;
    const self = body.ship === owner.assemblyRoot;
    if (self && (ai || !gravitySelfTowAllowed(owner,mount,body)
      || !isPointInPolygon(point.clone().sub(owner.pos).rotate(-owner.facingRad),owner.spec.bounds))) return;
    if (ai && (!body.ship || sameTeam(owner, body.ship))) return;
    const d = point.distanceTo(body.pos);
    if (!self && d > body.radius + tolerance) return;
    // Self requires the root's actual interior, with no forgiving external padding.
    const edge=self?0:gravityPointerDistance(body,point,world);
    if (edge > tolerance) return;
    rows.push({ body, score: edge===0 ? (body.projectile ? -500 : -1000) + d / Math.max(1, body.radius) : edge });
  };
  for (const s of world.ships) if (s.assemblyRoot === s) addBody(shipGravityBody(s, world), ai?12:50);
  if (!ai) {
    for (const a of world.asteroids ?? []) if (a.hp > 0 && point.distanceTo(a.pos) <= a.radius + 28) addBody(asteroidGravityBody(a), 28);
    for (const h of world.hulkFragments ?? []) if (point.distanceTo(h.pos) <= h.collisionRadius + 28) addBody(hulkGravityBody(h), 28);
    for (const p of world.projectiles ?? []) if (point.distanceTo(p.pos) <= p.radius + 52) addBody(projectileGravityBody(p), 52);
  }
  return rows.sort((a,b) => a.score-b.score || `${a.body.target.kind}:${a.body.target.id}`.localeCompare(`${b.body.target.kind}:${b.body.target.id}`)).map(r=>r.body);
}
/** Directional push has no outward weapon arc, but retains real contact/range/LOS. */
export function gravityPushLineValid(owner: Ship, body: GravityBody, range: number, world: GravityWorld): boolean {
  const hit=contactEntry(body,owner.pos,body.pos);
  return !body.fixed && hit!==null && owner.pos.distanceTo(Vector2.lerp(owner.pos,body.pos,hit))<=range && gravityLineClear(owner,body,owner.pos,world);
}
export function pickGravityPushBody(owner: Ship, mount: WeaponMount, point: Vector2, range: number, world: GravityWorld, excluded: readonly GravityTarget[] = []): GravityBody | undefined {
  return candidates(owner,mount,point,world,false).find(body=>!excluded.some(target=>sameGravityTarget(target,body.target)) && body.ship!==owner.assemblyRoot
    && !(body.ship&&sameTeam(owner,body.ship)) && !(body.projectile&&sameTeam(owner,body.projectile))
    && gravityPushLineValid(owner,body,range,world));
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
  knownProjectionKeys.delete(p);
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
  const fieldOwnsAim = !ai && cursorGravityOwnsAim(owner);
  state.polarity = gravityPolarity(owner);
  const point = fieldOwnsAim ? new Vector2(state.anchorX,state.anchorY) : ai && owner.currentTargetShip ? owner.currentTargetShip.pos : owner.aimTargetWorld;
  if (state.phase === 'HOLD') {
    const body = state.target && resolveGravityBody(state.target, world);
    if (!body || !available(owner,mount,body,world) || state.age >= spec.holdTime) {
      const reason = state.age >= spec.holdTime ? '保持到期' : !body ? '目标失效'
        : weaponMuzzle(owner,mount).distanceTo(body.pos)-body.radius > combatWeaponRange(owner,mount.spec) ? '目标超出射程'
        : !gravityLineClear(owner,body,weaponMuzzle(owner,mount),world) ? '连接被遮挡' : '目标超出射界';
      releaseGravityTractor(mount,reason+' · 松键后重抓'); return;
    }
    const anchor = new Vector2(state.anchorX,state.anchorY), toward = point.clone().sub(anchor);
    const distance = toward.length(); if (distance > 0) anchor.addScaled(toward, Math.min(1,spec.anchorSpeed*dt/distance));
    const muzzle = weaponMuzzle(owner,mount), fromMuzzle = anchor.clone().sub(muzzle);
    const range = combatWeaponRange(owner, mount.spec);
    if (fromMuzzle.length() > range) anchor.copy(muzzle).add(fromMuzzle.normalize().scale(range));
    state.anchorX=anchor.x; state.anchorY=anchor.y; state.contactX=body.pos.x; state.contactY=body.pos.y; state.targetRadius=body.radius;
    state.age += dt; mount.glowAlpha=.7; mount.triggerHeld=true;
    return;
  }
  if (fieldOwnsAim) { state.status = '区域操纵中 · 松F后捕获'; return; }
  // Initial selection is sticky during acquisition: moving the cursor can begin a drag,
  // but cannot reset the short capture clock or silently substitute a nearby body.
  const latched=state.phase==='CAPTURE' && state.target ? resolveGravityBody(state.target,world) : undefined;
  if (state.phase==='CAPTURE' && (!latched || !available(owner,mount,latched,world))) {
    releaseGravityTractor(mount,'捕获中断 · 松键后重抓'); return;
  }
  const selected = latched ?? candidates(owner, mount, point, world, ai).find(body=>available(owner,mount,body,world));
  if (!selected) { state.phase='IDLE';state.target=undefined;state.capture=0;state.status='对准实体捕获';mount.glowAlpha=0;return; }
  if (!sameGravityTarget(state.target,selected.target)) {state.target=selected.target;state.capture=0;}
  state.phase='CAPTURE'; state.capture+=dt; state.contactX=selected.pos.x;state.contactY=selected.pos.y;state.targetRadius=selected.radius;
  const required = selected.projectile ? spec.projectileCaptureTime : spec.captureTime;
  mount.glowAlpha=.35*Math.min(1,state.capture/required);
  const kind=selected.projectile?'弹体':selected.ship?(selected.ship===owner.assemblyRoot?'本舰':sameTeam(owner,selected.ship)?'友舰':'敌舰'):selected.hulk?'残骸':selected.fixed?'固定锚':'岩石';
  state.status=`${kind} · 捕获中 ${Math.min(100,Math.floor(state.capture/required*100))}%`;
  if (state.capture < required) return;
  // Reservation precedes ownership/connection changes; cannot cause overload.
  if (owner.flux.totalFlux + 60 > owner.flux.maxFlux) {releaseGravityTractor(mount,'幅能不足');return;}
  owner.flux.increaseFlux(60,false);
  if (selected.projectile) captureProjectile(selected.projectile,owner);
  if (selected.hulk) selected.hulk.gravityManaged=true;
  state.phase='HOLD';state.age=0;state.damageClock=0;state.anchorX=selected.pos.x;state.anchorY=selected.pos.y;
  state.status='已抓住 · '+(selected.ship===owner.assemblyRoot?'本舰牵引':selected.fixed?'固定锚 · 反牵本舰':selected.target.kind==='SHIP'?(sameTeam(owner,selected.ship!)?'友舰牵引':'敌舰牵引'):selected.projectile?'弹体已接管':'实体牵引');
  mount.triggerHeld=true;
}
