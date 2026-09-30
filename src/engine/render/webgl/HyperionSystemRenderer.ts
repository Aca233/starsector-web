import { Vector2 } from '../../math/Vector2';
import { renderWeaponAngle } from '../ShipRenderQueries';
import { HYPERION_PROJECTILE_ID } from '../../content/HyperionIds';
import { HYPERION_FX } from '../../visual/HyperionFXAssets';
import { hyperionVisualState } from '../../visual/HyperionVisuals';
import type { ShipRenderState } from '../ShipRenderState';
import type { Projectile } from '../../simulation/Weapon';
import type { WebGLPassContext } from './WebGLPassContext';

type Point = { readonly x: number; readonly y: number };
type Color = readonly [number, number, number];
type Texture = keyof typeof HYPERION_FX;
const AMBER: Color = [1, .48, .1], HOT: Color = [1, .91, .65], BLUE: Color = [.3, .65, 1], WHITE: Color = [1, 1, 1];

/** Only retained textured sprites. No white-line pen, generated masks or glow-dot geometry. */
function sprites(ctx: WebGLPassContext, origin: Point, facing: number) {
  const c = Math.cos(facing), s = Math.sin(facing);
  const sprite = (texture: Texture, x: number, y: number, w: number, h: number, color: Color, alpha: number, angle = 0) => {
    if (alpha <= .003 || w <= 0 || h <= 0) return;
    ctx.batcher.drawSprite(ctx.textures.getTexture(HYPERION_FX[texture]),
      origin.x + x*c - y*s, origin.y + x*s + y*c, w, h,
      facing + angle, 0, 0, color[0], color[1], color[2], Math.min(1, alpha));
  };
  return {
    sprite,
    conduit: (x: number, y: number, ex: number, ey: number, width: number, color: Color, alpha: number) => {
      sprite('energy', (x+ex)/2, (y+ey)/2, Math.hypot(ex-x, ey-y), width, color, alpha, Math.atan2(ey-y, ex-x));
    },
  };
}
type Sprites = ReturnType<typeof sprites>;

function reactor(p: Sprites, side: number, time: number, level: number, color: Color) {
  const x = -30, y = side * 133;
  p.sprite('ring', x, y, 65, 65, color, level*.75, side*time*.24);
  p.sprite('plasma', x, y, 42, 42, color, level*.5, -side*time*.45);
}
function conduit(p: Sprites, side: number, time: number, level: number, color: Color) {
  // Follow the existing hull channels with the textured energy strip, not a geometric wire overlay.
  const nodes = [[-30,side*105],[28,side*37],[72,side*19],[250,side*19],[325,side*12],[369,0]];
  for (let i = 0; i < nodes.length-1; i++) {
    const [x,y] = nodes[i], [ex,ey] = nodes[i+1];
    const pulse = .66 + .16*Math.sin(time*5-i*.8);
    p.conduit(x, y, ex, ey, 6, color, level*pulse);
  }
}
function jumpAperture(p: Sprites, time: number, level: number, arriving: boolean) {
  // A translucent textured aperture crosses the hull. Its centre stays open, preserving the silhouette.
  const x = arriving ? -170 + (1-level)*510 : -200 + level*480;
  const width = 55 + 125*level, height = 510 + 80*level;
  p.sprite('corona', x, 0, width*2.1, height*1.15, WHITE, level*.85);
  p.sprite('aperture', x, 0, width, height, WHITE, level*.7);
  p.sprite('flare', x, 0, 60 + 40*level, height*.95, BLUE, level*.5);
  for (const side of [-1,1]) {
    p.sprite('cloud', x-42, side*180, 130, 78, BLUE, level*.16, side*(time*.2+.4));
  }
}

/** Called once per visible REAL hull, after copies. No recursive effects on teleport ghosts. */
export function renderHyperionSystems(ctx: WebGLPassContext, ship: ShipRenderState, pos: Point, facing: number, time: number): void {
  const state = hyperionVisualState(ship);
  if (!state.charge && !state.jumpCharge && !state.arrival && !state.assault) return;
  const p = sprites(ctx,pos,facing);
  ctx.batcher.setBlendMode('ADDITIVE');
  if (state.charge > 0) {
    const q = state.charge, power = Math.pow(q,.7);
    for (const side of [-1,1]) { reactor(p,side,time,power,AMBER); conduit(p,side,time,power,AMBER); }
    // Turbulent fire textures carry the shape; keep exposure low enough to retain their detail.
    p.sprite('cloud',369,0,115+90*q,95+80*q,AMBER,power*.34,time*.35);
    p.sprite('plasma',369,0,58+67*q,52+57*q,AMBER,power*.9,-time*.45);
    p.sprite('plasma',372,0,23+32*q,22+30*q,HOT,power*.68,time*.3);
    p.sprite('flare',369,0,28+24*q,75*q*q,HOT,power*.5);
  }
  const phase = Math.max(state.jumpCharge,state.arrival);
  if (phase > 0) {
    for (const side of [-1,1]) reactor(p,side,time,phase,BLUE);
    jumpAperture(p,time,phase,state.arrival>0);
    const plan = state.jump?.teleportVisual;
    // Failed/cancelled OUT has no successful origin and therefore never draws an arrival.
    if (state.arrival && plan?.origin) jumpAperture(sprites(ctx,plan.origin,plan.originFacing ?? facing),time,state.arrival*.65,true);
  }
  if (state.assault) {
    for (const side of [-1,1]) { reactor(p,side,time,.52,AMBER); conduit(p,side,time,.58,AMBER); }
    for (const w of ship.weapons) {
      if (w.isDisabled || w.spec.weaponType!=='ENERGY') continue;
      const url = w.mountType==='HARDPOINT' ? w.spec.hardpointGlowSpriteUrl ?? w.spec.glowSpriteUrl : w.spec.glowSpriteUrl;
      if (!url) continue;
      const info = ctx.textures.getTextureInfo(url); if (info.width <= 0 || info.height <= 0) continue;
      const c=Math.cos(facing), s=Math.sin(facing), r=w.relativePos;
      ctx.batcher.drawSprite(info.texture,pos.x+r.x*c-r.y*s,pos.y+r.x*s+r.y*c,info.width,info.height,
        (w.mountType==='HARDPOINT' ? facing+w.baseAngleDeg*Math.PI/180 : renderWeaponAngle(w,facing) ?? w.currentAngleRad)+Math.PI/2,0,0,1,.67,.25,.62+.12*Math.sin(time*9+r.x*.03));
    }
  }
  ctx.batcher.setBlendMode('NORMAL');
}

/** Render in the existing corrected/predicted projectile loop, exactly once. */
export function renderHyperionProjectile(ctx: WebGLPassContext, shot: Projectile, pos: Point, angle: number): boolean {
  if (shot.specId!==HYPERION_PROJECTILE_ID) return false;
  const fade=(shot.prevFadeProgress ?? shot.fadeProgress ?? 0)*(1-ctx.alpha)+(shot.fadeProgress ?? 0)*ctx.alpha;
  const alpha=Math.max(0,Math.min(1,1-fade));
  if (alpha<=0) return true;
  const age=shot.elapsedTime ?? 0, travel=shot.spawnLocation ? Math.hypot(pos.x-shot.spawnLocation.x,pos.y-shot.spawnLocation.y) : age*1200;
  const tail=Math.min(290,travel), p=sprites(ctx,pos,angle);
  ctx.batcher.setBlendMode('ADDITIVE');
  if (tail > .1) {
    // Native trail textures have no longitudinal fade baked in. Fade/taper their mesh
    // instead of stretching a bright rectangular sprite with a visibly cut-off end.
    const points = Array.from({length: 7}, (_, i) => {
      const t = i/6, width = 52*Math.pow(1-t,.7);
      return { pos: new Vector2(pos.x-Math.cos(angle)*tail*t, pos.y-Math.sin(angle)*tail*t),
        age: 0, duration: 1, baseWidth: width, currentWidth: width,
        u: age*1.5+t*2, alpha: alpha*Math.pow(1-t,1.2) };
    });
    ctx.batcher.flush();
    ctx.ribbonBatcher.begin(ctx.batcher.currentViewProj);
    ctx.ribbonBatcher.setAlphaDensityScale(1);
    ctx.ribbonBatcher.drawStrip(ctx.textures.getTexture(HYPERION_FX.energy,true),points,[255,150,55,200],'GLOW');
    ctx.ribbonBatcher.drawStrip(ctx.textures.getTexture(HYPERION_FX.trail,true),
      points.map(p => ({...p,currentWidth:p.currentWidth*.35})),[255,228,163,150],'GLOW');
    ctx.ribbonBatcher.end();
    ctx.batcher.resumeProgram();
  }
  p.sprite('plasma',0,0,106,81,AMBER,alpha*.95,age*.8);
  p.sprite('plasma',6,0,51,38,HOT,alpha*.8,-age);
  p.sprite('flare',8,0,38,75,HOT,alpha*.42);
  if (shot.spawnLocation && age<.24) {
    const flash=sprites(ctx,shot.spawnLocation,angle), f=(1-age/.24)*alpha;
    flash.sprite('plasma',0,0,160,120,AMBER,f*.7);
    flash.sprite('flare',0,0,130,190,HOT,f*.6);
  }
  ctx.batcher.setBlendMode('NORMAL');
  return true;
}
