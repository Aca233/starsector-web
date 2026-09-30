import { arkEmissionTextures, arkMembraneTextures, arkSystemTextures, arkPluginTextures } from './ArkSystemFX';
import { arkLanceTextures } from './ArkLanceMotion';
import art from '../content/adun-ark-art.json';
import { arkNativeFieldArt } from './ArkNativeField';
import { ADUN_ARK_ART, ADUN_ARK_ID, arkOwner, type AdunArkOwner } from '../content/AdunArkIds';
import type { ShipSpec } from '../content/ShipSpec';
export const arkArt=art;
export type ArkDraw = (typeof art.frames)[number][number];
export const arkArtTextures=[...new Set([...arkSystemTextures,...arkPluginTextures,...arkEmissionTextures,...arkMembraneTextures,...arkArt.frames.flatMap(frame=>frame.map(draw=>ADUN_ARK_ART+draw.file)),ADUN_ARK_ART+arkNativeFieldArt.file,...arkLanceTextures])];
export const arkFrame=(time:number)=>arkArt.frames[Math.floor(Math.max(0,time)%art.cycleSeconds/art.cycleSeconds*art.frames.length)];
/** Static editor and runtime use the exact same depth-owned sprites, not five overlapping sheets. */
export function arkStaticDraws(spec:ShipSpec){
 if((spec.sourceHullId??spec.id)!==ADUN_ARK_ID)return undefined;
 const present=new Set<AdunArkOwner>(['CORE']);for(const m of spec.modules??[]){const o=arkOwner(m.spec.sourceHullId??m.spec.id);if(o)present.add(o);}
 return arkArt.frames[0].filter(d=>present.has(d.owner as AdunArkOwner));
}
