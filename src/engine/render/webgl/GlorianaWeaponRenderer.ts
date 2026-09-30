import { GLORIANA_TORPEDO_ID, glorianaTorpedoTextures, torpedoLoadSlice, validLoadedMissileLevels } from '../../visual/GlorianaTorpedoVisuals';
import { chargeCellLevel, glorianaArtSize, glorianaChargeCells, glorianaRecoilProfiles, recoilSlice } from '../../visual/GlorianaWeaponVisuals';
import type { WeaponArtRect } from '../../visual/GlorianaWeaponVisuals';
import type { RenderWeapon } from '../ShipRenderState';
import type { WebGLPassContext } from './WebGLPassContext';

/** Texture-window animation only: same approved bitmap, pivot and weapon collision/muzzle data. */
export function renderGlorianaRecoil(ctx: WebGLPassContext, mount: RenderWeapon, texture: WebGLTexture,
  x: number, y: number, facing: number, tint: number, alpha: number): boolean {
  const p = glorianaRecoilProfiles[mount.spec.id];
  if (!p || mount.recoil < .002 || mount.isDisabled) return false;
  const angle = facing + Math.PI / 2, cos = Math.cos(angle), sin = Math.sin(angle);
  const draw = (source: WeaponArtRect, destination = source) => {
    if (destination.height <= 0) return;
    const dx = destination.x + destination.width/2 - p.width/2, dy = destination.y + destination.height/2 - p.height/2;
    ctx.batcher.drawSprite(texture, x+dx*cos-dy*sin, y+dx*sin+dy*cos, destination.width,destination.height,angle,0,0,
      tint,tint,tint,alpha,source.x/p.width,source.y/p.height,(source.x+source.width)/p.width,(source.y+source.height)/p.height);
  };
  for (const rect of p.fixed) draw(rect);
  for (const rect of p.barrels) { const slice = recoilSlice(rect,mount.recoil,p.travel); draw(slice.source,slice.destination); }
  return true;
}

/** Charge is already authoritative and projected to Workers; no timers, particles or protocol fields. */
export function renderGlorianaCharge(ctx: WebGLPassContext, mount: RenderWeapon, x:number,y:number,facing:number,alpha:number): void {
  const cells = glorianaChargeCells[mount.spec.id], size = glorianaArtSize(mount.spec.id);
  if (!cells || !size || mount.isDisabled || mount.glowAlpha <= .01 || alpha <= .001) return;
  const angle = facing+Math.PI/2, cos = Math.cos(angle), sin = Math.sin(angle);
  ctx.batcher.setBlendMode('ADDITIVE');
  for (const cell of cells) {
    const level = chargeCellLevel(mount.glowAlpha,cell.threshold);
    if (level <= .005) continue;
    const dx = cell.x+cell.width/2-size.width/2, dy = cell.y+cell.height/2-size.height/2;
    const wx = x+dx*cos-dy*sin, wy = y+dx*sin+dy*cos;
    // Confined halo and a hot narrow filament; gold trim and adjacent weapons remain legible.
    ctx.batcher.drawSprite(ctx.hitGlowTex,wx,wy,cell.width+5,cell.height+5,angle,0,0,1,.48,.12,level*.38*alpha);
    ctx.batcher.drawSprite(ctx.whiteTex,wx,wy,Math.max(.6,cell.width*.65),cell.height*.85,angle,0,0,
      1,.48+level*.35,.12+level*.4,level*.76*alpha);
  }
  ctx.batcher.setBlendMode('NORMAL');
}

/** Same pivot/size for all three layers. Reload feeds through the aft breech, with no painted cover. */
export function renderGlorianaTorpedo(ctx: WebGLPassContext, mount: RenderWeapon,
  x: number, y: number, facing: number, tint: number, alpha: number): boolean {
  if (mount.spec.id !== GLORIANA_TORPEDO_ID || !validLoadedMissileLevels(mount.loadedMissileLevels)) return false;
  const layers = glorianaTorpedoTextures.map(url => ctx.textures.getTextureInfo(url));
  if (layers.some(info => !info.texture || info.width !== 50 || info.height !== 92)) return false;
  const angle = facing + Math.PI / 2, cos = Math.cos(angle), sin = Math.sin(angle);
  ctx.batcher.drawSprite(layers[0].texture!, x,y,50,92,angle,0,0,tint,tint,tint,alpha);
  for (let rail = 0; rail < 2; rail++) {
    const {shift, height} = torpedoLoadSlice(mount.loadedMissileLevels[rail]);
    if (height < .001) continue;
    const dy = shift + height / 2 - 46;
    ctx.batcher.drawSprite(layers[rail+1].texture!,x-dy*sin,y+dy*cos,50,height,angle,0,0,
      tint,tint,tint,alpha,0,0,1,height/92);
  }
  return true;
}

/** Selected-broadside receiver indication. Never redraw the moving tubes at their rest pose. */
export function renderGlorianaOrderReceiver(ctx: WebGLPassContext, mount: RenderWeapon, texture: WebGLTexture,
  x:number,y:number,facing:number,alpha:number,level:number): void {
  const p=glorianaRecoilProfiles[mount.spec.id];
  if(!p||mount.isDisabled||mount.spec.weaponType!=='BALLISTIC'||level<=0)return;
  const angle=facing+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
  ctx.batcher.setBlendMode('ADDITIVE');
  for(const rect of p.fixed){
    const dx=rect.x+rect.width/2-p.width/2,dy=rect.y+rect.height/2-p.height/2;
    ctx.batcher.drawSprite(texture,x+dx*c-dy*s,y+dx*s+dy*c,rect.width,rect.height,angle,0,0,
      1,.67,.27,alpha*level*.22,rect.x/p.width,rect.y/p.height,(rect.x+rect.width)/p.width,(rect.y+rect.height)/p.height);
  }
  ctx.batcher.setBlendMode('NORMAL');
}
