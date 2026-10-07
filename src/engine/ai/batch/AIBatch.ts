import type { Ship } from '../../simulation/Ship';
import type { CombatEngine } from '../../simulation/CombatEngine';
import type { ThreatAssessment } from '../ThreatAssessment';
import type { FleetPlan } from '../FleetTactics';
import { beginStage, stageFor } from './StageProducer';
import { aiStage, type AIStageView } from './AIInputs';
import { solveAIFleet } from './AIFleetSolver';
import { solveAIThreat } from './AIThreatSolver';
import { solveAIForwardPath } from './AINavigationSolver';
import { tacticalPolicy as policy } from '../TacticalWorld';
import { aiDomainWork } from './AIWork';
export { aiDomainWork, resetAIDomainWork, aiDomainCoverage } from './AIWork';
export { solveAIThreat } from './AIThreatSolver';
export { solveAIForwardPath, solveAIAvoidance, solveAISteering, solveAIYield } from './AINavigationSolver';
export { solveAIProfile } from './AIProfileSolver';
export { solveAIPosition } from './AIPositionSolver';
export { solveAIFleet } from './AIFleetSolver';
export { solveAIHostile } from './AITargetSolver';
export type { AIStageData, AIStageView } from './AIInputs';
export { aiStageAdmission, AI_BODY_INPUTS, AI_MOUNT_INPUTS, AI_PROJECTILE_INPUTS, AI_OBSTACLE_INPUTS } from './AIInputs';

export interface AIEffectReads {
  threat(ship:Ship):ThreatAssessment;
  forward(ship:Ship,speed:number,horizon:number):boolean;
  changed(ship:Ship,family?:boolean):void;
  invalidate():void;
}
/** Owns observation leases and pure solvers, never authority state. Every plan
 * produces a fresh CapitalAIIntent; effects reacquire their own current stage. */
export class AIBatch implements AIEffectReads {
  readonly view:AIStageView;
  readonly fleetPlan:FleetPlan;
  private effect?:AIStageView;
  private recapturePending=false;
  private stage:'plan'|'effects'|'closed'='plan';
  constructor(private readonly owner:CombatEngine,view:AIStageView) {
    this.view=view;
    const manual=new Set(owner.externallyControlledShipIds);
    if(owner.playerShip.fireControlMode!=='AI')manual.add(owner.playerShip.id);
    // Stable owner reuses FleetColumns' growing scratch across phase epochs.
    this.fleetPlan=solveAIFleet(view,owner,owner.orders,manual);
    aiDomainWork.phases++;
  }
  static create(owner:CombatEngine|undefined):AIBatch|undefined {
    aiDomainWork.phaseAttempts++;
    if(!owner){aiDomainWork.missingStage++;return;}
    const stage=stageFor(owner);
    if(!stage||stage.kind!=='AI_PLAN'){aiDomainWork.missingStage++;return;}
    const view=aiStage(stage);
    if(!view){aiDomainWork.missingAIColumns++;return;}
    return view?.kind==='AI_PLAN'?new AIBatch(owner,view):undefined;
  }
  beginEffects():void {
    if(this.stage!=='plan')throw new Error('Numeric AI effects boundary already entered');
    this.view.close();this.stage='effects';
  }
  private current():AIStageView {
    if(this.stage!=='effects')throw new Error('AI_EFFECT_READ requested outside ordered effects');
    if(!this.effect?.active){
      this.effect=aiStage(beginStage(this.owner,'AI_EFFECT_READ',{ships:this.owner.ships,
        projectiles:this.owner.projectiles,beams:this.owner.beams,asteroids:this.owner.asteroids,hulkFragments:this.owner.hulkFragments}));
      aiDomainWork.effectCaptures++;
      if(this.recapturePending){aiDomainWork.effectRecaptures++;this.recapturePending=false;}
    } else if(!this.effect.valid){this.effect.recapture();aiDomainWork.effectRecaptures++;}
    if(!this.effect)throw new Error('AI_EFFECT_READ producer admission changed during numeric commit');
    return this.effect;
  }
  threat(ship:Ship):ThreatAssessment {
    aiDomainWork.effectThreatSolves++;
    const v=this.current(),r=v.rowOf.get(ship);
    if(r===undefined)throw new Error('AI effect ship left current observation');
    const b=v.bodies,phase=b.shieldType[r]===3,window=policy.imminentWindow+(phase?b.phaseUpDuration[r]:0);
    const recovery=2+(phase?b.phaseDownDuration[r]+b.phaseCooldownDuration[r]:b.shieldUnfoldDuration[r]);
    return solveAIThreat(v,r,Math.max(window,b.ventTime[r]+recovery),window);
  }
  forward(ship:Ship,speed:number,horizon:number):boolean {
    aiDomainWork.effectForwardSolves++;
    const v=this.current(),r=v.rowOf.get(ship);
    if(r===undefined)throw new Error('AI effect ship left current observation');
    return solveAIForwardPath(v,r,speed,horizon);
  }
  changed(ship:Ship,family=false):void {
    const v=this.effect;if(!v?.active)return;
    if(!v.valid)return;
    const row=v.rowOf.get(ship);
    if(row===undefined){this.invalidate();return;}
    if(!family){v.refreshChanged([ship]);aiDomainWork.effectRowRefreshes++;return;}
    const root=v.bodies.assemblyRootRow[row],members:Ship[]=[];
    for(let i=0;i<v.bodyCount;i++)if(v.bodies.assemblyRootRow[i]===root)members.push(v.ships[i]);
    v.refreshChanged(members);
    aiDomainWork.effectFamilyRefreshes++;aiDomainWork.effectRowRefreshes+=members.length;
  }
  invalidate():void {
    // Unknown effects can deploy/despawn/reorder entities. Recapture must obtain
    // the current authority roster, not call recapture() with old plan sources.
    this.effect?.invalidate();this.effect?.close();this.effect=undefined;
    this.recapturePending=true;aiDomainWork.effectInvalidations++;
  }
  close():void {this.view.close();this.effect?.close();this.effect=undefined;this.stage='closed';}
}
