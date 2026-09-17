import { sameTeam } from "../../CombatTeams";
import type { Projectile } from '../../Weapon';
import type { WeaponSimContext } from './WeaponSimContext';
import { Vector2 } from '../../../math/Vector2';
import type { Ship } from '../../Ship';
import { signedAngle } from '../../../math/Angles';

interface FlareState { wait: number; spin: number; seekAfter: number; immune: WeakSet<Projectile>; target?: Projectile; orbitTarget?: Ship }
/** FlareAI / SeekerFlareAI. Combat RNG only; no visual random draws affect targeting. */
export class FlareGuidance {
  private readonly states = new WeakMap<Projectile, FlareState>();
  public update(p: Projectile, dt: number, ctx: WeaponSimContext, projectiles: Projectile[]): boolean {
    const spec = p.flareBehavior;
    p.flareLife = (p.flareLife ?? p.flareMaxLife ?? 0) - dt;
    if (!spec) return p.flareLife <= 0;
    if ((p.hitpoints ?? 1) <= 0 || p.flareLife <= -spec.flameoutTime) return true;
    p.flareFizzling = p.flareLife <= 0;
    if (p.flareFizzling) {
      p.fadeProgress = Math.max(0, Math.min(1, (-p.flareLife - spec.flameoutTime + spec.fadeTime) / Math.max(.001, spec.fadeTime)));
      return false;
    }
    let state = this.states.get(p);
    if (!state) {
      state = {wait: .05 + ctx.random.next() * .05, spin: ctx.random.next() > .5 ? -1 : 1,
        seekAfter: spec.mode === 'SEEKER' ? .5 + ctx.random.next() * .5 : Infinity, immune: new WeakSet()};
      if (spec.mode === 'JAMMER') {
        const ships = ctx.ships ?? [ctx.playerShip, ctx.enemyShip, ...ctx.fighters];
        state.orbitTarget = ships.filter(s => !s.isDead && !s.isPhased && !sameTeam(s, p) && s.pos.distanceTo(p.pos) <= 1000)
          .sort((a,b) => a.pos.distanceTo(p.pos)-b.pos.distanceTo(p.pos))[0];
      }
      this.states.set(p, state);
    }
    if (spec.mode === 'JAMMER') {
      // FlareJammerAI's parsed effectChance is never used: this is a physical fighter-class decoy.
      const target = state.orbitTarget;
      let angle = p.facingRad ?? p.vel.heading();
      if (target) {
        const center = target.getShieldCenter();
        const radius = (target.shield.type !== 'NONE' ? target.shield.radius : target.spec.collisionRadius) + 75;
        const distance = p.pos.distanceTo(center);
        angle = center.clone().sub(p.pos).heading() + (distance < radius ? Math.PI : 0)
          + Math.max(0, 1 - Math.abs(distance-radius)/100) * Math.PI/2 * state.spin;
      }
      const facing = p.facingRad ?? p.vel.heading();
      const desiredTurn = Math.max(-(p.maxTurnRate ?? 0), Math.min(p.maxTurnRate ?? 0, signedAngle(angle-facing)*4));
      const change = (p.maxTurnAcceleration ?? 0)*dt;
      p.turnVelocityRad = (p.turnVelocityRad ?? 0)+Math.max(-change,Math.min(change,desiredTurn-(p.turnVelocityRad ?? 0)));
      p.facingRad = facing+p.turnVelocityRad*dt;
      p.vel.add(Vector2.fromAngle(p.facingRad, (p.engineAcceleration ?? 0)*dt));
      const speed = p.vel.length();
      if (speed > (p.maxSpeed ?? speed)) p.vel.scale((p.maxSpeed ?? speed)/speed);
      return false;
    }
    const hostile = (other: Projectile) => other !== p && (p.isPlayer === undefined
      ? other.sourceShipId !== p.sourceShipId : !sameTeam(other, p))
      && (other.hitpoints === undefined || other.hitpoints > 0) && !other.flareFizzling
      && (other.flightTimeRemaining === undefined || other.flightTimeRemaining > 0);
    state.wait -= dt;
    if (state.wait <= 1e-9) {
      state.wait += .05 + ctx.random.next() * .05;
      if (spec.mode === 'SEEKER' && p.elapsedTime >= state.seekAfter) {
        state.target = undefined;
        let nearest = Infinity;
        for (const missile of projectiles) {
          if (!missile.isRocket || missile.isFlare || !hostile(missile)) continue;
          const distance = p.pos.distanceTo(missile.pos);
          if (distance < nearest) { nearest = distance; state.target = missile; }
        }
      }
      for (const missile of projectiles) {
        if (!missile.isRocket || !missile.isGuided || missile.isFlare || !hostile(missile)
          || missile.renderTargetIndicator === false || p.pos.distanceTo(missile.pos) > spec.effectRange || state.immune.has(missile)) continue;
        if (ctx.random.next() > spec.effectChance || (missile.eccmChance ?? 0) > ctx.random.next()) {
          state.immune.add(missile);
        } else missile.targetProjectileId = p.id;
      }
    }
    const seek = p.elapsedTime >= state.seekAfter;
    // Seeking flares coast for the source's random .5-1s delay, but may spoof immediately.
    if (spec.mode === 'SEEKER' && !seek) return false;
    p.turnVelocityRad = state.spin * Math.min(p.maxTurnRate ?? 0, Math.abs(p.turnVelocityRad ?? 0) + (p.maxTurnAcceleration ?? 0) * dt);
    p.facingRad = (p.facingRad ?? p.vel.heading()) + p.turnVelocityRad * dt;
    let accelerationAngle = p.facingRad;
    const target = state.target;
    if (seek && target && projectiles.includes(target) && hostile(target)) {
      const lead = Math.min(1.5, p.pos.distanceTo(target.pos) / Math.max(1, p.maxSpeed ?? 0));
      accelerationAngle = target.pos.clone().addScaled(target.vel, lead).sub(p.pos).heading();
    }
    p.vel.add(Vector2.fromAngle(accelerationAngle, (p.engineAcceleration ?? 0) * dt));
    const speed = p.vel.length();
    if (speed > (p.maxSpeed ?? speed)) p.vel.scale((p.maxSpeed ?? speed) / speed);
    return false;
  }
}
