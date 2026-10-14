import type { WebGLPassContext } from './WebGLPassContext';
import type { ShipRenderState } from '../ShipRenderState';
import { gravityFieldEffect, gravityTractorEffect, gravityPushEffect, type GravityLensGeometry } from '../GravityEffectGeometry';
import { GRAVITY_HULL_ID } from '../../content/GravityIds';
import { Vector2 } from '../../math/Vector2';

/** Sparse native hit-glow grains and local pressure. No blue wormhole disc,
 * continuous field circle, beam connection or invented damage event. */
export function renderGravity(ctx:WebGLPassContext,ship:ShipRenderState,time:number):void {
 if(ship.isDead||ship.hullHp<=0||ship.isDocked||ship.isRetreated)return;
 const {batcher}=ctx,pos=ship.interpolatedPos(ctx.alpha),facing=ship.interpolatedFacing(ctx.alpha);
 batcher.setBlendMode('ADDITIVE');
 const flow=(g:GravityLensGeometry,clock:number,warm:boolean)=>{
  const axis=new Vector2(g.endX-g.x,g.endY-g.y),side=new Vector2(-axis.y,axis.x).normalize(),angle=axis.heading();
  for(let i=0;i<6;i++){
   const q=(clock*.9+i/6)%1,p=Vector2.lerp(new Vector2(g.x,g.y),new Vector2(g.endX,g.endY),q).addScaled(side,(i%2?1:-1)*Math.sin(q*Math.PI)*12);
   batcher.drawSprite(ctx.hitGlowTex,p.x,p.y,2.5,15,angle+Math.PI/2,0,0,warm?.85:.74,warm?.78:.82,.8,g.power*Math.sin(q*Math.PI)*.34);
  }
 };
 for(const system of ship.allSystems){
  const f=system.gravityField,g=gravityFieldEffect(system);
  if(f&&g){
   if(g.kind===0){
    // Dust carries the field direction; the lens core never paints a blue disc.
    for(let i=0;i<14;i++){
     const q=(f.age*.19+i/14)%1,a=i*2.39996+q*.38,r=f.radius*(f.polarity===-1?q:1-q)**1.45;
     batcher.drawSprite(ctx.hitGlowTex,f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,2.5,13,a+Math.PI/2,0,0,.76,.8,.78,g.power*Math.sin(q*Math.PI)*.24);
    }
   }else if(g.kind===1){
    for(let i=0;i<16;i++){
     const a=i*Math.PI/8+g.progress*.24,r=f.radius*(1-g.progress)**1.7;
     batcher.drawSprite(ctx.hitGlowTex,f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,3,24,a+Math.PI/2,0,0,.88,.83,.7,Math.sin(g.progress*Math.PI)*.42);
    }
   }else{
    // kind 4 exists only after collapseApplied; kind 2 is the actual G front.
    for(let i=0;i<18;i++){
     const a=i*2.39996,r=g.radius*(.97+.03*Math.sin(i*13.));
     batcher.drawSprite(ctx.hitGlowTex,f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,3,22,a+Math.PI/2,0,0,.87,.84,.77,g.power*.38);
    }
    if(g.kind===4)batcher.drawSprite(ctx.hitGlowTex,f.x,f.y,48*g.power+8,48*g.power+8,0,0,0,.9,.88,.8,g.power*.42);
   }
  }
  const push=gravityPushEffect(system);if(push)flow(push,system.gravityPush!.age,true);
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
   batcher.drawSprite(ctx.hitGlowTex,deflection.x,deflection.y,14,14,0,0,0,.72,.81,.84,fade*.34);
  }
  const state=mount.gravityTractor;if(!state||state.phase==='IDLE')continue;
  const drag=gravityTractorEffect(ship,mount,ctx.alpha);
  if(drag?.kind===3)flow(drag,time,false);
  // Capture has a local acquisition shimmer, not a muzzle-to-target laser.
  const level=state.phase==='HOLD'?.2:Math.min(.55,state.capture/.22);
  const size=state.phase==='HOLD'?12:18;
  batcher.drawSprite(ctx.hitGlowTex,state.contactX,state.contactY,size,size,0,0,0,.74,.83,.81,level*.28);
 }
 batcher.setBlendMode('NORMAL');
}
