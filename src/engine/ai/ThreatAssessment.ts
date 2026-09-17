import { Vector2 } from '../math/Vector2';
import { signedAngle } from '../math/Angles';
import { segmentCircleEntry } from '../math/Geometry';
import type { Ship } from '../simulation/Ship';
import type { DamageType } from '../simulation/ArmorGrid';
import type { TacticalWorld } from './TacticalWorld';
import { weaponMuzzle, weaponMuzzleExtent } from './FireControlGeometry';
import { weaponDps, weaponRange } from './ShipCombatProfile';
import { hasOnlyNativeRangeModifiers } from '../extensions/HullMods';

export interface IncomingThreat {
  sourceId: string;
  kind: 'PROJECTILE' | 'BEAM' | 'WEAPON';
  eta: number;
  damage: number;
  shieldFlux: number;
  direction: number;
}
export interface ThreatAssessment {
  threats: IncomingThreat[];
  horizon: number;
  imminentDamage: number;
  imminentShieldFlux: number;
  actualDamage: number;
  earliest: number;
  facing: number | null;
}
const shieldMultiplier = (type: DamageType) => type === 'KINETIC' ? 2 : type === 'HIGH_EXPLOSIVE' ? .5 : type === 'FRAGMENTATION' ? .25 : 1;

/** Local forecast, not omniscient future simulation: actual trajectories plus earliest
 * plausible follow-up shots from every hostile, including recovery/turn/closing times. */
export function assessThreats(ship: Ship, world: TacticalWorld, horizon: number, defenseWindow: number): ThreatAssessment {
  const threats: IncomingThreat[] = [];
  // Scratch space is assessment-local: no cross-ship/frame cache or stale live state.
  const forecastEnd = new Vector2();
  const forecastDelta = new Vector2();
  const forecastMuzzle = new Vector2();
  // With an infinite horizon the original add() also records ETA=Infinity misses.
  const finiteHorizon = Number.isFinite(horizon);
  const center = ship.getShieldCenter();
  const radius = Math.max(ship.spec.collisionRadius, ship.shield.type !== 'NONE' && ship.shield.type !== 'PHASE' ? ship.shield.radius : 0);
  const add = (kind: IncomingThreat['kind'], sourceId: string, eta: number, damage: number, type: DamageType, origin: Vector2) => {
    if (!(eta >= 0 && eta <= horizon && damage > 0) || !Number.isFinite(damage)) return;
    threats.push({kind,sourceId,eta,damage,shieldFlux:damage*shieldMultiplier(type)*ship.shield.efficiency*ship.shield.damageTakenMultiplierFor(type),
      direction:Math.atan2(origin.y-center.y,origin.x-center.x)});
  };
  const projectiles = world.projectileThreatIndex?.query(world.projectiles, ship, center, radius, horizon) ?? world.projectiles;
  for (const p of projectiles) {
    const owner = p.isPlayer ?? world.ships.find(s=>s.id===p.sourceShipId)?.isPlayer;
    if (owner === undefined || owner === ship.isPlayer || p.isFlare || p.didDamage || !(p.damage > 0)) continue;
    let lifetime = horizon;
    if (p.flightTimeRemaining !== undefined) lifetime = Math.min(lifetime,p.flightTimeRemaining);
    else if (p.rangeRemaining !== undefined) lifetime = Math.min(lifetime,Math.max(0,p.rangeRemaining)/Math.max(1,p.sourceMoveSpeed ?? p.vel.length())+Math.max(0,(p.fadeTime??0)*(1-(p.fadeProgress??0))));
    if (!(lifetime > 0)) continue;
    const endX = p.pos.x+(p.vel.x-ship.vel.x)*lifetime;
    const endY = p.pos.y+(p.vel.y-ship.vel.y)*lifetime;
    const collisionRadius = radius+p.radius+(p.proximityFuse?.range ?? 0);
    const pursuing = p.isGuided && p.targetShipId === ship.id;
    // A conservative swept box only rejects clear misses. Include coordinate-scaled
    // slack for the original quadratic's cancellation/rounding at extreme scales.
    // NaN/Infinity bounds fail open; guided pursuit of this ship must still be assessed.
    const extent = Math.abs(collisionRadius)+1e-7*Math.max(1,Math.abs(p.pos.x),Math.abs(p.pos.y),
      Math.abs(endX),Math.abs(endY),Math.abs(center.x),Math.abs(center.y),Math.abs(collisionRadius));
    if (finiteHorizon && !pursuing && (center.x < Math.min(p.pos.x,endX)-extent || center.x > Math.max(p.pos.x,endX)+extent
      || center.y < Math.min(p.pos.y,endY)-extent || center.y > Math.max(p.pos.y,endY)+extent)) continue;
    const t = segmentCircleEntry(p.pos,forecastEnd.set(endX,endY),center,collisionRadius);
    let eta = t === null ? Infinity : t*lifetime;
    if (pursuing) {
      const toward = forecastDelta.set(center.x-p.pos.x,center.y-p.pos.y);
      const error = Math.abs(signedAngle(toward.heading()-(p.facingRad ?? p.vel.heading())));
      const turnTime = error/Math.max(.001,(p.maxTurnRate ?? 0)*Math.PI/180);
      const pursuit = Math.max(0,toward.length()-collisionRadius)/Math.max(1,p.maxSpeed ?? p.vel.length()) + turnTime;
      if (pursuit <= lifetime) eta = Math.min(eta,pursuit);
    }
    add('PROJECTILE',p.sourceShipId,eta,p.damage,p.damageType,p.pos);
  }
  const activeBeams = new Set<string>();
  for (const b of world.beams) {
    const source = world.ships.find(s=>s.id===b.sourceShipId);
    if (!source || source.isPlayer===ship.isPlayer || source.isDead || b.damageActive===false || b.duration<=0) continue;
    if (segmentCircleEntry(b.startPos,b.endPos,center,radius) === null) continue;
    activeBeams.add(b.sourceShipId+'/'+b.slotId);
    const duration = Math.min(defenseWindow,b.duration);
    add('BEAM',b.sourceShipId,0,b.damagePerSec*duration,b.damageType,b.startPos);
  }
  const weaponEnvelopes = world.weaponThreatEnvelope && finiteHorizon && horizon >= 0 && ship.hasNativeThreatPhaseHooks
    ? world.weaponThreatEnvelope : undefined;
  for (const enemy of world.ships) {
    if (enemy===ship || enemy.isDead || enemy.isPlayer===ship.isPlayer) continue;
    const recovery = Math.max(enemy.flux.isOverloaded ? enemy.flux.overloadTimer : 0,
      enemy.flux.isVenting ? enemy.flux.getTimeToVent() : 0,
      enemy.isPhased ? enemy.shield.phaseChargeDownDuration : 0,
      enemy.system.blocksWeapons ? enemy.system.chargeDownDuration : 0);
    // Travel time is nonnegative: recovery beyond the horizon cannot contribute a threat.
    if (recovery > horizon) continue;
    const envelope = weaponEnvelopes?.get(enemy);
    if (envelope) {
      if (envelope.maxRangeAndMuzzle === -Infinity) continue;
      const distance = Math.max(Math.abs(center.x - enemy.pos.x), Math.abs(center.y - enemy.pos.y));
      const approach = radius + horizon * Math.max(1, envelope.maxSpeed
        + Math.abs(enemy.vel.x - ship.vel.x) + Math.abs(enemy.vel.y - ship.vel.y));
      const reach = approach + envelope.maxRangeAndMuzzle;
      // This stricter aggregate bound implies every original per-mount bound
      // rejects. Keep a larger margin for regrouped additions, and fail open.
      const pad = 1e-6 * Math.max(1, Math.abs(center.x), Math.abs(center.y), Math.abs(enemy.pos.x),
        Math.abs(enemy.pos.y), Math.abs(radius), Math.abs(approach), Math.abs(envelope.maxRangeAndMuzzle), Math.abs(reach));
      if (Number.isFinite(reach) && distance > reach + pad) continue;
    }
    // Assessment-local only: later AI updates can activate systems or change flux.
    let motion: ReturnType<Ship['getMotionStats']> | undefined;
    // Only audited pure stat hooks may move the range query ahead of muzzle reads.
    // Custom systems/hullmods keep their original callback and mutable-state order.
    let boundWeapons = finiteHorizon && horizon >= 0 && enemy.system.hasNativeStats && hasOnlyNativeRangeModifiers(enemy.spec);
    const distanceFromOrigin = Math.max(Math.abs(center.x-enemy.pos.x), Math.abs(center.y-enemy.pos.y));
    let approachReach = 0, coordinateScale = 0;
    let mountIndex = 0;
    for (const m of envelope?.mounts ?? enemy.weapons) {
      const preparedIndex = mountIndex++;
      if (m.isDisabled || m.ammo<1) continue;
      const dps = envelope ? envelope.dps[preparedIndex] : weaponDps(m);
      // Most scenes have no crossing active beams: avoid constructing a key per mount.
      if (dps<=0 || (activeBeams.size>0 && activeBeams.has(enemy.id+'/'+m.slotId))) continue;
      if (!motion) {
        motion = envelope?.motion ?? enemy.getMotionStats();
        // L1 relative speed bounds the original radial closing speed, including its
        // near-zero normalization rule. Keep the full horizon, even while venting.
        if (boundWeapons) {
          approachReach = radius + horizon*Math.max(1,motion.maxSpeed+Math.abs(enemy.vel.x-ship.vel.x)+Math.abs(enemy.vel.y-ship.vel.y));
          coordinateScale = Math.max(1,Math.abs(center.x),Math.abs(center.y),Math.abs(enemy.pos.x),Math.abs(enemy.pos.y),Math.abs(radius),Math.abs(approachReach));
        }
      }
      let range: number | undefined = envelope?.ranges[preparedIndex];
      if (boundWeapons) {
        range ??= weaponRange(enemy,m);
        // Cheap near check avoids even reading barrel geometry for close weapons.
        if (distanceFromOrigin > approachReach+range) {
          const extent = envelope?.muzzleExtents[preparedIndex] ?? weaponMuzzleExtent(m), reach = approachReach+range+extent;
          const pad = 1e-7*Math.max(coordinateScale,Math.abs(range),extent,Math.abs(reach));
          // NaN/Infinity fail open. Remaining candidates retain all exact ETA math.
          if (distanceFromOrigin > reach+pad) continue;
        }
      }
      const muzzle = weaponMuzzle(enemy,m,forecastMuzzle), delta = forecastDelta.set(center.x-muzzle.x,center.y-muzzle.y), distance = delta.length();
      range ??= weaponRange(enemy,m);
      // Outside range is not automatically safe: a hostile can close while this ship vents.
      // Keep Vector2.normalize's near-zero rule and the original arithmetic order.
      const unitX = distance>0.00001 ? delta.x/distance : delta.x;
      const unitY = distance>0.00001 ? delta.y/distance : delta.y;
      const relativeClosing = Math.max(0,(enemy.vel.x-ship.vel.x)*unitX+(enemy.vel.y-ship.vel.y)*unitY);
      const approachTime = Math.max(0,distance-radius-range)/Math.max(1,motion.maxSpeed+relativeClosing);
      // Exact lower bound for the existing ETA, not a shorter awareness radius.
      if (approachTime > horizon) continue;
      const base = enemy.facingRad+m.baseAngleDeg*Math.PI/180;
      const halfArc = m.mountType==='HARDPOINT' || (m.spec.turnRateDegPerSec ?? 1)<=0 ? 0 : m.arcDeg*Math.PI/360;
      const turn = Math.abs(signedAngle(delta.heading()-base));
      const hullTurnTime = Math.max(0,turn-halfArc-Math.asin(Math.min(1,radius/Math.max(1,distance))))/Math.max(.001,motion.maxTurnRate);
      const turretTime = halfArc>0 ? Math.abs(signedAngle(delta.heading()-m.currentAngleRad))/Math.max(.001,(m.spec.turnRateDegPerSec ?? 30)*Math.PI/180) : 0;
      const turnTime = m.spec.isGuided && m.spec.alwaysFire ? 0 : Math.max(hullTurnTime,turretTime);
      const charge = m.firingState==='CHARGING' ? m.firingStateTimer : m.spec.isBeam ? m.spec.beamSourceChargeupTime ?? 0 : m.spec.chargeTime ?? 0;
      const readiness = m.burstRemaining>0 ? m.burstTimer : Math.max(0,m.cooldownTimer)+charge;
      const travel = m.spec.isBeam ? 0 : Math.max(0,Math.min(range,distance-radius))/Math.max(1,m.spec.maxSpeed ?? m.spec.projSpeed);
      const eta = Math.max(recovery,readiness,turnTime,approachTime)+travel;
      // Forecast the first burst, not unlimited DPS over the entire vent horizon.
      const count = Math.min(m.ammo,Math.max(1,m.spec.burstSize ?? 1));
      const damage = m.spec.isBeam ? dps*Math.min(defenseWindow,m.spec.beamDuration ?? defenseWindow) : m.spec.damagePerShot*count;
      add('WEAPON',enemy.id,eta,damage,m.spec.type,muzzle);
      // add() can invoke arbitrary target-side shield modifiers. Any such callback
      // may move ships/change loadouts: stop using the pre-callback bound thereafter.
      boundWeapons = false;
    }
  }
  const imminent = threats.filter(t=>t.eta<=defenseWindow);
  // Pick the shield sector covering the largest weighted threat, not the fleet's attack target.
  let facing: number|null = null, best = -1;
  const halfArc = ship.shield.maxArcDeg*Math.PI/360;
  for (const candidate of imminent) {
    let weight = 0;
    // Preserve accumulation order and ties without an array per candidate sector.
    for (const t of imminent) {
      if (Math.abs(signedAngle(t.direction-candidate.direction))<=halfArc) weight += t.shieldFlux/(1+t.eta);
    }
    if (weight>best) { best=weight;facing=candidate.direction; }
  }
  let imminentDamage = 0, imminentShieldFlux = 0, actualDamage = 0, earliest = Infinity;
  for (const t of threats) {
    earliest = Math.min(earliest,t.eta);
    if (t.eta<=defenseWindow) {
      imminentDamage += t.damage;
      imminentShieldFlux += t.shieldFlux;
      if (t.kind!=='WEAPON') actualDamage += t.damage;
    }
  }
  return {threats,horizon,imminentDamage,imminentShieldFlux,actualDamage,earliest,facing};
}
