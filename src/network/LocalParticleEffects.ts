import type { Particle } from '../engine/simulation/CombatTypes';
import { generateParticleRecipe } from '../engine/visual/DynamicParticleRecipe';
import type { ParticleRecipe } from '../engine/visual/DynamicParticleRecipe';
import { advanceRecipeParticle } from '../engine/visual/ParticleRecipeKernel';
import { setLocalParticleLayer } from '../engine/render/LocalParticleLayer';
import { PARTICLE_EVENT_LIMITS, particleEventWeight, validateParticleEvents } from './particle-events.mjs';
import type { ParticleEventBatch, ParticleEventRow } from './particle-events.mjs';
interface Group { row:ParticleEventRow; particles?:Particle[]; steps:number }
/** Confirmed additive cosmetics only. Never writes engine particles, damage or RNG. */
export class LocalParticleEffects {
  private latest:ParticleEventBatch|undefined;
  private combatTime=0;
  private highest=0;
  private groups=new Map<number,Group>();
  private output:Particle[]=[];
  private generated=0;
  private advances=0;
  receive(value:ParticleEventBatch|undefined,combatTime:number):void {
    if(value===undefined){this.latest=undefined;this.groups.clear();this.highest=0;return;}
    const batch=validateParticleEvents(value);
    if(!Number.isFinite(combatTime)||combatTime<0)throw Error('Invalid particle display clock');
    if(this.latest && (batch.epoch<this.latest.epoch || (batch.epoch===this.latest.epoch && (batch.step<this.latest.step||batch.latest<this.latest.latest))))return;
    if(this.latest?.epoch===batch.epoch)for(const row of batch.events){
      const known=this.groups.get(row[0]);
      if(known && JSON.stringify(known.row)!==JSON.stringify(row))throw Error('Changed particle event identity');
    }
    if(this.latest?.epoch!==batch.epoch){this.groups.clear();this.highest=0;}
    // Take ownership: later packet/caller mutation cannot change replay templates.
    this.latest={...batch,events:batch.events.map(row=>[row[0],row[1],row[2].slice() as ParticleRecipe])};this.combatTime=combatTime;
    for(const row of this.latest.events)if(row[0]>this.highest)this.groups.set(row[0],{row,steps:0});
    this.highest=batch.latest;
    let weight=0;for(const {row} of this.groups.values())weight+=particleEventWeight(row[2]);
    if(this.groups.size>PARTICLE_EVENT_LIMITS.groups*2||weight>PARTICLE_EVENT_LIMITS.particles*2){
      this.groups.clear();for(const row of this.latest.events)this.groups.set(row[0],{row,steps:0});
    }
  }
  reset(engine: DisplaySource):void {setLocalParticleLayer(engine.fxSystem);this.latest=undefined;this.groups.clear();this.output.length=0;this.highest=0;}
  update(engine: DisplaySource,visualTime:number,reset=false):void {
    this.output.length=0;
    if(!this.latest || !Number.isFinite(visualTime)){setLocalParticleLayer(engine.fxSystem);return;}
    if(reset){
      // Paused/startup playback may request the same baseline every RAF. Keep
      // already generated groups; a genuine rewind is handled by age < steps.
      const previous=this.groups;this.groups=new Map();
      for(const row of this.latest.events)this.groups.set(row[0],previous.get(row[0])??{row,steps:0});
    }
    const clock=Math.min(this.latest.step+15,this.latest.step+Math.floor((visualTime-this.combatTime)*60+1e-6));
    for(const [id,group] of this.groups){
      const age=clock-group.row[1];if(age<0)continue;
      if(age>PARTICLE_EVENT_LIMITS.steps){this.groups.delete(id);continue;}
      if(!group.particles || age<group.steps){group.particles=generateParticleRecipe(group.row[2]) as Particle[];group.steps=0;this.generated+=group.particles.length;}
      while(group.steps<age){for(const p of group.particles)advanceRecipeParticle(p);group.steps++;this.advances++;}
      let alive=0;for(const p of group.particles)if(p.life>0){this.output.push(p);alive++;}
      if(!alive)this.groups.delete(id);
    }
    setLocalParticleLayer(engine.fxSystem,this.output);
  }
  stats(){return {groups:this.groups.size,particles:this.output.length,generated:this.generated,advances:this.advances,step:this.latest?.step??null};}
}

/** Minimal display capabilities; never an authority-world requirement. */
type DisplaySource = { readonly fxSystem: object };
