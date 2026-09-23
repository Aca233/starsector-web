/** Native module resolution, getSizeWithModules, and CampaignFleetMemberView.renderModules. */
import {requireThat} from '../core/Values.mjs';
import {originalMemberViewHull,createOriginalMemberViewSprite} from './OriginalMemberViewResources.mjs';
import {originalFleetDrawRotate,originalFleetDrawSprite} from './OriginalFleetDraw.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_MEMBER_MODULES',m);
const call=(services,name,...args)=>{check(typeof services[name]==='function','Actual module service required: '+name);const v=services[name](...args);check(!v||typeof v.then!=='function','Module services must be synchronous');return v;};
export function originalMemberViewSlotPosition(slot,facing,anchor=null){
 let p=slot.location;if(anchor!==null){const offset=originalFleetDrawRotate(anchor,slot.angle);p=[f(p[0]-offset[0]),f(p[1]-offset[1])];}
 // WeaponSlot.computeRelativePosition uses Math.toRadians(double), not Utils' float radians.
 const r=facing/180*Math.PI,c=f(Math.cos(r)),s=f(Math.sin(r));return [f(f(p[0]*c)-f(p[1]*s)),f(f(p[0]*s)+f(p[1]*c))];
}
export function originalMemberModuleSlots(member,services={}){const v=member.variant,slots=originalMemberViewHull(v.hullId,services).slots;check(Array.isArray(v.effects?.stationModules),'Actual ordered stationModules required');return v.effects.stationModules.flatMap(([id,variantId])=>{const slot=slots.find(s=>s.id===id);check(slot,'Module roster references a missing hull slot: '+id);return slot.type==='STATION_MODULE'?[{slot,variantId}]:[];});}
export function originalMemberModuleVariant(member,slot,variantId,services={}){
 const current=member.variant;let variant;
 if(!Object.hasOwn(current,'moduleVariants'))variant=call(services,'readMemberViewModuleVariant',member,slot.id);
 else{check(current.moduleVariants===null||Array.isArray(current.moduleVariants),'Actual nullable module variant map required');const entry=current.moduleVariants?.find(([key])=>key===slot.id);variant=entry?entry[1]:variantId===null?null:call(services,'readMemberViewStockVariant',variantId);}
 check(variant?.objectRef&&variant.hullId&&Array.isArray(variant.weapons),'Actual current module variant required: '+slot.id);return variant;
}
export function createOriginalMemberViewModules(member,services={},createIcons=true){
 const hull=originalMemberViewHull(member.variant.hullId,services),main=hull.sprite,rows=originalMemberModuleSlots(member,services);if(!rows.length)return {size:{width:main.width,height:main.height},icons:[]};
 let minX=f(-main.center[0]),minY=f(-main.center[1]),maxX=f(main.width-main.center[0]),maxY=f(main.height-main.center[1]);const start=[minX,minY,maxX,maxY],icons=[];
 for(const {slot,variantId}of rows){const variant=originalMemberModuleVariant(member,slot,variantId,services),h=originalMemberViewHull(variant.hullId,services),position=originalMemberViewSlotPosition(slot,90,h.moduleAnchor);let halfW=f(h.sprite.width/2),halfH=f(h.sprite.height/2);
  // Native getSizeWithModules zeros its temporary anchor, then uses a square for any nonzero angle.
  if(slot.angle!==0)halfW=halfH=Math.max(halfW,halfH);minX=Math.min(minX,f(position[0]-halfW));maxX=Math.max(maxX,f(position[0]+halfW));minY=Math.min(minY,f(position[1]-halfH));maxY=Math.max(maxY,f(position[1]+halfH));
 }
 // readResolve does a SECOND complete lookup after getSizeWithModules, not interleaved icons.
 if(createIcons)for(const {slot,variantId}of originalMemberModuleSlots(member,services)){if(variantId===null)continue;const variant=originalMemberModuleVariant(member,slot,variantId,services),h=originalMemberViewHull(variant.hullId,services);icons.push({scope:'native-campaign-module-icon',slotId:slot.id,slot,variant,sprite:createOriginalMemberViewSprite(h.sprite.path,services)});}
 const left=f(start[0]-minX),right=f(maxX-start[2]),bottom=f(start[1]-minY),top=f(maxY-start[3]);return {size:{width:f(f(start[2]-start[0])+f(left+right)),height:f(f(start[3]-start[1])+f(bottom+top))},icons};
}
export function renderOriginalMemberViewModules(view,frame,position,services={}){
 if(view.member.spriteOverride!==null)return;const parent=originalMemberViewHull(view.member.variant.hullId,services),scale=f(view.sprite.width/parent.sprite.width),statuses=view.member.status?.modules;check(Array.isArray(statuses),'Actual module status array required');
 for(let i=0;i<view.moduleIcons.length;i++){const icon=view.moduleIcons[i];check(icon.scope==='native-campaign-module-icon','External module icon needs its real renderer');if(i+1>=statuses.length)continue;const state=statuses[i+1];check(Object.hasOwn(state,'detached')&&(state.detached===null||typeof state.detached==='boolean'),'Actual nullable detached state required');if(state.detached===true)continue;
  const h=originalMemberViewHull(icon.variant.hullId,services),s=icon.sprite,p=originalMemberViewSlotPosition(icon.slot,view.facing,h.moduleAnchor);s.width=f(h.sprite.width*scale);s.height=f(h.sprite.height*scale);s.centerX=f(h.sprite.center[0]*scale);s.centerY=f(h.sprite.center[1]*scale);s.blendSrc=view.sprite.blendSrc;s.blendDest=view.sprite.blendDest;s.color=view.sprite.color;s.alphaMult=view.sprite.alphaMult;s.angle=f(f(view.facing-90)+icon.slot.angle);
  originalFleetDrawSprite(frame,'module',s,[f(position[0]+f(p[0]*scale)),f(position[1]+f(p[1]*scale))]);
 }
}
