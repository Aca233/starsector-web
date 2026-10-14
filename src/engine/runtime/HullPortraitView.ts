import type { CombatDisplayShip } from './CombatDisplayReads';
import type { ShipSpec } from '../content/ShipSpec';
import { assemblyParts, type AssemblyPart } from '../content/ModuleGeometry';
import { ArmorReadCache, type ArmorReadView } from './ArmorReadView';
import { isImmutableMetadata } from '../extensions/Immutable';
import { knownProjectionKeys } from './local/RenderShipProjection';

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
interface CompiledAssemblyPart extends AssemblyPart {
  readonly idSuffix: string;
}
const compiledAssemblyCache = new WeakMap<ShipSpec, CompiledAssemblyPart[]>();
const hullSpriteSpecKeys = ['spriteUrl', 'spriteWidth', 'spriteHeight', 'pivotX', 'pivotY'];
const hullSpritePartKeys = ['id', 'spec', 'x', 'y', 'angle', 'isDead'];
const hullPortraitPartKeys = ['id', 'spec', 'x', 'y', 'angle', 'isDead', 'bounds', 'canControlWeapons', 'hullHp', 'maxHullHp', 'armor', 'damageVersion', 'decals'];
const hullDecalKeys = ['url', 'x', 'y', 'size', 'rotation', 'opacity'];

function getCompiledAssemblyParts(spec: ShipSpec): CompiledAssemblyPart[] {
  const immutable = isImmutableMetadata(spec);
  if (immutable) {
    const cached = compiledAssemblyCache.get(spec);
    if (cached) return cached;
  }
  const raw = assemblyParts(spec);
  const compiled: CompiledAssemblyPart[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const part = raw[i];
    compiled[i] = {
      spec: part.spec,
      x: part.x,
      y: part.y,
      angle: part.angle,
      key: part.key,
      idSuffix: part.key === 'root' ? '' : part.key.split('/').slice(1).map(index => ':module:' + index).join(''),
    };
  }
  if (immutable) compiledAssemblyCache.set(spec, compiled);
  return compiled;
}

/** Lightweight map silhouettes: no armor/weapon arrays on ordinary fleet contacts. */
export function captureHullSprites(root: CombatDisplayShip, byId: ReadonlyMap<string, CombatDisplayShip>): HullSpritePart[] {
  const c=Math.cos(root.facingRad),s=Math.sin(root.facingRad);
  const parts=getCompiledAssemblyParts(root.spec);
  const out: HullSpritePart[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const id = root.id + part.idSuffix;
    const ship = part.key === 'root' ? root : byId.get(id);
    // Missing/detached modules cannot be painted using their healthy template.
    if (!ship || ship.isRetreated || ship.isDocked) continue;
    const spec = ship.spec, dx = ship.pos.x - root.pos.x, dy = ship.pos.y - root.pos.y;
    out.push({
      id,
      spec: { spriteUrl: spec.spriteUrl, spriteWidth: spec.spriteWidth, spriteHeight: spec.spriteHeight, pivotX: spec.pivotX, pivotY: spec.pivotY },
      x: ship.isDead ? part.x : dx * c + dy * s,
      y: ship.isDead ? part.y : -dx * s + dy * c,
      angle: ship.isDead ? part.angle : ship.facingRad - root.facingRad,
      isDead: ship.isDead,
    });
  }
  return out;
}

export class HullSpritesProjector {
  private readonly arrays = new WeakMap<CombatDisplayShip, HullSpritePart[]>();
  private readonly records = new WeakMap<CombatDisplayShip, Map<string, Record<string, unknown>>>();
  captureReadonly(root: CombatDisplayShip, byId: ReadonlyMap<string, CombatDisplayShip>): HullSpritePart[] {
    let out = this.arrays.get(root);
    if (!out) { out = []; this.arrays.set(root, out); }
    let recs = this.records.get(root);
    if (!recs) { recs = new Map(); this.records.set(root, recs); }
    const c = Math.cos(root.facingRad), s = Math.sin(root.facingRad);
    const parts = getCompiledAssemblyParts(root.spec);
    let write = 0;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const id = root.id + part.idSuffix;
      const ship = part.key === 'root' ? root : byId.get(id);
      if (!ship || ship.isRetreated || ship.isDocked) continue;
      const spec = ship.spec, dx = ship.pos.x - root.pos.x, dy = ship.pos.y - root.pos.y;
      const x = ship.isDead ? part.x : dx * c + dy * s;
      const y = ship.isDead ? part.y : -dx * s + dy * c;
      const angle = ship.isDead ? part.angle : ship.facingRad - root.facingRad;
      let rec = recs.get(id);
      if (!rec) {
        const specRec = { spriteUrl: spec.spriteUrl, spriteWidth: spec.spriteWidth, spriteHeight: spec.spriteHeight, pivotX: spec.pivotX, pivotY: spec.pivotY };
        knownProjectionKeys.set(specRec, hullSpriteSpecKeys);
        rec = { id, spec: specRec, x, y, angle, isDead: ship.isDead };
        knownProjectionKeys.set(rec, hullSpritePartKeys);
        recs.set(id, rec);
      } else {
        const specRec = rec.spec as Record<string, unknown>;
        specRec.spriteUrl = spec.spriteUrl;
        specRec.spriteWidth = spec.spriteWidth;
        specRec.spriteHeight = spec.spriteHeight;
        specRec.pivotX = spec.pivotX;
        specRec.pivotY = spec.pivotY;
        rec.x = x; rec.y = y; rec.angle = angle; rec.isDead = ship.isDead;
      }
      out[write++] = rec as unknown as HullSpritePart;
    }
    out.length = write;
    return out;
  }
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
  private readonly byId=new Map<string, CombatDisplayShip>();
  private readonly readonlyArrays=new WeakMap<CombatDisplayShip, HullPortraitPart[]>();
  private readonly readonlyRecords=new WeakMap<CombatDisplayShip, Map<string, HullPortraitPart>>();
  capture(root: CombatDisplayShip, ships: readonly CombatDisplayShip[], readonlyCapture = false): HullPortraitPart[] {
    const byId=this.byId;
    byId.clear();
    for(let i=0;i<ships.length;i++)byId.set(ships[i].id,ships[i]);
    byId.set(root.id,root);
    if(!readonlyCapture){
      const sprites=captureHullSprites(root,byId);
      return sprites.map(part=>{
        const ship=byId.get(part.id)!;
        return {...part,bounds:ship.spec.bounds,canControlWeapons:ship.weapons.length>0,hullHp:ship.hullHp,maxHullHp:ship.maxHullHp,armor:this.armor.read(ship.armor),damageVersion:ship.scorchMarkVersion,
          decals:ship.scorchMarks.map(mark=>({url:`/game-assets/graphics/damage/damage_${mark.kind}48_${mark.variant}_base.png`,
            x:mark.localPos.x,y:mark.localPos.y,size:mark.size,rotation:mark.rotationRad,opacity:mark.opacity})),
        };
      });
    }
    let out=this.readonlyArrays.get(root);
    if(!out){out=[];this.readonlyArrays.set(root,out);}
    let records=this.readonlyRecords.get(root);
    if(!records){records=new Map();this.readonlyRecords.set(root,records);}
    const c=Math.cos(root.facingRad),s=Math.sin(root.facingRad);
    const parts=getCompiledAssemblyParts(root.spec);
    let write=0;
    for(let i=0;i<parts.length;i++){
      const part=parts[i];
      const id=root.id+part.idSuffix;
      const ship=part.key==='root'?root:byId.get(id);
      if(!ship||ship.isRetreated||ship.isDocked)continue;
      const spec=ship.spec,dx=ship.pos.x-root.pos.x,dy=ship.pos.y-root.pos.y;
      const x=ship.isDead?part.x:dx*c+dy*s;
      const y=ship.isDead?part.y:-dx*s+dy*c;
      const angle=ship.isDead?part.angle:ship.facingRad-root.facingRad;
      let rec=records.get(id) as unknown as Record<string,unknown>|undefined;
      if(!rec){
        const specRec={spriteUrl:spec.spriteUrl,spriteWidth:spec.spriteWidth,spriteHeight:spec.spriteHeight,pivotX:spec.pivotX,pivotY:spec.pivotY};
        knownProjectionKeys.set(specRec,hullSpriteSpecKeys);
        rec={id,spec:specRec,x,y,angle,isDead:ship.isDead,bounds:ship.spec.bounds,
          canControlWeapons:ship.weapons.length>0,hullHp:ship.hullHp,maxHullHp:ship.maxHullHp,
          armor:this.armor.readReadonly(ship.armor),damageVersion:-1,decals:[]};
        knownProjectionKeys.set(rec,hullPortraitPartKeys);
        records.set(id,rec as unknown as HullPortraitPart);
      } else {
        const specRec=rec.spec as Record<string,unknown>;
        specRec.spriteUrl=spec.spriteUrl;specRec.spriteWidth=spec.spriteWidth;specRec.spriteHeight=spec.spriteHeight;
        specRec.pivotX=spec.pivotX;specRec.pivotY=spec.pivotY;
        rec.x=x;rec.y=y;rec.angle=angle;rec.isDead=ship.isDead;
        rec.bounds=ship.spec.bounds;rec.canControlWeapons=ship.weapons.length>0;
        rec.hullHp=ship.hullHp;rec.maxHullHp=ship.maxHullHp;rec.armor=this.armor.readReadonly(ship.armor);
      }
      if(rec.damageVersion!==ship.scorchMarkVersion){
        rec.damageVersion=ship.scorchMarkVersion;
        const decals=rec.decals as Record<string,unknown>[];
        const marks=ship.scorchMarks;
        decals.length=marks.length;
        for(let m=0;m<marks.length;m++){
          const mark=marks[m];
          const url=`/game-assets/graphics/damage/damage_${mark.kind}48_${mark.variant}_base.png`;
          let decal=decals[m];
          if(!decal){
            decal={url,x:mark.localPos.x,y:mark.localPos.y,size:mark.size,rotation:mark.rotationRad,opacity:mark.opacity};
            knownProjectionKeys.set(decal,hullDecalKeys);
            decals[m]=decal;
          } else {
            decal.url=url;decal.x=mark.localPos.x;decal.y=mark.localPos.y;
            decal.size=mark.size;decal.rotation=mark.rotationRad;decal.opacity=mark.opacity;
          }
        }
      }
      out[write++]=rec as unknown as HullPortraitPart;
    }
    out.length=write;
    return out;
  }
}
