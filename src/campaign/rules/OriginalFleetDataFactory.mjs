import {validateOriginalCampaignResources,validateOriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
/** Real FleetData + CargoData construction, independent of CampaignFleet/world registration. */
import {requireThat} from '../core/Values.mjs';
import {createOriginalNullFleetMember,createOriginalFleetNaming} from './OriginalFleetMembers.mjs';
import {createOriginalDefaultFleetCaptain,originalPersonnelByRef} from './OriginalMarketPersonnel.mjs';
import {registerOriginalFleetRoster} from './OriginalFleetRoster.mjs';
import {validateOriginalNativeFleet} from './OriginalFleetData.mjs';
import {validateOriginalResourceCargo} from './OriginalResourceCargo.mjs';
const check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_DATA_FACTORY',m);
export function createOriginalFleetDataFactory(){return {scope:'web-current-fleet-data-factory',classState:null,serial:0,fleets:[],campaignResources:null};}
/** Explicit new Web class initialization WHILE in campaign: native UID branch, once per current runtime.
 * This does not reconstruct an original JVM's unsaved static IDs. Existing class objects can be bound instead. */
export function initializeOriginalFleetDataClass(factory,memberFactory,player){
 check(factory?.scope==='web-current-fleet-data-factory','Current FleetData factory required');if(factory.classState!==null)return factory.classState;
 const nullMember=createOriginalNullFleetMember(memberFactory,player),defaultCommander=createOriginalDefaultFleetCaptain(player);
 return factory.classState={scope:'native-fleet-data-class-objects',origin:'new-web-current-sector-runtime',nullMember,defaultCommander};
}
export function bindOriginalFleetDataClass(factory,nullMember,defaultCommander,player){
 check(factory?.scope==='web-current-fleet-data-factory'&&factory.classState===null&&factory.fleets.length===0,'FleetData class objects already initialized');
 check(nullMember?.type==='NULL'&&nullMember.variant===null&&nullMember.stats===null&&nullMember.status?.modules?.length===1&&nullMember.repairTracker&&nullMember.buffManager,'Actual NULL_MEMBER constructor state required');
 check(originalPersonnelByRef(player,defaultCommander.objectRef)===defaultCommander&&defaultCommander.stats?.nativeCharacterStatsVersion===1,'Actual shared defaultCommander required');
 return factory.classState={scope:'native-fleet-data-class-objects',origin:'bound-current-class-objects',nullMember,defaultCommander};
}
/** Initial CargoData(true/false) both have unlimitedStacks=true in this installed native jar. */
export function createOriginalFleetCargo(dataRef){
 check(typeof dataRef==='string'&&dataRef.length>0,'Actual FleetData object reference required');
 const objectRef='created-fleet-cargo:'+dataRef,credits={objectRef:'created-fleet-credits:'+dataRef,value:0};
 return {objectRef,credits,creditsRef:credits.objectRef,unlimitedStacks:true,partials:null,slots:[],maxCapacity:1000,maxFuel:500,maxPersonnel:750,spaceUsed:50,
  carryingFleetRef:dataRef,mothballedShips:null,freeTransfer:false,origSource:null,extraCargoUsed:0,extraCrewUsed:0,extraMarinesUsed:0,extraFuelUsed:0,extraSuppliesUsed:0,unresolved:[]};
}
/** CargoData.initMothballedShips: do not consult the faction or reset a retained fleet twice. */
export function initializeOriginalCargoMothballedShips(cargo,factionId,services){
 check(cargo&&Object.hasOwn(cargo,'mothballedShips'),'Actual native Cargo/FleetData graph required; retained storage projection cannot be reinitialized');
 if(cargo.mothballedShips!==null){check(cargo.mothballedShips?.nativeSyncScope==='native-fleet-data-sync-inputs','Actual retained mothballed FleetData required');return cargo.mothballedShips;}
 check(typeof factionId==='string'&&typeof services?.readMothballedFaction==='function'&&typeof services.createMothballedFleetData==='function','Actual Cargo mothballed fleet constructor services required');
 const faction=services.readMothballedFaction(factionId);
 check(faction&&faction.factionId===factionId&&(faction.shipNamePrefix===null||typeof faction.shipNamePrefix==='string'),'Actual current faction naming prefix required');
 const fleet=services.createMothballedFleetData(faction.shipNamePrefix,faction.factionId);
 check(fleet?.nativeSyncScope==='native-fleet-data-sync-inputs'&&typeof fleet.dataRef==='string','Actual constructed mothballed FleetData required');
 cargo.mothballedShips=fleet;cargo.mothballedShipsRef=fleet.dataRef;return fleet;
}
export function createOriginalFleetData(factory,rosters,player,prefix,sourceFactionId){
 check(factory?.scope==='web-current-fleet-data-factory'&&factory.classState,'Explicit FleetData class initialization or actual class-object binding required');
 check(player.nativeUID?.sectorRef&&Number.isSafeInteger(factory.serial)&&factory.serial>=0&&factory.serial<Number.MAX_SAFE_INTEGER,'Actual current factory identity allocator required');
 const dataRef='created-fleet-data:'+player.nativeUID.sectorRef+':'+(++factory.serial),naming=createOriginalFleetNaming(prefix,sourceFactionId),cargo=createOriginalFleetCargo(dataRef),cls=factory.classState;
 check(!factory.fleets.some(v=>v.dataRef===dataRef)&&!rosters.bindings.some(b=>b.fleet.dataRef===dataRef),'Duplicate constructed FleetData handle');
 // objectRef here is the FleetData itself, not an invented CampaignFleet entity. No world ID is allocated.
 const fleet={objectRef:dataRef,dataRef,nativeConstruction:'fleet-data',campaignFleetRef:null,nativeSyncScope:'native-fleet-data-sync-inputs',syncUnresolved:[],attachedToCampaignFleet:false,aiMode:null,
  members:[],memberRefs:[],snapshot:[],membersWithoutNull:[],sortedMembersWithoutNull:[],sortedMembersWithoutNullWithFighters:[],officers:[],cargo,credits:cargo.credits,
  commanderRef:null,defaultCommanderRef:cls.defaultCommander.objectRef,nullMember:cls.nullMember,statPeople:[cls.defaultCommander],playerPersonRef:player.player.objectRef,
  stats:null,fleetStatsRef:null,logisticsRef:null,cacheClearedOnSync:{},crewSerial:0,fleetwideMaxBurnMod:null,commanderTravelSpeedBonus:cls.defaultCommander.stats.travelSpeedBonus,
  minCrew:0,fuelPerLightYear:1,travelSpeed:100,fleetPointsUsed:0,effectiveStrength:0,postLoadReset:null,compressedMembers:null,compressedCaptains:null,
  synchronization:{needsSync:true,forceNoSync:false,onlySyncMemberLists:false,lifecycle:'native-constructed-pending'}};
 const binding=registerOriginalFleetRoster(rosters,fleet,naming,null);factory.fleets.push(fleet);return binding;
}
export function validateOriginalFleetDataFactory(factory,memberFactory,player,rosters){
 check(factory?.scope==='web-current-fleet-data-factory'&&Number.isSafeInteger(factory.serial)&&factory.serial>=0&&Array.isArray(factory.fleets),'Invalid current FleetData factory');
 check(Object.hasOwn(factory,'campaignResources'),'Missing current constructor resource registry');if(factory.campaignResources!==null)validateOriginalCampaignResources(factory.campaignResources);
 const cls=factory.classState;if(cls===null){check(factory.fleets.length===0&&factory.serial===0,'FleetData instances without class initialization');return factory;}
 check(player&&cls.scope==='native-fleet-data-class-objects'&&['new-web-current-sector-runtime','bound-current-class-objects'].includes(cls.origin),'Invalid FleetData class provenance');
 check(cls.nullMember?.type==='NULL'&&cls.nullMember.variant===null&&cls.nullMember.stats===null&&cls.nullMember.status?.modules?.length===1&&cls.nullMember.repairTracker&&cls.nullMember.buffManager,'Missing actual static NULL_MEMBER');
 if(cls.origin==='new-web-current-sector-runtime')check(memberFactory?.members.includes(cls.nullMember),'Lost created static NULL_MEMBER identity');
 check(originalPersonnelByRef(player,cls.defaultCommander.objectRef)===cls.defaultCommander,'Lost shared default commander');
 const variants=new Map(),seenVariants=new Set();const variantIdentity=v=>{if(!v)return;check(typeof v.objectRef==='string','Actual module variant identity required');const known=variants.get(v.objectRef);check(!known||known===v,'Lost shared module-variant identity');if(seenVariants.has(v))return;seenVariants.add(v);variants.set(v.objectRef,v);if(v.moduleVariants!==undefined&&v.moduleVariants!==null){check(Array.isArray(v.moduleVariants)&&new Set(v.moduleVariants.map(([key])=>key)).size===v.moduleVariants.length,'Invalid module variant map');for(const [,child]of v.moduleVariants)variantIdentity(child);}};
 for(const v of Object.values(memberFactory?.stockVariants??{}))variantIdentity(v);for(const m of memberFactory?.members??[])variantIdentity(m.variant);
 const seen=new Set();for(const fleet of factory.fleets){
  if(fleet.campaign!==undefined){check(factory.campaignResources,'Constructed fleet without resource registry');validateOriginalConstructedCampaignFleet(fleet,factory.campaignResources);
    for(const row of fleet.campaign.view.shipViews.views){const member=memberFactory?.members.find(m=>m.objectRef===row.item.objectRef);check(!member||member===row.item,'Lost view/member-factory identity');for(const icon of row.view.moduleIcons??[])if(icon.scope==='native-campaign-module-icon')variantIdentity(icon.variant);}
   }
  validateOriginalNativeFleet(fleet);check(fleet.nativeConstruction==='fleet-data'&&!seen.has(fleet.dataRef),'Invalid/duplicate constructed FleetData');seen.add(fleet.dataRef);
  check(rosters?.bindings.some(b=>b.fleet===fleet),'Lost current constructed fleet binding');
  check(fleet.defaultCommanderRef===cls.defaultCommander.objectRef&&fleet.nullMember===cls.nullMember,'Lost FleetData class object sharing');
  check(fleet.statPeople?.includes(cls.defaultCommander),'Missing default commander lookup');
  const commanderRef=fleet.commanderRef??fleet.defaultCommanderRef,commander=originalPersonnelByRef(player,commanderRef);
  check(fleet.statPeople.filter(p=>p.objectRef===commanderRef).length===1&&fleet.statPeople.includes(commander),'Lost shared constructed fleet commander');
  check(fleet.commanderTravelSpeedBonus===commander.stats.travelSpeedBonus,'Lost shared commander travel-speed target');
  check(fleet.cargo.carryingFleetRef===fleet.dataRef&&fleet.cargo.creditsRef===fleet.credits.objectRef&&fleet.cargo.credits===fleet.credits,'Lost constructed cargo ownership/credits sharing');validateOriginalResourceCargo(fleet.cargo);
 }
 check(factory.fleets.length<=factory.serial,'FleetData serial precedes instance count');return factory;
}
