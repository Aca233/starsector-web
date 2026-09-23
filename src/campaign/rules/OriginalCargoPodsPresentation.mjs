/** Source-backed cargo-pod GPU commands and observer-owned visual state. No inventory DTO renderer. */
import R from '../data/reference-fleet-construction.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {createOriginalJavaRandom,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {validateOriginalCargoPods,validateOriginalCargoPodsField} from './OriginalCargoPods.mjs';
import {advanceOriginalCargoPodsField,initializeOriginalCargoPodsField} from './OriginalCargoPodsFrame.mjs';
import {advanceOriginalFader} from './OriginalFader.mjs';
import {createOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
import {createOriginalFleetContactPresentation,advanceOriginalCargoPodsContact,renderOriginalFleetContact,validateOriginalFleetContact} from './OriginalFleetContact.mjs';
import {createOriginalFleetDrawFrame,originalFleetDrawSprite,originalFleetDrawQuads,originalFleetDrawMask,NATIVE_FLEET_RGB_MASK} from './OriginalFleetDraw.mjs';
import {originalLocationEntityState} from './OriginalLocationOrbits.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_CARGO_PODS_PRESENTATION',m),scalar=n=>{check(Number.isFinite(n)&&Number.isFinite(f(n)),'Finite pod presentation float required');return f(n);};
const call=(s,k,...a)=>{check(typeof s[k]==='function','Actual pod presentation service required: '+k);const v=s[k](...a);check(!v||typeof v.then!=='function','Synchronous pod presentation required');return v;};
function sprite(texture,width,height,color,alpha,angle){return {texture,width,height,color,alphaMult:alpha,angle,centerX:-1,centerY:-1,blendSrc:770,blendDest:771};}
function light(pod,services){const source=pod.entity.lightSource;if(source===null)return null;const state=originalLocationEntityState(source,services);check(state.tags===null||Array.isArray(state.tags),'Actual light-source tags required');return state;}
/** CustomCampaignEntity + GenericFieldItemManager.render. May initialize the supplied visual field. */
export function renderOriginalCargoPodsGraphics(pod,random,context,services={},manager=pod.plugin.manager,contact=pod.entity){
 validateOriginalCargoPods(pod);validateOriginalCargoPodsField(pod,manager);const frame=createOriginalFleetDrawFrame(pod.position),alpha=scalar(context.alpha);
 check(alpha>=0&&alpha<=1,'Actual viewport alpha required');if(context.layer!=='TERRAIN_7A'||pod.entity.containingLocation!==context.currentLocation||!pod.spec.showInCampaign)return frame;
 const sensor=pod.entity.alwaysUseSensorFaderBrightness===true?Math.min(contact.sensorFader.currBrightness,pod.entity.sensorFader.currBrightness):contact.sensorFader.currBrightness;
 const brightness=f(f(alpha*sensor)*contact.sensorContactFader.currBrightness);if(brightness<=0)return frame;
 const near=call(context,'isNearViewport',pod.position,f(pod.radius+100));check(typeof near==='boolean','Actual viewport membership required');if(!near)return frame;
 initializeOriginalCargoPodsField(pod,random,manager);const source=light(pod,services),rgba=source!==null&&pod.entity.lightColor!==null?pod.entity.lightColor:[255,255,255,255],texture=R.cargoPods.fieldTexture,cols=Math.trunc(texture.width/manager.cellSize),rows=Math.trunc(texture.height/manager.cellSize),tw=f(texture.texWidth/cols),th=f(texture.texHeight/rows);
 originalFleetDrawMask(frame,NATIVE_FLEET_RGB_MASK);
 for(const item of manager.items){
  const body=sprite(texture,item.width,item.height,rgba,f(brightness*item.fader.currBrightness),f(item.facing-90));Object.assign(body,{texX:f(item.cellX*tw),texY:f(item.cellY*th),texWidth:tw,texHeight:th});originalFleetDrawSprite(frame,'cargo-pod',body,item.loc);
  if(source!==null&&!(source.tags??[]).includes('ambient_ls')){
   const width=f(item.width*1.5),height=f(item.height*1.5),clear=f(width*f(1.41)),x=f(f(-clear/2)-1),size=f(clear+2);originalFleetDrawMask(frame,[false,false,false,true]);
   originalFleetDrawQuads(frame,'cargo-pod-shadow-clear',null,[[x,x],[x,f(x+size)],[f(x+size),f(x+size)],[f(x+size),x]].map(p=>({position:[f(item.loc[0]+p[0]),f(item.loc[1]+p[1])],uv:[0,0],color:[0,0,0,0]})),770,0);
   body.blendSrc=1;body.blendDest=0;originalFleetDrawSprite(frame,'cargo-pod-shadow-alpha',body,item.loc);
   const direction=f(f(Math.atan2(f(source.position[1]-pod.position[1]),f(source.position[0]-pod.position[0])))*f(180/Math.PI)),shadow=sprite(R.cargoPods.shadowTexture,width,height,[255,255,255,255],brightness,direction);
   shadow.blendSrc=0;shadow.blendDest=770;originalFleetDrawSprite(frame,'cargo-pod-shadow-mask',shadow,item.loc);originalFleetDrawMask(frame,NATIVE_FLEET_RGB_MASK);
   shadow.blendSrc=772;shadow.blendDest=773;originalFleetDrawSprite(frame,'cargo-pod-shadow',shadow,item.loc);
  }
 }
 return frame;
}
export function createOriginalCargoPodsObserverPresentation(pod,observer,seed){validateOriginalCargoPods(pod);check(observer?.campaign?.entity,'Actual observer fleet required');return {scope:'native-observer-cargo-pods-presentation',pod,observer,contact:createOriginalFleetContactPresentation(pod),field:{...pod.plugin.manager,items:null,inited:false},emptyMemory:createOriginalCampaignMemory(),random:createOriginalJavaRandom(seed)};}
/** Keep the independent field/contact clocks, but never keep an owner in the previous world graph. */
export function rebindOriginalCargoPodsObserverPresentation(s,pod,observer){
 validateOriginalCargoPodsObserverPresentation(s);validateOriginalCargoPods(pod);
 check(pod.objectRef===s.pod.objectRef&&pod.id===s.pod.id&&observer?.objectRef===s.observer.objectRef&&observer.dataRef===s.observer.dataRef,'Cannot rebind a different observer or cargo-pods entity');
 s.pod=pod;s.observer=observer;s.contact.fleet=pod;if(s.contact.sensorContactIndicatorManager)s.contact.sensorContactIndicatorManager.fleet=pod;
 s.field.entity=pod;for(const item of s.field.items??[])item.entity=pod;
 for(const key of ['numPieces','category','key','cellSize','minSize','maxSize'])s.field[key]=pod.plugin.manager[key];
 return validateOriginalCargoPodsObserverPresentation(s);
}
function state(s,context){check(s?.scope==='native-observer-cargo-pods-presentation'&&s.contact.fleet===s.pod&&s.field!==s.pod.plugin.manager&&s.field.entity===s.pod,'Actual independent pod presentation required');check(context.currentLocation===s.observer.campaign.entity.containingLocation,'Observer current location mismatch');return {get currentLocation(){return context.currentLocation;},playerFleet:s.observer};}
/** Visual time only: never invokes plugin expiry, cargo changes, physics, or authoritative RNG. */
export function advanceOriginalCargoPodsObserver(s,seconds,days,context,services={}){
 const ctx=state(s,context);seconds=scalar(seconds);days=scalar(days);check(typeof context.paused==='boolean','Actual pause state required');if(context.paused)return {effects:[]};
 const observed=[];const result=advanceOriginalCargoPodsContact(s.pod,seconds,s.random,ctx,{...services,readContactMemory:()=>s.pod.entity.memory??s.emptyMemory,reportDetectedCargoPods:(entity,visibility)=>observed.push({kind:'observed-entity',entity,visibility}),discoverCargoPods:(plugin,entity)=>observed.push({kind:'observed-discoverable-entity',plugin,entity})},s.contact);result.effects.push(...observed);advanceOriginalFader(s.contact.sensorFader,seconds);advanceOriginalFader(s.contact.sensorContactFader,seconds);
 s.field.numPieces=s.pod.plugin.manager.numPieces;advanceOriginalCargoPodsField(s.pod,seconds,days,s.random,ctx,s.field);return result;
}
export function renderOriginalCargoPodsObserverLayers(s,context,services={}){
 const ctx=state(s,context),pod=s.pod,layers={scope:'native-observer-cargo-pods-layers',terrain:createOriginalFleetDrawFrame(pod.position),contacts:createOriginalFleetDrawFrame(pod.position)};
 if(pod.entity.containingLocation!==ctx.currentLocation||pod.entity.expired||!pod.worldRegistered||!pod.spec.showInCampaign)return layers;
 s.field.numPieces=pod.plugin.manager.numPieces;layers.terrain=renderOriginalCargoPodsGraphics(pod,s.random,{...context,layer:'TERRAIN_7A'},services,s.field,s.contact);
 if(s.contact.sensorContactIndicatorManager?.sensorInds!=null){const near=call(context,'isNearViewport',pod.position,f(pod.radius+20));check(typeof near==='boolean','Actual viewport membership required');if(near)layers.contacts=renderOriginalFleetContact(pod,context.alpha,ctx,services,s.contact);}
 return layers;
}
export function validateOriginalCargoPodsObserverPresentation(s){state(s,{currentLocation:s.observer.campaign.entity.containingLocation});validateOriginalJavaRandom(s.random);validateOriginalFleetContact(s.pod,s.contact);validateOriginalCargoPodsField(s.pod,s.field);return s;}
