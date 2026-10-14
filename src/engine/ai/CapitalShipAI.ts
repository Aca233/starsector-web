import { attachedModuleMotion, attachedModuleControls } from './AttachedModuleMotion';
import { withSystemForwardInput } from './SystemAIInputs';
import { CombatQueryReads, queryMotionStats } from './CombatQueryReads';
import { chooseCombatVelocity, type CombatPositionChoice } from './TacticalPositioning';
import { planFleetTactics, type FleetAssignment } from './FleetTactics';
import { fleetApproachVelocity, fleetEngagementRange, regroupVelocity } from './FleetNavigation';
import { sameTeam } from "../simulation/CombatTeams";
import type { Ship } from '../simulation/Ship';
import type { TacticalOrder } from '../simulation/CombatTypes';
import { Vector2 } from '../math/Vector2';
import { signedAngle } from '../math/Angles';
import { combatProfile } from './ShipCombatProfile';
import { assessThreats, type ThreatAssessment } from './ThreatAssessment';
import { ShipDefenseController } from './ShipDefenseController';
import { avoidCollisions, planVelocity, forwardPathClear, velocityToPosition, yieldFireLane } from './TacticalNavigation';
import { tacticalPolicy as policy, type TacticalWorld } from './TacticalWorld';
import type { SteeringCommand } from './SteeringKernel';
import type { AIStageView } from './batch/AIInputs';
import { length, visible } from './batch/AIInputs';
import { BodyFlag as B } from './batch/StageProtocol';
import { solveAIThreat } from './batch/AIThreatSolver';
import { solveAIProfile } from './batch/AIProfileSolver';
import { solveAIPosition } from './batch/AIPositionSolver';
import { solveAIHostile } from './batch/AITargetSolver';
import { approachVelocity, positionVelocity, regroupVelocity as numericRegroup,
  solveAIAvoidance, solveAIYield, solveAISteering } from './batch/AINavigationSolver';
import type { AIBatch, AIEffectReads } from './batch/AIBatch';
import { hasExactThreatPhaseAI, hasNativeThreatPhaseAI } from '../extensions/ship-systems/Registry';
import { aiDomainWork } from './batch/AIWork';

/** Transient authority-local command. AI memory advances during planning; world writes do not. */
export interface CapitalAIIntent {
  readonly owner: CapitalShipAI;
  readonly sequence: number;
  readonly stopped: boolean;
  readonly target: Ship | null;
  readonly aimX: number;
  readonly aimY: number;
  readonly holdOffensiveFire: boolean;
  readonly movement: Readonly<SteeringCommand>;
  readonly ships: readonly Ship[];
}
/** Authority-bound effect recipe, not a serialized World or a worker capability.
 * All values previously captured by the closure are explicit; live references
 * remain live until the original ordered effects boundary. Planning never calls
 * system/defense writers through this recipe. */
interface CapitalAIPlanEffects {
  numeric?: AIEffectReads;
  scene: TacticalWorld;
  target: Ship | undefined;
  threat: ThreatAssessment;
  profile: ReturnType<typeof combatProfile>;
  assignment: FleetAssignment | undefined;
  facing: number;
  allowOffensiveManeuver: boolean;
  regroup: boolean;
  disengaging: boolean;
  withdrawing: boolean;
  escort: boolean;
  avoiding: boolean;
  defending: boolean;
  waypoint: boolean;
  avoidingCollision: boolean;
  yielding: boolean;
  attachedMotion: boolean;
  deferred: boolean;
  compactForecast: boolean;
}
const intentSequence = new WeakMap<CapitalShipAI, number>();
const intentState = new WeakMap<CapitalAIIntent, { stage: 'planned' | 'controls' | 'closed'; effects?: CapitalAIPlanEffects }>();

// Legacy navigation cadence; physical integration and urgent reactions still run
// on every update. Its existing rollback and three-bucket phase stay independent.
const TACTICAL_INTERVAL = import.meta.env?.VITE_AI_TACTICAL_20HZ === 'false' ? 0 : 1 / 20;
// Explicit Web extension, enabled only by the caller's standard-native admission.
const MULTIRATE_TACTICAL_INTERVAL = 1 / 10;

const FORECAST_INTERVAL = import.meta.env?.VITE_AI_THREAT_FORECAST_20HZ === 'false' ? 0 : 1 / 20;

/** Composition of Web tactical policies. Not a full native BasicShipAI port.
 * No hull-ID branches; movement, defense and system activation have separate owners. */
const jStr = (v: string | null | undefined) => v == null ? 'null' : v.includes('"') || v.includes('\\') ? JSON.stringify(v) : `"${v}"`;
const jNum = (v: number | null | undefined) => typeof v === 'number' && Number.isFinite(v) ? `${v}` : 'null';

export class CapitalShipAI {
  private readonly defense=new ShipDefenseController();
  private withdrawing=false;
  // Primitive fields deliberately participate in the existing Publisher/Owner codec.
  // Do not move these into an unreplicated WeakMap or object cache.
  private attachedMotionLast = false;
  private tacticalRemaining = -1;
  private multiratePlanningLast = false;
  private multirateRemaining = -1;
  private multirateAssignmentKey = '';
  private multirateStateKey = '';
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
  private readonly multiratePhase: number;
  constructor(public ship:Ship,public targetShip:Ship) {
    // Stable across host/owner realms, creation order and replays; consumes no RNG.
    let hash = 2166136261;
    for (let i = 0; i < ship.id.length; i++) hash = Math.imul(hash ^ ship.id.charCodeAt(i), 16777619);
    this.tacticalPhase = (hash >>> 0) % 3;
    this.multiratePhase = (hash >>> 0) % 6;
  }

  /** Opt-in whole-decision sampler: held controls, NOT a slower physical tick.
   * First ownership/invalidated intent is immediate. No catch-up burst after a long
   * step; elapsed simulation time reaches defense/intent timers exactly once. */
  public sampleDecision(dt: number, order: TacticalOrder | null, ships: readonly Ship[], deferred = false): number | null {
    const ship = this.ship;
    if (!(dt > 0) || !Number.isFinite(dt) || ship.fireControlMode !== 'AI' || !ship.tacticalAI
      || ship.isDead || ship.isRetreated || ship.isDocked || ship.retreating) {
      this.decisionRemaining = -1; this.decisionElapsed = 0;
      return dt;
    }
    const orderKey = order ? `[${jStr(order.id)},${jStr(order.type)},${jStr(order.targetShipId)},${jNum(order.targetPos?.x)},${jNum(order.targetPos?.y)},${jNum(order.issuedTime)}]` : '';
    const stateKey = `[${jStr(ship.system.tacticalMode)},${!!ship.flux.isVenting},${!!ship.flux.isOverloaded}]`;
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
    if (!deferred) ship.combatShips = ships;
    if (!scheduled && orderKey === this.decisionOrderKey && stateKey === this.decisionStateKey
      && target?.id === this.decisionTargetId && !invalidTarget && !this.attachedMotionLast) return null;
    this.decisionOrderKey = orderKey; this.decisionStateKey = stateKey; this.decisionTargetId = target?.id;
    const elapsed = this.decisionElapsed; this.decisionElapsed = 0;
    return elapsed;
  }

  public update(dt:number,order:TacticalOrder|null=null,world?:TacticalWorld):void {
    this.decide(dt, order, world, false);
  }

  public plan(dt:number,order:TacticalOrder|null=null,world?:TacticalWorld):CapitalAIIntent {
    return this.decide(dt, order, world, true)!;
  }

  /** Default admitted phase: real producer -> numeric solver -> fresh authority
   * intent, not the legacy decide() with numerically repackaged outputs. Controller
   * clocks/primitive memory remain the same fields used by publisher/owner codecs. */
  public planNumeric(dt:number,order:TacticalOrder|null,scene:TacticalWorld,batch:AIBatch):CapitalAIIntent {
    const v:AIStageView=batch.view,b=v.bodies,a=v.ai,r=batch.bridge.rowOf.get(this.ship);
    if(r===undefined||!v.active||!v.valid)throw new Error('Invalid numeric AI planning lease');
    aiDomainWork.plans++;
    const multirate=scene.multiratePlanning===true;
    if(multirate!==this.multiratePlanningLast){
      this.multiratePlanningLast=multirate;this.tacticalRemaining=-1;this.multirateRemaining=-1;this.forecastRemaining=-1;
      this.multirateAssignmentKey='';this.multirateStateKey='';
    }
    if((b.flags[r]&B.MANUAL)||!a.tacticalPresent[r]){
      this.defense.reset();this.withdrawing=false;this.tacticalRemaining=-1;this.multirateRemaining=-1;this.forecastRemaining=-1;
    }
    if((b.flags[r]&(B.DEAD|B.RETREATED|B.DOCKED))||a.retreating[r]){
      aiDomainWork.stoppedPlans++;
      this.tacticalRemaining=-1;this.multirateRemaining=-1;this.forecastRemaining=-1;
      return this.intent({stopped:true,target:null,aimX:this.ship.aimTargetWorld.x,aimY:this.ship.aimTargetWorld.y,
        holdOffensiveFire:false,movement:attachedModuleControls,ships:scene.ships});
    }
    const attached=!!a.attachedMotion[r],motionChanged=attached!==this.attachedMotionLast;
    if(attached)aiDomainWork.attachedPlans++;
    this.attachedMotionLast=attached;
    // Former Engine hostile producer updated controller.targetShip BEFORE the
    // tactical clock, even when the selected fleet assignment had no target.
    // Keep that memory edge without asking Engine to rescan authority objects.
    const hostilePreselection=solveAIHostile(v,r,order?.type==='ENGAGE'||order?.type==='AVOID'?order.targetShipId:undefined);
    if(hostilePreselection>=0)this.targetShip=batch.bridge.ships[hostilePreselection];
    const assignment=batch.fleetPlan.get(a.ids[r]);
    const valid=(i:number)=>i>=0&&!a.vastBulk[i]&&!(b.flags[i]&(B.DEAD|B.RETREATED|B.DOCKED))&&visible(v,i,r)&&b.team[i]!==b.team[r];
    const row=(id:string|null|undefined)=>id?v.rowById.get(id)??-1:-1;
    let scheduled:boolean;
    if(multirate){
      const first=this.multirateRemaining<0;this.multirateRemaining-=Math.max(0,dt);scheduled=first||this.multirateRemaining<=1e-9;
      if(scheduled)this.multirateRemaining=first?(this.multiratePhase+1)*MULTIRATE_TACTICAL_INTERVAL/6
        :MULTIRATE_TACTICAL_INTERVAL+Math.min(0,this.multirateRemaining%MULTIRATE_TACTICAL_INTERVAL);
    } else {
      const first=this.tacticalRemaining<0;this.tacticalRemaining-=Math.max(0,dt);scheduled=first||this.tacticalRemaining<=1e-9||TACTICAL_INTERVAL===0;
      if(scheduled)this.tacticalRemaining=TACTICAL_INTERVAL===0?0:first?(this.tacticalPhase+1)*TACTICAL_INTERVAL/3
        :TACTICAL_INTERVAL+Math.min(0,this.tacticalRemaining%TACTICAL_INTERVAL);
    }
    const orderKey=order?`[${jStr(order.id)},${jStr(order.type)},${jStr(order.targetShipId)},${jNum(order.targetPos?.x)},${jNum(order.targetPos?.y)},${jNum(order.issuedTime)}]`:'';
    let t=row(a.currentTargetId[r]);
    let decide=scheduled||orderKey!==this.tacticalOrderKey||a.currentTargetId[r]!==this.tacticalTargetId||!!a.currentTargetId[r]&&!valid(t);
    this.tacticalOrderKey=orderKey;
    if(multirate){
      const key=`[${jStr(assignment?.role)},${jStr(assignment?.task)},${jStr(assignment?.targetId)},${jStr(assignment?.anchorId)},${assignment?.approachBearing==null}]`;
      // attachmentKey is the producer's JSON of the original first five fields.
      // Join the two arrays without nesting/quoting that JSON or coercing the
      // raw doNotBackOff stat to boolean; preserve the legacy memory key exactly.
      const stateKey=`${a.attachmentKey[r].slice(0,-1)},${jNum(b.team[r])},${jNum(a.doNotBackOff[r])},${jStr(a.systemMode[r])},${!!a.systemActive[r]},${!!(b.flags[r]&B.VENTING)},${!!(b.flags[r]&B.OVERLOADED)},${jStr(a.engineState[r])}]`;
      decide ||=motionChanged||key!==this.multirateAssignmentKey||stateKey!==this.multirateStateKey;
      this.multirateAssignmentKey=key;this.multirateStateKey=stateKey;
    }
    if(decide){
      t=row(order?.type==='ENGAGE'||order?.type==='AVOID'?order.targetShipId:undefined);
      if(!valid(t))t=row(assignment?.targetId);
      if(!valid(t))t=-1;
      if(t<0&&!assignment){
        const preferred=hostilePreselection>=0?hostilePreselection:batch.bridge.rowOf.get(this.targetShip)??-1;if(valid(preferred))t=preferred;
      }
      this.tacticalTargetId=t>=0?a.ids[t]:undefined;
    }
    const phase=b.shieldType[r]===3,window=policy.imminentWindow+(phase?b.phaseUpDuration[r]:0);
    const recovery=2+(phase?b.phaseDownDuration[r]+b.phaseCooldownDuration[r]:b.shieldUnfoldDuration[r]),horizon=Math.max(window,b.ventTime[r]+recovery);
    // The first-tick differential exposed module forecastRemaining changing
    // from -1 to a sampled clock. Native ship hooks alone never granted that
    // cadence: the original scene also had to carry weaponThreatEnvelope.
    const compact=FORECAST_INTERVAL>0&&(scene.compactThreatForecastEligible??!!scene.weaponThreatEnvelope)&&!!a.nativeForecast[r],
      firstForecast=this.forecastRemaining<0;
    this.forecastRemaining-=Math.max(0,dt);
    const refreshForecast=!compact||firstForecast||this.forecastRemaining<=1e-9||this.forecastDefenseWindow!==window||this.forecastRosterSize!==v.bodyCount;
    const needsThreatList = (!!this.ship.system.definition.advanceAI && !hasNativeThreatPhaseAI(this.ship.system.definition) && !hasExactThreatPhaseAI(this.ship.system.definition))
      || (!!this.ship.systems[1]?.definition.advanceAI && !hasNativeThreatPhaseAI(this.ship.systems[1].definition) && !hasExactThreatPhaseAI(this.ship.systems[1].definition))
      || (!!this.ship.defenseSystem.definition.advanceAI && !hasNativeThreatPhaseAI(this.ship.defenseSystem.definition) && !hasExactThreatPhaseAI(this.ship.defenseSystem.definition));
    const threat=solveAIThreat(v,r,horizon,window,refreshForecast?horizon:Math.min(horizon,window),scene.weaponThreatFrameEligible===true,!needsThreatList);
    if(refreshForecast){
      if (threat.farWeaponEarliest !== undefined) {
        this.forecastFarThreat = Number.isFinite(threat.farWeaponEarliest);
        this.forecastEarliest = threat.farWeaponEarliest;
      } else {
        this.forecastFarThreat=false;this.forecastEarliest=Infinity;
        for(const incoming of threat.threats)if(incoming.kind==='WEAPON'&&incoming.eta>window){this.forecastFarThreat=true;this.forecastEarliest=Math.min(this.forecastEarliest,incoming.eta);}
      }
      this.forecastRemaining=!compact?-1:firstForecast?(this.tacticalPhase+1)*FORECAST_INTERVAL/3:FORECAST_INTERVAL+Math.min(0,this.forecastRemaining%FORECAST_INTERVAL);
      this.forecastDefenseWindow=window;this.forecastRosterSize=v.bodyCount;
    } else {threat.hasDeferredWeaponThreat=this.forecastFarThreat;threat.earliest=Math.min(threat.earliest,this.forecastEarliest);}
    this.defense.observe(dt,threat);
    const refreshProfile=()=>{
      const p=solveAIProfile(v,r,t,assignment);this.tacticalRange=p.range;this.tacticalBearing=p.relativeBearing;this.tacticalFirepower=p.firepower;this.tacticalWeapons=p.weapons;return p;
    };
    let profile=decide?refreshProfile():{range:this.tacticalRange,relativeBearing:this.tacticalBearing,firepower:this.tacticalFirepower,weapons:this.tacticalWeapons};
    const withdraw=()=>{
      if(b.fluxPercent[r]>=policy.retreatAt||!profile.weapons&&assignment?.role!=='CARRIER')this.withdrawing=t>=0;
      else if(b.fluxPercent[r]<=policy.resumeAt)this.withdrawing=false;
      if(a.doNotBackOff[r]&&!(b.flags[r]&B.VENTING))this.withdrawing=false;
      if(a.systemMode[r]==='ASSAULT')this.withdrawing=false;if(a.systemMode[r]==='EXTRACT')this.withdrawing=true;
    };
    withdraw();
    if(a.systemMode[r]==='ASSAULT'||a.systemMode[r]==='EXTRACT')order=null;
    let regroup=!order&&assignment?.task==='REGROUP'&&!a.doNotBackOff[r]&&a.systemMode[r]!=='ASSAULT'&&a.systemMode[r]!=='EXTRACT'?row(assignment.anchorId):-1;
    if(regroup>=0&&((b.flags[regroup]&(B.DEAD|B.RETREATED))||b.team[regroup]!==b.team[r]))regroup=-1;
    const disengaging=!order&&assignment?.task==='DISENGAGE'&&!a.doNotBackOff[r]&&a.systemMode[r]!=='ASSAULT'&&a.systemMode[r]!=='EXTRACT';
    let withdrawing=this.withdrawing||disengaging,hold=this.withdrawing&&b.fluxPercent[r]>policy.resumeAt&&!a.forcesAutofire[r];
    let escort=order?.type==='ESCORT'?row(order.targetShipId):-1;
    if(escort>=0&&(escort===r||(b.flags[escort]&B.DEAD)||b.team[escort]!==b.team[r]))escort=-1;
    const defending=order?.type==='DEFEND',avoiding=order?.type==='AVOID',waypoint=order?.type==='WAYPOINT'||defending?order.targetPos:undefined;
    const key=()=>`[${jStr(assignment?.role)},${regroup>=0},${jStr(regroup>=0?a.ids[regroup]:undefined)},${withdrawing},${jStr(escort>=0?a.ids[escort]:undefined)},${avoiding},${jNum(waypoint?.x)},${jNum(waypoint?.y)},${jStr(a.systemMode[r])},${!!a.systemActive[r]},${!!(b.flags[r]&B.VENTING)},${!!(b.flags[r]&B.OVERLOADED)},${jStr(a.engineState[r])}]`;
    let intentKey=key();const intentChanged=intentKey!==this.tacticalIntentKey;
    if(multirate&&intentChanged&&!decide){profile=refreshProfile();withdraw();withdrawing=this.withdrawing||disengaging;hold=this.withdrawing&&b.fluxPercent[r]>policy.resumeAt&&!a.forcesAutofire[r];intentKey=key();}
    decide ||=intentChanged;this.tacticalIntentKey=intentKey;
    let facing=this.tacticalFacing,desired={x:this.tacticalX,y:this.tacticalY},yielding=this.tacticalYielding;
    let positioning:ReturnType<typeof solveAIPosition>|undefined;
    if(attached){
      facing=b.facing[r];this.tacticalX=0;this.tacticalY=0;this.tacticalFacing=facing;this.tacticalYielding=false;
      this.tacticalPositioning=undefined;this.tacticalScoreGain=undefined;this.tacticalClearFire=undefined;yielding=false;
    } else if(decide||motionChanged){
      facing=b.facing[r];desired={x:0,y:0};
      const targetFacing=()=>Math.atan2(b.y[t]-b.y[r],b.x[t]-b.x[r])-profile.relativeBearing;
      if(regroup>=0){desired=numericRegroup(v,r,regroup,t);if(t>=0)facing=targetFacing();}
      else if(escort>=0){
        const separation=b.radius[r]+b.radius[escort]+220;
        desired=positionVelocity(v,r,b.x[escort]+-Math.cos(b.facing[escort])*separation,b.y[escort]+-Math.sin(b.facing[escort])*separation,b.vx[escort],b.vy[escort],120);
        facing=t>=0?targetFacing():b.facing[escort];
      } else if(avoiding&&t>=0){
        let x=b.x[r]-b.x[t],y=b.y[r]-b.y[t];if(length(x,y)<1){x=-1;y=0;}const k=b.maxSpeed[r]/length(x,y);desired={x:x*k,y:y*k};facing=targetFacing();
      } else if(waypoint){
        const dx=waypoint.x-b.x[r],dy=waypoint.y-b.y[r];if(defending&&t>=0)facing=targetFacing();else if(length(dx,dy)>policy.positionTolerance)facing=Math.atan2(dy,dx);
        desired=positionVelocity(v,r,waypoint.x,waypoint.y);
      } else if(t>=0){
        facing=targetFacing();desired=approachVelocity(v,r,t,profile.range,withdrawing,order?undefined:assignment);
        if(!order&&!withdrawing&&assignment?.role!=='CARRIER'&&!a.systemMode[r]){positioning=solveAIPosition(v,r,t,desired,profile,batch.fleetPlan);desired=positioning.velocity;}
      } else {
        desired=positionVelocity(v,r,0,0);if(length(b.x[r],b.y[r])>policy.positionTolerance)facing=Math.atan2(-b.y[r],-b.x[r]);
      }
      const cooperation=waypoint||escort>=0||avoiding||withdrawing||regroup>=0||positioning?.adjusted?{velocity:desired,yielding:false}:solveAIYield(v,r,desired);
      desired=cooperation.velocity;yielding=cooperation.yielding;
      this.tacticalX=desired.x;this.tacticalY=desired.y;this.tacticalFacing=facing;this.tacticalYielding=yielding;
      this.tacticalPositioning=positioning?.reason;this.tacticalScoreGain=positioning?.scoreGain;this.tacticalClearFire=positioning?.clearFire;
    }
    const avoidance=attached?{velocity:desired,avoiding:false}:solveAIAvoidance(v,r,desired);
    const movement=attached?attachedModuleControls:solveAISteering(v,r,avoidance.velocity,facing);
    const target=t>=0?batch.bridge.ships[t]:undefined;
    const effects:CapitalAIPlanEffects={numeric:batch,scene,target,threat,profile,assignment,facing,
      allowOffensiveManeuver:regroup<0&&!withdrawing&&escort<0&&!avoiding&&!waypoint,
      regroup:regroup>=0,disengaging,withdrawing,escort:escort>=0,avoiding,defending,waypoint:!!waypoint,
      avoidingCollision:avoidance.avoiding,yielding,attachedMotion:attached,deferred:true,compactForecast:compact};
    return this.intent({stopped:false,target:target??null,aimX:t>=0?b.x[t]:this.ship.aimTargetWorld.x,aimY:t>=0?b.y[t]:this.ship.aimTargetWorld.y,
      holdOffensiveFire:hold,movement:Object.freeze(movement),ships:scene.ships},effects);
  }

  private intent(values: Omit<CapitalAIIntent, 'owner' | 'sequence'>, effects?: CapitalAIPlanEffects): CapitalAIIntent {
    const sequence = (intentSequence.get(this) ?? 0) + 1;
    intentSequence.set(this, sequence);
    const intent: CapitalAIIntent = Object.freeze({ ...values, owner: this, sequence });
    intentState.set(intent, { stage: 'planned', effects });
    return intent;
  }

  public commitControls(intent: CapitalAIIntent): void {
    const state = intentState.get(intent);
    if (intent.owner !== this || intentSequence.get(this) !== intent.sequence || state?.stage !== 'planned')
      throw new Error('Stale, foreign or already committed AI intent');
    state.stage = 'controls';
    const ship = this.ship;
    ship.fireControlMode = 'AI'; ship.isFiringMain = false; ship.combatShips = intent.ships;
    if (intent.stopped || ship.isDead || ship.isRetreated || ship.isDocked || ship.retreating) {
      ship.clearInput(); ship.defenseFacingRad = undefined; ship.aiHoldOffensiveFire = false; ship.tacticalAI = undefined;
      return;
    }
    ship.currentTargetShip = intent.target;
    if (intent.target) { this.targetShip = intent.target; ship.aimTargetWorld.set(intent.aimX, intent.aimY); }
    ship.aiHoldOffensiveFire = intent.holdOffensiveFire;
    Object.assign(ship, intent.movement);
  }

  public commitEffects(intent: CapitalAIIntent): void {
    const state = intentState.get(intent);
    if (intent.owner !== this || intentSequence.get(this) !== intent.sequence || state?.stage !== 'controls')
      throw new Error('AI effects require current committed controls');
    state.stage = 'closed';
    const effects = state.effects;
    // A consumed intent must not retain its plan-time world or closed read leases.
    state.effects = undefined;
    const ship = this.ship;
    if (!intent.stopped && !ship.isDead && !ship.isRetreated && !ship.isDocked && !ship.retreating) this.executePlanEffects(effects!);
  }

  private refreshTacticalProfile(target: Ship | undefined, scene: TacticalWorld, assignment: FleetAssignment | undefined): ReturnType<typeof combatProfile> {
    const profile = target ? combatProfile(this.ship,target,scene.queryReads) : {range:0,relativeBearing:0,firepower:0,weapons:0};
    if (target) profile.range = fleetEngagementRange(this.ship,target,profile.range,assignment);
    this.tacticalRange=profile.range;this.tacticalBearing=profile.relativeBearing;
    this.tacticalFirepower=profile.firepower;this.tacticalWeapons=profile.weapons;
    return profile;
  }

  private updateWithdrawal(target: Ship | undefined, weapons: number, assignment: FleetAssignment | undefined): void {
    const ship = this.ship;
    if(ship.flux.fluxPercent>=policy.retreatAt||(!weapons&&assignment?.role!=='CARRIER'))this.withdrawing=!!target;
    else if(ship.flux.fluxPercent<=policy.resumeAt)this.withdrawing=false;
    if (ship.hullStats.doNotBackOff && !ship.flux.isVenting) this.withdrawing = false;
    if (ship.system.tacticalMode === 'ASSAULT') this.withdrawing = false;
    if (ship.system.tacticalMode === 'EXTRACT') this.withdrawing = true;
  }

  private decide(dt:number,order:TacticalOrder|null,world:TacticalWorld|undefined,deferred:boolean):CapitalAIIntent|undefined {
    const ship=this.ship;
    const multiratePlanning = world?.multiratePlanning === true;
    if (multiratePlanning !== this.multiratePlanningLast) {
      this.multiratePlanningLast = multiratePlanning;
      this.tacticalRemaining=-1;this.multirateRemaining=-1;this.forecastRemaining=-1;
      this.multirateAssignmentKey='';this.multirateStateKey='';
    }
    // Pilot edge commands set AI ownership before this call and clear diagnostics.
    if(ship.fireControlMode!=='AI'||!ship.tacticalAI){this.defense.reset();this.withdrawing=false;this.tacticalRemaining=-1;this.multirateRemaining=-1;this.forecastRemaining=-1;}
    if (!deferred) { ship.fireControlMode='AI';ship.isFiringMain=false; }
    if(ship.isDead||ship.isRetreated||ship.isDocked||ship.retreating){
      this.tacticalRemaining=-1;this.multirateRemaining=-1;this.forecastRemaining=-1;
      if (!deferred) {
        ship.clearInput();ship.defenseFacingRad=undefined;ship.aiHoldOffensiveFire=false;ship.tacticalAI=undefined;
        return;
      }
      return this.intent({ stopped: true, target: null, aimX: ship.aimTargetWorld.x, aimY: ship.aimTargetWorld.y,
        holdOffensiveFire: false, movement: {turnInput:0,throttle:0,strafeInput:0,brakeInput:false}, ships: world?.ships ?? [] });
    }
    const rawScene=world??{ships:[ship,this.targetShip],projectiles:[],beams:[],asteroids:[]};
    const ownReads=!deferred&&!rawScene.queryReads&&!rawScene.noteNavigationObstacle&&import.meta.env?.VITE_COMBAT_QUERY_READS!=='false'
      ?new CombatQueryReads():undefined;
    const scene=ownReads?{...rawScene,queryReads:ownReads}:rawScene;
    try {
    const attachedMotion = deferred && attachedModuleMotion(ship, scene);
    const motionChanged = attachedMotion !== this.attachedMotionLast;
    this.attachedMotionLast = attachedMotion;
    if (!deferred) ship.combatShips = scene.ships;
    const assignment=(scene.fleetPlan ?? planFleetTactics(scene.ships, order ? new Map([[ship.id,order]]) : undefined)).get(ship.id);
    const validTarget=(s:Ship)=>!s.hasVastBulk&&!s.isDead&&!s.isRetreated&&!s.isDocked&&s.isVisibleTo(ship.teamId)&&!sameTeam(s,ship);
    let scheduled: boolean;
    if (multiratePlanning) {
      const first = this.multirateRemaining < 0;
      this.multirateRemaining -= Math.max(0, dt);
      scheduled = first || this.multirateRemaining <= 1e-9;
      if (scheduled) this.multirateRemaining = first
        ? (this.multiratePhase + 1) * MULTIRATE_TACTICAL_INTERVAL / 6
        : MULTIRATE_TACTICAL_INTERVAL + Math.min(0, this.multirateRemaining % MULTIRATE_TACTICAL_INTERVAL);
      // Invalidations below refresh once without moving this fixed phase or
      // accumulating skipped decisions. No world, intent or effects are cached.
    } else {
      const first = this.tacticalRemaining < 0;
      this.tacticalRemaining -= Math.max(0, dt);
      scheduled = first || this.tacticalRemaining <= 1e-9 || TACTICAL_INTERVAL === 0;
      if (scheduled) this.tacticalRemaining = TACTICAL_INTERVAL === 0 ? 0
        : first ? (this.tacticalPhase + 1) * TACTICAL_INTERVAL / 3
        : TACTICAL_INTERVAL + Math.min(0, this.tacticalRemaining % TACTICAL_INTERVAL);
    }
    // Orders may be edited in place; compare their values, not their object identity.
    const orderKey = order ? `[${jStr(order.id)},${jStr(order.type)},${jStr(order.targetShipId)},${jNum(order.targetPos?.x)},${jNum(order.targetPos?.y)},${jNum(order.issuedTime)}]` : '';
    let target = ship.currentTargetShip ?? undefined;
    let decide = scheduled || orderKey !== this.tacticalOrderKey || target?.id !== this.tacticalTargetId
      || !!target && (!validTarget(target) || !scene.ships.includes(target));
    this.tacticalOrderKey = orderKey;
    if (multiratePlanning) {
      // IDs/roles/tasks are discrete assignment edges. Score, pressure, assigned
      // power and the continuously moving approach bearing are NOT invalidators.
      const assignmentKey = `[${jStr(assignment?.role)},${jStr(assignment?.task)},${jStr(assignment?.targetId)},${jStr(assignment?.anchorId)},${assignment?.approachBearing == null}]`;
      // Track the physical attachment even when the native attached-motion
      // capability is absent; switching that capability also needs a fresh plan.
      const mount = ship.moduleMount;
      const stateKey = `[${jStr(ship.parentShip?.id)},${jStr(mount?.slotId)},${jNum(mount?.x)},${jNum(mount?.y)},${jNum(mount?.angleDeg)},${jNum(ship.teamId)},${jNum(ship.hullStats.doNotBackOff as unknown as number)},${jStr(ship.system.tacticalMode)},${!!ship.system.isActive},${!!ship.flux.isVenting},${!!ship.flux.isOverloaded},${jStr(ship.engineController.state)}]`;
      decide ||= motionChanged || assignmentKey !== this.multirateAssignmentKey || stateKey !== this.multirateStateKey;
      this.multirateAssignmentKey=assignmentKey;this.multirateStateKey=stateKey;
    }
    if (decide) {
      const orderedId=order?.type==='ENGAGE'||order?.type==='AVOID'?order.targetShipId:undefined;
      target=scene.ships.find(s=>s.id===orderedId&&validTarget(s))
        ?? scene.ships.find(s=>s.id===assignment?.targetId&&validTarget(s));
      if(!target&&!assignment)target=scene.ships.find(s=>s===this.targetShip&&validTarget(s));
      this.tacticalTargetId = target?.id;
    }
    if (!deferred) {
      if(target){this.targetShip=target;ship.currentTargetShip=target;ship.aimTargetWorld.copy(target.pos);}else ship.currentTargetShip=null;
    }
    const phase=ship.shield.type==='PHASE';
    const defenseWindow=policy.imminentWindow+(phase?ship.shield.phaseChargeUpDuration:0);
    // Native vent module accounts for the WHOLE vent plus defense recovery, not only its target.
    const recovery=2+(phase?ship.shield.phaseChargeDownDuration+ship.shield.phaseCooldownDuration:ship.shield.unfoldDuration);
    const horizon=Math.max(defenseWindow,ship.flux.getTimeToVent()+recovery);
    const compactForecast = FORECAST_INTERVAL > 0 && (scene.compactThreatForecastEligible ?? !!scene.weaponThreatEnvelope) && ship.hasNativeThreatPhaseHooks;
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
    let profile = decide
      ? this.refreshTacticalProfile(target,scene,assignment)
      : {range:this.tacticalRange,relativeBearing:this.tacticalBearing,firepower:this.tacticalFirepower,weapons:this.tacticalWeapons};
    this.updateWithdrawal(target,profile.weapons,assignment);
    if (ship.system.tacticalMode === 'ASSAULT' || ship.system.tacticalMode === 'EXTRACT') order = null;
    const regroup= !order && assignment?.task==='REGROUP' && !ship.hullStats.doNotBackOff && ship.system.tacticalMode!=='ASSAULT' && ship.system.tacticalMode!=='EXTRACT'
      ? scene.ships.find(s=>s.id===assignment.anchorId&&!s.isDead&&!s.isRetreated&&sameTeam(s,ship)) : undefined;
    const disengaging = !order && assignment?.task==='DISENGAGE' && !ship.hullStats.doNotBackOff
      && ship.system.tacticalMode!=='ASSAULT' && ship.system.tacticalMode!=='EXTRACT';
    let withdrawing = this.withdrawing || disengaging;
    // Movement retreat/regroup is not a ceasefire. Hold only while recovering high flux;
    // safe in-range weapons can otherwise cover the withdrawal.
    let holdOffensiveFire=this.withdrawing && ship.flux.fluxPercent>policy.resumeAt && !ship.system.forcesAutofire;
    if (!deferred) ship.aiHoldOffensiveFire = holdOffensiveFire;
    const escort=order?.type==='ESCORT'?scene.ships.find(other=>other.id===order.targetShipId&&sameTeam(other, ship)&&!other.isDead&&other!==ship):undefined;
    const defending=order?.type==='DEFEND';
    const avoiding=order?.type==='AVOID';
    const waypoint=order?.type==='WAYPOINT'||defending?order.targetPos:undefined;
    const formatIntentKey = () => `[${jStr(assignment?.role)},${!!regroup},${jStr(regroup?.id)},${withdrawing},${jStr(escort?.id)},${avoiding},${jNum(waypoint?.x)},${jNum(waypoint?.y)},${jStr(ship.system.tacticalMode)},${!!ship.system.isActive},${!!ship.flux.isVenting},${!!ship.flux.isOverloaded},${jStr(ship.engineController.state)}]`;
    let intentKey = formatIntentKey();
    const intentChanged = intentKey !== this.tacticalIntentKey;
    if (multiratePlanning && intentChanged && !decide) {
      // Withdrawal and lost escort/cover can invalidate after profile selection.
      // Refresh the profile too, BEFORE steering/system effects use the new intent.
      // The legacy path deliberately retains its existing invalidation ordering.
      profile=this.refreshTacticalProfile(target,scene,assignment);
      this.updateWithdrawal(target,profile.weapons,assignment);
      withdrawing=this.withdrawing||disengaging;
      holdOffensiveFire=this.withdrawing && ship.flux.fluxPercent>policy.resumeAt && !ship.system.forcesAutofire;
      if (!deferred) ship.aiHoldOffensiveFire = holdOffensiveFire;
      intentKey=formatIntentKey();
    }
    decide ||= intentChanged;
    this.tacticalIntentKey = intentKey;
    let positioning: CombatPositionChoice | undefined;
    let facing=this.tacticalFacing,desired=new Vector2(this.tacticalX,this.tacticalY);
    let cooperation = {velocity:desired,yielding:this.tacticalYielding};
    if (attachedMotion) {
      facing=ship.facingRad;
      this.tacticalX=0;this.tacticalY=0;this.tacticalFacing=facing;this.tacticalYielding=false;
      this.tacticalPositioning=undefined;this.tacticalScoreGain=undefined;this.tacticalClearFire=undefined;
      cooperation={velocity:desired,yielding:false};
    } else if (decide || motionChanged) {
      facing=ship.facingRad;desired=new Vector2();
      if(regroup){
        desired=regroupVelocity(ship,regroup,target,scene.queryReads);
        if(target)facing=target.pos.clone().sub(ship.pos).heading()-profile.relativeBearing;
      }else if(escort){
        // Web escort policy: follow behind the protected hull at collision-safe separation.
        const separation=ship.spec.collisionRadius+escort.spec.collisionRadius+220;
        const station=escort.pos.clone().add(new Vector2(-Math.cos(escort.facingRad)*separation,-Math.sin(escort.facingRad)*separation));
        desired=velocityToPosition(ship,station,escort.vel,120,scene.queryReads);
        facing=target?target.pos.clone().sub(ship.pos).heading()-profile.relativeBearing:escort.facingRad;
      }else if(avoiding&&target){
        const away=ship.pos.clone().sub(target.pos);if(away.length()<1)away.set(-1,0);
        desired=away.scale(queryMotionStats(ship,scene.queryReads).maxSpeed/away.length());
        facing=target.pos.clone().sub(ship.pos).heading()-profile.relativeBearing;
      }else if(waypoint){
        const delta=new Vector2(waypoint.x,waypoint.y).sub(ship.pos);
        if(defending&&target)facing=target.pos.clone().sub(ship.pos).heading()-profile.relativeBearing;
        else if(delta.length()>policy.positionTolerance)facing=delta.heading();
        desired=velocityToPosition(ship,new Vector2(waypoint.x,waypoint.y),undefined,undefined,scene.queryReads);
      }else if(target){
        facing=target.pos.clone().sub(ship.pos).heading()-profile.relativeBearing;
        desired=fleetApproachVelocity(ship,target,profile.range,withdrawing,order?undefined:assignment,scene.queryReads);
        if (!order && !withdrawing && assignment?.role !== 'CARRIER' && !ship.system.tacticalMode) {
          positioning = chooseCombatVelocity(ship,target,desired,profile,scene);
          desired = positioning.velocity;
        }
      } else {
        // No omniscient lock through fog: approach the public battlefield centre to search.
        const centre = new Vector2();
        desired=velocityToPosition(ship,centre,undefined,undefined,scene.queryReads);
        if (ship.pos.length()>policy.positionTolerance) facing=centre.sub(ship.pos).heading();
      }
      cooperation=waypoint||escort||avoiding||withdrawing||regroup||positioning?.adjusted?{velocity:desired,yielding:false}:yieldFireLane(ship,desired,scene);
      this.tacticalX=cooperation.velocity.x;this.tacticalY=cooperation.velocity.y;this.tacticalFacing=facing;
      this.tacticalYielding=cooperation.yielding;this.tacticalPositioning=positioning?.reason;
      this.tacticalScoreGain=positioning?.scoreGain;this.tacticalClearFire=positioning?.clearFire;
    }
    // Urgent avoidance and steering read the CURRENT scene and motion limits,
    // not a cached throttle/turn command. Defense and system AI below are also live.
    const avoidance=attachedMotion?{velocity:desired,avoiding:false}:avoidCollisions(ship,cooperation.velocity,scene);
    const movement = attachedMotion ? attachedModuleControls : planVelocity(ship,avoidance.velocity,facing,scene.queryReads);
    if (!deferred) Object.assign(ship, movement);
    const allowOffensiveManeuver = !regroup && !withdrawing && !escort && !avoiding && !waypoint;
    const effects: CapitalAIPlanEffects = {
      scene: rawScene, target, threat, profile, assignment, facing, allowOffensiveManeuver,
      regroup: !!regroup, disengaging, withdrawing, escort: !!escort, avoiding,
      defending, waypoint: !!waypoint, avoidingCollision: avoidance.avoiding,
      yielding: cooperation.yielding, attachedMotion, deferred, compactForecast,
    };
    ownReads?.close();
    // The legacy comparison must not pay for unused plan ownership/validation.
    if (!deferred) { this.executePlanEffects(effects); return; }
    return this.intent({ stopped: false, target: target ?? null,
      aimX: target?.pos.x ?? ship.aimTargetWorld.x, aimY: target?.pos.y ?? ship.aimTargetWorld.y,
      holdOffensiveFire, movement: Object.freeze(movement), ships: scene.ships }, effects);
    } finally { ownReads?.close(); }
  }

  /** All native world writes stay here, AFTER controls and in original AI order.
   * A planning record is not permission to reuse closed observation indexes for
   * live venting or to execute authored callbacks in another realm. */
  private executePlanEffects(program: CapitalAIPlanEffects): void {
    const ship = this.ship;
    const { scene, target, profile, assignment, facing, allowOffensiveManeuver,
      regroup, disengaging, withdrawing, escort, avoiding, defending, waypoint,
      avoidingCollision, yielding, attachedMotion, deferred, compactForecast } = program;
    const numeric=program.numeric;
    const changedSystem=(system:typeof ship.system)=>{
      if(!numeric||!system.definition.advanceAI)return;
      // Audited native AI only writes this owner. Exact authored systems can
      // update assembly statistics, so refresh the family. Unknown callbacks may
      // write anywhere; revoke the observation before the next demanded query.
      if(hasNativeThreatPhaseAI(system.definition))numeric.changed(ship);
      else if(hasExactThreatPhaseAI(system.definition))numeric.changed(ship,true);
      else numeric.invalidate();
    };
    let threat = program.threat;
    if(target&&!ship.flux.isVenting&&!ship.flux.isOverloaded){
      // System callbacks decide activation only; they no longer rewrite stationkeeping or shield orders.
      const runSystemAI = (system: typeof ship.system) => {
        if (!system.definition.advanceAI) return;
        const modifiers=system.definition.modifiers?.({...system,state:'ACTIVE',effectLevel:1} as typeof system,ship.flux.maxFlux);
        const boostSpeed=ship.spec.maxSpeed+(modifiers?.speedFlat??0);
        system.definition.advanceAI({ship,system,world:scene,target,distance:ship.pos.distanceTo(target.pos),angleDiff:signedAngle(facing-ship.facingRad),
          tactical:Object.assign(withSystemForwardInput(
            {allowOffensiveManeuver,desiredRange:profile.range,withdrawing:withdrawing||!!regroup,waypoint:!!waypoint,avoidingCollision:avoidingCollision||yielding},
            system,scene,() => numeric?numeric.forward(ship,Math.max(boostSpeed,ship.vel.length()),Math.max(policy.avoidanceLookahead,system.chargeUpDuration+system.chargeDownDuration))
              :forwardPathClear(ship,scene,Math.max(boostSpeed,ship.vel.length()),Math.max(policy.avoidanceLookahead,system.chargeUpDuration+system.chargeDownDuration))),
            {quietFor:this.defense.quietFor,threat})});
        changedSystem(system);
      };
      runSystemAI(ship.system);
      if (ship.systems[1]) runSystemAI(ship.systems[1]);
      if (ship.spec.rightClickSystemType !== undefined) runSystemAI(ship.defenseSystem);
    }
    if (target && ship.spec.rightClickSystemType === undefined && ship.defenseSystem.definition.advanceAI) {
      ship.defenseSystem.definition.advanceAI({ ship, system: ship.defenseSystem, target, distance: ship.pos.distanceTo(target.pos), angleDiff: signedAngle(facing-ship.facingRad),
        tactical: { allowOffensiveManeuver, desiredRange: profile.range, withdrawing: withdrawing||!!regroup, waypoint: !!waypoint, avoidingCollision: avoidingCollision, forwardClear: true, quietFor: this.defense.quietFor, threat } });
      changedSystem(ship.defenseSystem);
    }
    const defense=this.defense.update(ship,threat,numeric || deferred || compactForecast || scene.weaponThreatFrame ? () => {
      if(numeric){
        threat=numeric.threat(ship);this.forecastRemaining=-1;return threat;
      }
      // System AI above may have changed the scene. Never commit a vent using
      // sampled far-threat absence or advance the calm timer a second time.
      const livePhase = ship.shield.type === 'PHASE';
      const liveWindow = policy.imminentWindow + (livePhase ? ship.shield.phaseChargeUpDuration : 0);
      const liveRecovery = 2 + (livePhase ? ship.shield.phaseChargeDownDuration + ship.shield.phaseCooldownDuration : ship.shield.unfoldDuration);
      // Plan-time indexes may already be closed. Venting always rechecks live
      // effects/defense changes without any phase observation or advisory cache.
      const liveScene = deferred ? { ...scene, queryReads:undefined, weaponThreatFrame:undefined, weaponThreatEnvelope:undefined,
        exactWeaponThreatEnvelope:undefined, projectileThreatIndex:undefined, beamThreatIndex:undefined,
        navigationObstacleIndex:undefined, friendlyFireLaneIndex:undefined }
        : scene.weaponThreatFrame ? {...scene,weaponThreatFrame:undefined} : scene;
      threat = assessThreats(ship,liveScene,
        Math.max(liveWindow,ship.flux.getTimeToVent()+liveRecovery),liveWindow);
      this.forecastRemaining = -1;
      return threat;
    } : undefined);
    numeric?.changed(ship);
    ship.tacticalAI={fleetRole:assignment?.role,fleetTask:regroup?'REGROUP':disengaging?'DISENGAGE':assignment?.task==='REGROUP'||assignment?.task==='DISENGAGE'?(target?'PRESSURE':'SEARCH'):assignment?.task,targetScore:assignment?.score,pressureRatio:assignment?.pressureRatio,assignedPower:assignment?.assignedPower,
      mode:regroup?'WITHDRAW':escort?'ESCORT':avoiding?'AVOID':defending?'DEFEND':waypoint?'WAYPOINT':!target?'IDLE':withdrawing?'WITHDRAW':'ENGAGE',desiredRange:profile.range,
      ...(attachedMotion?{motionRole:'ATTACHED' as const}:{}),
      positioning:this.tacticalPositioning,positionScoreGain:this.tacticalScoreGain,clearFireFraction:this.tacticalClearFire,
      desiredFacing:facing,availableFirepower:profile.firepower,avoidingCollision:avoidingCollision,yieldingFireLane:yielding,
      incomingDamage:threat.imminentDamage,incomingShieldFlux:threat.imminentShieldFlux,
      earliestThreat:Number.isFinite(threat.earliest)?threat.earliest:null,ventSafe:defense.ventSafe,defense:defense.state};
  }

}
