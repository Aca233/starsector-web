import { SnapshotReceiveRate } from './SnapshotPolicy';
import type { LanFrameCompletion } from './LanPresentationFrameLoop';
import type { LanPresentationRuntime } from './LanPresentationRuntime';

/** Selected page metrics only; no restored entity graph or fabricated timing. */
export interface LanWorkerTelemetry {
  ships:number; projectiles:number; explosions:number; hp:number; max:number; enemy:number; enemyMax:number;
  flux:number; capacity:number; group:number; tick:number; sim:number; capture:number; encode:number;
  appliedHz:number|null; motionHz:number|null; motionAgeMs:number|null; motionTick:number|null;
  apply:number; render:number; renderDrawCalls:number; spriteDrawCalls:number; spriteTextureSlots:number;
  renderCulling:{spritesEnabled:boolean;hullOverlaysEnabled:boolean;shipSpritesRejected:number;hullOverlaysRejected:number};
  gpu:number|null; fps:number; frameMs:number; realtimeRatio:number|null; combatRate:number|null; playbackDelay:number;
  px:number; py:number;
}
export class LanPresentationTelemetry {
  readonly applied = new SnapshotReceiveRate();
  readonly motion = new SnapshotReceiveRate();
  private applyMs=0; private renderMs=0; private gapMs=0; private delay=0;
  private frames=0; private fps=0; private windowAt=performance.now();
  reset():void {this.applied.reset();this.motion.reset();this.frames=0;this.fps=0;this.windowAt=performance.now();this.applyMs=this.renderMs=this.gapMs=this.delay=0;}
  frame(frame:LanFrameCompletion,now:number):void {
    for(let i=0;i<frame.appliedFrames;i++)this.applied.receive(now);
    if(frame.appliedFrames)this.applyMs=this.applyMs*.7+frame.applyMs*.3;
    this.renderMs=this.renderMs*.9+frame.renderMs*.1;this.gapMs=this.gapMs*.9+frame.gapMs*.1;this.delay=frame.playbackDelay;
    if(frame.drawn)this.frames++;
    if(now-this.windowAt>=500){this.fps=this.frames*1000/(now-this.windowAt);this.frames=0;this.windowAt=now;}
  }
  capture(runtime:LanPresentationRuntime,now:number,receivedAt:number):LanWorkerTelemetry {
    const w=runtime.world,p=w.playerShip,e=w.enemyShip,r=runtime.renderer,s=r.getResourceStats(),m=runtime.latest;
    const fresh=now-receivedAt<2500;
    return {ships:w.ships.length,projectiles:w.projectiles.length,explosions:w.explosions.length,hp:p.hullHp,max:p.maxHullHp,
      enemy:e.hullHp,enemyMax:e.maxHullHp,flux:p.flux.totalFlux,capacity:p.flux.maxFlux,group:p.selectedGroupIndex+1,
      tick:runtime.appliedTick,sim:m?.simulationMs??0,capture:m?.captureMs??0,encode:m?.encodeMs??0,
      appliedHz:this.applied.sample(now),motionHz:this.motion.sample(now),motionAgeMs:runtime.pipeline.motion.age(now),
      motionTick:runtime.pipeline.motion.tick<0?null:runtime.pipeline.motion.tick,
      apply:this.applyMs,render:this.renderMs,renderDrawCalls:s.drawCalls,spriteDrawCalls:r.batcher.drawCalls,spriteTextureSlots:r.batcher.textureCapacity,
      renderCulling:{spritesEnabled:import.meta.env.VITE_CULL_SPRITES!=='false',hullOverlaysEnabled:import.meta.env.VITE_CULL_DAMAGE_OVERLAYS!=='false',shipSpritesRejected:r.batcher.culledSprites,hullOverlaysRejected:r.shipPass.culledDamageOverlays},
      gpu:s.gpuTimeMs,fps:this.fps,frameMs:this.gapMs,realtimeRatio:fresh?m?.realtimeRatio??null:null,combatRate:fresh?m?.combatRate??null:null,
      playbackDelay:this.delay,px:p.pos.x,py:p.pos.y};
  }
}
