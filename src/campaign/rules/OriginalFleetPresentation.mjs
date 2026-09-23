/** Observer-local rendering state. Not a Sector tick, authority DTO, or UI replacement. */
import {originalFleetPointCost} from './OriginalFleetData.mjs';
import R from '../data/reference-fleet-view.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {createOriginalJavaRandom,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {advanceOriginalFader} from './OriginalFader.mjs';
import {createOriginalFleetContactPresentation,advanceOriginalFleetContact,renderOriginalFleetContact,setOriginalFleetIndicatorColors,validateOriginalFleetContact} from './OriginalFleetContact.mjs';
import {createOriginalFleetView,advanceOriginalFleetView,clearOriginalFleetView,renderOriginalFleetGraphics,validateOriginalFleetView} from './OriginalCampaignFleetView.mjs';
import {originalFleetSensorRadius} from './OriginalSensors.mjs';
import {createOriginalFleetDrawFrame,originalFleetDrawSprite} from './OriginalFleetDraw.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_PRESENTATION',m);
const scalar=n=>{check(Number.isFinite(n)&&Number.isFinite(f(n)),'Finite presentation float required');return f(n);};
const call=(services,name,...args)=>{check(typeof services[name]==='function','Actual observer service required: '+name);const value=services[name](...args);check(!value||typeof value.then!=='function','Synchronous observer service required');return value;};
const boolean=v=>{check(typeof v==='boolean','Actual observer visibility boolean required');return v;};
function state(s){check(s?.scope==='native-observer-fleet-presentation'&&s.fleet?.campaign&&s.observer?.campaign&&s.contact.fleet===s.fleet,'Actual observer/fleet presentation identity required');return s;}
/** A new independent visual-random branch, not a claim to replay native Math.random history. */
export function createOriginalFleetObserverPresentation(fleet,observer,seed){
 check(fleet?.campaign&&observer?.campaign,'Actual observer and target fleets required');
 return {scope:'native-observer-fleet-presentation',fleet,observer,contact:createOriginalFleetContactPresentation(fleet),view:createOriginalFleetView(fleet.objectRef),random:createOriginalJavaRandom(seed)};
}
/** Build one read-only identity index per restored world, not one deep world clone per view. */
export function createOriginalObserverRebindReferences(factory){
 check(Array.isArray(factory?.members)&&factory.stockVariants,'Actual member/variant factory required');
 const members=new Map(),variants=new Map(),seen=new Set(),pending=Object.values(factory.stockVariants);
 for(const member of factory.members){check(typeof member.objectRef==='string'&&(!members.has(member.objectRef)||members.get(member.objectRef)===member),'Ambiguous member identity');members.set(member.objectRef,member);if(member.variant)pending.push(member.variant);}
 while(pending.length){const variant=pending.pop();if(seen.has(variant))continue;seen.add(variant);check(typeof variant.objectRef==='string'&&(!variants.has(variant.objectRef)||variants.get(variant.objectRef)===variant),'Ambiguous variant identity');variants.set(variant.objectRef,variant);for(const [,child]of variant.moduleVariants??[])if(child)pending.push(child);}
 return {members,variants};
}
/** A replica revision is not a native despawn/spawn. Preserve visual objects and native set order. */
export function rebindOriginalFleetObserverPresentation(s,fleet,observer,references){
 validateOriginalFleetObserverPresentation(s);
 check(fleet?.objectRef===s.fleet.objectRef&&fleet.dataRef===s.fleet.dataRef&&observer?.objectRef===s.observer.objectRef&&observer.dataRef===s.observer.dataRef,'Cannot rebind a different observer or fleet');
 check(references?.members instanceof Map&&references.variants instanceof Map,'Actual current identity indexes required');
 const collection=s.view.shipViews,remapped=new Map();
 for(const row of collection.views){
  const old=row.item,member=references.members.get(old.objectRef)??old,child=row.view;
  check(member.type===old.type&&child.member===old,'Lost persistent member/view identity');
  // A disappeared member keeps its last object for CollectionView.notifyOrphaned -> fade-out.
  // It is never inserted into the new world and rebind does not acknowledge an authority sync.
  remapped.set(old,member);row.item=member;child.fleet=fleet;child.member=member;
  check(child.scope==='native-campaign-fleet-member-view'&&child.engineGlow?.member===old,'Actual native member view required for rebind');child.engineGlow.member=member;
  for(const icon of child.moduleIcons)if(icon.scope==='native-campaign-module-icon')icon.variant=references.variants.get(icon.variant.objectRef)??icon.variant;
 }
 for(let i=0;i<collection.orphaned.length;i++)collection.orphaned[i]=remapped.get(collection.orphaned[i])??collection.orphaned[i];
 s.fleet=fleet;s.observer=observer;s.contact.fleet=fleet;if(s.contact.sensorContactIndicatorManager)s.contact.sensorContactIndicatorManager.fleet=fleet;
 s.view.lightSource=fleet.campaign.view.lightSource;s.view.lightColor=fleet.campaign.view.lightColor;
 return validateOriginalFleetObserverPresentation(s);
}
function contextFor(s,context){check(context.currentLocation===s.observer.campaign.entity.containingLocation,'Observer current location mismatch');return {get currentLocation(){return context.currentLocation;},get paused(){return context.paused;},get isFastForwardIteration(){return context.isFastForwardIteration;},playerFleet:s.observer};}
/** Base contact phase only. Host advances AI/world once, never once per observer. */
export function advanceOriginalFleetObserverContact(s,seconds,context,services={}){
 state(s);seconds=scalar(seconds);const faction=services.readFleetIndicatorFaction?call(services,'readFleetIndicatorFaction',s.fleet):s.fleet.campaign.faction;
 if(faction!==null)setOriginalFleetIndicatorColors(s.fleet,faction.specColor,faction.secondaryUIColor,faction.specSecondarySegments,services,s.contact);
 const result=advanceOriginalFleetContact(s.fleet,seconds,s.random,contextFor(s,context),services,s.contact);
 advanceOriginalFader(s.contact.sensorFader,seconds);advanceOriginalFader(s.contact.sensorContactFader,seconds);return result;
}
/** Read the list the native lists-only getter would return without acknowledging a world sync.
 * Native ownership repair remains the authority's responsibility, never an observation side effect. */
function observerMembers(fleet){
 const sync=fleet.synchronization;check(sync&&Array.isArray(fleet.members),'Actual current member list required');
 if((!fleet.attachedToCampaignFleet||fleet.stats!=null)&&sync.needsSync&&!sync.forceNoSync&&!fleet.members.some(member=>member.type!=='NULL'&&member.repairTracker===null)){
  const members=fleet.members.filter(member=>member.type!=='NULL');check(members.every(member=>member.fleetDataRef===fleet.dataRef),'Actual world member ownership must be synchronized before observing');return members.sort((a,b)=>(originalFleetPointCost(b)-originalFleetPointCost(a))|0);
 }
 check(Array.isArray(fleet.sortedMembersWithoutNull),'Actual current cached member list required');return fleet.sortedMembersWithoutNull;
}
/** Separate post-member phase preserves CampaignFleet.advance's ordering. */
export function advanceOriginalFleetObserverView(s,seconds,context,services={}){
 state(s);seconds=scalar(seconds);const ctx=contextFor(s,context),visible=boolean(call(services,'isFleetVisible',s.fleet,500));
 if(visible||boolean(call(services,'willFleetBeVisible',s.fleet))){s.view.lightSource=s.fleet.campaign.view.lightSource;s.view.lightColor=s.fleet.campaign.view.lightColor;advanceOriginalFleetView(s.fleet,seconds,ctx,s.random,{readSortedFleetViewMembers:observerMembers,readFleetViewTravelSpeed:fleet=>scalar(fleet.travelSpeed),...services},s.view);return true;}
 clearOriginalFleetView(s.fleet,s.view);return false;
}
function arrow(color,size,alpha,angle){const texture=R.textures[R.assets.arrow];check(texture,'Actual native fleet arrow source required');return {texture,width:size,height:size,centerX:-1,centerY:-1,angle,color,alphaMult:alpha,blendSrc:770,blendDest:771};}
function courseArrows(frame,fleet,rgba,alpha,course,radius){
 if(course===null)return;check(course&&Array.isArray(course.target)&&course.target.length===2&&course.target.every(Number.isFinite),'Actual current course target required');
 const zoom=scalar(course.zoom),phase=scalar(course.phase),brightness=scalar(course.brightness);check(zoom>0&&phase>=0&&phase<=1&&brightness>=0&&brightness<=1,'Invalid current course widget');
 const size=f(10*zoom),dx=f(course.target[0]-fleet.position[0]),dy=f(course.target[1]-fleet.position[1]),facing=f(Math.atan2(dy,dx)*180/Math.PI),x=f(Math.cos(facing*Math.PI/180)),y=f(Math.sin(facing*Math.PI/180));
 const length=f(f(size+3)*15),distance=f(Math.sqrt(f(f(dx*dx)+f(dy*dy)))),available=Math.max(0,f(f(distance-length)-50));alpha=f(alpha*brightness);if(length>available)alpha=f(alpha*f(available/length));
 const sprite=arrow(rgba,size,alpha,f(facing-90));for(let i=0;i<15;i++){let at=f(phase+f(f(i)*f(1/15)));while(at>1)at=f(at-1);let opacity=1;if(at<f(.1))opacity=f(at/f(.1));else if(at>f(1-f(.25)))opacity=f(f(1-at)/f(.25));const offset=f(f(f(radius+5)+size)+f(at*length));sprite.alphaMult=f(alpha*opacity);originalFleetDrawSprite(frame,'course-arrow',sprite,[f(offset*x),f(offset*y)]);}
}
/** Two ordered layers, not a complete scene: all fleet layers precede all contact layers. */
export function renderOriginalFleetObserverLayers(s,context,services={}){
 state(s);contextFor(s,context);const fleet=s.fleet,c=fleet.campaign,contact=s.contact,alpha=scalar(context.alpha),radius=services.readFleetRadius?scalar(call(services,'readFleetRadius',fleet)):originalFleetSensorRadius(fleet);
 check(alpha>=0&&alpha<=1&&Object.hasOwn(context,'course'),'Actual viewport alpha and nullable course widget required');
 const layers={scope:'native-observer-fleet-layers',fleet:createOriginalFleetDrawFrame(fleet.position),contacts:createOriginalFleetDrawFrame(fleet.position)};
 if(c.entity.containingLocation!==context.currentLocation||c.flags.hidden!==null)return layers;
 if(boolean(call(context,'isNearViewport',fleet.position,450))){let brightness=f(alpha*contact.sensorFader.currBrightness);if(brightness>0){const visibility=call(services,'readVisibilityToPlayer',fleet);check(['NONE','SENSOR_CONTACT','COMPOSITION_DETAILS','COMPOSITION_AND_FACTION_DETAILS'].includes(visibility),'Actual observer visibility level required');brightness=f(brightness*contact.sensorContactFader.currBrightness);
  if(brightness>0){layers.fleet=renderOriginalFleetGraphics(fleet,brightness,services,s.view);if(c.flags.fadeAndExpire===null&&visibility!=='SENSOR_CONTACT'&&c.flags.stationMode===null){const heading=fleet.campaign.facing.facing,offset=f(radius+5),x=f(Math.cos(heading*Math.PI/180)),y=f(Math.sin(heading*Math.PI/180));originalFleetDrawSprite(layers.fleet,'heading-arrow',arrow(contact.indicator.color,10,f(brightness*f(.5)),f(heading-90)),[f(offset*x),f(offset*y)]);if(fleet===s.observer)courseArrows(layers.fleet,fleet,contact.indicator.color,brightness,context.course,radius);}}
 }}
 if(boolean(call(context,'isNearViewport',fleet.position,f(radius+20)))&&contact.sensorContactIndicatorManager?.sensorInds!=null)layers.contacts=renderOriginalFleetContact(fleet,alpha,{playerFleet:s.observer,currentLocation:context.currentLocation},services,contact);
 return layers;
}
export function validateOriginalFleetObserverPresentation(s){state(s);validateOriginalJavaRandom(s.random);validateOriginalFleetContact(s.fleet,s.contact);validateOriginalFleetView(s.fleet,s.view);return s;}
