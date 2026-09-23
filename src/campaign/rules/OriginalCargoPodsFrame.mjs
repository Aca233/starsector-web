/** CargoPodsEntityPlugin + GenericFieldItemManager/Sprite natural state, 0.98a-RC8.
 * World translation belongs to BaseLocation; neither this plugin nor its local pieces moves it twice. */
import R from '../data/reference-fleet-construction.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {validateOriginalCargoPods,updateOriginalCargoPodsSize} from './OriginalCargoPods.mjs';
import {originalJavaNextDouble,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {createOriginalFader,fadeOriginalFader,advanceOriginalFader,originalFaderIsOut} from './OriginalFader.mjs';
import {advanceOriginalEntityBaseTail,advanceOriginalEntityEvenIfPaused,startOriginalEntityFadeAndExpire} from './OriginalCampaignEntityFrame.mjs';
import {advanceOriginalCargoPodsContact,setOriginalFleetIndicatorColors} from './OriginalFleetContact.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_CARGO_PODS_FRAME',m);
const scalar=n=>{check(Number.isFinite(n)&&Number.isFinite(f(n)),'Finite cargo-pod float required');return f(n);};
const call=(s,k,...a)=>{check(typeof s[k]==='function','Actual cargo-pod frame service required: '+k);const v=s[k](...a);check(!v||typeof v.then!=='function','Synchronous cargo-pod service required');return v;};
const level=v=>{check(['NONE','SENSOR_CONTACT','COMPOSITION_DETAILS','COMPOSITION_AND_FACTION_DETAILS'].includes(v),'Actual cargo-pod visibility required');return v;};
const unit=angle=>{const rad=f(angle*f(Math.PI/180));return [f(Math.cos(rad)),f(Math.sin(rad))];};
function piece(pod,m,random){
 const next=()=>f(originalJavaNextDouble(random)),size=f(m.minSize+f(f(m.maxSize-m.minSize)*next())),texture=R.cargoPods.fieldTexture;
 const cols=Math.trunc(texture.width/m.cellSize),rows=Math.trunc(texture.height/m.cellSize),cellX=Math.trunc(originalJavaNextDouble(random)*cols),cellY=Math.trunc(originalJavaNextDouble(random)*rows);
 const fader=createOriginalFader(0,.2,.2);fadeOriginalFader(fader,'IN');
 const facing=f(next()*360),angVel=f(f(next()*360)-180),dist=f(f(Math.sqrt(next()))*f(pod.radius*.75)),loc=unit(f(next()*360));for(let i=0;i<2;i++)loc[i]=f(loc[i]*dist);
 unit(f(next()*360)); // Original computes a random vector and immediately replaces it with getPerp(loc).
 const vel=[loc[1],f(-loc[0])];for(let i=0;i<2;i++)vel[i]=f(vel[i]+f(.25-f(f(next()*.5)*.25)));
 if(next()>.5){vel[0]=f(-vel[0]);vel[1]=f(-vel[1]);}const square=f(f(vel[0]*vel[0])+f(vel[1]*vel[1]));if(square>f(1.401298464324817e-45)){const inv=f(1/f(Math.sqrt(square)));for(let i=0;i<2;i++)vel[i]=f(vel[i]*inv);}
 const speed=f(10+f(next()*10));for(let i=0;i<2;i++)vel[i]=f(vel[i]*speed);
 return {scope:'native-generic-field-item',entity:pod,width:size,height:size,cellX,cellY,loc,vel,timeLeft:f(1+next()),facing,angVel,fader};
}
function advancePiece(item,days){advanceOriginalFader(item.fader,days);item.facing=f(item.facing+f(item.angVel*days));for(let i=0;i<2;i++)item.loc[i]=f(item.loc[i]+f(item.vel[i]*days));item.timeLeft=f(item.timeLeft-days);if(item.timeLeft<0)fadeOriginalFader(item.fader,'OUT');}
function addPieces(pod,random,m){while(m.items.length<m.numPieces)m.items.push(piece(pod,m,random));}
/** Render also calls this, including before a positive-time advance. An observer may own m. */
export function initializeOriginalCargoPodsField(pod,random,m=pod.plugin.manager){check(m.entity===pod,'Lost actual field owner');if(m.inited)return;m.inited=true;m.items=[];addPieces(pod,random,m);for(const item of m.items)advancePiece(item,f(.1));}
export function advanceOriginalCargoPodsField(pod,seconds,days,random,context,m=pod.plugin.manager){
 seconds=scalar(seconds);days=scalar(days);if(seconds<=0)return;check(m.entity===pod,'Lost actual field owner');
 if(pod.entity.containingLocation!==context.currentLocation){m.items=null;m.inited=false;return;}
 initializeOriginalCargoPodsField(pod,random,m);
 check(Array.isArray(m.items),'Actual initialized field items required');const remove=[];for(const item of m.items){advancePiece(item,days);if(originalFaderIsOut(item.fader))remove.push(item);}for(let i=m.items.length-1;i>=0;i--)if(remove.includes(m.items[i]))m.items.splice(i,1);addPieces(pod,random,m);
}
export function advanceOriginalCargoPodsPlugin(pod,seconds,days,random,context,services={}){
 validateOriginalCargoPods(pod);seconds=scalar(seconds);days=scalar(days);validateOriginalJavaRandom(random);const p=pod.plugin,e=pod.entity;
 check(e.containingLocation&&typeof e.containingLocation.hyperspaceMode==='boolean','Actual containing location required');const depth=e.containingLocation.hyperspaceMode?scalar(call(services,'readCargoPodsAbyssalDepth',pod)):0;
 p.elapsed=f(p.elapsed+(depth>=1?f(days*5):days));
 if(p.neverExpire!==true&&p.elapsed>=f(p.maxDays+p.extraDays)&&p.maxDays>=0){const vis=level(call(services,'readCargoPodsVisibilityToPlayer',pod)),canSee=e.containingLocation===context.currentLocation&&(vis==='COMPOSITION_AND_FACTION_DETAILS'||vis==='COMPOSITION_DETAILS');if(!canSee){p.maxDays=-1;startOriginalEntityFadeAndExpire(e);p.neverExpire=true;}}
 if(e.containingLocation===context.currentLocation){updateOriginalCargoPodsSize(pod);const radius=f(10+f(10*f(Math.sqrt(p.manager.numPieces)))),range=Math.min(2000,f(500+f(radius*20))),mods=e.detectedRangeMod.flat,old=mods.find(m=>m.id==='gen');if(old)old.value=range;else mods.push({id:'gen',value:range});}
 advanceOriginalCargoPodsField(pod,seconds,days,random,context);return pod;
}
export function advanceOriginalCargoPodsFrame(pod,seconds,days,random,context,services={}){
 validateOriginalCargoPods(pod);seconds=scalar(seconds);days=scalar(days);check(typeof context.paused==='boolean','Actual pause state required');check(pod.fleetForVisual===null,'Actual visual fleet advance service required');
 if(pod.faction.factionId!=='neutral')setOriginalFleetIndicatorColors(pod,pod.faction.specColor,pod.faction.secondaryUIColor,pod.faction.specSecondarySegments,services,pod.entity);
 const contact=advanceOriginalCargoPodsContact(pod,seconds,random,context,services);
 advanceOriginalEntityBaseTail(pod.entity,seconds,days,{get paused(){return context.paused;},isPlayerFleet:false},services);
 advanceOriginalCargoPodsPlugin(pod,seconds,days,random,context,services);return {scope:'native-cargo-pods-frame',effects:contact.effects,readyForAuthority:false};
}
export function advanceOriginalCargoPodsEvenIfPaused(pod,seconds,context,services={}){validateOriginalCargoPods(pod);advanceOriginalEntityEvenIfPaused(pod.entity,seconds,{get paused(){return context.paused;},isPlayerFleet:false},services);}
/** Live getters from the actual custom entity; no sensor registration as a Fleet. */
export function originalCargoPodsSensorEntity(pod){validateOriginalCargoPods(pod);const e=pod.entity;return {isFleet:false,isPlayerFleet:false,get locationRef(){return e.containingLocation?.objectRef??null;},get position(){return {x:e.position[0],y:e.position[1]};},get radius(){return pod.radius;},get ghost(){return (e.tags??[]).includes('ghost');},get sensorProfile(){return e.sensorProfile;},get sensorStrength(){return e.sensorStrength;},get transponderOn(){return e.transponderOn;},get extendedDetectedAtRange(){return e.extendedDetectedAtRange;},get detectionRangeDetailsOverrideMult(){return e.detectionRangeDetailsOverrideMult;},get detectedRangeMod(){return e.detectedRangeMod;},get sensorRangeMod(){return e.sensorRangeMod;},detectedByPlayerRangeMult:1};}
