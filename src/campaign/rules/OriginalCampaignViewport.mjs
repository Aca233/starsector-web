/** CombatViewport.isNearViewport and CampaignFleet view eligibility (0.98a-RC8).
 * The host supplies its actual viewport. Missing camera/jump history is not offscreen. */
import {requireThat} from '../core/Values.mjs';
import {originalFleetSensorRadius} from './OriginalSensors.mjs';
const f=Math.fround,check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_VIEWPORT',message);
const scalar=value=>{check(typeof value==='number'&&Number.isFinite(value)&&Number.isFinite(f(value)),'Actual finite viewport float required');return f(value);};
const vector=value=>{check(Array.isArray(value)&&value.length===2,'Actual viewport position required');return value.map(scalar);};
const call=(services,name,...args)=>{check(typeof services?.[name]==='function','Actual viewport service required: '+name);const value=services[name](...args);check(!value||typeof value.then!=='function','Synchronous viewport service required');return value;};
/** Inclusive bounds, native float operation order, and source short-circuit inset traversal. */
export function originalIsNearViewport(viewport,position,radius){
 const point=vector(position),padding=scalar(radius),seen=new Set();
 const near=view=>{check(view&&typeof view==='object'&&!seen.has(view),'Actual non-cyclic viewport required');seen.add(view);
  check(typeof view.everythingNearViewport==='boolean','Actual everythingNearViewport flag required');if(view.everythingNearViewport)return true;
  check(Object.hasOwn(view,'inset'),'Actual nullable inset required');if(view.inset!==null&&near(view.inset))return true;
  const x=scalar(view.llx),y=scalar(view.lly),width=scalar(view.visibleWidth),height=scalar(view.visibleHeight);
  return !(point[0]>f(f(x+width)+padding)||point[0]<f(x-padding)||point[1]>f(f(y+height)+padding)||point[1]<f(y-padding));
 };return near(viewport);
}
const campaign=fleet=>{check(fleet?.campaign?.scope==='native-constructed-campaign-fleet','Actual constructed fleet required for viewport');return fleet.campaign;};
const radius=(fleet,services)=>scalar(services.readFleetRadius?call(services,'readFleetRadius',fleet):originalFleetSensorRadius(fleet));
export function originalFleetIsVisible(fleet,margin,context,services){
 const c=campaign(fleet);check(Object.hasOwn(context,'currentLocation')&&context.currentLocation!==undefined,'Actual current location required');
 if(c.entity.containingLocation!==context.currentLocation)return false;
 return originalIsNearViewport(call(services,'readFleetViewport'),fleet.position,f(radius(fleet,services)+scalar(margin)));
}
function destination(fleet,services){
 const c=campaign(fleet);check(Object.hasOwn(c.flags,'isInJumpTransition')&&(c.flags.isInJumpTransition===null||typeof c.flags.isInJumpTransition==='boolean'),'Actual nullable transition flag required');
 if(c.flags.isInJumpTransition===null)return null;
 check(Object.hasOwn(c,'jumpDestination'),'Actual nullable jump destination required');if(c.jumpDestination===null)return null;
 const target=call(services,'readFleetJumpDestination',fleet);check(target&&Object.hasOwn(target,'containingLocation')&&target.containingLocation!==undefined,'Actual jump destination entity required');vector(target.position);return target;
}
export function originalFleetWillBeVisible(fleet,context,services){
 campaign(fleet);check(Object.hasOwn(context,'playerFleet')&&context.playerFleet!==undefined&&Object.hasOwn(context,'currentLocation')&&context.currentLocation!==undefined,'Actual player/current-location context required');
 let arriving=false,leaving=false;const own=destination(fleet,services);
 if(own!==null&&own.containingLocation===context.currentLocation)arriving=originalIsNearViewport(call(services,'readFleetViewport'),own.position,f(radius(fleet,services)+500));
 // Stock computes both locals even when arriving is already true.
 const player=context.playerFleet,target=player===null?null:destination(player,services);
 if(target!==null&&target.containingLocation===fleet.campaign.entity.containingLocation){const a=vector(fleet.position),b=vector(target.position),x=f(a[0]-b[0]),y=f(a[1]-b[1]);leaving=f(Math.sqrt(f(f(x*x)+f(y*y))))<1500;}
 return arriving||leaving;
}
