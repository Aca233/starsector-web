import { chooseCombatVelocity, type CombatPositionChoice } from './TacticalPositioning';
import { planFleetTactics } from './FleetTactics';
import { fleetApproachVelocity, fleetEngagementRange, regroupVelocity } from './FleetNavigation';
import { sameTeam } from "../simulation/CombatTeams";
import type { Ship } from '../simulation/Ship';
import type { TacticalOrder } from '../simulation/CombatTypes';
import { Vector2 } from '../math/Vector2';
import { signedAngle } from '../math/Angles';
import { combatProfile } from './ShipCombatProfile';
import { assessThreats } from './ThreatAssessment';
import { ShipDefenseController } from './ShipDefenseController';
import { avoidCollisions, driveVelocity, forwardPathClear, velocityToPosition, yieldFireLane } from './TacticalNavigation';
import { tacticalPolicy as policy, type TacticalWorld } from './TacticalWorld';

// Intent is sampled in simulation time; physical integration and urgent reactions
// still run on every update. Build-time rollback retains the original 60 Hz path.
const TACTICAL_INTERVAL = import.meta.env?.VITE_AI_TACTICAL_20HZ === 'false' ? 0 : 1 / 20;

const FORECAST_INTERVAL = import.meta.env?.VITE_AI_THREAT_FORECAST_20HZ === 'false' ? 0 : 1 / 20;

/** Composition of Web tactical policies. Not a full native BasicShipAI port.
 * No hull-ID branches; movement, defense and system activation have separate owners. */
export class CapitalShipAI {
  private readonly defense=new ShipDefenseController();
  private withdrawing=false;
  // Primitive fields deliberately participate in the existing Publisher/Owner codec.
  // Do not move these into an unreplicated WeakMap or object cache.
  private tacticalRemaining = -1;
  private forecastRemaining = -1;
  private forecastFarThreat = false;
  private forecastEarliest = Infinity;
  private forecastDefenseWindow = 0;
  private forecastRosterSize = -1;
  private tacticalOrderKey = '';
  private tacticalIntentKey = '';
  private tacticalTargetId: string | undefined = undefined;
  private tacticalRange = 0;
  private tacticalBearing = 0;
  private tacticalFirepower = 0;
  private tacticalWeapons = 0;
  private tacticalX = 0;
  private tacticalY = 0;
  private tacticalFacing = 0;
  private tacticalYielding = false;
  private tacticalPositioning: CombatPositionChoice['reason'] | undefined = undefined;
  private tacticalScoreGain: number | undefined = undefined;
  private tacticalClearFire: number | undefined = undefined;
  // Used only by the opt-in authority rule. Keep clocks primitive for AI codecs.
  private decisionRemaining = -1;
  private decisionElapsed = 0;
  private decisionOrderKey = '';
  private decisionStateKey = '';
  private decisionTargetId: string | undefined = undefined;
  private readonly tacticalPhase: number;
  constructor(public ship:Ship,public targetShip:Ship) {
    // Stable across host/owner realms, creation order and replays; consumes no RNG.
    let hash = 2166136261;
    for (let i = 0; i < ship.id.length; i++) hash = Math.imul(hash ^ ship.id.charCodeAt(i), 16777619);
    this.tacticalPhase = (hash >>> 0) % 3;
  }

  /** Opt-in whole-decision sampler: held controls, NOT a slower physical tick.
   * First ownership/invalidated intent is immediate. No catch-up burst after a long
   * step; elapsed simulation time reaches defense/intent timers exactly once. */
  public sampleDecision(dt: number, order: TacticalOrder | null, ships: readonly Ship[]): number | null {
    const ship = this.ship;
    if (!(dt > 0) || !Number.isFinite(dt) || ship.fireControlMode !== 'AI' || !ship.tacticalAI
      || ship.isDead || ship.isRetreated || ship.isDocked || ship.retreating) {
      this.decisionRemaining = -1; this.decisionElapsed = 0;
      return dt;
    }
    const orderKey = order ? JSON.stringify([order.id, order.type, order.targetShipId, order.targetPos?.x, order.targetPos?.y, order.issuedTime]) : '';
    const stateKey = JSON.stringify([ship.system.tacticalMode, ship.flux.isVenting, ship.flux.isOverloaded]);
    const target = ship.currentTargetShip;
    const invalidTarget = !!target && (target.isDead || target.isRetreated || target.isDocked
      || target.hasVastBulk || !target.isVisibleTo(ship.teamId) || sameTeam(ship, target) || !ships.includes(target));
    const first = this.decisionRemaining < 0;
    this.decisionElapsed += dt;
    this.decisionRemaining -= dt;
    const scheduled = first || this.decisionRemaining <= 1e-9;
    if (scheduled) this.decisionRemaining = first ? (this.tacticalPhase + 1) / 60
      : 1 / 20 + Math.min(0, this.decisionRemaining % (1 / 20));
    // Do not hold an obsolete world roster during the skipped control steps.
    ship.combatShips = ships;
    if (!scheduled && orderKey === this.decisionOrderKey && stateKey === this.decisionStateKey
      && target?.id === this.decisionTargetId && !invalidTarget) return null;
    this.decisionOrderKey = orderKey; this.decisionStateKey = stateKey; this.decisionTargetId = target?.id;
    const elapsed = this.decisionElapsed; this.decisionElapsed = 0;
    return elapsed;
  }

  public update(dt:number,order:TacticalOrder|null=null,world?:TacticalWorld):void {
    const ship=this.ship;
    // Pilot edge commands set AI ownership before this call and clear diagnostics.
    if(ship.fireControlMode!=='AI'||!ship.tacticalAI){this.defense.reset();this.withdrawing=false;this.tacticalRemaining=-1;this.forecastRemaining=-1;}
    ship.fireControlMode='AI';ship.isFiringMain=false;
    if(ship.isDead||ship.isRetreated||ship.isDocked||ship.retreating){this.tacticalRemaining=-1;this.forecastRemaining=-1;ship.clearInput();ship.defenseFacingRad=undefined;ship.aiHoldOffensiveFire=false;ship.tacticalAI=undefined;return;}
    const scene=world??{ships:[ship,this.targetShip],projectiles:[],beams:[],asteroids:[]};
    ship.combatShips = scene.ships;
    const assignment=(scene.fleetPlan ?? planFleetTactics(scene.ships, order ? new Map([[ship.id,order]]) : undefined)).get(ship.id);
    const validTarget=(s:Ship)=>!s.hasVastBulk&&!s.isDead&&!s.isRetreated&&!s.isDocked&&s.isVisibleTo(ship.teamId)&&!sameTeam(s,ship);
    const first = this.tacticalRemaining < 0;
    this.tacticalRemaining -= Math.max(0, dt);
    const scheduled = first || this.tacticalRemaining <= 1e-9 || TACTICAL_INTERVAL === 0;
    if (scheduled) this.tacticalRemaining = TACTICAL_INTERVAL === 0 ? 0
      : first ? (this.tacticalPhase + 1) * TACTICAL_INTERVAL / 3
      : TACTICAL_INTERVAL + Math.min(0, this.tacticalRemaining % TACTICAL_INTERVAL);
    // Orders may be edited in place; compare their values, not their object identity.
    const orderKey = order ? JSON.stringify([order.id, order.type, order.targetShipId, order.targetPos?.x, order.targetPos?.y, order.issuedTime]) : '';
    let target = ship.currentTargetShip ?? undefined;
    let decide = scheduled || orderKey !== this.tacticalOrderKey || target?.id !== this.tacticalTargetId
      || !!target && (!validTarget(target) || !scene.ships.includes(target));
    this.tacticalOrderKey = orderKey;
    if (decide) {
      const orderedId=order?.type==='ENGAGE'||order?.type==='AVOID'?order.targetShipId:undefined;
      target=scene.ships.find(s=>s.id===orderedId&&validTarget(s))
        ?? scene.ships.find(s=>s.id===assignment?.targetId&&validTarget(s));
      if(!target&&!assignment)target=scene.ships.find(s=>s===this.targetShip&&validTarget(s));
      this.tacticalTargetId = target?.id;
    }
    if(target){this.targetShip=target;ship.currentTargetShip=target;ship.aimTargetWorld.copy(target.pos);}else ship.currentTargetShip=null;
    const phase=ship.shield.type==='PHASE';
    const defenseWindow=policy.imminentWindow+(phase?ship.shield.phaseChargeUpDuration:0);
    // Native vent module accounts for the WHOLE vent plus defense recovery, not only its target.
    const recovery=2+(phase?ship.shield.phaseChargeDownDuration+ship.shield.phaseCooldownDuration:ship.shield.unfoldDuration);
    const horizon=Math.max(defenseWindow,ship.flux.getTimeToVent()+recovery);
    const compactForecast = FORECAST_INTERVAL > 0 && !!scene.weaponThreatEnvelope && ship.hasNativeThreatPhaseHooks;
    const forecastFirst = this.forecastRemaining < 0;
    this.forecastRemaining -= Math.max(0, dt);
    const refreshForecast = !compactForecast || forecastFirst || this.forecastRemaining <= 1e-9
      || this.forecastDefenseWindow !== defenseWindow || this.forecastRosterSize !== scene.ships.length;
    let threat = assessThreats(ship,scene,horizon,defenseWindow,refreshForecast ? horizon : Math.min(horizon,defenseWindow));
    if (refreshForecast) {
      this.forecastFarThreat = false; this.forecastEarliest = Infinity;
      for (const incoming of threat.threats) if (incoming.kind === 'WEAPON' && incoming.eta > defenseWindow) {
        this.forecastFarThreat = true; this.forecastEarliest = Math.min(this.forecastEarliest,incoming.eta);
      }
      this.forecastRemaining = !compactForecast ? -1 : forecastFirst
        ? (this.tacticalPhase + 1) * FORECAST_INTERVAL / 3
        : FORECAST_INTERVAL + Math.min(0, this.forecastRemaining % FORECAST_INTERVAL);
      this.forecastDefenseWindow = defenseWindow; this.forecastRosterSize = scene.ships.length;
    } else {
      threat.hasDeferredWeaponThreat = this.forecastFarThreat;
      threat.earliest = Math.min(threat.earliest,this.forecastEarliest);
    }
    this.defense.observe(dt,threat);
    const profile = decide
      ? target ? combatProfile(ship,target) : {range:0,relativeBearing:0,firepower:0,weapons:0}
      : {range:this.tacticalRange,relativeBearing:this.tacticalBearing,firepower:this.tacticalFirepower,weapons:this.tacticalWeapons};
    if (decide) {
      if(target)profile.range=fleetEngagementRange(ship,target,profile.range,assignment);
      this.tacticalRange=profile.range;this.tacticalBearing=profile.relativeBearing;
      this.tacticalFirepower=profile.firepower;this.tacticalWeapons=profile.weapons;
    }
    if(ship.flux.fluxPercent>=policy.retreatAt||(!profile.weapons&&assignment?.role!=='CARRIER'))this.withdrawing=!!target;
    else if(ship.flux.fluxPercent<=policy.resumeAt)this.withdrawing=false;
    if (ship.hullStats.doNotBackOff && !ship.flux.isVenting) this.withdrawing = false;
    if (ship.system.tacticalMode === 'ASSAULT') { this.withdrawing = false; order = null; }
    if (ship.system.tacticalMode === 'EXTRACT') { this.withdrawing = true; order = null; }
    const regroup= !order && assignment?.task==='REGROUP' && !ship.hullStats.doNotBackOff && ship.system.tacticalMode!=='ASSAULT' && ship.system.tacticalMode!=='EXTRACT'
      ? scene.ships.find(s=>s.id===assignment.anchorId&&!s.isDead&&!s.isRetreated&&sameTeam(s,ship)) : undefined;
    const disengaging = !order && assignment?.task==='DISENGAGE' && !ship.hullStats.doNotBackOff
      && ship.system.tacticalMode!=='ASSAULT' && ship.system.tacticalMode!=='EXTRACT';
    const withdrawing = this.withdrawing || disengaging;
    // Movement retreat/regroup is not a ceasefire. Hold only while recovering high flux;
    // safe in-range weapons can otherwise cover the withdrawal.
    ship.aiHoldOffensiveFire=this.withdrawing && ship.flux.fluxPercent>policy.resumeAt && !ship.system.forcesAutofire;
    const escort=order?.type==='ESCORT'?scene.ships.find(other=>other.id===order.targetShipId&&sameTeam(other, ship)&&!other.isDead&&other!==ship):undefined;
    const defending=order?.type==='DEFEND';
    const avoiding=order?.type==='AVOID';
    const waypoint=order?.type==='WAYPOINT'||defending?order.targetPos:undefined;
    const intentKey = JSON.stringify([assignment?.role, !!regroup, regroup?.id, withdrawing, escort?.id, avoiding, waypoint?.x, waypoint?.y,
      ship.system.tacticalMode, ship.system.isActive, ship.flux.isVenting, ship.flux.isOverloaded, ship.engineController.state]);
    decide ||= intentKey !== this.tacticalIntentKey;
    this.tacticalIntentKey = intentKey;
    let positioning: CombatPositionChoice | undefined;
    let facing=this.tacticalFacing,desired=new Vector2(this.tacticalX,this.tacticalY);
    let cooperation = {velocity:desired,yielding:this.tacticalYielding};
    if (decide) {
      facing=ship.facingRad;desired=new Vector2();
      if(regroup){
        desired=regroupVelocity(ship,regroup,target);
        if(target)facing=target.pos.clone().sub(ship.pos).heading()-profile.relativeBearing;
      }else if(escort){
        // Web escort policy: follow behind the protected hull at collision-safe separation.
        const separation=ship.spec.collisionRadius+escort.spec.collisionRadius+220;
        const station=escort.pos.clone().add(new Vector2(-Math.cos(escort.facingRad)*separation,-Math.sin(escort.facingRad)*separation));
        desired=velocityToPosition(ship,station,escort.vel,120);
        facing=target?target.pos.clone().sub(ship.pos).heading()-profile.relativeBearing:escort.facingRad;
      }else if(avoiding&&target){
        const away=ship.pos.clone().sub(target.pos);if(away.length()<1)away.set(-1,0);
        desired=away.scale(ship.getMotionStats().maxSpeed/away.length());
        facing=target.pos.clone().sub(ship.pos).heading()-profile.relativeBearing;
      }else if(waypoint){
        const delta=new Vector2(waypoint.x,waypoint.y).sub(ship.pos);
        if(defending&&target)facing=target.pos.clone().sub(ship.pos).heading()-profile.relativeBearing;
        else if(delta.length()>policy.positionTolerance)facing=delta.heading();
        desired=velocityToPosition(ship,new Vector2(waypoint.x,waypoint.y));
      }else if(target){
        facing=target.pos.clone().sub(ship.pos).heading()-profile.relativeBearing;
        desired=fleetApproachVelocity(ship,target,profile.range,withdrawing,order?undefined:assignment);
        if (!order && !withdrawing && assignment?.role !== 'CARRIER' && !ship.system.tacticalMode) {
          positioning = chooseCombatVelocity(ship,target,desired,profile,scene);
          desired = positioning.velocity;
        }
      } else {
        // No omniscient lock through fog: approach the public battlefield centre to search.
        const centre = new Vector2();
        desired=velocityToPosition(ship,centre);
        if (ship.pos.length()>policy.positionTolerance) facing=centre.sub(ship.pos).heading();
      }
      cooperation=waypoint||escort||avoiding||withdrawing||regroup||positioning?.adjusted?{velocity:desired,yielding:false}:yieldFireLane(ship,desired,scene);
      this.tacticalX=cooperation.velocity.x;this.tacticalY=cooperation.velocity.y;this.tacticalFacing=facing;
      this.tacticalYielding=cooperation.yielding;this.tacticalPositioning=positioning?.reason;
      this.tacticalScoreGain=positioning?.scoreGain;this.tacticalClearFire=positioning?.clearFire;
    }
    // Urgent avoidance and steering read the CURRENT scene and motion limits,
    // not a cached throttle/turn command. Defense and system AI below are also live.
    const avoidance=avoidCollisions(ship,cooperation.velocity,scene);
    driveVelocity(ship,avoidance.velocity,facing);
    const allowOffensiveManeuver = !regroup && !withdrawing && !escort && !avoiding && !waypoint;
    if(target&&!ship.flux.isVenting&&!ship.flux.isOverloaded){
      // System callbacks decide activation only; they no longer rewrite stationkeeping or shield orders.
      const tacticalSystems = ship.spec.rightClickSystemType === undefined ? ship.systems : [...ship.systems, ship.defenseSystem];
      for (const system of tacticalSystems) {
        const modifiers=system.definition.modifiers?.({...system,state:'ACTIVE',effectLevel:1} as typeof system,ship.flux.maxFlux);
        const boostSpeed=ship.spec.maxSpeed+(modifiers?.speedFlat??0);
        system.definition.advanceAI?.({ship,system,world:scene,target,distance:ship.pos.distanceTo(target.pos),angleDiff:signedAngle(facing-ship.facingRad),
          tactical:{allowOffensiveManeuver,desiredRange:profile.range,withdrawing:withdrawing||!!regroup,waypoint:!!waypoint,avoidingCollision:avoidance.avoiding||cooperation.yielding,
            forwardClear:forwardPathClear(ship,scene,Math.max(boostSpeed,ship.vel.length()),Math.max(policy.avoidanceLookahead,system.chargeUpDuration+system.chargeDownDuration)),
            quietFor:this.defense.quietFor,threat}});
      }
    }
    if (target && ship.spec.rightClickSystemType === undefined) ship.defenseSystem.definition.advanceAI?.({ ship, system: ship.defenseSystem, target, distance: ship.pos.distanceTo(target.pos), angleDiff: signedAngle(facing-ship.facingRad),
      tactical: { allowOffensiveManeuver, desiredRange: profile.range, withdrawing: withdrawing||!!regroup, waypoint: !!waypoint, avoidingCollision: avoidance.avoiding, forwardClear: true, quietFor: this.defense.quietFor, threat } });
    const defense=this.defense.update(ship,threat,compactForecast ? () => {
      // System AI above may have changed the scene. Never commit a vent using
      // sampled far-threat absence or advance the calm timer a second time.
      const livePhase = ship.shield.type === 'PHASE';
      const liveWindow = policy.imminentWindow + (livePhase ? ship.shield.phaseChargeUpDuration : 0);
      const liveRecovery = 2 + (livePhase ? ship.shield.phaseChargeDownDuration + ship.shield.phaseCooldownDuration : ship.shield.unfoldDuration);
      threat = assessThreats(ship,scene,Math.max(liveWindow,ship.flux.getTimeToVent()+liveRecovery),liveWindow);
      this.forecastRemaining = -1;
      return threat;
    } : undefined);
    ship.tacticalAI={fleetRole:assignment?.role,fleetTask:regroup?'REGROUP':disengaging?'DISENGAGE':assignment?.task==='REGROUP'||assignment?.task==='DISENGAGE'?(target?'PRESSURE':'SEARCH'):assignment?.task,targetScore:assignment?.score,pressureRatio:assignment?.pressureRatio,assignedPower:assignment?.assignedPower,
      mode:regroup?'WITHDRAW':escort?'ESCORT':avoiding?'AVOID':defending?'DEFEND':waypoint?'WAYPOINT':!target?'IDLE':withdrawing?'WITHDRAW':'ENGAGE',desiredRange:profile.range,
      positioning:this.tacticalPositioning,positionScoreGain:this.tacticalScoreGain,clearFireFraction:this.tacticalClearFire,
      desiredFacing:facing,availableFirepower:profile.firepower,avoidingCollision:avoidance.avoiding,yieldingFireLane:cooperation.yielding,
      incomingDamage:threat.imminentDamage,incomingShieldFlux:threat.imminentShieldFlux,
      earliestThreat:Number.isFinite(threat.earliest)?threat.earliest:null,ventSafe:defense.ventSafe,defense:defense.state};
  }
}
