import { Vector2 } from '../../math/Vector2';
import type { Ship } from '../Ship';
import type { ShipSystem } from '../ShipSystem';
import type { Projectile } from '../Weapon';
import type { GravityFieldSpec, GravityFieldState } from '../GravityFieldState';
import type { GravityManeuverSpec, GravityManeuverState } from '../GravityManeuverState';
import { sameTeam, combatTeam } from '../CombatTeams';
import type { Asteroid, HulkFragment } from '../CombatTypes';
import { resolveGravityBody, releaseGravityTractor, gravityProjectileSupported, projectileGravityMass, gravityLineClear } from './GravityTractor';
import { weaponMuzzle, shipSegmentEntry } from '../../ai/FireControlGeometry';
import { combatWeaponRange } from '../WeaponRange';
import { signedAngle } from '../../math/Angles';
import { advanceTurretAim } from './weapon/WeaponAim';

/** Caps concern NEW external force, never an unconditional overwrite of velocity. */
export const GRAVITY_LIMITS = { shipAcceleration: 260, shipImpulse: 240, shipOverspeed: 240, projectileAcceleration: 1400, projectileImpulse: 750, projectileSpeed: 2400 } as const;
type Body = { root: Ship; members: Ship[]; mass: number };
type Delta = { continuous: Vector2; impulse: Vector2 };
type Contribution<T> = { target: T; delta: Vector2 };
const live = (s: Ship) => !s.isDead && s.hullHp > 0 && !s.isRetreated && !s.isDocked && !s.isPhased;
const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const supportedProjectile = gravityProjectileSupported;
const massResponse = (mass: number) => Math.min(2.5, 1000 / Math.max(1, mass));
const clampLength = (v: Vector2, limit: number) => { const n = v.length(); if (n > limit) v.scale(limit / n); return v; };

/** First swept contact with an expanding shell. Both inner and outer boundaries
 * matter: an already-passed object can escape outward, but cannot be hit just
 * because it remains somewhere inside the enclosing disk. */
export function gravityWaveContactTime(start: { x: number; y: number }, end: { x: number; y: number }, field: { x: number; y: number }, r0: number, r1: number, bodyRadius: number): number | undefined {
  const x = start.x - field.x, y = start.y - field.y;
  const vx = end.x - start.x, vy = end.y - start.y, dr = r1 - r0;
  const onShell = (t: number) => Math.abs(Math.hypot(x + vx * t, y + vy * t) - (r0 + dr * t)) <= bodyRadius + 1e-5;
  if (onShell(0)) return 0;
  const candidates: number[] = [];
  for (const offset of [bodyRadius, -bodyRadius]) {
    const radius = r0 + offset;
    const a = vx * vx + vy * vy - dr * dr, b = 2 * (x * vx + y * vy - radius * dr), c = x * x + y * y - radius * radius;
    if (Math.abs(a) < 1e-9) { if (Math.abs(b) > 1e-9) candidates.push(-c / b); }
    else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const d = Math.sqrt(discriminant);
        candidates.push((-b - d) / (2 * a), (-b + d) / (2 * a));
      }
    }
  }
  return candidates.filter(t => t >= 0 && t <= 1 && onShell(t)).sort((a, b) => a - b)[0];
}
export function crossesGravityWave(start: { x: number; y: number }, end: { x: number; y: number }, field: { x: number; y: number }, r0: number, r1: number, bodyRadius: number): boolean {
  return gravityWaveContactTime(start, end, field, r0, r1, bodyRadius) !== undefined;
}

function direction(field: GravityFieldState, position: { x: number; y: number }, outward: boolean, fallbackAngle: number): Vector2 {
  const v = new Vector2(position.x - field.x, position.y - field.y);
  if (v.length() < 1e-6) return outward ? Vector2.fromAngle(fallbackAngle) : v;
  return v.normalize().scale(outward ? 1 : -1);
}
function addBudgeted<T>(rows: Contribution<T>[], budget: number, map: Map<T, Delta>, impulse: boolean): number {
  const total = rows.reduce((n, row) => n + row.delta.length(), 0), scale = total > budget ? budget / total : 1;
  for (const { target, delta } of rows) {
    let sum = map.get(target);
    if (!sum) { sum = { continuous: new Vector2(), impulse: new Vector2() }; map.set(target, sum); }
    (impulse ? sum.impulse : sum.continuous).addScaled(delta, scale);
  }
  return Math.min(total, budget);
}
function apply(velocity: Vector2, delta: Delta, acceleration: number, impulse: number, ceiling: number, dt: number): boolean {
  const combined = clampLength(delta.continuous, acceleration * dt).add(clampLength(delta.impulse, impulse));
  if (combined.length() <= 1e-9) return false;
  // Preserve any pre-existing overspeed; gravity cannot make it faster without bound.
  const maxSpeed = Math.max(velocity.length(), ceiling);
  velocity.add(combined); clampLength(velocity, maxSpeed);
  return true;
}
function bodyDistance(body: Body, field: GravityFieldState): number {
  return Math.max(0, Math.min(...body.members.map(member => Math.hypot(member.pos.x - field.x, member.pos.y - field.y) - member.spec.collisionRadius)));
}
function stop(system: ShipSystem): void { system.gravityField = undefined; system.deactivate(); }

/** One authority pass AFTER all system events, BEFORE projectile movement/collision.
 * No retained world cache. Arrays/maps below live for this step only; hit history
 * lives on serializable ShipSystem state, including on an actual Dedicated Worker. */
export function advanceGravityFields(dt: number, ships: readonly Ship[], projectiles: readonly Projectile[], asteroids: readonly Asteroid[] = [], hulkFragments: readonly HulkFragment[] = []): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const emitters: { owner: Ship; system: ShipSystem; spec: GravityFieldSpec; field: GravityFieldState }[] = [];
  for (const owner of ships) for (const system of owner.allSystems) {
    const spec = system.definition.gravityField, field = system.gravityField;
    if (!spec || !field) continue;
    if (!live(owner) || owner.isAttachedModule || owner.retreating || system.disabled || owner.flux.isOverloaded || owner.flux.isVenting || (owner.runtimeModifiers.value.disableSystems ?? 0) > 0) { stop(system); continue; }
    if (spec.kind === 'WELL' && (system.state === 'OUT' || !system.isActive || Math.hypot(owner.pos.x - field.x, owner.pos.y - field.y) > spec.placementRange)) { stop(system); continue; }
    if (spec.kind==='REPULSOR' && !system.definition.gravityRemoteRelease && field.age===0) {field.x=owner.pos.x;field.y=owner.pos.y;}
    if (system.state === 'IN') continue;
    emitters.push({ owner, system, spec, field });
  }
  const maneuvers: { owner: Ship; system: ShipSystem; spec: GravityManeuverSpec; state: GravityManeuverState }[] = [];
  for (const owner of ships) for (const system of owner.allSystems) {
    const spec = system.definition.gravityManeuver, state = system.gravityManeuver;
    if (!spec || !state) continue;
    if (!live(owner) || owner.isAttachedModule || owner.retreating || system.disabled || owner.flux.isOverloaded || owner.flux.isVenting || (owner.runtimeModifiers.value.disableSystems ?? 0) > 0 || system.state !== 'ACTIVE') { system.deactivate(); continue; }
    maneuvers.push({ owner, system, spec, state });
  }
  const controllers = ships.flatMap(owner=>owner.weapons.filter(m=>m.spec.gravityTractor || m.spec.gravityDeflector).map(mount=>({owner,mount})));
  if (!emitters.length && !maneuvers.length && !controllers.length) return;
  emitters.sort((a, b) => order(a.owner.id, b.owner.id) || order(a.system.type, b.system.type));
  const bodies = new Map<Ship, Body>();
  for (const ship of ships) {
    const root = ship.assemblyRoot;
    if (!live(ship) || !live(root)) continue;
    let body = bodies.get(root);
    if (!body) { body = { root, members: [], mass: 0 }; bodies.set(root, body); }
    if (!body.members.includes(ship)) { body.members.push(ship); body.mass += Math.max(1, ship.spec.mass); }
  }
  const shipDeltas = new Map<Ship, Delta>(), projectileDeltas = new Map<Projectile, Delta>(), environmentDeltas = new Map<Vector2, Delta>();
  const world = {ships,projectiles,asteroids,hulkFragments};
  const environments = [...asteroids.map(a=>resolveGravityBody({kind:'ASTEROID',id:a.id},world)), ...hulkFragments.map(h=>resolveGravityBody({kind:'HULK',id:h.id},world))].filter(b=>!!b);
  for (const { owner, system, spec, field } of emitters) {
    field.serial ??= system.activationSerial;
    const impulse = spec.kind === 'REPULSOR';
    const step = Math.min(dt, Math.max(0, spec.duration - field.age));
    const oldRadius = field.radius;
    field.age += step;
    field.radius = impulse ? spec.radius * Math.min(1, field.age / spec.duration) : spec.radius;
    const shipRows: Contribution<Ship>[] = [], projectileRows: Contribution<Projectile>[] = [];
    const eligibleBodies = [...bodies.values()].filter(b => b.root !== owner.assemblyRoot && !b.root.spec.sourceHullTraits?.includes('GRAVITY_FIXED')
      && (!sameTeam(owner, b.root) || field.releaseTargets?.some(t=>t.kind==='SHIP' && t.id===b.root.id)))
      .map(body => ({ body, distance: bodyDistance(body, field) }))
      .sort((a, b) => a.distance - b.distance || order(a.body.root.id, b.body.root.id));
    for (const { body, distance } of eligibleBodies) {
      if (shipRows.length >= spec.maxShips || (impulse && field.shipHits.length >= spec.maxShips)) break;
      if ((!impulse && distance > spec.radius) || (impulse && (field.shipHits.includes(body.root.id) || field.shipBudgetRemaining <= 0))) continue;
      let contact = body.root.pos;
      if (impulse) {
        const hit = body.members.map(member => ({ member, time: gravityWaveContactTime(member.prevPos, member.pos, field, oldRadius, field.radius, member.spec.collisionRadius) }))
          .filter(row => row.time !== undefined).sort((a, b) => a.time! - b.time!)[0];
        if (!hit) continue;
        contact = Vector2.lerp(hit.member.prevPos, hit.member.pos, hit.time!);
      }
      const falloff = impulse ? 1 - .55 * Math.min(1, distance / spec.radius) : Math.max(0, 1 - (distance / spec.radius) ** 2) * Math.min(1, Math.hypot(body.root.pos.x - field.x, body.root.pos.y - field.y) / 70);
      const delta = direction(field, contact, impulse, owner.facingRad).scale(spec.shipStrength * massResponse(body.mass) * falloff * (impulse ? 1 : step));
      shipRows.push({ target: body.root, delta });
      if (impulse) field.shipHits.push(body.root.id);
    }
    const eligibleProjectiles = projectiles.filter(p => supportedProjectile(p) && combatTeam(p) !== undefined
      && (!sameTeam(owner, p) || (p.sourceShipId===owner.id && p.gravityCoupling==='MASS_DRIVER') || field.releaseTargets?.some(t=>t.kind==='PROJECTILE' && t.id===p.id)))
      .map(p => ({ p, distance: Math.hypot(p.pos.x - field.x, p.pos.y - field.y) }))
      .sort((a, b) => a.distance - b.distance || a.p.id - b.p.id);
    for (const { p, distance } of eligibleProjectiles) {
      if (projectileRows.length >= spec.maxProjectiles || (impulse && field.projectileHits.length >= spec.maxProjectiles)) break;
      let contact = p.pos;
      if (impulse) {
        if (field.projectileBudgetRemaining <= 0 || field.projectileHits.includes(p.id)) continue;
        const end = p.pos.clone().addScaled(p.vel, step);
        const time = gravityWaveContactTime(p.pos, end, field, oldRadius, field.radius, p.radius);
        if (time === undefined) continue;
        contact = Vector2.lerp(p.pos, end, time);
      } else {
        if (distance > spec.radius) continue;
        if (sameTeam(owner,p)) {
          const binding=p.gravityWellBinding;
          if (binding && (binding.ownerId!==owner.id || binding.serial!==field.serial || binding.age>=.65 || binding.turn>=Math.PI/4)) continue;
          p.gravityWellBinding ??= {ownerId:owner.id,serial:field.serial??system.activationSerial,age:0,turn:0};
          p.gravityWellBinding.age += step;
        }
      }
      const falloff = impulse ? 1 - .35 * Math.min(1, distance / spec.radius) : Math.max(0, 1 - (distance / spec.radius) ** 2) * Math.min(1, distance / 70);
      const delta=direction(field, contact, impulse, owner.facingRad).scale(spec.projectileStrength * falloff * Math.min(2,4/projectileGravityMass(p)) * (impulse ? 1 : step));
      if (!impulse && sameTeam(owner,p) && p.gravityWellBinding) {
        // Keep friendly calibration shots useful; no permanent orbit or free speed boost.
        const before=p.vel.heading(), rotated=p.vel.clone().add(delta);
        const turn=Math.abs(signedAngle(rotated.heading()-before));
        const remaining=Math.PI/4-p.gravityWellBinding.turn;
        if (turn>remaining && turn>0) delta.scale(remaining/turn);
        p.gravityWellBinding.turn+=Math.min(turn,remaining);
      }
      projectileRows.push({ target: p, delta });
      if (impulse) field.projectileHits.push(p.id);
    }
    const shipsSpent = addBudgeted(shipRows, impulse ? field.shipBudgetRemaining : spec.shipBudget * step, shipDeltas, impulse);
    const projectilesSpent = addBudgeted(projectileRows, impulse ? field.projectileBudgetRemaining : spec.projectileBudget * step, projectileDeltas, impulse);
    if (impulse) { field.shipBudgetRemaining -= shipsSpent; field.projectileBudgetRemaining -= projectilesSpent; }
    const environmentRows: Contribution<Vector2>[]=[];
    const envHits=field.environmentHits ??= [];
    for (const body of environments.sort((a,b)=>a!.pos.distanceTo(new Vector2(field.x,field.y))-b!.pos.distanceTo(new Vector2(field.x,field.y)))) {
      if (!body || body.fixed) continue;
      const key=`${body.target.kind}:${body.target.id}`, distance=Math.max(0,body.pos.distanceTo(new Vector2(field.x,field.y))-body.radius);
      if (environmentRows.length>=spec.maxShips || (impulse && envHits.length>=spec.maxShips)) break;
      if (impulse ? envHits.includes(key) || !crossesGravityWave(body.pos,body.pos.clone().addScaled(body.vel,step),field,oldRadius,field.radius,body.radius) : distance>spec.radius) continue;
      const falloff=impulse?1-.55*Math.min(1,distance/spec.radius):Math.max(0,1-(distance/spec.radius)**2);
      environmentRows.push({target:body.vel,delta:direction(field,body.pos,impulse,owner.facingRad).scale(spec.shipStrength*massResponse(body.mass)*falloff*(impulse?1:step))});
      if(body.hulk)body.hulk.gravityManaged=true;
      if (impulse) envHits.push(key);
    }
    const envBudget=impulse?field.shipBudgetRemaining:Math.max(0,spec.shipBudget*step-shipsSpent);
    const envSpent=addBudgeted(environmentRows,envBudget,environmentDeltas,impulse);
    if (impulse) field.shipBudgetRemaining=Math.max(0,field.shipBudgetRemaining-envSpent);
    if (field.age >= spec.duration) stop(system);
  }
  for (const {owner,mount} of controllers.sort((a,b)=>order(a.owner.id,b.owner.id)||order(a.mount.slotId,b.mount.slotId))) {
    const state=mount.gravityTractor, spec=mount.spec.gravityTractor;
    const usable=live(owner) && !owner.retreating && !owner.flux.isOverloaded && !owner.flux.isVenting && (owner.runtimeModifiers.value.disableSystems ?? 0) <= 0 && !mount.isDisabled && owner.system.canFireWeapon(mount);
    if (!usable) { if(state?.phase!=='IDLE') releaseGravityTractor(mount,'装置中断');continue; }
    if (spec && state?.phase==='HOLD' && state.target) {
      const body=resolveGravityBody(state.target,world), muzzle=weaponMuzzle(owner,mount);
      if (!body || muzzle.distanceTo(body.pos)-body.radius>combatWeaponRange(owner,mount.spec) || !gravityLineClear(owner,body,muzzle,world)) {releaseGravityTractor(mount,'连接中断');continue;}
      const cost=spec.fluxPerSecond*dt*Math.min(2,Math.max(.75,body.mass/(body.projectile?6:3000)));
      if (owner.flux.totalFlux+cost>owner.flux.maxFlux) {releaseGravityTractor(mount,'幅能不足');continue;}
      owner.flux.increaseFlux(cost,false);
      const delta=new Vector2(state.anchorX-body.pos.x,state.anchorY-body.pos.y).scale(2.4).sub(body.vel.clone().sub(owner.vel).scale(spec.damping));
      clampLength(delta,spec.strength);
      if (body.fixed) {
        const pull=body.pos.clone().sub(owner.pos).normalize().scale(spec.strength*massResponse(owner.spec.mass)*dt);
        addBudgeted([{target:owner.assemblyRoot,delta:pull}],pull.length(),shipDeltas,false);
      } else {
        delta.scale((body.projectile?Math.min(2,6/body.mass):massResponse(body.mass))*dt);
        if (body.ship) addBudgeted([{target:body.ship,delta}],delta.length(),shipDeltas,false);
        else if (body.projectile) addBudgeted([{target:body.projectile,delta}],delta.length(),projectileDeltas,false);
        else addBudgeted([{target:body.vel,delta}],delta.length(),environmentDeltas,false);
      }
      const entry=body.ship?shipSegmentEntry(body.ship,muzzle,body.pos):null;
      const contact=entry===null?body.pos:Vector2.lerp(muzzle,body.pos,entry);
      state.contactX=contact.x;state.contactY=contact.y;
    }
    const pd=mount.spec.gravityDeflector;
    if (mount.gravityDeflection) {mount.gravityDeflection.age+=dt;if(mount.gravityDeflection.age>.18)mount.gravityDeflection=undefined;}
    if (!pd) continue;
    if (owner.fireControlMode==='MANUAL' && !owner.weaponGroups.some(g=>g.weaponSlotIds.includes(mount.slotId) && (g.isAutofire || (g.index===owner.selectedGroupIndex && owner.isFiringMain)))) continue;
    const muzzle=weaponMuzzle(owner,mount);
    const threats=projectiles.filter(p=>supportedProjectile(p)&&!sameTeam(owner,p)&&p.pos.distanceTo(muzzle)<=mount.spec.range)
      .map(p=>{const r=p.pos.clone().sub(owner.pos),v=p.vel.clone().sub(owner.vel),t=-r.dot(v)/Math.max(1,v.lengthSq());return {p,t,d:r.addScaled(v,Math.max(0,t)).length()};})
      .filter(r=>r.t>=0&&r.t<=1.1&&r.d<owner.spec.collisionRadius+r.p.radius+15).sort((a,b)=>a.t-b.t||a.p.id-b.p.id);
    const threat=threats.find(({p})=>Math.abs(signedAngle(p.pos.clone().sub(muzzle).heading()-owner.facingRad-mount.baseAngleDeg*Math.PI/180))<=mount.arcDeg*Math.PI/360);
    if (!threat) continue;
    const angle=threat.p.pos.clone().sub(muzzle).heading(), base=owner.facingRad+mount.baseAngleDeg*Math.PI/180;
    mount.currentAngleRad=advanceTurretAim(mount.currentAngleRad,base,angle,mount.arcDeg,(mount.spec.turnRateDegPerSec??180)*Math.PI/180,owner.angularVelRad,dt);
    if (mount.cooldownTimer>0 || Math.abs(signedAngle(angle-mount.currentAngleRad))>.16 || owner.flux.totalFlux+pd.fluxPerUse>owner.flux.maxFlux) continue;
    const body=resolveGravityBody({kind:'PROJECTILE',id:threat.p.id},world);
    if (!body || !gravityLineClear(owner,body,muzzle,world)) continue;
    const v=threat.p.vel.clone().sub(owner.vel), side=new Vector2(-v.y,v.x).normalize();
    const away=threat.p.pos.clone().sub(owner.pos);
    if (side.dot(away)<0 || (Math.abs(side.dot(away))<1e-8 && threat.p.id%2<1))side.scale(-1);
    const required=Math.max(30,(owner.spec.collisionRadius+threat.p.radius+20-threat.d)/Math.max(.15,threat.t));
    const delta=side.scale(Math.min(required,pd.impulse/projectileGravityMass(threat.p),pd.budgetPerSecond*pd.interval));
    addBudgeted([{target:threat.p,delta}],delta.length(),projectileDeltas,true);
    owner.flux.increaseFlux(pd.fluxPerUse,false);mount.cooldownTimer=pd.interval;mount.glowAlpha=.6;
    mount.gravityDeflection={x:threat.p.pos.x,y:threat.p.pos.y,age:0};
  }
  for (const { owner, system, spec, state } of maneuvers) {
    const step = Math.min(dt, Math.max(0, spec.duration - state.age));
    state.age += step;
    const speed = owner.vel.length();
    if (speed < spec.minSpeed || step <= 0) { system.deactivate(); continue; }
    const error = Math.atan2(Math.sin(state.targetAngle - owner.vel.heading()), Math.cos(state.targetAngle - owner.vel.heading()));
    // Bound the CHORD of the exact rotation. Scaling a large rotation vector
    // afterwards would silently brake the ship rather than preserving speed.
    const accelerationAngle = 2 * Math.asin(Math.min(1, Math.min(spec.lateralAcceleration, GRAVITY_LIMITS.shipAcceleration) * step / (2 * speed)));
    const angle = Math.sign(error) * Math.min(Math.abs(error), spec.turnRate * step, state.turnRemaining, accelerationAngle);
    state.turnRemaining = Math.max(0, state.turnRemaining - Math.abs(angle));
    const delta = owner.vel.clone().rotate(angle).sub(owner.vel);
    addBudgeted([{ target: owner, delta }], delta.length(), shipDeltas, false);
    // A completed turn is a committed action, not an idle live-cursor rudder.
    if (state.age >= spec.duration || state.turnRemaining < 1e-8 || Math.abs(error - angle) < 1e-8) system.deactivate();
  }
  for (const [root, delta] of shipDeltas) {
    apply(root.vel, delta, GRAVITY_LIMITS.shipAcceleration, GRAVITY_LIMITS.shipImpulse, root.spec.maxSpeed + GRAVITY_LIMITS.shipOverspeed, dt);
    // Attached bodies inherit the root impulse; never apply one kick per turret module.
    root.syncModuleTree();
  }
  for (const [projectile, delta] of projectileDeltas) {
    if (apply(projectile.vel, delta, GRAVITY_LIMITS.projectileAcceleration, GRAVITY_LIMITS.projectileImpulse, GRAVITY_LIMITS.projectileSpeed, dt)) {
      projectile.gravityDeflected = true;
      // Rockets keep their nose/turn inertia and can reacquire. Solid shots face their new path.
      if (!projectile.isRocket && !projectile.angularVelocityRad) projectile.facingRad = projectile.vel.heading();
    }
  }
  for (const [velocity,delta] of environmentDeltas) apply(velocity,delta,GRAVITY_LIMITS.shipAcceleration,GRAVITY_LIMITS.shipImpulse,320,dt);
}
