import type { HullPortraitPart } from '../../engine/runtime/HullPortraitView';
import { getCachedImage } from './hudUtils';
import { isPointInPolygon } from '../../engine/math/Geometry';
import { shipLocalToSpritePixel } from '../../engine/render/ShipDamageVisuals';

type Palette = 'friendly' | 'enemy' | 'map';
/** Shared draw/pick transform; sprite rectangles never decide which module is selected. */
export function hullPortraitLayout(parts: readonly HullPortraitPart[], width: number, height: number, palette: Palette = 'friendly') {
  if (!parts.length) return {cx:0,cy:0,scale:1};
  const corners=parts.flatMap(part=>{
    const c=Math.cos(part.angle),s=Math.sin(part.angle),spec=part.spec;
    return [-spec.pivotX,spec.spriteWidth-spec.pivotX].flatMap(x=>[-spec.pivotY,spec.spriteHeight-spec.pivotY].map(y=>({x:part.y+x*c-y*s,y:-part.x+x*s+y*c})));
  });
  const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x));
  const minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  const radius=Math.max(1,...corners.map(p=>Math.hypot(p.x-cx,p.y-cy)));
  const scale=palette==='map'?Math.min((width-6)/Math.max(1,maxX-minX),(height-6)/Math.max(1,maxY-minY)):Math.min(width,height)*.86/(radius*2);
  return {cx,cy,scale};
}
export function pickHullPortraitPart(parts: readonly HullPortraitPart[], width: number, height: number, facing: number, x: number, y: number): HullPortraitPart | undefined {
  const {cx,cy,scale}=hullPortraitLayout(parts,width,height);
  const dx=x-width/2,dy=y-height/2,c=Math.cos(facing),s=Math.sin(facing);
  const px=(dx*c+dy*s)/scale+cx,py=(-dx*s+dy*c)/scale+cy;
  let best: HullPortraitPart | undefined, distance=Infinity;
  for (const part of parts) {
    if (part.isDead || part.hullHp<=0) continue;
    const ox=px-part.y,oy=py+part.x,pc=Math.cos(part.angle),ps=Math.sin(part.angle);
    const local={x:ox*ps-oy*pc,y:ox*pc+oy*ps};
    if (isPointInPolygon(local,part.bounds) && Math.hypot(ox,oy)<distance) {best=part;distance=Math.hypot(ox,oy);}
  }
  return best;
}
/** Per-component buffers: no global canvases, no simulation state, independent armor per part. */
export class HullPortraitPainter {
  private readonly cache = new Map<string, {canvas:HTMLCanvasElement; key:string}>();
  constructor(private readonly palette: Palette) {}
  private tile(part: HullPortraitPart, scale: number): HTMLCanvasElement | null {
    const image = getCachedImage(part.spec.spriteUrl);
    if (!image.complete || !image.naturalWidth) return null;
    const width = Math.max(1, Math.ceil(part.spec.spriteWidth*scale)), height = Math.max(1, Math.ceil(part.spec.spriteHeight*scale));
    let entry = this.cache.get(part.id);
    if (!entry) { entry = {canvas:document.createElement('canvas'),key:''}; this.cache.set(part.id, entry); }
    const key = [part.spec.spriteUrl,width,height,part.armor.dirtyVersion,part.damageVersion,part.hullHp,part.maxHullHp,part.isDead].join(':');
    if (entry.key === key) return entry.canvas;
    entry.key='';
    const canvas = entry.canvas; canvas.width=width; canvas.height=height;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.globalAlpha = Math.max(.2, Math.min(1, part.hullHp/Math.max(1,part.maxHullHp)));
    ctx.drawImage(image,0,0,width,height);ctx.globalAlpha=1;
    if (part.isDead || part.hullHp <= 0) {
      ctx.globalCompositeOperation='source-in';ctx.fillStyle='rgba(50,55,60,.35)';ctx.fillRect(0,0,width,height);
    } else {
      if(this.palette==='map') {ctx.globalCompositeOperation='source-in';ctx.fillStyle='#287a92';ctx.fillRect(0,0,width,height);}
      ctx.globalCompositeOperation='source-atop';
      const armor=part.armor, sx=width/part.spec.spriteWidth, sy=height/part.spec.spriteHeight;
      const cw=armor.cellHeight*sx, ch=armor.cellWidth*sy;
      for(let r=0;r<armor.rows;r++)for(let c=0;c<armor.cols;c++) {
        const ratio=Math.max(0,Math.min(1,armor.cells[r*armor.cols+c]/Math.max(1,armor.maxCellArmor)));
        ctx.fillStyle = this.palette==='map'
          ? ratio>.75?'rgba(54,197,201,.44)':ratio>.25?'rgba(225,175,53,.85)':ratio>.03?'rgba(208,83,20,.9)':'rgba(0,2,5,.95)'
          : ratio>.75 ? this.palette==='enemy'?`rgba(240,140,30,${.38+ratio*.25})`:`rgba(91,181,164,${.35+ratio*.25})`
            : ratio>.35?'rgba(245,210,25,.65)':ratio>.05?'rgba(235,45,30,.85)':'rgba(15,20,25,.9)';
        const p=shipLocalToSpritePixel(part.spec,{x:armor.minX+(c+.5)*armor.cellWidth,y:armor.minY+(r+.5)*armor.cellHeight});
        ctx.fillRect(p.x*sx-cw/2,p.y*sy-ch/2,Math.max(.5,cw-.5),Math.max(.5,ch-.5));
      }
      ctx.globalAlpha=this.palette==='map'?.12:.28;ctx.drawImage(image,0,0,width,height);ctx.globalAlpha=1;
      let ready=true;
      for(const mark of part.decals) {
        const decal=getCachedImage(mark.url);if(!decal.complete||!decal.naturalWidth){ready=false;continue;}
        const p=shipLocalToSpritePixel(part.spec,mark);
        ctx.save();ctx.translate(p.x*sx,p.y*sy);ctx.rotate(mark.rotation-Math.PI/2);ctx.globalAlpha=mark.opacity;
        ctx.drawImage(decal,-mark.size*sx/2,-mark.size*sy/2,mark.size*sx,mark.size*sy);ctx.restore();
      }
      if(!ready)return canvas; // Retry asynchronous decals instead of caching an incomplete tile.
    }
    entry.key=key;return canvas;
  }
  draw(ctx: CanvasRenderingContext2D, parts: readonly HullPortraitPart[], width: number, height: number, facing = 0, selectedId?: string): number {
    const active = new Set(parts.map(part=>part.id));
    for(const id of this.cache.keys())if(!active.has(id))this.cache.delete(id);
    if(!parts.length)return 0;
    const {cx,cy,scale}=hullPortraitLayout(parts,width,height,this.palette);
    ctx.save();ctx.translate(width/2,height/2);ctx.rotate(facing);ctx.scale(scale,scale);ctx.translate(-cx,-cy);
    let count=0;
    for(const part of parts) {
      const tile=this.tile(part,scale);if(!tile)continue;
      ctx.save();ctx.translate(part.y,-part.x);ctx.rotate(part.angle);
      ctx.drawImage(tile,-part.spec.pivotX,-part.spec.pivotY,part.spec.spriteWidth,part.spec.spriteHeight);ctx.restore();count++;
    }
    const selected=parts.find(part=>part.id===selectedId);
    if(selected?.bounds.length) {
      ctx.save();ctx.translate(selected.y,-selected.x);ctx.rotate(selected.angle);
      ctx.beginPath();selected.bounds.forEach(([x,y],index)=>{if(index===0)ctx.moveTo(y,-x);else ctx.lineTo(y,-x);});ctx.closePath();
      ctx.strokeStyle='#f4ffff';ctx.lineWidth=1.5/scale;ctx.stroke();ctx.restore();
    }
    ctx.restore();return count;
  }
}
