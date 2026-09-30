import { weaponArtLayout, type WeaponArtCalibration } from '../../content/WeaponInstallation';
import { renderWeaponInstallations } from './WeaponInstallationRenderer';
import type { JumpTargetPreview } from '../../runtime/JumpTargeting';
import type { ShipRenderState } from '../ShipRenderState';
import type { WebGLPassContext } from './WebGLPassContext';

/** A display-only hull/armament copy, never thrust, damage FX, shields or simulation state. */
export function renderJumpTarget(ctx: WebGLPassContext, ship: ShipRenderState, target: JumpTargetPreview): void {
  if (ship.id !== target.shipId || ship.isDead) return;
  const color = target.valid ? [.3,.82,1] : [1,.24,.16];
  const {batcher,textures,whiteTex} = ctx, p = target.position, facing = target.facing;
  batcher.setBlendMode('NORMAL');
  const line = (x:number,y:number,ex:number,ey:number,alpha:number,width=1.3) => {
    batcher.drawSprite(whiteTex,(x+ex)/2,(y+ey)/2,Math.hypot(ex-x,ey-y),width/ctx.zoom,Math.atan2(ey-y,ex-x),0,0,color[0],color[1],color[2],alpha);
  };
  // Range guide is an interface mark, not a fabricated jump/explosion effect.
  for (let i=0;i<96;i++) {
    const a=i*Math.PI/48, b=(i+.68)*Math.PI/48;
    line(target.origin.x+Math.cos(a)*target.range,target.origin.y+Math.sin(a)*target.range,
      target.origin.x+Math.cos(b)*target.range,target.origin.y+Math.sin(b)*target.range,.24);
  }
  line(target.origin.x,target.origin.y,p.x,p.y,.19);
  const hull = ship.spec;
  batcher.drawSprite(textures.getTexture(hull.spriteUrl),p.x,p.y,hull.spriteWidth,hull.spriteHeight,facing+Math.PI/2,
    hull.pivotX/hull.spriteWidth-.5,hull.pivotY/hull.spriteHeight-.5,color[0],color[1],color[2],.48);
  const sprite = (url:string|undefined,x:number,y:number,angle:number, spec: WeaponArtCalibration = {}) => {
    if (!url) return;
    const image=textures.getTextureInfo(url); if (!image.texture || image.width<=0 || image.height<=0) return;
    const art=weaponArtLayout(spec,image.width,image.height);
    batcher.drawSprite(image.texture,x,y,art.width,art.height,angle+Math.PI/2,art.pivotX-.5,art.pivotY-.5,color[0],color[1],color[2],.54);
  };
  const c=Math.cos(facing),s=Math.sin(facing);
  for (const part of hull.decorativeWeapons ?? []) sprite(part.spriteUrl,p.x+part.x*c-part.y*s,p.y+part.x*s+part.y*c,facing+part.angleDeg*Math.PI/180);
  renderWeaponInstallations(ctx,hull.weaponSlots,p.x,p.y,facing,color,.54);
  for (const mount of ship.weapons) {
    if (mount.mountType==='HIDDEN') continue;
    const hard=mount.mountType==='HARDPOINT', spec=mount.spec;
    if (hard && spec.hardpointUsesHullSprite) continue;
    const x=p.x+mount.relativePos.x*c-mount.relativePos.y*s, y=p.y+mount.relativePos.x*s+mount.relativePos.y*c;
    const angle=hard?facing+mount.baseAngleDeg*Math.PI/180:mount.currentAngleRad+facing-ship.facingRad;
    const gun=() => sprite(hard?(spec.hardpointGunSpriteUrl || spec.turretGunSpriteUrl):spec.turretGunSpriteUrl,x,y,angle,spec);
    if (spec.renderBarrelBelow) gun();
    sprite(hard?(spec.hardpointSpriteUrl || spec.turretSpriteUrl):spec.turretSpriteUrl,x,y,angle,spec);
    if (!spec.renderBarrelBelow) gun();
  }
  const r=Math.max(40,ship.spec.collisionRadius), arm=Math.min(65,r*.25);
  for (const dx of [-1,1]) for (const dy of [-1,1]) {
    line(p.x+dx*r,p.y+dy*r,p.x+dx*(r-arm),p.y+dy*r,.85,2);
    line(p.x+dx*r,p.y+dy*r,p.x+dx*r,p.y+dy*(r-arm),.85,2);
  }
  if (target.phase === 'facing') {
    const length=Math.max(100,ship.spec.collisionRadius+70),tipX=p.x+c*length,tipY=p.y+s*length;
    line(p.x,p.y,tipX,tipY,.85,2);
    for (const side of [-1,1]) line(tipX,tipY,tipX-30*c+side*17*s,tipY-30*s-side*17*c,.95,2);
  }
  // Precise center at the cursor/pivot rather than the sprite rectangle's center.
  line(p.x-8/ctx.zoom,p.y,p.x+8/ctx.zoom,p.y,.85);
  line(p.x,p.y-8/ctx.zoom,p.x,p.y+8/ctx.zoom,.85);
}
