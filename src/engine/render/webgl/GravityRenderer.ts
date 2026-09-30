import type { WebGLPassContext } from './WebGLPassContext';
import type { ShipRenderState } from '../ShipRenderState';
import { GRAVITY_HULL_ID } from '../../content/GravityIds';
import { gravityTextures } from '../../visual/GravityVisuals';
import { Vector2 } from '../../math/Vector2';

/** Native-texture flecks and one core/pressure edge; scene bending is in GravityLensPass.
 * No laser connection, repeated orbital rings or fabricated impact events. */
export function renderGravity(ctx:WebGLPassContext,ship:ShipRenderState,time:number):void {
 if(ship.isDead||ship.hullHp<=0||ship.isDocked||ship.isRetreated)return;
 const {batcher,textures}=ctx,ring=textures.getTextureInfo(gravityTextures[0]).texture,wave=textures.getTextureInfo(gravityTextures[1]).texture;
 const pos=ship.interpolatedPos(ctx.alpha),facing=ship.interpolatedFacing(ctx.alpha);
 batcher.setBlendMode('ADDITIVE');
 for(const system of ship.allSystems){
  const f=system.gravityField;if(!f||system.disabled||!system.isActive||system.state==='OUT')continue;
  if(f.kind==='WELL'&&ring){
   const level=Math.min(1,system.effectLevel);
   // Restrained inner lens rim, not three enormous range circles.
   batcher.drawSprite(ring,f.x,f.y,96,96,-f.age*.12,0,0,.52,.66,.72,level*.28);
   for(let i=0;i<14;i++){
    const q=(f.age*.19+i/14)%1,a=i*2.39996+q*.65,r=f.radius*(1-q)**1.45;
    const opacity=level*Math.sin(q*Math.PI)*.4;
    batcher.drawSprite(ctx.hitGlowTex,f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,3.5,16,a+Math.PI/2,0,0,.66,.77,.82,opacity);
   }
  }else if(f.kind==='COLLAPSE'){
   const charging=system.state==='IN',q=charging?system.effectLevel:1,fade=charging?1:Math.max(0,1-f.age/(f.duration??.35));
   if(charging){
    for(let i=0;i<16;i++){
     const a=i*Math.PI/8+q*.24,r=f.radius*(1-q)**1.7;
     batcher.drawSprite(ctx.hitGlowTex,f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,4,28*(.4+q),a+Math.PI/2,0,0,.74,.83,.86,Math.sin(q*Math.PI)*.6);
    }
   }else if(f.collapseApplied){
    // This flash is latched by the single real damage event.
    batcher.drawSprite(ctx.hitGlowTex,f.x,f.y,80*fade+12,80*fade+12,0,0,0,.87,.9,.86,fade*.38);
   }
  }else if(f.kind==='REPULSOR'&&wave&&f.radius>0){
   const fade=Math.max(0,1-(f.age/(f.duration??.4))**2);
   batcher.drawSprite(wave,f.x,f.y,f.radius*2,f.radius*2,0,0,0,.68,.75,.77,fade*.14);
  }
 }
 if((ship.spec.sourceHullId??ship.spec.id)===GRAVITY_HULL_ID){
  for(let i=0;i<ship.spec.engineSlots.length;i++){
   const e=ship.spec.engineSlots[i],thrust=ship.engineStatuses[i]?.currentThrust??0;
   if(thrust<=.01)continue;const p=pos.clone().add(new Vector2(e.x,e.y).rotate(facing));
   batcher.drawSprite(ctx.glowTex,p.x,p.y,12,24,facing+Math.PI/2,0,0,.3,.58,.65,Math.min(.18,thrust*.18));
  }
 }
 for(const mount of ship.weapons){
  if(mount.isDisabled)continue;
  const deflection=mount.gravityDeflection;
  if(deflection){
   const fade=Math.max(0,1-deflection.age/.18);
   // A local glint only when the simulation actually deflects a projectile.
   batcher.drawSprite(ctx.hitGlowTex,deflection.x,deflection.y,14,14,0,0,0,.72,.81,.84,fade*.34);
  }
  const state=mount.gravityTractor;if(!state||state.phase==='IDLE')continue;
  const from=pos.clone().add(mount.relativePos.clone().rotate(facing)),to=new Vector2(state.contactX,state.contactY);
  const axis=to.clone().sub(from),side=new Vector2(-axis.y,axis.x).normalize(),angle=axis.heading();
  const level=state.phase==='HOLD'?1:Math.min(.55,state.capture/.22);
  // Two sparse inward paths. They indicate manipulated matter, not a beam weapon.
  for(let i=0;i<8;i++){
   const q=(time*.8+i/8)%1,p=Vector2.lerp(from,to,q).addScaled(side,(i%2?1:-1)*Math.sin(q*Math.PI)*18);
   batcher.drawSprite(ctx.hitGlowTex,p.x,p.y,3,12,angle+Math.PI/2,0,0,.7,.81,.86,level*Math.sin(q*Math.PI)*.5);
  }
  batcher.drawSprite(ctx.hitGlowTex,to.x,to.y,10,10,0,0,0,.7,.82,.85,level*.18);
 }
 batcher.setBlendMode('NORMAL');
}
