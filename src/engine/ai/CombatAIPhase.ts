import { AttachedModuleMotionSpan } from './AttachedModuleMotion';
import { ShipDefenseController } from './ShipDefenseController';
import { SystemAIInputSpan } from './SystemAIInputs';
import { stageKernelWork,bindDecisionReadWorld } from './DecisionReadPlane';
import { CombatDecisionScene } from './CombatDecisionScene';
import type { CombatEngine } from '../simulation/CombatEngine';
import { CombatQueryReads } from './CombatQueryReads';
import { CapitalShipAI, type CapitalAIIntent } from './CapitalShipAI';
import type { TacticalOrder } from '../simulation/CombatTypes';
import type { Ship } from '../simulation/Ship';
import type { TacticalWorld } from './TacticalWorld';
import { AIBatch } from './batch/AIBatch';
import type { FleetPlan } from './FleetTactics';
import { aiDomainWork } from './batch/AIWork';

const effectPrototypes = [CapitalShipAI.prototype, ShipDefenseController.prototype].map(prototype => ({
  prototype, descriptors: Object.getOwnPropertyDescriptors(prototype)
}));
const nativeEffectMethods = () => effectPrototypes.every(({prototype, descriptors}) =>
  Object.entries(descriptors).every(([key, d]) => {
    const now = Object.getOwnPropertyDescriptor(prototype, key);
    return now?.value === d.value && now?.get === d.get && now?.set === d.set;
  }));
const nativeAIInstance = (ai: CapitalShipAI) => Object.getPrototypeOf(ai) === CapitalShipAI.prototype
  && Object.keys(effectPrototypes[0].descriptors).every(key => key === 'constructor' || !Object.hasOwn(ai, key));

/** Synchronous observation span: all native target/navigation/threat plans precede
 * every control write and every stateful system/defense callback. Not an async
 * transaction: controller memory advances while planning. Never serialize it. */
export class CombatAIPhase {
  readonly scene?:CombatDecisionScene;
  private readonly systemInputs?:SystemAIInputSpan;
  private readonly attachedMotion?:AttachedModuleMotionSpan;
  private readonly numeric?:AIBatch;
  constructor(owner?:CombatEngine,ships?:readonly Ship[]) {
    this.numeric=nativeEffectMethods()?AIBatch.create(owner):undefined;
    // Native numeric admission excludes the entire old DecisionScene/read-plane
    // preparation chain, rather than running both worlds and discarding one.
    this.scene=!this.numeric&&owner&&ships?CombatDecisionScene.create(owner,ships):undefined;
    if(this.scene&&owner&&ships) {
      this.systemInputs=SystemAIInputSpan.create(owner,ships);
      if(nativeEffectMethods())this.attachedMotion=AttachedModuleMotionSpan.create(owner,ships);
    }
  }
  get numericEnabled():boolean {return !!this.numeric;}
  get numericFleetPlan():FleetPlan|undefined {return this.numeric?.fleetPlan;}
  closeObservation():void {this.attachedMotion?.close();this.scene?.close();this.numeric?.view.close();}
  private stage: 'plan' | 'controls' | 'effects' | 'closed' = 'plan';
  private readonly entries: { ai: CapitalShipAI; intent: CapitalAIIntent; numeric:boolean; after?: () => void }[] = [];
  private readonly members = new Set<Ship>();
  get entityCount(): number { return this.entries.length; }
  has(ship: Ship): boolean { return this.members.has(ship); }
  plan(ai: CapitalShipAI, dt: number, order: TacticalOrder | null, world: TacticalWorld): void {
    if (this.stage !== 'plan' || this.members.has(ai.ship)) throw new Error('Duplicate or out-of-phase AI plan');
    this.members.add(ai.ship);
    if(this.numeric&&nativeAIInstance(ai)&&!world.noteNavigationObstacle&&this.numeric.view.rowOf.has(ai.ship)){
      try {this.entries.push({ai,intent:ai.planNumeric(dt,order,world,this.numeric),numeric:true});}
      catch(error){this.numeric.close();throw error;}
      return;
    }
    aiDomainWork.legacyPlans++;
    if(!nativeAIInstance(ai))aiDomainWork.customController++;
    if(world.noteNavigationObstacle)aiDomainWork.customWorld++;
    if(!nativeAIInstance(ai)) {this.systemInputs?.close();this.attachedMotion?.close();}
    const originalWorld = world;
    if(!world.noteNavigationObstacle&&this.scene?.matches(world.ships)&&this.scene.includes(ai.ship)) {
      this.scene.notePlan(ai.ship);
      world={...world,decisionScene:this.scene,navigationObstacleIndex:this.scene.navigation};
    }
    const shared = world.decisionScene === this.scene && this.scene?.matches(world.ships) && this.scene.includes(ai.ship)
      ? this.scene.readPlane?.reads : undefined;
    if(shared)stageKernelWork.sharedPlans++;
    const reads = shared ?? (!world.noteNavigationObstacle && import.meta.env?.VITE_COMBAT_QUERY_READS !== 'false' ? new CombatQueryReads() : undefined);
    const planWorld=reads?{...world,queryReads:reads}:world;
    if(shared&&this.scene?.readPlane) {
      bindDecisionReadWorld(planWorld,this.scene.readPlane);
      this.attachedMotion?.bind(planWorld,originalWorld);
    }
    if(world.decisionScene===this.scene&&this.scene?.matches(world.ships))this.systemInputs?.bind(planWorld,originalWorld);
    try { this.entries.push({ ai, intent: ai.plan(dt, order, planWorld),numeric:false }); }
    catch(error){if(shared)this.closeObservation();throw error;}
    finally { if (!shared) reads?.close(); }
  }
  afterShip(ship: Ship, after: () => void): void {
    const entry = this.entries.find(row => row.ai.ship === ship);
    if (this.stage !== 'plan' || !entry) throw new Error('AI receipt needs a current plan');
    entry.after = after;
  }
  execute(mark?: (stage: 'ai:controls' | 'ai:effects') => void): void {
    if (this.stage !== 'plan') throw new Error('AI phase already executed');
    this.closeObservation();
    try {
      this.stage = 'controls'; mark?.('ai:controls');
      for (const { ai, intent, numeric } of this.entries) {ai.commitControls(intent);if(numeric)aiDomainWork.controls++;}
      this.stage = 'effects'; mark?.('ai:effects');
      this.numeric?.beginEffects();
      if(!nativeEffectMethods()||!this.entries.every(({ai})=>nativeAIInstance(ai)))this.systemInputs?.close();
      this.systemInputs?.beginEffects();
      for (const { ai, intent, after, numeric } of this.entries) {
        ai.commitEffects(intent);
        if(numeric)aiDomainWork.effects++;
        // A caller-supplied receipt is not part of the audited native effect domain.
        if(after) { this.systemInputs?.close(); after();this.numeric?.invalidate(); }
      }
    } finally {
      this.systemInputs?.close();
      this.numeric?.close();
      this.stage = 'closed'; this.entries.length = 0; this.members.clear();
    }
  }
}
