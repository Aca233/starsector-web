import {isOriginalCampaignPlanet} from './OriginalCampaignPlanet.mjs';
/** CampaignEngine.findClosest and CampaignState's explicit entity-target control branch.
 * This is not held-mouse control, automatic orbit, a whole UI controller, or a world tick. */
import {requireThat} from '../core/Values.mjs';
import {isOriginalCargoPods} from './OriginalCargoPods.mjs';
import {originalFleetSensorRadius} from './OriginalSensors.mjs';
import {originalWorldLocationObjects} from './OriginalFleetWorld.mjs';
import {setOriginalConstructedFleetDestination} from './OriginalCampaignFleetMotion.mjs';
import {setOriginalFleetNoEngaging} from './OriginalCampaignFleetAdvance.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_PLAYER_NAVIGATION',m);
const scalar=v=>{check(Number.isFinite(v)&&Number.isFinite(f(v)),'Actual finite navigation float required');return f(v);};
const call=(s,k,...a)=>{check(typeof s[k]==='function','Actual navigation service required: '+k);const v=s[k](...a);check(!v||typeof v.then!=='function','Synchronous navigation service required');return v;};
function fleetState(fleet){check(fleet?.campaign?.scope==='native-constructed-campaign-fleet','Actual controlled fleet required');return fleet.campaign;}
export function originalNavigationEntity(object,services={}){
  if(isOriginalCampaignPlanet(object))return {entity:object.entity,radius:object.radius,isFleet:false,hidden:false,showInCampaign:true,abyssalAlpha:null};
 if(isOriginalCargoPods(object))return {entity:object.entity,radius:object.radius,isFleet:false,hidden:false,showInCampaign:object.spec.showInCampaign,abyssalAlpha:null};
 if(object?.campaign?.scope==='native-constructed-campaign-fleet')return {entity:object.campaign.entity,radius:originalFleetSensorRadius(object),isFleet:true,hidden:object.campaign.flags.hidden!==null,showInCampaign:true,abyssalAlpha:null};
 return call(services,'readNavigationEntity',object);
}
/** Strict radius hit and distance+radius priority, preserving native repository tie order. */
export function findOriginalNavigationTarget(observer,point,services={},padding=0){
 const c=fleetState(observer),location=c.entity.containingLocation;if(location===null)return null;
 check(Array.isArray(point)&&point.length===2,'Actual map point required');const x=scalar(point[0]),y=scalar(point[1]);padding=scalar(padding);let best=null,bestDistance=3.4028234663852886e38,bestRadius=3.4028234663852886e38;
 for(const object of originalWorldLocationObjects(location,'com.fs.starfarer.campaign.CampaignEntity')){
  if(object===observer)continue;const info=originalNavigationEntity(object,services),tags=info.entity.tags??[];check(Array.isArray(tags),'Actual entity tags required');if(tags.includes('terrain')||tags.includes('non_clickable'))continue;
  // Native visibility/hidden getters are pure. Reject hidden objects before asking the observer's
  // sensor adapter, so deliberately undisclosed entities never require an observer sensor binding.
  check(typeof info.hidden==='boolean','Actual hidden flag required');if(info.hidden)continue;
  const visible=call(services,'isNavigationEntityVisible',object,observer);check(typeof visible==='boolean','Actual visible flag required');if(!visible)continue;
  if(info.abyssalAlpha!==null&&scalar(info.abyssalAlpha)<=0)continue;
  const level=call(services,'readNavigationVisibility',object,observer);check(['NONE','SENSOR_CONTACT','COMPOSITION_DETAILS','COMPOSITION_AND_FACTION_DETAILS'].includes(level),'Actual navigation visibility required');if(level==='NONE'||level==='SENSOR_CONTACT'||!info.showInCampaign)continue;
  const radius=scalar(info.radius),dx=f(x-scalar(info.entity.position[0])),dy=f(y-scalar(info.entity.position[1])),distance=f(Math.sqrt(f(f(dx*dx)+f(dy*dy))));
  if(f(distance+radius)<f(bestDistance+bestRadius)&&distance<Math.max(padding,radius)){best=object;bestDistance=distance;bestRadius=radius;}
 }
 return best;
}
/** CampaignState.setMovementDestination: even an override-blocked order cancels the target. */
export function setOriginalPlayerMovementDestination(fleet,x,y){setOriginalConstructedFleetDestination(fleet,x,y);fleetState(fleet).interactionTarget=null;}
/** followEntity's world-side writes. Message/indicator intents stay observer-local. */
export function followOriginalNavigationTarget(fleet,target,services={}){
 const c=fleetState(fleet);check(target&&typeof target.objectRef==='string','Actual target identity required');
 if(c.noCombat!==null&&scalar(call(services,'readDaysSinceLastPlayerBattle',fleet))>.5)setOriginalFleetNoEngaging(fleet,.05);
 c.interactionTarget=target.objectRef;return {scope:'native-player-follow-target',followingDirectCommand:true,followMouse:false,effects:[{kind:'target-indicator-pulse',entity:target}]};
}
/** Must run in the owner's input/control phase, not in observation reads or each NPC AI frame. */
export function advanceOriginalPlayerTargetNavigation(fleet,context,services={}){
 const c=fleetState(fleet);check(typeof context.paused==='boolean','Actual pause state required');c.movement.hardSpeedLimit=-1;if(context.paused||c.interactionTarget===null)return false;
 const target=call(services,'resolveNavigationTarget',c.interactionTarget);
 if(target===null){c.interactionTarget=null;return false;}
 const info=originalNavigationEntity(target,services),location=info.entity.containingLocation;
 if(location!==c.entity.containingLocation||!location?.repository.contains.includes(target)){c.interactionTarget=null;return false;}
 let point=info.entity.position;
 if(info.isFleet){const dx=f(scalar(point[0])-c.entity.position[0]),dy=f(scalar(point[1])-c.entity.position[1]),angle=f(f(Math.atan2(dy,dx))*f(57.295784)),radians=f(angle*f(f(Math.PI)/180));point=[f(c.entity.position[0]+f(f(Math.cos(radians))*750)),f(c.entity.position[1]+f(f(Math.sin(radians))*750))];}
 setOriginalConstructedFleetDestination(fleet,...point);c.moveDestinationSetWhileInLocation=c.entity.containingLocation?.objectRef??null;return true;
}
