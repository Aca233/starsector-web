import type { Ship } from '../simulation/Ship';
import type { TacticalOrder } from '../simulation/CombatTypes';
import { Vector2 } from '../math/Vector2';
import { signedAngle } from '../math/Angles';
import { combatProfile } from './ShipCombatProfile';
import { assessThreats } from './ThreatAssessment';
import { ShipDefenseController } from './ShipDefenseController';
import { avoidCollisions, driveVelocity, forwardPathClear, rangeVelocity, velocityToPosition, yieldFireLane } from './TacticalNavigation';
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
    if(ship.isDead){ship.clearInput();ship.defenseFacingRad=undefined;ship.aiHoldOffensiveFire=false;ship.tacticalAI=undefined;return;}
    const scene=world??{ships:[ship,this.targetShip],projectiles:[],beams:[],asteroids:[]};
    ship.combatShips = scene.ships;
    let target:Ship|undefined=this.targetShip;
    if(target.isDead||target.isPlayer===ship.isPlayer||!scene.ships.includes(target)){
      const candidates=scene.ships.filter(s=>!s.isDead&&s.isPlayer!==ship.isPlayer);
      target=candidates.reduce<Ship|undefined>((nearest,s)=>!nearest||s.pos.distanceTo(ship.pos)<nearest.pos.distanceTo(ship.pos)?s:nearest,undefined);
    }
    if(target){this.targetShip=target;ship.currentTargetShip=target;ship.aimTargetWorld.copy(target.pos);}else ship.currentTargetShip=null;
    const phase=ship.shield.type==='PHASE';
    const defenseWindow=policy.imminentWindow+(phase?ship.shield.phaseChargeUpDuration:0);
    // Native vent module accounts for the WHOLE vent plus defense recovery, not only its target.
    const recovery=2+(phase?ship.shield.phaseChargeDownDuration+ship.shield.phaseCooldownDuration:ship.shield.unfoldDuration);
    const horizon=Math.max(defenseWindow,ship.flux.getTimeToVent()+recovery);
    const threat=assessThreats(ship,scene,horizon,defenseWindow);
    this.defense.observe(dt,threat);
    const profile=target?combatProfile(ship,target):{range:0,relativeBearing:0,firepower:0,weapons:0};
    if(ship.flux.fluxPercent>=policy.retreatAt||!profile.weapons)this.withdrawing=!!target;
    else if(ship.flux.fluxPercent<=policy.resumeAt)this.withdrawing=false;
    ship.aiHoldOffensiveFire=this.withdrawing;
    const escort=order?.type==='ESCORT'?scene.ships.find(other=>other.id===order.targetShipId&&other.isPlayer===ship.isPlayer&&!other.isDead&&other!==ship):undefined;
    const defending=order?.type==='DEFEND';
    const avoiding=order?.type==='AVOID';
    const waypoint=order?.type==='WAYPOINT'||defending?order.targetPos:undefined;
    let facing=ship.facingRad,desired=new Vector2();
    if(escort){
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
      desired=rangeVelocity(ship,target,profile.range,this.withdrawing);
    }
    const cooperation=waypoint||escort||avoiding||this.withdrawing?{velocity:desired,yielding:false}:yieldFireLane(ship,desired,scene);
    const avoidance=avoidCollisions(ship,cooperation.velocity,scene);
    driveVelocity(ship,avoidance.velocity,facing);
    if(target&&!ship.flux.isVenting&&!ship.flux.isOverloaded){
      // System callbacks decide activation only; they no longer rewrite stationkeeping or shield orders.
      const modifiers=ship.system.definition.modifiers?.({...ship.system,state:'ACTIVE',effectLevel:1} as typeof ship.system,ship.flux.maxFlux);
      const boostSpeed=ship.spec.maxSpeed+(modifiers?.speedFlat??0);
      ship.system.definition.advanceAI?.({ship,target,distance:ship.pos.distanceTo(target.pos),angleDiff:signedAngle(facing-ship.facingRad),
        tactical:{desiredRange:profile.range,withdrawing:this.withdrawing,waypoint:!!waypoint,avoidingCollision:avoidance.avoiding||cooperation.yielding,
          forwardClear:forwardPathClear(ship,scene,Math.max(boostSpeed,ship.vel.length()),Math.max(policy.avoidanceLookahead,ship.system.chargeUpDuration+ship.system.chargeDownDuration)),
          quietFor:this.defense.quietFor,threat}});
    }
    if (target) ship.defenseSystem.definition.advanceAI?.({ ship, system: ship.defenseSystem, target, distance: ship.pos.distanceTo(target.pos), angleDiff: signedAngle(facing-ship.facingRad),
      tactical: { desiredRange: profile.range, withdrawing: this.withdrawing, waypoint: !!waypoint, avoidingCollision: avoidance.avoiding, forwardClear: true, quietFor: this.defense.quietFor, threat } });
    const defense=this.defense.update(ship,threat);
    ship.tacticalAI={mode:escort?'ESCORT':avoiding?'AVOID':defending?'DEFEND':waypoint?'WAYPOINT':!target?'IDLE':this.withdrawing?'WITHDRAW':'ENGAGE',desiredRange:profile.range,
      desiredFacing:facing,availableFirepower:profile.firepower,avoidingCollision:avoidance.avoiding,yieldingFireLane:cooperation.yielding,
      incomingDamage:threat.imminentDamage,incomingShieldFlux:threat.imminentShieldFlux,
      earliestThreat:Number.isFinite(threat.earliest)?threat.earliest:null,ventSafe:defense.ventSafe,defense:defense.state};
  }
}
