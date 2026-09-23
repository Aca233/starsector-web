/** Current native route spatial closure. No sensor, fleet factory, or renderer substitutes. */
import {requireThat,canonicalJSON} from '../core/Values.mjs';
import {ORIGINAL_MILITARY_BASES} from './OriginalMilitaryBases.mjs';
const C=ORIGINAL_MILITARY_BASES.routeManager,f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_ROUTE_SPACE',m);
const finiteFloat=v=>Number.isFinite(v)&&f(v)===v;
export function validateOriginalRouteSpace(s,{allowUnresolved=false}={}){
 check(s?.scope==='native-route-spatial-closure'&&s.schemaVersion===1&&Array.isArray(s.unresolved)&&(allowUnresolved||!s.unresolved.length),'Complete native route spatial closure required');
 const vectors=new Map();for(const key of ['locations','entities']){check(Array.isArray(s[key])&&new Set(s[key].map(e=>e.objectRef)).size===s[key].length,'Invalid route spatial roster');for(const stored of s[key]){const e=key==='entities'?originalRouteEntity(s,stored.objectRef):stored;
  check(typeof e.objectRef==='string'&&typeof e.classAlias==='string','Actual route spatial identity required');if(e.position===null){check(allowUnresolved&&e.positionRef===null,'Missing current route vector');continue;}
  check(typeof e.positionRef==='string'&&finiteFloat(e.position.x)&&finiteFloat(e.position.y),'Actual route float vector required');const old=vectors.get(e.positionRef);check(!old||old===e.position,'Lost shared route vector identity');vectors.set(e.positionRef,e.position);
 }}
 check(s.hyperspaceRef===null?allowUnresolved:s.locations.some(l=>l.objectRef===s.hyperspaceRef),'Missing hyperspace identity');
 check(s.playerFleetRef===null||s.entities.some(e=>e.objectRef===s.playerFleetRef&&originalRouteEntity(s,e.objectRef).fleet),'Missing player spatial fleet');
 for(const stored of s.entities){const e=originalRouteEntity(s,stored.objectRef);check(e.locationRef===null||s.locations.some(l=>l.objectRef===e.locationRef),'Missing route containing location');if(e.fleet){const p=e.fleet;check(e.classAlias==='Flt'&&(p.battleRef===null||typeof p.battleRef==='string')&&[null,true,false].includes(p.noAutoDespawn)&&[null,true,false].includes(p.wasMousedOverByPlayer),'Invalid current fleet flags');check(p.eventListenerRefs===null||Array.isArray(p.eventListenerRefs)&&p.eventListenerRefs.every(id=>typeof id==='string'),'Invalid ordered fleet event listeners');}}
 return s;
}
export function restoreCapturedOriginalRouteSpace(capture){const s=structuredClone(capture),vectors=new Map();for(const e of [...s.locations,...s.entities]){if(e.position===null)continue;const old=vectors.get(e.positionRef);if(old){check(canonicalJSON(old)===canonicalJSON(e.position),'Conflicting captured route vector identity');e.position=old;}else vectors.set(e.positionRef,e.position);}return validateOriginalRouteSpace(s,{allowUnresolved:true});}
/** No cached positions or nullable flags for bound current fleets: read the actual object on every access. */
export function originalRouteEntity(s,ref){
 const e=s.entities.find(e=>e.objectRef===ref);check(e,'Actual current route entity required');if(!e.nativeFleet)return e;
 const fleet=e.nativeFleet,c=fleet.campaign;check(fleet.objectRef===e.objectRef&&c?.scope==='native-constructed-campaign-fleet','Lost actual route fleet identity');
 return {...e,position:{x:fleet.position[0],y:fleet.position[1]},locationRef:c.entity.containingLocation?.objectRef??null,fleet:{battleRef:fleet.battle?.objectRef??null,noAutoDespawn:c.flags.noAutoDespawn,wasMousedOverByPlayer:c.flags.wasMousedOverByPlayer,eventListenerRefs:c.despawnListeners?.map(l=>l.objectRef)??null}};
}
export function bindOriginalRouteWorldFleet(s,fleet){
 check(s&&fleet?.campaign?.scope==='native-constructed-campaign-fleet','Actual route space and constructed fleet required');
 const old=s.entities.find(e=>e.objectRef===fleet.objectRef);check(!old||old.nativeFleet===fleet,'Cannot replace a different captured route fleet');if(old)return old;
 const row={objectRef:fleet.objectRef,classAlias:'Flt',positionRef:fleet.objectRef+':position',position:null,locationRef:null,fleet:null,nativeFleet:fleet};s.entities.push(row);validateOriginalRouteSpace(s);return row;
}
function location(s,ref){const l=s.locations.find(l=>l.objectRef===ref);check(l,'Actual non-null route location required');return l;}
const hyper=(s,l)=>l.objectRef===s.hyperspaceRef;
export function originalEntityHyperPosition(s,ref){const e=originalRouteEntity(s,ref);return e.locationRef===null||hyper(s,location(s,e.locationRef))?e.position:location(s,e.locationRef).position;}
function from(s,seg){return originalRouteEntity(s,seg.fromRef);}
function to(s,seg){return originalRouteEntity(s,seg.toRef);}
function inSystem(s,seg){
 if(seg.toRef===null&&seg.fromRef!==null&&from(s,seg).locationRef!==null&&!hyper(s,location(s,from(s,seg).locationRef)))return true;
 return seg.fromRef!==null&&!hyper(s,location(s,from(s,seg).locationRef))&&from(s,seg).locationRef===to(s,seg).locationRef;
}
function center(s,ref){if(ref===null)return false;const e=originalRouteEntity(s,ref);if(e.locationRef===null)return false;const l=location(s,e.locationRef);return l.classAlias==='Sstm'&&l.centerRef===ref;}
function leave(s,seg){if(inSystem(s,seg)||center(s,seg.fromRef))return false;return seg.fromRef===null||!hyper(s,location(s,from(s,seg).locationRef));}
function enter(s,seg){if(inSystem(s,seg)||center(s,seg.toRef))return false;return seg.toRef===null||!hyper(s,location(s,to(s,seg).locationRef));}
function duration(seg){return Math.min(f(seg.daysMax*C.IN_OUT_PHASE_FRACTION),C.IN_OUT_PHASE_DAYS);}
function clamp(v){if(v>1)v=1;if(v<0)v=0;return v;}
export function originalRouteProgress(s,seg,phase='overall'){
 check(finiteFloat(seg.elapsed)&&finiteFloat(seg.daysMax),'Actual route progress floats required');
 if(phase==='overall')return seg.daysMax<=0?1:f(seg.elapsed/seg.daysMax);
 const dur=duration(seg);
 if(phase==='enter')return clamp(f(1-f(Math.max(0,f(seg.daysMax-seg.elapsed))/dur)));
 if(phase==='leave')return clamp(f(seg.elapsed/dur));
 check(phase==='transit','Unknown route progress phase');let max=seg.daysMax,e=seg.elapsed;if(enter(s,seg))max=f(max-dur);if(leave(s,seg)){max=f(max-dur);e=f(e-dur);}return clamp(f(e/max));
}
export function originalRouteContainingLocation(s,seg){
 if(seg.fromRef!==null&&seg.toRef===null)return from(s,seg).locationRef;
 if(seg.fromRef===null&&seg.toRef!==null)return to(s,seg).locationRef;
 if(from(s,seg).locationRef===to(s,seg).locationRef)return from(s,seg).locationRef;
 if(originalRouteProgress(s,seg,'leave')<1)return from(s,seg).locationRef;
 if(originalRouteProgress(s,seg,'transit')<1)return s.hyperspaceRef;
 return to(s,seg).locationRef;
}
export function originalRouteHyperPosition(s,route){
 const seg=route.current;if(seg===null)return {x:f(1e8),y:0};
 if(inSystem(s,seg)||seg.toRef===null||to(s,seg).locationRef===null)return originalEntityHyperPosition(s,seg.fromRef);
 const p=originalRouteProgress(s,seg,'transit'),a=from(s,seg),b=to(s,seg),la=location(s,a.locationRef),lb=location(s,b.locationRef),pa=hyper(s,la)?a.position:la.position,pb=hyper(s,lb)?b.position:lb.position;
 return {x:f(pa.x+f(f(pb.x-pa.x)*p)),y:f(pa.y+f(f(pb.y-pa.y)*p))};
}
export function originalRouteDistanceLY(a,b){check(a&&b&&[a.x,a.y,b.x,b.y].every(v=>typeof v==='number'&&(f(v)===v||Number.isNaN(v))),'Native float hyperspace coordinates required');const dx=f(a.x-b.x),dy=f(a.y-b.y);return f(f(Math.sqrt(f(f(dx*dx)+f(dy*dy))))/C.unitsPerLightYear);}
export function originalRouteShouldSpawn(s,route){if(route.delay>0||route.activeFleetRef!==null)return false;check(s.playerFleetRef!==null,'Actual player fleet required');return originalRouteDistanceLY(originalRouteHyperPosition(s,route),originalEntityHyperPosition(s,s.playerFleetRef))<C.SPAWN_DIST_LY;}
export function originalRouteShouldDespawn(s,route){
 if(route.activeFleetRef===null||route.daysSinceSeenByPlayer<C.DAYS_SINCE_SEEN_BEFORE_DESPAWN_IF_FAR)return false;
 const fleet=originalRouteEntity(s,route.activeFleetRef).fleet;check(fleet,'Actual active fleet required');if(fleet.battleRef!==null||fleet.noAutoDespawn!==null)return false;check(s.playerFleetRef!==null,'Actual player fleet required');
 const dist=originalRouteDistanceLY(originalEntityHyperPosition(s,route.activeFleetRef),originalEntityHyperPosition(s,s.playerFleetRef));return dist>C.DESPAWN_DIST_LY_FAR||dist>C.DESPAWN_DIST_LY_CLOSE&&route.daysSinceSeenByPlayer>C.DAYS_SINCE_SEEN_BEFORE_DESPAWN_IF_CLOSE;
}
export function setOriginalRouteFleetMousedOver(s,ref,value){const fleet=originalRouteEntity(s,ref).fleet;check(fleet&&[true,false,null].includes(value),'Actual fleet and nullable mouse-over flag required');const native=originalRouteEntity(s,ref).nativeFleet;if(native)native.campaign.flags.wasMousedOverByPlayer=value===false?null:value;else fleet.wasMousedOverByPlayer=value===false?null:value;}
