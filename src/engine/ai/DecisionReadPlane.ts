import { CombatDecisionScene,nativeDecisionSceneMatches } from './CombatDecisionScene';
import { CombatQueryReads } from './CombatQueryReads';
import type { Ship } from '../simulation/Ship';
import type { WeaponMount } from '../simulation/Weapon';
import type { WeaponThreatEnvelope } from './WeaponThreatEnvelope';
import type { Asteroid } from '../simulation/CombatTypes';
import type { TacticalWorld } from './TacticalWorld';
import { Vector2 } from '../math/Vector2';

export interface PositionGun { mount: WeaponMount; range: number; power: number }
export const stageKernelWork = { planes: 0, sharedPlans: 0, batteries: 0, batteryHits: 0, rootScores: 0, moduleScores: 0,
  bodyLists: 0, bodyListHits: 0, predictions: 0, predictionHits: 0, capturedFireFrames: 0 };
const methods = (['clone','sub','add','addScaled','rotate','distanceTo','length','heading','dot','normalize'] as const)
  .map(key => [key, Vector2.prototype[key]] as const);
const maths = (['cos','sin','atan2','asin','sqrt','abs','min','max','hypot'] as const).map(key => [key, Math[key]] as const);
const nativeVector = (v: Vector2) => Object.getPrototypeOf(v) === Vector2.prototype
      && methods.every(([key]) => !Object.hasOwn(v, key))
      && ['x','y'].every(key => { const d=Object.getOwnPropertyDescriptor(v,key); return !!d && 'value' in d && typeof d.value==='number'; });

const boundDecisionWorlds=new WeakMap<TacticalWorld,{plane:DecisionReadPlane;ships:readonly Ship[];scene:TacticalWorld['decisionScene']}>();
export function bindDecisionReadWorld(world:TacticalWorld,plane:DecisionReadPlane):void {
  const sd=Object.getOwnPropertyDescriptor(world,'ships'),rd=Object.getOwnPropertyDescriptor(world,'queryReads'),dd=Object.getOwnPropertyDescriptor(world,'decisionScene');
  if(!sd||!rd||!dd||!('value'in sd)||!('value'in rd)||!('value'in dd))return;
  const scene=dd.value as TacticalWorld['decisionScene'];
  if(!scene||Object.getPrototypeOf(scene)!==CombatDecisionScene.prototype||Object.hasOwn(scene,'matches')
    ||Object.getOwnPropertyDescriptor(CombatDecisionScene.prototype,'matches')?.value!==nativeDecisionSceneMatches)return;
  if(plane.active&&rd.value===plane.reads&&scene&&Object.getOwnPropertyDescriptor(scene,'readPlane')?.value===plane&&scene.matches(sd.value))
    boundDecisionWorlds.set(world,{plane,ships:sd.value,scene});
}
export function decisionReadsFor(world:TacticalWorld):DecisionReadPlane|undefined {
  const bound=boundDecisionWorlds.get(world);
  return bound?.plane.active&&world.ships===bound.ships&&world.queryReads===bound.plane.reads&&world.decisionScene===bound.scene?bound.plane:undefined;
}
/** This plane exists only within the private synchronous, all-native ROOT+MODULE
 * plan span. Never lent to controls/effects or retained across ticks. */
export class DecisionReadPlane {
  readonly reads = new CombatQueryReads();
  private open = true;
  private readonly batteries = new Map<Ship, { envelope: WeaponThreatEnvelope | undefined; values: [PositionGun[]?, PositionGun[]?] }>();
  readonly scalar: boolean;
  private readonly asteroidAdmission=new WeakMap<readonly Asteroid[],boolean>();
  private readonly bodyLists=new Map<number,readonly Ship[]>();
  private readonly positions=new Map<Ship,Vector2>();
  positionBodies(ships:readonly Ship[],team:number):readonly Ship[] {
    if(!this.open)throw new Error('Closed decision read plane');
    const cached=this.bodyLists.get(team);if(cached){stageKernelWork.bodyListHits++;return cached;}
    const bodies=ships.filter(other=>!other.isDead&&!other.isPhased&&other.spec.hullSize!=='FIGHTER'&&other.isVisibleTo(team));
    this.bodyLists.set(team,bodies);stageKernelWork.bodyLists++;return bodies;
  }
  predictedPosition(ship:Ship):Vector2 {
    if(!this.open)throw new Error('Closed decision read plane');
    const cached=this.positions.get(ship);if(cached){stageKernelWork.predictionHits++;return cached;}
    const p=Object.getOwnPropertyDescriptor(ship,'pos'),v=Object.getOwnPropertyDescriptor(ship,'vel');
    const position=ship.pos.clone().addScaled(ship.vel,3);
    // Custom vector callbacks retain every call, even on registered diagnostic worlds.
    if(p&&v&&'value'in p&&'value'in v&&this.canScoreVectors([p.value,v.value])){
      this.positions.set(ship,position);stageKernelWork.predictions++;
    }
    return position;
  }
  private readonly vectorAdmission=new WeakMap<Vector2,boolean>();
  constructor() {
    this.scalar = methods.every(([key, fn]) => Vector2.prototype[key] === fn) && maths.every(([key, fn]) => Math[key] === fn);
    stageKernelWork.planes++;
  }
  canScoreVectors(vectors:readonly Vector2[]):boolean {
    if(!this.open||!this.scalar)return false;
    return vectors.every(v=>{let known=this.vectorAdmission.get(v);
      if(known===undefined){known=nativeVector(v);this.vectorAdmission.set(v,known);}return known;});
  }
  canScore(asteroids:readonly Asteroid[]):boolean {
    if(!this.open||!this.scalar)return false;
    const known=this.asteroidAdmission.get(asteroids);if(known!==undefined)return known;
    const native=asteroids.every(a=>{const p=Object.getOwnPropertyDescriptor(a,'pos'),v=Object.getOwnPropertyDescriptor(a,'vel');
      return !!p&&!!v&&'value'in p&&'value'in v&&nativeVector(p.value)&&nativeVector(v.value);});
    this.asteroidAdmission.set(asteroids,native);return native;
  }
  get active(): boolean { return this.open; }
  battery(ship: Ship, envelope: WeaponThreatEnvelope | undefined, stationkeeping: boolean, read: () => PositionGun[]): PositionGun[] {
    if (!this.open) throw new Error('Closed decision read plane');
    let entry=this.batteries.get(ship);
    if (!entry || entry.envelope !== envelope) { entry={envelope, values: []}; this.batteries.set(ship,entry); }
    const key=stationkeeping ? 1 : 0, cached=entry.values[key];
    if (cached) { stageKernelWork.batteryHits++; return cached; }
    const value=read(); entry.values[key]=value; stageKernelWork.batteries++; return value;
  }
  close(): void { this.open=false; this.reads.close(); this.batteries.clear(); this.bodyLists.clear();this.positions.clear(); }
}
