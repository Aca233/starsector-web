import { Vector2 } from '../math/Vector2';
import type { RenderSystem, RenderWeapon, ShipRenderState } from './ShipRenderState';

export interface GravityLensGeometry {
  x:number; y:number; endX:number; endY:number; radius:number; power:number;
  progress:number; forceSign:number; kind:0|1|2|3|4;
}
const unit=(n:number)=>Math.max(0,Math.min(1,n));

/** Shared sprite/refraction stages. Read-only: never invent a hit or a second clock. */
export function gravityFieldEffect(system:RenderSystem):GravityLensGeometry|undefined {
  const f=system.gravityField;
  if(!f || system.disabled || !system.isActive || system.state==='OUT')return;
  const base={x:f.x,y:f.y,endX:f.x,endY:f.y,forceSign:f.polarity===-1?-1:1};
  if(f.kind==='WELL')return {...base,kind:0,radius:Math.min(260,f.radius*.3),power:unit(system.effectLevel),progress:1};
  if(f.kind==='REPULSOR')return {...base,kind:2,radius:f.radius,power:Math.max(0,1-(f.age/(f.duration??.4))**2),progress:1};
  if(system.state==='IN')return {...base,kind:1,radius:f.radius,power:unit(system.effectLevel),progress:unit(system.effectLevel)};
  if(system.state==='ACTIVE' && f.collapseApplied){
    const progress=unit(f.age/(f.duration??.35));
    return {...base,kind:4,radius:f.radius*(.08+.92*Math.sqrt(progress)),power:1-progress,progress,forceSign:1};
  }
}

/** Acquisition points at the contact; HOLD points FROM the body toward its real
 * drag anchor. Localize long drags so the entire intervening fleet is not smeared. */
export function gravityTractorEffect(ship:ShipRenderState,mount:RenderWeapon,alpha:number):GravityLensGeometry|undefined {
  const s=mount.gravityTractor;
  if(!s || s.phase==='IDLE' || mount.isDisabled)return;
  const contact=new Vector2(s.contactX,s.contactY);
  if(s.phase==='CAPTURE')return {x:contact.x,y:contact.y,endX:contact.x,endY:contact.y,radius:24,power:Math.min(.55,s.capture/.22),progress:0,forceSign:1,kind:0};
  if(s.target?.kind==='SHIP' && s.target.id===ship.id)contact.copy(ship.interpolatedPos(alpha));
  const direction=new Vector2(s.anchorX-contact.x,s.anchorY-contact.y).scale(s.polarity===-1?-1:1),length=direction.length();
  if(length<12)return;
  const end=contact.clone().add(direction.normalize().scale(Math.min(160,length)));
  return {x:contact.x,y:contact.y,endX:end.x,endY:end.y,radius:22,power:Math.min(1,length/70),progress:0,forceSign:1,kind:3};
}

export function gravityPushEffect(system:RenderSystem):GravityLensGeometry|undefined {
  const p=system.gravityPush;
  if(!p?.target || !system.gravityControlHeld || system.disabled || system.state!=='ACTIVE')return;
  const length=Math.hypot(p.dx,p.dy);if(length<1e-6)return;
  return {x:p.x,y:p.y,endX:p.x+p.dx/length*140,endY:p.y+p.dy/length*140,radius:24,power:1,progress:0,forceSign:1,kind:3};
}
