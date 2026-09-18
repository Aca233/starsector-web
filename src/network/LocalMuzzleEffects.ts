import { Vector2 } from '../engine/math/Vector2';
import type { CombatEngine } from '../engine/simulation/CombatEngine';
import type { MuzzleParticle } from '../engine/simulation/CombatTypes';
import { SimulationRandom } from '../engine/simulation/SimulationRandom';
import { appendMuzzleFlash, appendLauncherSmoke } from '../engine/visual/MuzzleParticles';
import { setLocalMuzzleLayer } from '../engine/render/LocalMuzzleLayer';
import { validateMuzzleEvents, MAX_MUZZLE_EVENTS, MAX_MUZZLE_PARTICLES } from './muzzle-events.mjs';
import type { MuzzleEventBatch, MuzzleEventRow, MuzzleStyleInfo } from './muzzle-events.mjs';
interface Group {row:MuzzleEventRow;style:MuzzleStyleInfo;particles?:Array<{particle:MuzzleParticle;x:number;y:number}>}
/** Replays confirmed cosmetic events, not firing decisions. Display time controls
 * age, so duplicate windows, skipped snapshots and reconnect never restart smoke. */
export class LocalMuzzleEffects {
  private groups=new Map<number,Group>();
  private latest:MuzzleEventBatch|undefined;
  private highest=0;
  private particleBudget=0;
  private time:number|null=null;
  private dirty=false;
  private particles:MuzzleParticle[]=[];
  receive(batch:MuzzleEventBatch|undefined):void {
    if(!batch) return;
    const styles=validateMuzzleEvents(batch);
    if(this.latest && batch.latest<this.latest.latest) return;
    this.latest=batch;
    for(const row of batch.events) if(row[0]>this.highest){
      const style=styles[row[2]];
      this.groups.set(row[0],{row:row.slice() as MuzzleEventRow,style});this.particleBudget+=style.particles;this.dirty=true;
    }
    this.highest=Math.max(this.highest,batch.latest);
    // A suspended/stale viewer must not retain unbounded earlier windows. Rebuild
    // from the latest complete retained window; no stale burst is replayed at age 0.
    if(this.groups.size>MAX_MUZZLE_EVENTS*2 || this.particleBudget>MAX_MUZZLE_PARTICLES*2){
      this.groups.clear();this.particleBudget=0;
      for(const row of batch.events){const style=styles[row[2]];this.groups.set(row[0],{row:row.slice() as MuzzleEventRow,style});this.particleBudget+=style.particles;}
      this.dirty=true;
    }
  }
  reset(engine:CombatEngine):void {
    setLocalMuzzleLayer(engine.fxSystem);this.groups.clear();this.particles.length=0;
    this.latest=undefined;this.highest=0;this.particleBudget=0;this.time=null;this.dirty=false;
  }
  update(engine:CombatEngine,visualTime:number,reset=false):void {
    if(!Number.isFinite(visualTime)){this.reset(engine);return;}
    if(reset || (this.time!==null&&(visualTime<this.time||visualTime-this.time>1))){
      const batch=this.latest;this.reset(engine);this.receive(batch);
    }
    if(this.time===visualTime&&!this.dirty)return;
    this.time=visualTime;this.dirty=false;this.particles.length=0;
    for(const [id,group] of this.groups){
      const age=visualTime-group.row[1];
      if(age>=group.style.duration){this.groups.delete(id);this.particleBudget-=group.style.particles;continue;}
      if(age<0)continue;
      if(!group.particles){
        const row=group.row,generated:MuzzleParticle[]=[],random=SimulationRandom.fromCursor(row[3]);
        const pos=new Vector2(row[4],row[5]),velocity=new Vector2(row[6],row[7]),style=group.style.style;
        if(style.kind===0)appendMuzzleFlash(generated,random,style.spec,pos,row[8],velocity);
        else appendLauncherSmoke(generated,random,style.spec,pos,row[8],velocity);
        group.particles=generated.map(particle=>({particle,x:particle.pos.x,y:particle.pos.y}));
      }
      for(const {particle,x,y} of group.particles){
        particle.life=particle.maxLife-age;
        if(particle.life<=0)continue;
        particle.pos.set(x+particle.vel.x*age,y+particle.vel.y*age);
        this.particles.push(particle);
      }
    }
    setLocalMuzzleLayer(engine.fxSystem,this.particles);
  }
}
