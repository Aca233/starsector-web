/** SensorContactIndicatorManager.advance for actual fleets and stock cargo pods.
 * Native contact state, ordered ping/sound intents and source-backed GPU quads; no audio playback.
 * Discovery and DetectedEntity listeners execute synchronously through real services. */
import R from '../data/reference-fleet-view.json' with {type:'json'};
import {createOriginalFleetDrawFrame,originalFleetDrawSprite,originalFleetDrawMask,NATIVE_FLEET_RGB_MASK} from './OriginalFleetDraw.mjs';
import {requireThat} from '../core/Values.mjs';
import {createOriginalFader,advanceOriginalFader,fadeOriginalFader,forceOriginalFader,originalFaderIsIn,originalFaderIsOut,validateOriginalFader} from './OriginalFader.mjs';
import {originalJavaNextDouble} from './OriginalJavaRandom.mjs';
import {originalEntityMemoryWithoutUpdate,originalCampaignMemoryInteger,originalCampaignMemoryContains} from './OriginalCampaignMemory.mjs';
import {originalFleetSensorRadius} from './OriginalSensors.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_CONTACT',m),LEVELS=['NONE','SENSOR_CONTACT','COMPOSITION_DETAILS','COMPOSITION_AND_FACTION_DETAILS'];
const campaign=owner=>{if(owner?.scope==='native-campaign-planet'||owner?.scope==='native-custom-campaign-entity'&&owner.type==='cargo_pods')return owner;check(owner?.campaign?.entity,'Actual contact owner required');return owner.campaign;};
const entityOf=owner=>campaign(owner).entity;
const profileOf=owner=>owner.campaign?owner.sensorProfile:entityOf(owner).sensorProfile;
const scalar=n=>{check(Number.isFinite(n)&&Number.isFinite(f(n)),'Actual native contact float required');return f(n);};
const int=n=>Number.isNaN(n)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));
function invoke(services,name,...args){check(typeof services[name]==='function','Actual fleet contact service required: '+name);const result=services[name](...args);check(!result||typeof result.then!=='function','Fleet contact services must be synchronous');return result;}
const level=v=>{check(LEVELS.includes(v),'Actual visibility level required');return v;};
const color=v=>{check(Array.isArray(v)&&v.length===4&&v.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'Actual native RGBA color required');return v;};
/** Observer-owned visual state; the fleet/member graph is never cloned or swapped. */
export function createOriginalFleetContactPresentation(fleet){
 entityOf(fleet);
 return {fleet,sensorContactIndicatorManager:null,sensorFader:createOriginalFader(1,.2,.2),sensorContactFader:createOriginalFader(0,.2,.2),indicator:{color:[255,255,255,0],secondaryColor:null,secondarySegments:0,renderList:null}};
}
export function originalFleetContactManager(fleet,presentation=entityOf(fleet)){
 const entity=presentation;check(entity&&Object.hasOwn(entity,'sensorContactIndicatorManager'),'Actual constructed fleet contact field required');
 if(entity.sensorContactIndicatorManager===null)entity.sensorContactIndicatorManager={scope:'native-fleet-contact-indicator-manager',fleet,questionMark:null,sensorInds:null,sinceLastNoticedPing:0,sinceLastLostSightPing:0,prevLevel:null};
 return validateOriginalFleetContact(fleet,presentation);
}
export function validateOriginalFleetContact(fleet,presentation=entityOf(fleet)){
 check(!Object.hasOwn(presentation,'fleet')||presentation.fleet===fleet,'Contact presentation belongs to another fleet');validateOriginalFader(presentation.sensorFader);validateOriginalFader(presentation.sensorContactFader);
 const state=presentation.sensorContactIndicatorManager;if(state===null)return null;
 check(state?.scope==='native-fleet-contact-indicator-manager'&&state.fleet===fleet,'Lost actual contact-manager owner');
 for(const key of ['sinceLastNoticedPing','sinceLastLostSightPing'])check(scalar(state[key])===state[key],'Invalid contact timer');check(state.prevLevel===null||LEVELS.includes(state.prevLevel),'Invalid previous contact level');
 check(state.questionMark===null,'Transient contact sprite must remain in the renderer cache');check(state.sensorInds===null||Array.isArray(state.sensorInds),'Invalid current contact marker list');
 for(const marker of state.sensorInds??[]){check(marker.manager===state&&Array.isArray(marker.offset)&&marker.offset.length===2&&marker.offset.every(n=>scalar(n)===n),'Lost contact marker identity or position');validateOriginalFader(marker.fader);}return state;
}
export function setOriginalFleetIndicatorColors(fleet,primary,secondary,segments,services={},presentation=entityOf(fleet)){
 const indicator=presentation.indicator,rgba=color(primary??[155,155,155,155]);check(indicator&&Number.isInteger(segments),'Actual circle indicator required');if(secondary!==null)color(secondary);
 if(!indicator.color.every((n,i)=>n===rgba[i])){if(indicator.renderList!==null)invoke(services,'invalidateIndicatorList',indicator.renderList);indicator.color=rgba;}
 indicator.secondaryColor=secondary;indicator.secondarySegments=segments;
}
function factionColors(fleet,faction,services,presentation){check(faction,'Actual current faction colors required');setOriginalFleetIndicatorColors(fleet,faction.specColor,faction.secondaryUIColor,faction.specSecondarySegments,services,presentation);}
function newMarker(manager,fleet,random,services){
 const radius=services.readFleetRadius?scalar(invoke(services,'readFleetRadius',fleet)):originalFleetSensorRadius(fleet),angle=f(360*f(originalJavaNextDouble(random))),radians=f(angle*f(f(Math.PI)/180));
 const distance=f(f(radius*f(Math.sqrt(f(f(originalJavaNextDouble(random))+f(.01)))))*f(.6)),offset=[f(f(Math.cos(radians))*distance),f(f(Math.sin(radians))*distance)];
 let duration=f(f(originalJavaNextDouble(random))+.5);if(manager.sensorInds!==null&&manager.sensorInds.length===0)duration=f(duration*.5);
 const fader=createOriginalFader(0,duration,duration,false,true);fadeOriginalFader(fader,'IN');return {manager,offset,fader};
}
/** Counter limit from native bytecode; override is intentionally not clamped. */
export function originalFleetContactMarkerLimit(fleet,services={}){
 const entity=entityOf(fleet),radius=services.readFleetRadius?scalar(invoke(services,'readFleetRadius',fleet)):originalFleetSensorRadius(fleet);
 let count=(int(f((profileOf(fleet)??0)/10))+int(f(radius/20)))|0;count=Math.max(2,Math.min(10,count));
 const memory=services.readContactMemory?invoke(services,'readContactMemory',fleet):originalEntityMemoryWithoutUpdate(entity);count=Math.max(1,(count+originalCampaignMemoryInteger(memory,'$extraSensorIndicators',services.memoryServices))|0);
 if(originalCampaignMemoryContains(memory,'$sensorIndicatorsOverride',services.memoryServices))count=originalCampaignMemoryInteger(memory,'$sensorIndicatorsOverride',services.memoryServices);return count;
}
export function advanceOriginalFleetContact(fleet,seconds,globalRandom,context,services={},presentation=entityOf(fleet)){
 seconds=scalar(seconds);const c=campaign(fleet),isFleet=!!fleet.campaign,entity=c.entity,state=originalFleetContactManager(fleet,presentation),effects=[];
 const inCurrent=()=>entity.containingLocation===context.currentLocation,hasProfile=()=>profileOf(fleet)!==null;
 const ping=(id,rgba)=>effects.push({kind:'sensor-ping',entity:fleet,id,color:[...color(rgba)]});
 const report=value=>invoke(services,'reportDetectedEntity',fleet,value);
 state.sinceLastNoticedPing=f(state.sinceLastNoticedPing+seconds);state.sinceLastLostSightPing=f(state.sinceLastLostSightPing+seconds);
 if(state.sensorInds!==null){for(let i=0;i<state.sensorInds.length;){const marker=state.sensorInds[i];advanceOriginalFader(marker.fader,seconds);if(originalFaderIsOut(marker.fader))state.sensorInds.splice(i,1);else i++;}if(state.sensorInds.length===0)state.sensorInds=null;}
 if(fleet===context.playerFleet){forceOriginalFader(presentation.sensorFader,'IN');forceOriginalFader(presentation.sensorContactFader,'IN');return {effects};}
 const visible=invoke(services,'isFleetVisibleToPlayer',fleet);check(typeof visible==='boolean','Actual player fleet visibility required');
 if(visible&&(!isFleet||c.flags.hidden===null)){
  const visibility=level(invoke(services,'readVisibilityToPlayer',fleet));
  if(entity.discoverable===true&&visibility==='COMPOSITION_AND_FACTION_DETAILS'){const plugin=invoke(services,'pickDiscoverEntityPlugin',fleet);check(plugin===null||typeof plugin==='object','Actual discovery plugin or known null required');if(plugin!==null)invoke(services,'discoverEntity',plugin,fleet);report(visibility);}
  if(visibility==='SENSOR_CONTACT'&&(state.prevLevel==='NONE'||state.prevLevel===null)&&hasProfile()){report(visibility);state.prevLevel=visibility;}
  if(visibility==='COMPOSITION_DETAILS'||visibility==='COMPOSITION_AND_FACTION_DETAILS'){
   fadeOriginalFader(presentation.sensorContactFader,'IN');
   if(hasProfile()){if(state.prevLevel!==visibility){if(visibility==='COMPOSITION_DETAILS'&&(state.prevLevel===null||state.prevLevel==='SENSOR_CONTACT')||visibility==='COMPOSITION_AND_FACTION_DETAILS'&&(state.prevLevel===null||state.prevLevel==='SENSOR_CONTACT'||state.prevLevel==='COMPOSITION_DETAILS'))report(visibility);state.prevLevel=visibility;}}else state.prevLevel=null;
   for(const marker of state.sensorInds??[])fadeOriginalFader(marker.fader,'OUT');
   if(presentation.indicator.color[3]>0){if(visibility==='COMPOSITION_AND_FACTION_DETAILS')factionColors(fleet,services.readFleetIndicatorFaction?invoke(services,'readFleetIndicatorFaction',fleet):c.faction,services,presentation);else{
     // Native does fetch neutral before overriding its primary with gray.
     const neutral=invoke(services,'readNeutralIndicatorFaction');check(neutral&&Object.hasOwn(neutral,'specColor'),'Actual current neutral faction colors required');setOriginalFleetIndicatorColors(fleet,[125,125,125,255],[0,0,0,0],8,services,presentation);
   }}
   if(isFleet){const reverse=level(invoke(services,'readPlayerVisibilityToFleet',fleet));
   if(reverse!=='NONE'){if(state.sinceLastNoticedPing>1000){ping('noticed_player',presentation.indicator.color);state.sinceLastNoticedPing=0;state.sinceLastLostSightPing=1000;}}
   else{state.sinceLastNoticedPing=1000;if(state.sinceLastLostSightPing>1000){ping('lost_sight_of_player',presentation.indicator.color);state.sinceLastLostSightPing=0;}}
  }}else{state.sinceLastNoticedPing=1000;fadeOriginalFader(presentation.sensorContactFader,'OUT');}
  if(visibility==='SENSOR_CONTACT'){
   state.sensorInds??=[];const count=originalFleetContactMarkerLimit(fleet,services);if(state.sensorInds.length<count)state.sensorInds.push(newMarker(state,fleet,globalRandom,services));
   factionColors(fleet,invoke(services,'readNeutralIndicatorFaction'),services,presentation);
  }
  if(originalFaderIsOut(presentation.sensorFader)&&inCurrent()&&visibility==='SENSOR_CONTACT'){const rgba=color(invoke(services,'readPlayerFactionBaseUIColor'));ping('new_sensor_contact',[rgba[0],rgba[1],rgba[2],70]);}
  if(!isFleet||c.flags.fadeAndExpire===null||c.flags.fadeAndExpire===false)fadeOriginalFader(presentation.sensorFader,'IN');
 }else{
  state.sinceLastNoticedPing=1000;
  if(originalFaderIsIn(presentation.sensorFader)&&inCurrent())effects.push({kind:'campaign-sound',id:'lost_sight_of_by_player',pitch:1,volume:1,position:[...fleet.position],velocity:[...entity.velocity]});
  if(inCurrent()&&presentation.sensorFader.currBrightness>0&&state.prevLevel!==null&&hasProfile())report('NONE');
  fadeOriginalFader(presentation.sensorContactFader,'OUT');fadeOriginalFader(presentation.sensorFader,'OUT');state.prevLevel=null;
 }
 return {effects};
}

/** Same native manager, with non-fleet branches and genuine entity callbacks. The historical
 * manager field name 'fleet' remains the shared owner pointer, never a fabricated FleetData. */
export function advanceOriginalCargoPodsContact(pod,seconds,random,context,services={},presentation=pod.entity){
 check(pod?.scope==='native-custom-campaign-entity'&&pod.type==='cargo_pods','Actual stock cargo pods required');
 return advanceOriginalFleetContact(pod,seconds,random,context,{...services,readFleetRadius:entity=>entity.radius,isFleetVisibleToPlayer:services.isCargoPodsVisibleToPlayer,readVisibilityToPlayer:services.readCargoPodsVisibilityToPlayer,readFleetIndicatorFaction:entity=>entity.faction,reportDetectedEntity:services.reportDetectedCargoPods,pickDiscoverEntityPlugin:services.pickDiscoverCargoPodsPlugin,discoverEntity:services.discoverCargoPods},presentation);
}
// The Java sprite is transient too: no GPU/source cache enters a world checkpoint.
const contactSprites=new WeakMap();
export function renderOriginalFleetContact(fleet,alpha,context,services={},presentation=entityOf(fleet)){
 const frame=createOriginalFleetDrawFrame(fleet.position);if(fleet===context.playerFleet)return frame;
 const manager=originalFleetContactManager(fleet,presentation);let sprite=contactSprites.get(manager);
 if(!sprite){const texture=R.textures[R.assets.contact];check(texture,'Actual misc.question_mark source required');sprite={texture,width:texture.width,height:texture.height,centerX:-1,centerY:-1,angle:0,color:[...color(invoke(services,'readPlayerFactionColor'))],alphaMult:1,blendSrc:770,blendDest:771};contactSprites.set(manager,sprite);}
 alpha=f(scalar(alpha)*presentation.sensorFader.currBrightness);originalFleetDrawMask(frame,NATIVE_FLEET_RGB_MASK);
 for(const marker of manager.sensorInds??[]){sprite.width=35;sprite.height=35;sprite.alphaMult=f(alpha*Math.min(1,f(marker.fader.currBrightness/f(.75))));originalFleetDrawSprite(frame,'sensor-contact',sprite,marker.offset);}
 return frame;
}
