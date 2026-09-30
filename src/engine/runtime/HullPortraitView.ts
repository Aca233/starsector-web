import type { CombatDisplayShip } from './CombatDisplayReads';
import type { ShipSpec } from '../content/ShipSpec';
import { assemblyParts } from '../content/ModuleGeometry';
import { ArmorReadCache, type ArmorReadView } from './ArmorReadView';

export interface HullSpritePart {
  readonly id: string;
  readonly spec: Readonly<Pick<ShipSpec, 'spriteUrl'|'spriteWidth'|'spriteHeight'|'pivotX'|'pivotY'>>;
  /** Relative to the selected root, in ship-local forward/right coordinates. */
  readonly x: number; readonly y: number; readonly angle: number;
  readonly isDead: boolean;
}
export interface HullPortraitPart extends HullSpritePart {
  readonly bounds: readonly [number,number][];
  readonly canControlWeapons: boolean;
  readonly hullHp: number; readonly maxHullHp: number;
  readonly armor: ArmorReadView;
  readonly damageVersion: number;
  readonly decals: readonly {readonly url:string;readonly x:number;readonly y:number;readonly size:number;readonly rotation:number;readonly opacity:number}[];
}
/** Lightweight map silhouettes: no armor/weapon arrays on ordinary fleet contacts. */
export function captureHullSprites(root: CombatDisplayShip, byId: ReadonlyMap<string, CombatDisplayShip>): HullSpritePart[] {
  const c=Math.cos(root.facingRad),s=Math.sin(root.facingRad);
  return assemblyParts(root.spec).flatMap(part=>{
    const id=root.id+part.key.split('/').slice(1).map(index=>':module:'+index).join('');
    const ship=part.key==='root'?root:byId.get(id);
    // Missing/detached modules cannot be painted using their healthy template.
    if(!ship||ship.isRetreated||ship.isDocked)return [];
    const spec=ship.spec,dx=ship.pos.x-root.pos.x,dy=ship.pos.y-root.pos.y;
    return [{id,spec:{spriteUrl:spec.spriteUrl,spriteWidth:spec.spriteWidth,spriteHeight:spec.spriteHeight,pivotX:spec.pivotX,pivotY:spec.pivotY},
      x:ship.isDead?part.x:dx*c+dy*s,y:ship.isDead?part.y:-dx*s+dy*c,
      angle:ship.isDead?part.angle:ship.facingRad-root.facingRad,isDead:ship.isDead}];
  });
}
/** Bounds shared by map drawing and picking; a module is not a separate fleet icon. */
export function hullSpriteBounds(parts: readonly HullSpritePart[]) {
  const corners=parts.flatMap(part=>{
    const c=Math.cos(part.angle),s=Math.sin(part.angle),spec=part.spec;
    return [-spec.pivotX,spec.spriteWidth-spec.pivotX].flatMap(x=>[-spec.pivotY,spec.spriteHeight-spec.pivotY].map(y=>({x:part.y+x*c-y*s,y:-part.x+x*s+y*c})));
  });
  const minX=Math.min(0,...corners.map(p=>p.x)),maxX=Math.max(0,...corners.map(p=>p.x));
  const minY=Math.min(0,...corners.map(p=>p.y)),maxY=Math.max(0,...corners.map(p=>p.y));
  return {width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY),radius:Math.max(1,...corners.map(p=>Math.hypot(p.x,p.y)))};
}
/** Only the displayed assembly carries armor; never publish an extra Ship/AI graph. */
export class HullPortraitProjector {
  private readonly armor=new ArmorReadCache();
  capture(root: CombatDisplayShip, ships: readonly CombatDisplayShip[]): HullPortraitPart[] {
    const byId=new Map(ships.map(ship=>[ship.id,ship]));byId.set(root.id,root);
    return captureHullSprites(root,byId).map(part=>{
      const ship=byId.get(part.id)!;
      return {...part,bounds:ship.spec.bounds,canControlWeapons:ship.weapons.length>0,hullHp:ship.hullHp,maxHullHp:ship.maxHullHp,armor:this.armor.read(ship.armor),damageVersion:ship.scorchMarkVersion,
        decals:ship.scorchMarks.map(mark=>({url:`/game-assets/graphics/damage/damage_${mark.kind}48_${mark.variant}_base.png`,
          x:mark.localPos.x,y:mark.localPos.y,size:mark.size,rotation:mark.rotationRad,opacity:mark.opacity})),
      };
    });
  }
}
