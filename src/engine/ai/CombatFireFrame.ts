import { ShipStepBatch } from '../simulation/ShipStepBatch';
import type { CombatEngine } from '../simulation/CombatEngine';
import { NumericAcquisitionFrame, firePlaneWork } from './NumericAcquisitionFrame';
import { FireControlQueryRoster } from './FireControlQueryBatch';
import { AcquisitionRangeIndex } from './AcquisitionRangeIndex';
import { FireControlBlockerIndex } from './FireControlBlockerIndex';
import { shieldCenterOffset } from '../simulation/collision/ShieldCollisionGeometry';
import type { Ship } from '../simulation/Ship';
import type { Vector2 } from '../math/Vector2';
import type { CombatKinematicsStore } from '../simulation/CombatKinematicsStore';

import type { CombatStateCore } from '../simulation/CombatStateCore';

interface Contact {
  readonly ship: Ship; readonly pos: { x: number; y: number }; readonly vel: { x: number; y: number }; readonly radius: number;
}
/** One post-integration fire-query frame. Kinematics are numeric and immutable
 * throughout query; lifecycle/role/resource checks remain with the rule owners.
 * The shared acquisition and obstruction trees are built once per target roster,
 * not once per shooter. Closed before any emission or recoil writes. */
export class CombatFireFrame {
  private active = true;
  readonly numeric?: NumericAcquisitionFrame;
  private readonly values?: Float64Array;
  private readonly observation?: { row(ship: Ship): number | undefined; read(offset: number): number; close(): void };
  private readonly rows = new Map<Ship, number>();
  private acquisition?: AcquisitionRangeIndex<Contact>;
  private contacts?: Contact[];
  private readonly sharedPlane: boolean;
  private blockers?: FireControlBlockerIndex;
  constructor(private readonly ships: readonly Ship[], store?: CombatKinematicsStore | CombatStateCore, owner?:CombatEngine, batch?:ShipStepBatch) {
    this.observation = store?.observe(ships);
    // Only the actual private native batch can reorder pure capture. Generic or
    // observed stores retain their original read/callback order and row layout.
    const nativeCapture=!store&&import.meta.env?.VITE_COMBAT_FIRE_PLANE!=='false'
      &&!!owner&&FireControlQueryRoster.isWorkerOwned(owner)&&ShipStepBatch.ownsFireContacts(batch,owner,ships);
    if(nativeCapture)this.numeric=NumericAcquisitionFrame.create(ships,owner,batch);
    this.sharedPlane=!!this.numeric?.sharesContactPlane;
    this.values = this.observation||this.sharedPlane ? undefined : new Float64Array(ships.length * 4);
    try {
      if(this.sharedPlane){firePlaneWork.contactPlanes++;return;}
      const contacts: Contact[] = ships.map((ship, row) => {
        const offset = this.observation?.row(ship) ?? row * 4;
        if (!this.observation) {
          this.rows.set(ship, offset);
          this.values![offset]=ship.pos.x; this.values![offset+1]=ship.pos.y;
          this.values![offset+2]=ship.vel.x; this.values![offset+3]=ship.vel.y;
        }
        return { ship, pos: { x: this.read(offset), y: this.read(offset + 1) }, vel: { x: this.read(offset + 2), y: this.read(offset + 3) },
          radius: Math.max(ship.spec.collisionRadius, ship.shield.isActive && ship.shield.type !== 'NONE' && ship.shield.type !== 'PHASE'
            ? ship.shield.radius + shieldCenterOffset(ship) : 0) };
      });
      this.contacts=contacts;
      if(!nativeCapture)this.numeric = NumericAcquisitionFrame.create(ships,owner,batch);
      // Native numerical queries need no second object acquisition hierarchy.
      // Keep its captured contacts for an exact lazy fallback, never live poses.
      if(!this.numeric?.rewritesReadonlyPhase || import.meta.env?.VITE_COMBAT_STAGE_KERNEL==='false')
        this.acquisition = new AcquisitionRangeIndex(contacts, contact => contact.radius);
    } catch (error) { this.observation?.close(); throw error; }
  }
  row(ship: Ship): number | undefined {
    if (!this.active) throw new Error('Fire frame used outside its observation stage');
    return this.observation ? this.observation.row(ship) : this.sharedPlane ? this.numeric!.kinematicRow(ship) : this.rows.get(ship);
  }
  read(offset: number): number { if (!this.active) throw new Error('Closed fire kinematics'); return this.observation ? this.observation.read(offset) : this.sharedPlane ? this.numeric!.readKinematic(offset) : this.values![offset]; }
  targets(origin: Vector2, velocity: Vector2, range: number, speed: number, delay: number, beam: boolean): readonly Ship[] {
    if (!this.active) throw new Error('Closed fire acquisition frame');
    // Captured scalar rows, NEVER current live positions/shields. Even if a
    // generic query consumes the fallback, it sees the same post-motion frame.
    this.contacts ??= this.ships.map(ship=>{
      const row=this.numeric!.kinematicRow(ship)!;
      return {ship,pos:{x:this.read(row),y:this.read(row+1)},vel:{x:this.read(row+2),y:this.read(row+3)},radius:this.numeric!.contactExtent(row)};
    });
    this.acquisition ??= new AcquisitionRangeIndex(this.contacts,contact=>contact.radius);
    return this.acquisition.query(origin, velocity, range, speed, delay, beam).map(contact => contact.ship);
  }
  queryBlockers(origin: Vector2, travel: Vector2, velocity: Vector2, delay: number, time: number): readonly Ship[] {
    if (!this.active) throw new Error('Closed fire obstruction frame');
    this.blockers ??= new FireControlBlockerIndex(this.ships);
    return this.blockers.query(origin, travel, velocity, delay, time);
  }
  close(): void { this.active = false; this.observation?.close(); this.numeric?.close(); }
}
