import { renderArkWeaponPacket } from './ArkWeaponFXRenderer';
import { adunWeaponFxScale, sampleAdunMotion, type AdunMotionKey } from '../../visual/AdunFXAssets';
import type { Projectile, Beam } from '../../simulation/Weapon';
import type { WebGLPassContext } from './WebGLPassContext';
type Point={readonly x:number;readonly y:number};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
/** Frames are registered to a common painted origin, not independently centered or scaled. */
function drawMotion(ctx: WebGLPassContext, key: AdunMotionKey, time: number, pos: Point, angle: number,
  width: number, height: number, opacity: number, duration?: number, pivot?: readonly [number, number]): void {
  if (opacity <= 0 || width <= 0 || height <= 0) return;
  ctx.batcher.setBlendMode('ADDITIVE');
  for (const { frame, weight } of sampleAdunMotion(key, time, duration)) {
    const info = ctx.textures.getTextureInfo(frame.url);
    if (!info.texture || info.width <= 0 || info.height <= 0) throw new Error('Adun motion VFX was not preloaded: ' + frame.url);
    ctx.batcher.drawSprite(info.texture, pos.x, pos.y, width, height, angle,
      (pivot?.[0] ?? frame.pivotX) - .5, (pivot?.[1] ?? frame.pivotY) - .5, 1, 1, 1, clamp(opacity) * weight);
  }
}
/** Read authoritative phase: pause, slow motion, cancellation and replay share one clock. */
export function adunCoreLayers(state:string,level:number):readonly {key:'ignition'|'core'|'shutdown';alpha:number}[] {
  const q=clamp(level);if(!['IN','ACTIVE','OUT'].includes(state)||q<=0)return [];
  const layers:{key:'ignition'|'core'|'shutdown';alpha:number}[]=[{key:'core',alpha:.28*q*q}];
  if(state!=='ACTIVE')layers.push({key:state==='IN'?'ignition':'shutdown',alpha:.26*4*q*(1-q)});
  return layers;
}
/** Each rendered projectile is an actual authority/prediction entity; muzzle uses its real spawn. */
export function renderAdunProjectile(ctx:WebGLPassContext,p:Projectile,pos:Point,angle:number):boolean {
  if (renderArkWeaponPacket(ctx, p, pos, angle)) return true;
  const scale=adunWeaponFxScale(p.specId);if(!scale||p.specId==='web_adun_interception_prism')return false;
  const fade=(p.prevFadeProgress??p.fadeProgress??0)*(1-ctx.alpha)+(p.fadeProgress??0)*ctx.alpha,opacity=clamp(1-fade);
  const length=p.projLength??110*scale;
  const age=p.elapsedTime??0;
  drawMotion(ctx,'lance',age,pos,angle+Math.PI/2,Math.max(3,(p.projWidth??24*scale)*.7),length,opacity*.85);
  if(p.spawnLocation&&age<.12)drawMotion(ctx,'muzzle',age,p.spawnLocation,angle+Math.PI/2,32*scale,44*scale,opacity*(1-age/.12)*.8,.12);
  ctx.batcher.setBlendMode('NORMAL');return true;
}
export function renderAdunBeam(ctx:WebGLPassContext,beam:Beam):boolean {
  if(!['web_adun_interception_prism','web_ark_guard_prism'].includes(beam.specId))return false;
  const dx=beam.endPos.x-beam.startPos.x,dy=beam.endPos.y-beam.startPos.y,len=Math.hypot(dx,dy),level=clamp(beam.brightness??1);
  if(len>0&&level>0){
    drawMotion(ctx,'beam',beam.elapsedTime,{x:(beam.startPos.x+beam.endPos.x)/2,y:(beam.startPos.y+beam.endPos.y)/2},Math.atan2(dy,dx)+Math.PI/2,Math.max(.8,beam.width*.8),len,level*.5,undefined,[.5,.5]);
    // Continuous contact glow, not a fabricated stream of repeated hit events.
    if((beam.hitGlowBrightness??0)>0)drawMotion(ctx,'core',beam.elapsedTime,beam.endPos,0,7,11,(beam.hitGlowBrightness??0)*.28);
  }
  ctx.batcher.setBlendMode('NORMAL');return true;
}
/** Called only after the native thrust/status interpolation and culling. No extra layers or noise. */
export function renderAdunExhaust(ctx:WebGLPassContext,pos:Point,angle:number,width:number,length:number,opacity:number,simulationTime:number):void {
  // Generated plume points down (+image Y); engine angle points out of the nozzle (+world X).
  // Broad painted throat is registered to the nozzle; plume width is not driven by tail length.
  const plumeWidth=width*1.8;
  drawMotion(ctx,'exhaust',simulationTime,pos,angle-Math.PI/2,plumeWidth,length,opacity*.7);
  ctx.batcher.setBlendMode('NORMAL');
}

/** Authoritative hit lifetime drives a complete painted one-shot; pause holds its current frame. */
export function renderAdunImpact(ctx: WebGLPassContext, pos: Point, diameter: number, age: number, duration: number, opacity: number): void {
  drawMotion(ctx, 'impact', age, pos, 0, diameter, diameter, opacity, duration);
}

