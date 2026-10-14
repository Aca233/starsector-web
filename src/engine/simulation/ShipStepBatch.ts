import { hasPublishedFireMembership, fireMembershipWork } from './PublishedFireMembership';
import { ShipWeaponControlSystem } from './systems/ShipWeaponControlSystem';
import type { CombatEngine } from './CombatEngine';
import type { CombatStateCore } from './CombatStateCore';
import type { FireControlWorld } from '../ai/AutofireController';
import { FireControlQueryRoster } from '../ai/FireControlQueryBatch';
import { CombatFireFrame } from '../ai/CombatFireFrame';
import type { CombatKinematicsStore } from './CombatKinematicsStore';
import { hasNativeMotionBoundary, type Ship, type ShipStepState } from './Ship';
import type { WeaponControlStep, WeaponFirePlan } from './systems/ShipWeaponControlSystem';
import { beginStage, bindStage, closeStage, numericDecisionCoreEnabled, type StageView } from '../ai/batch/StageProducer';

type UpdateArgs = Parameters<Ship['update']>;
interface Entry {
  ship: Ship; args: UpdateArgs; state?: ShipStepState;
  weapons?: WeaponControlStep; plan?: WeaponFirePlan;
}
export type ShipStepStage = 'collect' | 'state' | 'motion' | 'weapon-state' | 'fire-query' | 'fire-commit' | 'finish' | 'closed';
type ExecutingStage = Exclude<ShipStepStage, 'collect' | 'closed'>;
const fireMembers=new WeakMap<ShipStepBatch,{owner:CombatEngine;members:Set<Ship>}>();

/** World-owned phase transaction. No awaits or entity creation during fire queries.
 * Ship.update in an AI/deck system registers work; it does not simulate that ship.
 * Per-ship resource submission stays ordered; every fire query precedes emission.
 * Transient frames/plans never become serialized Ship/Engine fields. */
export class ShipStepBatch {
  constructor(private readonly kinematics?: CombatKinematicsStore, private readonly core?: CombatStateCore, private readonly owner?:CombatEngine) {
    if(owner&&FireControlQueryRoster.isWorkerOwned(owner)&&import.meta.env?.VITE_COMBAT_STAGE_KERNEL!=='false')
      fireMembers.set(this,{owner,members:new Set(owner.ships)});
  }
  /** Actual batch provenance, not a permission flag or caller-supplied Set.
   * A contact retired during deck processing can remain in an earlier source
   * roster. It was owned when captured; its LIVE lifecycle still governs fire. */
  static ownsFireContacts(batch:ShipStepBatch|undefined,owner:CombatEngine,ships:readonly Ship[]):boolean {
    if(!batch||Object.getPrototypeOf(batch)!==ShipStepBatch.prototype)return false;
    for(const [key,fn]of [['execute',nativeBatchExecute],['enqueue',nativeBatchEnqueue]] as const){
      const own=Object.getOwnPropertyDescriptor(batch,key),proto=Object.getOwnPropertyDescriptor(ShipStepBatch.prototype,key);
      if(own&&(!('value'in own)||own.value!==fn)||proto?.value!==fn)return false;
    }
    const captured=fireMembers.get(batch);
    return !!captured&&captured.owner===owner&&batch.stage==='fire-query'&&ships.every(ship=>captured.members.has(ship));
  }
  private readonly entries: Entry[] = [];
  private readonly ships: Ship[] = [];
  private readonly members = new Set<Ship>();
  private readonly receipts = new Map<Ship, (() => void)[]>();
  private readonly rosters = new Map<readonly Ship[], FireControlQueryRoster>();
  private stage: ShipStepStage = 'collect';
  get currentStage(): ShipStepStage { return this.stage; }
  get entityCount(): number { return this.entries.length; }
  enqueue(ship: Ship, ...args: UpdateArgs): void {
    if (this.stage !== 'collect' || this.members.has(ship)) throw new Error('Duplicate or out-of-phase ship update');
    const captured=fireMembers.get(this);
    if(captured&&!captured.members.has(ship)){
      // Newly deployed craft join only through the real authority roster.
      const current=captured.owner.ships;
      if(current.includes(ship))for(const member of current)captured.members.add(member);
    }
    this.members.add(ship); this.ships.push(ship); this.entries.push({ ship, args });
  }
  afterShip(ship: Ship, receipt: () => void): void {
    if (this.stage !== 'collect' || !this.members.has(ship)) throw new Error('Receipt requires a queued ship update');
    const callbacks = this.receipts.get(ship) ?? []; callbacks.push(receipt); this.receipts.set(ship, callbacks);
  }
  execute(afterMotion: () => void, mark?: (stage: `world:${ExecutingStage}`) => void): void {
    if (this.stage !== 'collect') throw new Error('Ship batch has already run');
    const enter = (stage: ExecutingStage) => { this.stage = stage; mark?.(`world:${stage}`); };
    let frame: CombatFireFrame | undefined;
    let numericStage: StageView | undefined;
    try {
      enter('state');
      for (const entry of this.entries) entry.state = entry.ship.prepareStep(entry.args[0], entry.args[1], entry.args[5]);
      enter('motion');
      const contacts = new Set<Ship>();
      const scanned = this.owner && FireControlQueryRoster.isWorkerOwned(this.owner)
        && import.meta.env?.VITE_COMBAT_PLANNING_PRODUCERS !== 'false' ? new Set<readonly Ship[]>() : undefined;
      for (const entry of this.entries) {
        contacts.add(entry.ship);
        const source = entry.args[5]?.ships;
        if (source && scanned && hasPublishedFireMembership(source)) {
          fireMembershipWork.nativeSources++;
          if (scanned.has(source)) {
            fireMembershipWork.reusedSources++;fireMembershipWork.skippedRows+=source.length;continue;
          }
          scanned.add(source);fireMembershipWork.uniqueSources++;fireMembershipWork.visitedRows+=source.length;
        }
        for (const ship of source ?? []) contacts.add(ship);
      }
      const core = this.core?.reconcile([...contacts]) ? this.core : undefined;
      // A custom integrator may move a later entity. In that case preserve the
      // whole batch's ordered object writes, not just the custom ship's update.
      const motion = !core && this.kinematics && this.ships.every(hasNativeMotionBoundary) ? this.kinematics : undefined;
      if (motion) {
        motion.beginMotion(this.ships);
        for (const entry of this.entries) if (entry.state) motion.queue(entry.ship, entry.state.effectiveDt);
        motion.solve();
      }
      for (const entry of this.entries) if (entry.state)
        entry.ship.integrateStep(entry.state, core?.move(entry.ship,entry.state.effectiveDt) ?? motion?.commit(entry.ship));
      motion?.closeMotion();
      afterMotion();
      enter('weapon-state');
      for (const entry of this.entries) if (entry.state && entry.ship.hullHp > 0 && !entry.ship.isDead && !entry.ship.isRetreated)
        entry.weapons = entry.ship.weaponControl.advanceState(entry.state.effectiveDt, entry.ship);
      enter('fire-query');
      const contactRoster = [...contacts];
      const allNativePlanLoop = this.entries.every(entry => ShipWeaponControlSystem.hasNativePlanLoop(entry.ship.weaponControl));
      numericStage = numericDecisionCoreEnabled
        && allNativePlanLoop
        ? beginStage(this.owner, 'FIRE_QUERY', {
          ships: contactRoster, projectiles: this.owner?.projectiles, beams: this.owner?.beams
        }) : undefined;
      // The shared stage is the fire producer. Legacy frames/rosters exist only
      // for compatibility, never as an extra world codec before the new solver.
      if (!numericStage) frame = new CombatFireFrame(contactRoster, core ?? this.kinematics, this.owner, this);
      const sealScopes = frame?.numeric?.rewritesReadonlyPhase && allNativePlanLoop;
      let lastSealedScope: readonly Ship[] | undefined;
      let lastSource: FireControlWorld | undefined;
      let lastRoster: FireControlQueryRoster | undefined;
      let sharedWorld: FireControlWorld | undefined;
      for (const entry of this.entries) {
        if (!entry.state || !entry.weapons || entry.ship.hullHp <= 0 || entry.ship.isDead || entry.ship.isRetreated) continue;
        const source = entry.args[5];
        if (!source) throw new Error('Phased update needs its actual fire world');
        if (sealScopes && source.ships !== lastSealedScope) {
          lastSealedScope = source.ships;
          frame?.numeric?.sealScope(source.ships);
        }
        let roster = numericStage ? undefined : this.rosters.get(source.ships);
        if (!numericStage && !roster) { roster = FireControlQueryRoster.forStage(source.ships); this.rosters.set(source.ships, roster); }
        let world = sharedWorld;
        if (!world || source !== lastSource || roster !== lastRoster) {
          world = { ...source, queryRoster: roster, fireFrame: frame, shipStepBatch: undefined };
          bindStage(world, numericStage);
          lastSource = source;
          lastRoster = roster;
          sharedWorld = world;
        }
        entry.plan = entry.ship.weaponControl.planFire(entry.weapons, entry.state.aimAngle, entry.state.target, world);
      }
      frame?.close();
      closeStage(numericStage);
      for (const roster of this.rosters.values()) roster.close();
      enter('fire-commit');
      for (const entry of this.entries) if (entry.plan)
        entry.ship.weaponControl.commitFire(entry.plan, entry.args[2], entry.args[3], entry.args[4]);
      enter('finish');
      for (const entry of this.entries) if (entry.state) entry.ship.finishStep(entry.state);
      for (const entry of this.entries) for (const receipt of this.receipts.get(entry.ship) ?? []) receipt();
    } finally {
      this.stage = 'closed';
      fireMembers.delete(this);
      frame?.close();
      closeStage(numericStage);
      this.kinematics?.closeMotion();
      for (const roster of this.rosters.values()) roster.close();
      this.rosters.clear(); this.receipts.clear(); this.members.clear(); this.entries.length = 0; this.ships.length = 0;
    }
  }
}

const nativeBatchExecute=ShipStepBatch.prototype.execute;
const nativeBatchEnqueue=ShipStepBatch.prototype.enqueue;
