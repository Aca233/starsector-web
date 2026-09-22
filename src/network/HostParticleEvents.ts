import { Vector2 } from '../engine/math/Vector2';
import { SimulationRandom } from '../engine/simulation/SimulationRandom';
import { CombatFXSystem } from '../engine/simulation/systems/CombatFXSystem';
import type { Particle } from '../engine/simulation/CombatTypes';
import { generateParticleRecipe } from '../engine/visual/DynamicParticleRecipe';
import type { ParticleRecipe } from '../engine/visual/DynamicParticleRecipe';
import { advanceRecipeParticle } from '../engine/visual/ParticleRecipeKernel';
import { setParticleEventSink } from '../engine/visual/ParticleEventSink';
import type { ParticleEventSink } from '../engine/visual/ParticleEventSink';
import { PARTICLE_EVENT_LIMITS, particleEventWeight } from './particle-events.mjs';
import type { ParticleEventBatch, ParticleEventRow } from './particle-events.mjs';
const clone = Vector2.prototype.clone, add = Vector2.prototype.add, fromAngle = Vector2.fromAngle;
const addScaled = Vector2.prototype.addScaled, scale = Vector2.prototype.scale;
const reserve = SimulationRandom.prototype.reserveSamples, fromCursor = SimulationRandom.fromCursor;
const nativeUpdate = CombatFXSystem.prototype.updateParticles;
interface Group { row: ParticleEventRow; alive: number }
type Slot = { raw: Particle } | { group: Group; index: number; life: number };
const hosts = new WeakMap<CombatFXSystem, HostParticleEvents>();
const numberData = (o: object, key: string) => { const d=Object.getOwnPropertyDescriptor(o,key);return d && Object.hasOwn(d,'value') && typeof d.value==='number' ? d.value : NaN; };
/** Only expiry occupancy runs on the authority. Motion, size and brightness are
 * generated/advanced by viewers, with exactly the old world RNG consumption. */
export class HostParticleEvents implements ParticleEventSink {
  private groups: Group[] = [];
  private order: Slot[] = [];
  private knownRaw = new WeakSet<Particle>();
  private sequence = 0;
  private step = 0;
  private epoch = 0;
  private weight = 0;
  private enabled = true;
  activeParticles = 0;
  constructor(private readonly fx: CombatFXSystem) { hosts.set(fx,this);setParticleEventSink(fx,this); }
  emit(kind: 0 | 2, pos: Vector2, count: number, color: [number,number,number], random: SimulationRandom): boolean {
    if (!this.enabled || this.fx.updateParticles !== nativeUpdate || Object.getPrototypeOf(this.fx) !== CombatFXSystem.prototype
        || Vector2.prototype.clone !== clone || Vector2.prototype.add !== add || Vector2.fromAngle !== fromAngle
        || Vector2.prototype.addScaled !== addScaled || Vector2.prototype.scale !== scale
        || !pos || Object.getPrototypeOf(pos)!==Vector2.prototype || Object.hasOwn(pos,'clone') || Object.hasOwn(pos,'add')
        || !Number.isFinite(count) || count <= 0 || count > (kind===0 ? 1e9 : 720) || (kind===2 && !Number.isInteger(count))) return false;
    const x=numberData(pos,'x'),y=numberData(pos,'y');
    if (!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>1e9||Math.abs(y)>1e9
        || !Array.isArray(color) || color.length!==3) return false;
    const rgb=[0,1,2].map(i=>numberData(color,String(i)));
    if(rgb.some(n=>!Number.isFinite(n)||n<0||n>255))return false;
    const cursor=reserve.call(random,0);
    if(cursor===null || cursor>1e18)return false;
    const recipe:ParticleRecipe=[1,kind,cursor,x,y,count,rgb[0]!,rgb[1]!,rgb[2]!,0,0];
    const weight=particleEventWeight(recipe);
    if(this.groups.length>=PARTICLE_EVENT_LIMITS.groups || this.weight+weight>PARTICLE_EVENT_LIMITS.particles
        || this.sequence>=Number.MAX_SAFE_INTEGER || this.step>=Number.MAX_SAFE_INTEGER-PARTICLE_EVENT_LIMITS.steps)return false;
    // Lifetimes affect the old density cap. Read precisely the same RNG stream,
    // but never allocate a vector/particle or run trigonometry on the authority.
    const preview=fromCursor(cursor),life:number[]=[];let samples=0;
    if(kind===0){
      let damage=Math.min(100,count);if(damage<10){samples++;if(preview.next()*10<damage)damage=10;}
      for(let i=0;i<Math.floor(damage/10);i++)life.push(1);
      samples+=life.length*5;
    }else{
      for(let i=0;i<count;i++){
        preview.next();preview.next();life.push(.22+preview.next()*.34);
        // size, end-size, color mix, peak alpha, drag, stretch.
        for(let j=0;j<6;j++)preview.next();
      }
      samples=count*9;
    }
    if(reserve.call(random,samples)===null)return false;
    if(life.length){
      this.syncRaw();
      const group:Group={row:[++this.sequence,this.step,recipe],alive:life.length};this.groups.push(group);
      for(let index=0;index<life.length;index++)this.order.push({group,index,life:life[index]!});
      this.activeParticles+=life.length;this.weight+=weight;
    }
    return true;
  }
  private syncRaw():void {
    for(const raw of this.fx.particles)if(!this.knownRaw.has(raw)){this.order.push({raw});this.knownRaw.add(raw);}
  }
  advance(dt:number):void {
    if(!this.enabled)return;
    if(dt!==1/60){this.syncRaw();this.materialize();return;}
    this.step++;
    if(!this.groups.length)return; // No extra native-particle scan on an idle lane.
    this.syncRaw();
    // Mirror the original unified array's swap-removal order. Without this,
    // removing an offloaded spark reorders the remaining native SMOKE differently
    // and changes source-over pixels, even though all particle fields match.
    for(let i=this.order.length-1;i>=0;i--){
      const slot=this.order[i]!;
      const expired='raw' in slot ? slot.raw.life-dt<=0 : (slot.life-=dt)<=0;
      if(!expired)continue;
      if('raw' in slot)this.knownRaw.delete(slot.raw);else{slot.group.alive--;this.activeParticles--;}
      const last=this.order.pop()!;if(i<this.order.length)this.order[i]=last;
    }
    let retained=0;
    for(const group of this.groups){if(group.alive)this.groups[retained++]=group;else this.weight-=particleEventWeight(group.row[2]);}
    this.groups.length=retained;
  }
  afterAdvance():void {
    if(!this.enabled || !this.order.length)return;
    let n=0;for(const slot of this.order)if('raw' in slot)this.fx.particles[n++]=slot.raw;
    this.fx.particles.length=n;
    if(!this.groups.length){this.order.length=0;this.knownRaw=new WeakSet();}
  }
  clear():void { this.groups.length=0;this.order.length=0;this.knownRaw=new WeakSet();this.weight=0;this.activeParticles=0;this.step=0;this.epoch++; }
  private materialize():void {
    const expanded=new Map<Group,Particle[]>();
    for(const group of this.groups){
      const particles=generateParticleRecipe(group.row[2]) as Particle[];
      for(let step=group.row[1];step<this.step;step++)for(const p of particles)advanceRecipeParticle(p);
      expanded.set(group,particles);
    }
    this.fx.particles.length=0;
    for(const slot of this.order)this.fx.particles.push('raw' in slot?slot.raw:expanded.get(slot.group)![slot.index]!);
    this.clear();this.enabled=false;
  }
  snapshot():ParticleEventBatch { return {version:1,epoch:this.epoch,step:this.step,latest:this.sequence,events:this.groups.map(g=>[g.row[0],g.row[1],g.row[2].slice() as ParticleRecipe])}; }
}
export const hostParticleEvents = (fx:CombatFXSystem) => hosts.get(fx);
