import type { ArkSystemMaterialRenderer } from './ArkSystemMaterialRenderer';
import { arkEmissionLayers, arkSystemEmission } from '../../visual/ArkSystemFX';
import { arkLanceArt, arkLancePose } from '../../visual/ArkLanceMotion';
import { arkNativeFieldArt, arkNativeFieldLayers, arkFieldIntensity, arkFieldBands } from '../../visual/ArkNativeField';
import { ADUN_ARK_ART, arkOwner } from '../../content/AdunArkIds';
import { arkArt, arkFrame } from '../../visual/AdunArkArt';
import { assemblyShipIds } from '../../content/ModuleGeometry';
import type { ShipRenderState } from '../ShipRenderState';
import type { WebGLPassContext } from './WebGLPassContext';
import type { ArkDamageRenderer } from './ArkDamageRenderer';
/** All five owners sample one simulation frame; damage removes an owner's entire depth stack. */
export function renderArkBody(ctx:WebGLPassContext,ship:ShipRenderState,ships:readonly ShipRenderState[],pos:{x:number;y:number},facing:number,time:number,alpha:number,damage?:ArkDamageRenderer,material?:ArkSystemMaterialRenderer):boolean {
 const owner=arkOwner(ship.spec.sourceHullId??ship.spec.id);if(!owner)return false;
 if(owner!=='CORE')return true;
 const ids=new Set(assemblyShipIds(ship.id,ship.spec));
 const live=new Map(ships.filter(s=>ids.has(s.id)&&!s.isDead&&s.hullHp>0&&!s.isRetreated&&!s.isDocked).map(s=>[arkOwner(s.spec.sourceHullId??s.spec.id),s]));
 const anchor=arkArt.parts.CORE.anchor,k=arkArt.scale;
 const aft=ships.find(part=>ids.has(part.id)&&arkOwner(part.spec.sourceHullId??part.spec.id)==='AFT'&&!part.isDead&&part.hullHp>0&&!part.isRetreated&&!part.isDocked);
 const fore=ships.find(part=>ids.has(part.id)&&arkOwner(part.spec.sourceHullId??part.spec.id)==='FORE'&&!part.isDead&&part.hullHp>0&&!part.isRetreated&&!part.isDocked);
 const lancePose=arkLancePose(fore?.weapons.find(w=>w.spec.id==='web_ark_solar_lance'),!!fore&&(fore.flux.isOverloaded||fore.flux.isVenting));
 const field=aft?arkFieldIntensity(aft.engineStatuses,ctx.alpha)*alpha:0;
 ctx.batcher.setBlendMode('NORMAL');
 for(const [index,sourceDraw] of arkFrame(time).entries()){
  const draw=sourceDraw.owner==='FORE'&&lancePose>0?{...arkLanceArt.frames[lancePose],owner:'FORE'}:sourceDraw;
  const part=live.get(draw.owner as ReturnType<typeof arkOwner>);
  if(!part)continue;
  const texture=ctx.textures.getTexture(ADUN_ARK_ART+draw.file),[w,h]=draw.size;
  ctx.batcher.drawSprite(texture,pos.x,pos.y,w*k,h*k,facing+Math.PI/2,(anchor[0]-draw.box[0])/w-.5,(anchor[1]-draw.box[1])/h-.5,1,1,1,alpha);
  // Native lower-AFT emission stays inside its owning depth layer. Later hull
  // layers can occlude it; it must never be an on-top glow over the rotating ring.
  if(aft&&field>0&&draw.owner==='AFT'&&arkNativeFieldLayers.has(draw.file)){
   const d=arkNativeFieldArt,fw=d.size[0];
   ctx.batcher.setBlendMode('ADDITIVE');
   for(const band of arkFieldBands){
    const intensity=arkFieldIntensity(aft.engineStatuses,ctx.alpha,band.onset)*alpha;
    if(intensity<=0)continue;
    const fh=band.bottom-band.top;
    ctx.batcher.drawSprite(ctx.textures.getTexture(ADUN_ARK_ART+d.file),pos.x,pos.y,fw*k,fh*k,facing+Math.PI/2,(anchor[0]-d.box[0])/fw-.5,(anchor[1]-band.top)/fh-.5,1,1,1,intensity,0,(band.top-d.box[1])/d.size[1],1,(band.bottom-d.box[1])/d.size[1]);
   }
   ctx.batcher.setBlendMode('NORMAL');
  }
  const power=arkSystemEmission(ship,draw.owner as NonNullable<ReturnType<typeof arkOwner>>,part);
  const emission=arkEmissionLayers[draw.file];
  if(power&&emission&&!part.flux.isOverloaded&&!part.flux.isVenting){
   material?.render(ctx,emission,pos,facing,time,power.alpha*alpha,power.material);
  }
  damage?.renderLayer(ctx,part,draw,index,pos,facing,alpha);
 }

 return true;
}
