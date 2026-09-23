/** Public native sprite/slot/weapon specifications; resource services can replace the catalog. */
import raw from '../data/reference-fleet-view.json' with {type:'json'};
import {immutableJSON,requireThat} from '../core/Values.mjs';
export const ORIGINAL_FLEET_VIEW_INPUTS=immutableJSON(raw);
export function createOriginalMemberViewSprite(path,services={}){const texture=ORIGINAL_FLEET_VIEW_INPUTS.textures[path]??services.readMemberViewTexture?.(path);requireThat(texture&&typeof texture.then!=='function'&&texture.path===path&&texture.width>0&&texture.height>0,'UNSUPPORTED_NATIVE_MEMBER_VIEW','Actual sprite resource required: '+path);return {texture,width:texture.width,height:texture.height,centerX:-1,centerY:-1,angle:0,color:[255,255,255,255],alphaMult:1,blendSrc:770,blendDest:771};}
export function originalMemberViewHull(id,services={}){const hull=services.readMemberViewHull?services.readMemberViewHull(id):ORIGINAL_FLEET_VIEW_INPUTS.hulls[id];requireThat(hull&&typeof hull.then!=='function'&&Array.isArray(hull.slots),'UNSUPPORTED_NATIVE_MEMBER_VIEW','Actual hull sprite/slots required: '+id);return hull;}
