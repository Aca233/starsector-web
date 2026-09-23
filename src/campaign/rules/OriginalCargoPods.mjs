/** Stock cargo_pods CustomCampaignEntity construction and CargoPodsEntityPlugin size state.
 * Actual world objects, not cooperative-cargo DTOs. Natural BaseEntity/contact/field rendering
 * still requires its corresponding frame services; no expiry timer is silently substituted.
 */
import {validateOriginalFader} from './OriginalFader.mjs';
import {validateOriginalEntityFadeScript} from './OriginalCampaignEntityFrame.mjs';
import {validateOriginalFleetContact} from './OriginalFleetContact.mjs';
import R from '../data/reference-fleet-construction.json' with {type:'json'};
import {requireThat,canonicalJSON} from '../core/Values.mjs';
import {createOriginalBaseCampaignEntity,validateOriginalFleetConstructionFaction} from './OriginalCampaignFleet.mjs';
import {nextOriginalNativeUID} from './OriginalMarketPersonnel.mjs';
import {originalJavaNextDouble,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {validateOriginalResourceCargo} from './OriginalResourceCargo.mjs';
import {originalNativeCargoItemQuantity} from './OriginalNativeCargo.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_CARGO_PODS',m),int=n=>Number.isNaN(n)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));
const call=(s,k,...a)=>{check(typeof s[k]==='function','Actual cargo-pods service required: '+k);const v=s[k](...a);check(!v||typeof v.then!=='function','Synchronous cargo-pods service required');return v;};
export const isOriginalCargoPods=object=>object?.scope==='native-custom-campaign-entity'&&object.type==='cargo_pods';
export function createOriginalCargoPods(player,faction,lightSource,services){
 validateOriginalFleetConstructionFaction(faction);check(faction.factionId==='neutral','Misc.addCargoPods requires the actual neutral faction');
 const id=nextOriginalNativeUID(player),objectRef='created-custom-entity:'+player.nativeUID.sectorRef+':'+id,entity=createOriginalBaseCampaignEntity(objectRef,id,services.resources),spec=R.cargoPods.spec;
 const cargo=call(services,'createCargo',objectRef);check(cargo.carryingFleetRef===null&&cargo.mothballedShips===null,'Actual unattached custom-entity Cargo required');
 entity.factionRef=faction.objectRef;entity.lightSource=lightSource;entity.name=spec.defaultName;entity.customDescriptionId=spec.customDescriptionId;
 entity.indicator.color=faction.specColor??[155,155,155,155];entity.indicator.secondaryColor=faction.secondaryUIColor;entity.indicator.secondarySegments=faction.specSecondarySegments;
 entity.customVisual={...R.cargoPods.interactionImage};entity.tags=[...spec.tags];entity.facing=90;
 cargo.mothballedShips=call(services,'createMothballedShips',faction.shipNamePrefix,faction.factionId);
 const pod={scope:'native-custom-campaign-entity',objectRef,id,type:'cargo_pods',entity,position:entity.position,faction,cargo,spec,width:spec.spriteWidth,height:spec.spriteHeight,radius:spec.defaultRadius,sheetCellX:-1,sheetCellY:-1,sprite:null,shadowMask:null,layers:[...spec.layers],firstLayer:spec.layers[0]??null,fleetForVisual:null,worldRegistered:false,plugin:null};
 entity.detectionRangeDetailsOverrideMult=f(.5);
 pod.plugin={scope:'native-cargo-pods-plugin',entity:pod,elapsed:0,maxDays:1,extraDays:0,neverExpire:null,manager:{scope:'native-generic-field-item-manager',entity:pod,items:null,inited:false,numPieces:0,category:'misc',key:'cargoPods',cellSize:32,minSize:10,maxSize:10}};
 validateOriginalCargoPods(pod);return pod;
}
/** Misc.addCargoPods runs this AFTER addCustomEntity registers the object. */
export function initializeOriginalCargoPodsDrift(pod,position,mathRandom){
 validateOriginalCargoPods(pod);validateOriginalJavaRandom(mathRandom);check(Array.isArray(position)&&position.length===2&&position.every(n=>Number.isFinite(n)&&Number.isFinite(f(n))),'Actual finite player location required');
 pod.position[0]=f(position[0]);pod.position[1]=f(position[1]);const angle=f(f(originalJavaNextDouble(mathRandom))*360),radians=f(angle*f(Math.PI/180)),speed=f(5+f(10*f(originalJavaNextDouble(mathRandom))));
 pod.entity.velocity[0]=f(f(Math.cos(radians))*speed);pod.entity.velocity[1]=f(f(Math.sin(radians))*speed);pod.entity.discoverable=null;pod.entity.discoveryXP=null;pod.entity.sensorProfile=1;return pod;
}
export function updateOriginalCargoPodsSize(pod){
 validateOriginalCargoPods(pod);const cargo=pod.cargo,quantity=id=>originalNativeCargoItemQuantity(cargo,{type:'RESOURCES',commodityId:id});
 const personnel=(int(quantity('crew'))+int(cargo.extraCrewUsed)+int(quantity('marines'))+int(cargo.extraMarinesUsed))|0,fuel=f(quantity('fuel')+cargo.extraFuelUsed),space=cargo.spaceUsed,total=f(f(space+fuel)+f(personnel));
 const pieces=Math.max(5,Math.min(40,int(Math.sqrt(total)))),cryo=f(personnel)>f(space+fuel);pod.plugin.manager.numPieces=pieces;pod.entity.name=cryo?'冷冻舱':'货物吊舱';pod.entity.customDescriptionId=cryo?'cryopods':'cargo_pods';pod.radius=f(10+f(10*f(Math.sqrt(pieces-4))));pod.plugin.maxDays=f(5+f(pieces-5));
}
export function validateOriginalCargoPods(pod){
 check(isOriginalCargoPods(pod)&&typeof pod.objectRef==='string'&&typeof pod.id==='string','Actual cargo-pods entity required');const e=pod.entity;
 check(e?.objectRef===pod.objectRef&&e.id===pod.id&&pod.position===e.position,'Lost custom-entity identity/position');for(const v of [e.position,e.velocity])check(Array.isArray(v)&&v.length===2&&v.every(n=>Number.isFinite(n)&&f(n)===n),'Actual custom-entity vectors required');
 check(typeof e.expired==='boolean'&&typeof pod.worldRegistered==='boolean','Actual entity lifecycle required');validateOriginalFleetConstructionFaction(pod.faction);check(e.factionRef===pod.faction.objectRef,'Lost custom-entity faction');
 validateOriginalResourceCargo(pod.cargo);check(pod.cargo.carryingFleetRef===null&&pod.cargo.mothballedShips?.nativeConstruction==='fleet-data','Actual custom Cargo with its mothballed FleetData required');
 check(canonicalJSON(pod.spec)===canonicalJSON(R.cargoPods.spec),'Unverified cargo-pods spec');check(Array.isArray(pod.layers)&&pod.layers.every(layer=>R.worldRegistration.layers.includes(layer)),'Invalid custom entity render layers');for(const key of ['width','height','radius'])check(Number.isFinite(pod[key])&&f(pod[key])===pod[key],'Actual custom entity size required');
 const p=pod.plugin;check(p?.scope==='native-cargo-pods-plugin'&&p.entity===pod,'Lost cargo-pods plugin owner');for(const key of ['elapsed','maxDays','extraDays'])check(Number.isFinite(p[key])&&f(p[key])===p[key],'Actual cargo-pods clock required');check(p.neverExpire===null||typeof p.neverExpire==='boolean','Actual nullable lifetime override required');
 validateOriginalCargoPodsField(pod,p.manager);
 validateOriginalFleetContact(pod,e);check(Array.isArray(e.scripts),'Actual custom entity scripts required');for(const script of e.scripts)if(script?.scope==='native-entity-fade-expire-script')validateOriginalEntityFadeScript(script,e);return pod;
}

export function validateOriginalCargoPodsField(pod,m){
 check(m?.scope==='native-generic-field-item-manager'&&m.entity===pod&&typeof m.inited==='boolean'&&(m.items===null||Array.isArray(m.items))&&Number.isInteger(m.numPieces)&&m.numPieces>=0,'Actual field manager required');
 check(m.inited===(m.items!==null),'Lost field initialization state');
 for(const item of m.items??[]){check(item?.scope==='native-generic-field-item'&&item.entity===pod,'Lost field item/entity identity');for(const k of ['width','height','timeLeft','facing','angVel'])check(Number.isFinite(item[k])&&f(item[k])===item[k],'Actual field item float required');for(const k of ['loc','vel'])check(Array.isArray(item[k])&&item[k].length===2&&item[k].every(n=>Number.isFinite(n)&&f(n)===n),'Actual field item vector required');check(Number.isInteger(item.cellX)&&item.cellX>=0&&item.cellX<R.cargoPods.fieldTexture.width/m.cellSize&&Number.isInteger(item.cellY)&&item.cellY>=0&&item.cellY<R.cargoPods.fieldTexture.height/m.cellSize,'Invalid field sprite cell');validateOriginalFader(item.fader);}
 return m;
}
