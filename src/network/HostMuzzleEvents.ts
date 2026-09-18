import { Vector2 } from '../engine/math/Vector2';
import { isImmutableMetadata } from '../engine/extensions/Immutable';
import { setMuzzleEventSink, type CombatFXSystem } from '../engine/simulation/systems/CombatFXSystem';
import { SimulationRandom } from '../engine/simulation/SimulationRandom';
import type { MuzzleFlashSpec, LauncherSmokeSpec } from '../engine/simulation/Weapon';
import { describeMuzzleStyle, MAX_MUZZLE_EVENTS, MAX_MUZZLE_PARTICLES, MAX_MUZZLE_STYLES } from './muzzle-events.mjs';
import type { MuzzleEventBatch, MuzzleEventRow, MuzzleStyleInfo } from './muzzle-events.mjs';

const clone = Vector2.prototype.clone, add = Vector2.prototype.add, fromAngle = Vector2.fromAngle;
const reserveSamples = SimulationRandom.prototype.reserveSamples;
const nativeVectors = () => Object.getOwnPropertyDescriptor(Vector2.prototype, 'clone')?.value === clone
  && Object.getOwnPropertyDescriptor(Vector2.prototype, 'add')?.value === add
  && Object.getOwnPropertyDescriptor(Vector2, 'fromAngle')?.value === fromAngle;
const vectorData = (v: Vector2): [number,number] | null => {
  if (!(v instanceof Vector2) || Object.getPrototypeOf(v) !== Vector2.prototype) return null;
  const x=Object.getOwnPropertyDescriptor(v,'x'),y=Object.getOwnPropertyDescriptor(v,'y');
  if (!x || !y || !Object.hasOwn(x,'value') || !Object.hasOwn(y,'value')
    || typeof x.value!=='number' || typeof y.value!=='number' || !Number.isFinite(x.value) || !Number.isFinite(y.value)
    || Math.abs(x.value)>1e9 || Math.abs(y.value)>1e9) return null;
  return [x.value,y.value];
};
interface StoredEvent {row:MuzzleEventRow;style:MuzzleStyleInfo;expires:number}
/** Native spawn events have a bounded replay window. Unsupported hooks/styles or
 * a full window fall back to ordinary authoritative particles; nothing is dropped. */
export class HostMuzzleEvents {
  private queue: StoredEvent[] = [];
  private styles = new Map<MuzzleStyleInfo,number>();
  private cache = [new WeakMap<object,MuzzleStyleInfo|null>(),new WeakMap<object,MuzzleStyleInfo|null>()];
  private particles = 0;
  private sequence = 0;
  private prunedAt = -1;
  constructor(fx:CombatFXSystem, private readonly clock:()=>number) {
    setMuzzleEventSink(fx,(kind,spec,pos,angle,velocity,random)=>this.emit(kind,spec,pos,angle,velocity,random));
  }
  private prune(now:number):void {
    if (now === this.prunedAt) return;
    this.prunedAt=now;
    let retained=0;
    for(const event of this.queue){
      if(event.expires>now) this.queue[retained++]=event;
      else {
        this.particles-=event.style.particles;
        const count=this.styles.get(event.style)!-1;
        if(count) this.styles.set(event.style,count); else this.styles.delete(event.style);
      }
    }
    this.queue.length=retained;
  }
  private emit(kind:0|1,spec:MuzzleFlashSpec|LauncherSmokeSpec,pos:Vector2,angle:number,velocity:Vector2,random:SimulationRandom):boolean {
    // Only audited, copied/frozen metadata can reserve its known number of draws.
    // Mutable specs and custom vector/RNG hooks keep their original callback path.
    if (!spec || !isImmutableMetadata(spec) || !nativeVectors()) return false;
    if(!pos || !velocity) return false;
    if(Object.hasOwn(pos,'clone') || Object.hasOwn(pos,'add') || Object.hasOwn(velocity,'clone') || Object.hasOwn(velocity,'add')) return false;
    const p=vectorData(pos),v=vectorData(velocity),now=this.clock();
    if(!p||!v||!Number.isFinite(angle)||Math.abs(angle)>1e9||!Number.isFinite(now)||now<0||now>1e9) return false;
    let style=this.cache[kind].get(spec);
    if(style===undefined){style=describeMuzzleStyle(kind,spec);this.cache[kind].set(spec,style);}
    if(!style) return false;
    this.prune(now);
    if(this.queue.length>=MAX_MUZZLE_EVENTS||this.particles+style.particles>MAX_MUZZLE_PARTICLES
      ||(!this.styles.has(style)&&this.styles.size>=MAX_MUZZLE_STYLES)||this.sequence>=Number.MAX_SAFE_INTEGER) return false;
    const cursor=reserveSamples.call(random,style.samples);
    if(cursor===null) return false;
    const row:MuzzleEventRow=[++this.sequence,now,0,cursor,p[0],p[1],v[0],v[1],angle];
    this.queue.push({row,style,expires:now+style.duration+2});
    this.styles.set(style,(this.styles.get(style)??0)+1);this.particles+=style.particles;
    return true;
  }
  snapshot():MuzzleEventBatch {
    const time=this.clock();this.prune(time);
    const indexes=new Map<MuzzleStyleInfo,number>(),styles:MuzzleEventBatch['styles']=[],events:MuzzleEventRow[]=[];
    for(const event of this.queue){
      let index=indexes.get(event.style);
      if(index===undefined){index=styles.length;indexes.set(event.style,index);styles.push(event.style.style);}
      const row=event.row.slice() as MuzzleEventRow;row[2]=index;events.push(row);
    }
    return {time,latest:this.sequence,styles,events};
  }
}
