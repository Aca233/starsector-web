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

/** Composition of Web tactical policies. Not a full native BasicShipAI port.
 * No hull-ID branches; movement, defense and system activation have separate owners. */
export class CapitalShipAI {
  private readonly defense=new ShipDefenseController();
  private withdrawing=false;
  constructor(public ship:Ship,public targetShip:Ship) {}

  public update(dt:number,order:TacticalOrder|null=null,world?:TacticalWorld):void {
    const ship=this.ship;
    if(ship.fireControlMode!=='AI'){this.defense.reset();this.withdrawing=false;}
    ship.fireControlMode='AI';ship.isFiringMain=false;
    if(ship.isDead||ship.retreating){ship.clearInput();ship.defenseFacingRad=undefined;ship.aiHoldOffensiveFire=false;ship.tacticalAI=undefined;return;}
    const scene=world??{ships:[ship,this.targetShip],projectiles:[],beams:[],asteroids:[]};
    ship.combatShips = scene.ships;
    const assignment=(scene.fleetPlan ?? planFleetTactics(scene.ships, order ? new Map([[ship.id,order]]) : undefined)).get(ship.id);
    const validTarget=(s:Ship)=>!s.hasVastBulk&&!s.isDead&&!s.isRetreated&&!s.isDocked&&s.isVisibleTo(ship.teamId)&&!sameTeam(s,ship);
    const orderedId=order?.type==='ENGAGE'||order?.type==='AVOID'?order.targetShipId:undefined;
    let target=scene.ships.find(s=>s.id===orderedId&&validTarget(s))
      ?? scene.ships.find(s=>s.id===assignment?.targetId&&validTarget(s));
    if(!target&&!assignment)target=scene.ships.find(s=>s===this.targetShip&&validTarget(s));
    if(target){this.targetShip=target;ship.currentTargetShip=target;ship.aimTargetWorld.copy(target.pos);}else ship.currentTargetShip=null;
    const phase=ship.shield.type==='PHASE';
    const defenseWindow=policy.imminentWindow+(phase?ship.shield.phaseChargeUpDuration:0);
    // Native vent module accounts for the WHOLE vent plus defense recovery, not only its target.
    const recovery=2+(phase?ship.shield.phaseChargeDownDuration+ship.shield.phaseCooldownDuration:ship.shield.unfoldDuration);
    const horizon=Math.max(defenseWindow,ship.flux.getTimeToVent()+recovery);
    const threat=assessThreats(ship,scene,horizon,defenseWindow);
    this.defense.observe(dt,threat);
    const profile=target?combatProfile(ship,target):{range:0,relativeBearing:0,firepower:0,weapons:0};
    if(target)profile.range=fleetEngagementRange(ship,target,profile.range,assignment);
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
    let positioning: CombatPositionChoice | undefined;
    let facing=ship.facingRad,desired=new Vector2();
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
    const cooperation=waypoint||escort||avoiding||withdrawing||regroup||positioning?.adjusted?{velocity:desired,yielding:false}:yieldFireLane(ship,desired,scene);
    const avoidance=avoidCollisions(ship,cooperation.velocity,scene);
    driveVelocity(ship,avoidance.velocity,facing);
    const allowOffensiveManeuver = !regroup && !withdrawing && !escort && !avoiding && !waypoint;
    if(target&&!ship.flux.isVenting&&!ship.flux.isOverloaded){
      // System callbacks decide activation only; they no longer rewrite stationkeeping or shield orders.
      for (const system of ship.systems) {
        const modifiers=system.definition.modifiers?.({...system,state:'ACTIVE',effectLevel:1} as typeof system,ship.flux.maxFlux);
        const boostSpeed=ship.spec.maxSpeed+(modifiers?.speedFlat??0);
        system.definition.advanceAI?.({ship,system,target,distance:ship.pos.distanceTo(target.pos),angleDiff:signedAngle(facing-ship.facingRad),
          tactical:{allowOffensiveManeuver,desiredRange:profile.range,withdrawing:withdrawing||!!regroup,waypoint:!!waypoint,avoidingCollision:avoidance.avoiding||cooperation.yielding,
            forwardClear:forwardPathClear(ship,scene,Math.max(boostSpeed,ship.vel.length()),Math.max(policy.avoidanceLookahead,system.chargeUpDuration+system.chargeDownDuration)),
            quietFor:this.defense.quietFor,threat}});
      }
    }
    if (target) ship.defenseSystem.definition.advanceAI?.({ ship, system: ship.defenseSystem, target, distance: ship.pos.distanceTo(target.pos), angleDiff: signedAngle(facing-ship.facingRad),
      tactical: { allowOffensiveManeuver, desiredRange: profile.range, withdrawing: withdrawing||!!regroup, waypoint: !!waypoint, avoidingCollision: avoidance.avoiding, forwardClear: true, quietFor: this.defense.quietFor, threat } });
    const defense=this.defense.update(ship,threat);
    ship.tacticalAI={fleetRole:assignment?.role,fleetTask:regroup?'REGROUP':disengaging?'DISENGAGE':assignment?.task==='REGROUP'||assignment?.task==='DISENGAGE'?(target?'PRESSURE':'SEARCH'):assignment?.task,targetScore:assignment?.score,pressureRatio:assignment?.pressureRatio,assignedPower:assignment?.assignedPower,
      mode:regroup?'WITHDRAW':escort?'ESCORT':avoiding?'AVOID':defending?'DEFEND':waypoint?'WAYPOINT':!target?'IDLE':withdrawing?'WITHDRAW':'ENGAGE',desiredRange:profile.range,
      positioning:positioning?.reason,positionScoreGain:positioning?.scoreGain,clearFireFraction:positioning?.clearFire,
      desiredFacing:facing,availableFirepower:profile.firepower,avoidingCollision:avoidance.avoiding,yieldingFireLane:cooperation.yielding,
      incomingDamage:threat.imminentDamage,incomingShieldFlux:threat.imminentShieldFlux,
      earliestThreat:Number.isFinite(threat.earliest)?threat.earliest:null,ventSafe:defense.ventSafe,defense:defense.state};
  }
}
