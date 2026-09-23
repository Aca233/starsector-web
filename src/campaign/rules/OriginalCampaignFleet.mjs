import {validateOriginalModularFleetAI} from './OriginalModularFleetAI.mjs';
import {validateOriginalFleetInflater} from './OriginalFleetInflater.mjs';
import {validateOriginalFleetAbilities} from './OriginalCampaignAbilities.mjs';
import {createOriginalFleetView,validateOriginalFleetView} from './OriginalCampaignFleetView.mjs';
import {validateOriginalFleetContact} from './OriginalFleetContact.mjs';
/** CampaignFleet(Faction) logical construction; no GL context, AI, location registration or natural frame. */
import R from '../data/reference-fleet-construction.json' with {type:'json'};
import {validateOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
import {requireThat,canonicalJSON} from '../core/Values.mjs';
import {nextOriginalNativeUID} from './OriginalMarketPersonnel.mjs';
import {createOriginalFleetStats} from './OriginalNativeFleetStats.mjs';
import {createOriginalNativeFleetCounts} from './OriginalNativeFleetCounts.mjs';
import {createOriginalSmoothMovement,createOriginalSmoothFacing} from './OriginalMovement.mjs';
import {createOriginalFader,fadeOriginalFader,validateOriginalFader} from './OriginalFader.mjs';
import {createOriginalJavaRandom,originalJavaNextDouble,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {advanceOriginalNativeFleetLogistics} from './OriginalNativeLogistics.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_CAMPAIGN_FLEET',m),blank=()=>({flat:[],percent:[],mult:[]});
const number=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n)&&Number.isFinite(f(n)),'Actual finite '+label+' required');return f(n);};
const color=c=>c===null||Array.isArray(c)&&c.length===4&&c.every(n=>Number.isInteger(n)&&n>=0&&n<=255);
export function validateOriginalFleetConstructionFaction(faction){
 check(faction?.scope==='native-current-faction-fleet-construction'&&typeof faction.objectRef==='string'&&typeof faction.factionId==='string','Actual current faction object required');
 check(faction.shipNamePrefix===null||typeof faction.shipNamePrefix==='string','Current prefix including runtime override required');
 if(Object.hasOwn(faction,'specBaseUIColor'))check(color(faction.specBaseUIColor),'Actual optional spec base UI color required');
 check(color(faction.specColor)&&color(faction.secondaryUIColor)&&Number.isInteger(faction.specSecondarySegments),'Current/spec faction colors and spec segment count required');return faction;
}
/** Source resource descriptors are not GPU texture handles. Resumed factories keep
 * one shared source record per asset; the eventual renderer owns its GL cache. */
export function initializeOriginalCampaignResources(factory){
 check(Object.hasOwn(factory,'campaignResources'),'Current constructor resource registry missing');
 if(factory.campaignResources===null)factory.campaignResources={scope:'native-campaign-construction-resources',textures:structuredClone(R.textures),selectionColor:[...R.selectionColor],combatReadinessPlugin:R.combatReadinessPlugin};
 return validateOriginalCampaignResources(factory.campaignResources);
}
export function validateOriginalCampaignResources(resources){
 check(resources?.scope==='native-campaign-construction-resources'&&canonicalJSON(resources.textures)===canonicalJSON(R.textures),'Unverified constructor texture sources');
 check(canonicalJSON(resources.selectionColor)===canonicalJSON(R.selectionColor)&&resources.combatReadinessPlugin===R.combatReadinessPlugin,'Unverified constructor settings');return resources;
}
function sprite(objectRef,texture){return {objectRef,texture,textureId:texture.path,width:texture.width,height:texture.height,texX:0,texY:0,texWidth:texture.texWidth,texHeight:texture.texHeight,angle:0,color:[255,255,255,255],alphaMult:1,colorUL:[255,255,255,255],colorUR:[255,255,255,255],colorLL:[255,255,255,255],colorLR:[255,255,255,255],centerX:-1,centerY:-1,offsetX:0,offsetY:0,blendSrc:770,blendDest:771,texClamp:false};}
export function createOriginalBaseCampaignEntity(objectRef,id,resources){
 const indicator={objectRef:objectRef+':indicator',entityRef:objectRef,fader:createOriginalFader(0,.25,.25),pulse:createOriginalFader(0,.25,.5),color:[255,255,255,0],secondaryColor:null,typeOrdinal:2,pendingTypeOrdinal:null,pendingColor:null,radius:0,lineWidth:3,renderList:null,texture:resources.textures['graphics/hud/line8x8.png'],radiusOverride:0,alternateGeometry:false,brightnessMult:1,brightnessOverride:0,specialMode:false,secondarySegments:0};fadeOriginalFader(indicator.fader,'IN');
 return {objectRef,id,position:[0,0],velocity:[0,0],name:null,expired:false,lightColor:null,customDescriptionId:null,transponderOn:false,facing:0,freeTransfer:false,j0:null,factionRef:'native-static:NO_FACTION',orbit:null,containingLocation:null,lightSource:null,indicator,
  selectionIndicator:{objectRef:objectRef+':selection',entityRef:objectRef,color:resources.selectionColor,fader:createOriginalFader(0,.1,.1)},memory:null,market:null,scripts:[],activePerson:null,floatingText:null,abilities:null,customData:null,sensorContactIndicatorManager:null,discoverable:null,discoveryXP:null,salvageXP:null,dropValue:null,dropRandom:null,sensorFader:createOriginalFader(1,.2,.2),sensorContactFader:createOriginalFader(0,.2,.2),customVisual:null,tags:null,autogenJumpPointNameInSystem:null,autogenJumpPointNameInHyper:null,skipForJumpPointAutoGen:false,alwaysUseSensorFaderBrightness:null,extendedDetectedAtRange:null,sensorStrength:null,sensorProfile:null,detectedRangeMod:blank(),sensorRangeMod:blank(),detectionRangeDetailsOverrideMult:null};
}
/** com.fs.starfarer.util.IntervalTracker, NOT the differently-behaving API class. */
export function createOriginalEngineInterval(min,max,random){const s={minInterval:number(min,'minimum interval'),maxInterval:number(max,'maximum interval'),currInterval:0,elapsed:0,intervalElapsed:false};nextInterval(s,random);return s;}
function nextInterval(s,random){s.currInterval=f(s.minInterval+f(f(s.maxInterval-s.minInterval)*f(originalJavaNextDouble(random))));s.elapsed=0;s.intervalElapsed=false;}
export function advanceOriginalEngineInterval(s,amount,random){if(s.intervalElapsed)nextInterval(s,random);s.elapsed=f(s.elapsed+number(amount,'interval amount'));if(s.elapsed>=s.currInterval)s.intervalElapsed=true;return s;}
function accidents(fleet,random){
 const randomSeed=BigInt(Math.trunc(originalJavaNextDouble(random)*2**63)).toString(),tracker=createOriginalEngineInterval(.5,1.5,random),riskRandom=createOriginalJavaRandom(randomSeed);
 return {objectRef:fleet.objectRef+':accidents',fleetRef:fleet.objectRef,randomSeed,random:riskRandom,tracker,currentChance:0,context:{daysWithoutSupplies:0},risks:[{kind:'native-low-cr-ship-loss',fleetDataRef:fleet.dataRef,cargo:fleet.cargo,random:riskRandom}]};
}
/** Explicit current Faction values are mandatory: static faction defaults may not
 * overwrite runtime prefix/color overrides. Class objects must already be bound
 * or explicitly initialized; this does not recreate the original JVM's statics. */
export function constructOriginalCampaignFleet(player,faction,context,services){
 validateOriginalFleetConstructionFaction(faction);check(typeof context?.isInSectorGen==='boolean','Actual sector-generation context required');
 const secondsPerDay=number(context.secondsPerDay,'seconds per day');check(secondsPerDay>0,'Positive native day length required');
 check(typeof services?.createFleetData==='function'&&typeof services.initializeCommander==='function','Actual FleetData and commander constructors required');
 const resources=validateOriginalCampaignResources(services.resources);validateOriginalJavaRandom(services.globalRandom);
 const id=nextOriginalNativeUID(player),objectRef='created-campaign-fleet:'+player.nativeUID.sectorRef+':'+id,entity=createOriginalBaseCampaignEntity(objectRef,id,resources);
 const stats=createOriginalFleetStats(objectRef+':stats'),noCombatPulse=createOriginalFader(0,.1,.1,true,true);
 entity.factionRef=faction.objectRef;const arrow=sprite(objectRef+':arrow',resources.textures['graphics/warroom/ship_arrow.png']);
 const binding=services.createFleetData(faction.shipNamePrefix,faction.factionId),fleet=binding?.fleet;
 check(fleet?.nativeConstruction==='fleet-data'&&fleet.attachedToCampaignFleet===false&&fleet.commanderRef===null,'Fresh actual FleetData required');
 Object.assign(fleet,{objectRef,campaignFleetRef:objectRef,id,factionId:faction.factionId,attachedToCampaignFleet:true,aiMode:false,stats,fleetStatsRef:stats.objectRef,fleetwideMaxBurnMod:stats.fleetwideMaxBurnMod,counts:createOriginalNativeFleetCounts(),despawning:false,forceNoSensorProfileUpdate:null,sensorProfile:null,sensorStrength:null,inflater:null,inflated:false,battle:null,isPlayerFleet:false,transponderOn:false,position:entity.position,facing:90,name:'巡逻队'});
 const view=createOriginalFleetView(objectRef);
 const movement=createOriginalSmoothMovement(1,2,objectRef),facing=createOriginalSmoothFacing(150,100);facing.facing=90;
 const flags={reportedSpawned:false,noAutoDespawn:null,doNotAdvanceAI:null,wasMousedOverByPlayer:null,isInJumpTransition:null,inHyperspaceTransitionWarpOutStage:null,noFactionInName:null,stationMode:null,wasOutOfSupplies:null,wasOutOfCrew:null,fadeAndExpire:null,hidden:null,inflated:null,forceNoSensorProfileUpdate:null,abortDespawn:null,goSlowOneFrame:null,wasSlowMoving:null,goSlowStop:null};
 fleet.campaign={schemaVersion:1,scope:'native-constructed-campaign-fleet',entity,faction,arrow,view,movement,facing,desiredFacing:90,moveDestination:null,moveOverride:false,noCombat:null,noCombatPulse,ai:null,interactionTarget:null,flags,despawnListeners:null,abilityRenderer:null,nullAIActionText:null,layers:['FLEETS'],jumpDestination:null,moveDestinationSetWhileInLocation:null,accidents:null,logistics:null,sensorRangeIndicator:null,rendering:'source-state-only-not-rendered',worldRegistered:false};
 entity.indicator.color=faction.specColor??[155,155,155,155];entity.indicator.secondaryColor=faction.secondaryUIColor;entity.indicator.secondarySegments=faction.specSecondarySegments;
 services.initializeCommander(fleet,faction.factionId,context.isInSectorGen);
 fleet.campaign.accidents=accidents(fleet,services.globalRandom);
 fleet.logisticsRef=objectRef+':logistics';fleet.campaign.logistics={objectRef:fleet.logisticsRef,fleetRef:objectRef,plugin:{objectRef:objectRef+':cr-plugin',className:resources.combatReadinessPlugin}};
 fleet.logisticsEnvironment={velocity:entity.velocity,secondsPerDay,inHyperspace:false};
 fleet.campaign.sensorRangeIndicator={fleetRef:objectRef,color:null,fader:createOriginalFader(0,.5,.5),phase:0,texture:resources.textures['graphics/hud/line8x8.png'],renderList:null,radius:0,lineWidth:0};
 validateOriginalConstructedCampaignFleet(fleet,resources);return binding;
}
export function setOriginalConstructedFleetLocation(fleet,x,y){const c=fleet.campaign;check(c?.scope==='native-constructed-campaign-fleet','Actual constructed fleet required');x=number(x,'x');y=number(y,'y');c.entity.position[0]=x;c.entity.position[1]=y;c.movement.position[0]=x;c.movement.position[1]=y;}
export function setOriginalConstructedFleetVelocity(fleet,x,y){check(fleet.campaign?.scope==='native-constructed-campaign-fleet','Actual constructed fleet required');fleet.campaign.movement.velocity[0]=number(x,'vx');fleet.campaign.movement.velocity[1]=number(y,'vy');}
export function setOriginalConstructedFleetFacing(fleet,angle){check(fleet.campaign?.scope==='native-constructed-campaign-fleet','Actual constructed fleet required');fleet.facing=number(angle,'facing');fleet.campaign.facing.facing=fleet.facing;}
/** Actual existing LogisticsModule algorithm, not an unimplemented plugin marker. */
export function advanceOriginalConstructedFleetLogistics(fleet,days,services={}){check(fleet.campaign?.logistics?.plugin.className===R.combatReadinessPlugin,'Unported logistics plugin');return advanceOriginalNativeFleetLogistics(fleet,days,services);}
export function validateOriginalConstructedCampaignFleet(fleet,resources){
 const c=fleet.campaign;check(c?.schemaVersion===1&&c.scope==='native-constructed-campaign-fleet'&&fleet.attachedToCampaignFleet&&fleet.campaignFleetRef===fleet.objectRef&&c.entity.objectRef===fleet.objectRef,'Invalid constructed CampaignFleet identity');
 check(typeof c.worldRegistered==='boolean'&&(c.entity.containingLocation===null||c.entity.containingLocation.scope==='native-location-fleet-registry'),'Invalid actual fleet world state');
 check(c.abilityRenderer===null||c.abilityRenderer.fleet===fleet,'Lost ability-renderer owner');check(c.despawnListeners===null||Array.isArray(c.despawnListeners),'Invalid fleet listener roster');
 validateOriginalFleetConstructionFaction(c.faction);check(c.entity.factionRef===c.faction.objectRef&&fleet.factionId===c.faction.factionId,'Lost actual fleet faction');
 check(fleet.position===c.entity.position&&c.movement.delegate===fleet.objectRef&&fleet.logisticsEnvironment?.velocity===c.entity.velocity&&c.entity.velocity!==c.movement.velocity,'Lost shared fleet movement state');
 check(c.entity.sensorProfile===fleet.sensorProfile&&c.entity.sensorStrength===fleet.sensorStrength,'Lost actual entity sensor values');
 check(fleet.stats?.objectRef===fleet.fleetStatsRef&&fleet.fleetwideMaxBurnMod===fleet.stats.fleetwideMaxBurnMod,'Lost actual constructed fleet stats');
 validateOriginalFleetView(fleet);
 for(const s of [c.entity.sensorFader,c.entity.sensorContactFader,c.entity.indicator.fader,c.entity.indicator.pulse,c.entity.selectionIndicator.fader,c.noCombatPulse,c.sensorRangeIndicator.fader])validateOriginalFader(s);
 if(c.noCombat!==null)validateOriginalFader(c.noCombat);
 if(c.entity.memory!==null)validateOriginalCampaignMemory(c.entity.memory);
 validateOriginalFleetContact(fleet);validateOriginalFleetAbilities(fleet);if(c.ai?.scope==='native-modular-fleet-ai')validateOriginalModularFleetAI(c.ai,fleet);if(fleet.inflater?.scope==='native-default-fleet-inflater')validateOriginalFleetInflater(fleet.inflater);
 const line=resources.textures['graphics/hud/line8x8.png'];check(c.entity.indicator.texture===line&&c.sensorRangeIndicator.texture===line&&c.arrow.texture===resources.textures['graphics/warroom/ship_arrow.png'],'Lost constructor source resource sharing');
 const a=c.accidents;check(a?.fleetRef===fleet.objectRef&&a.risks.length===1&&a.risks[0].kind==='native-low-cr-ship-loss'&&a.risks[0].fleetDataRef===fleet.dataRef&&a.risks[0].cargo===fleet.cargo&&a.risks[0].random===a.random,'Lost actual accident risk dependencies');validateOriginalJavaRandom(a.random);
 check(c.logistics.objectRef===fleet.logisticsRef&&c.logistics.fleetRef===fleet.objectRef&&c.logistics.plugin.className===R.combatReadinessPlugin,'Lost actual logistics binding');return fleet;
}
