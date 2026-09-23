/** Actual Battle membership and side selection, not the member-strength projection.
 * Natural advance is in OriginalCampaignBattleFrame; combined/autoresolve remain explicit services. */
import raw from '../data/reference-campaign-battle.json' with {type:'json'};
import {requireThat,immutableJSON} from '../core/Values.mjs';
import {createOriginalEngineInterval} from './OriginalCampaignFleet.mjs';
import {synchronizeOriginalFleet} from './OriginalFleetData.mjs';
import {originalEntityMemoryWithoutUpdate,originalCampaignMemoryBoolean,originalCampaignMemoryContains} from './OriginalCampaignMemory.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_CAMPAIGN_BATTLE',m);
export const ORIGINAL_CAMPAIGN_BATTLE=immutableJSON(raw);
const call=(s,k,...args)=>{check(typeof s[k]==='function','Actual Battle service required: '+k);const v=s[k](...args);check(!v||typeof v.then!=='function','Synchronous Battle service required: '+k);return v;};
const bool=v=>{check(typeof v==='boolean','Actual Battle Boolean required');return v;};
const scalar=v=>{check(typeof v==='number'&&Number.isFinite(v)&&Number.isFinite(f(v)),'Finite Battle float required');return f(v);};
const campaign=fleet=>{check(fleet?.campaign?.scope==='native-constructed-campaign-fleet','Actual constructed fleet required, not a strength projection');return fleet.campaign;};
const actual=b=>{check(b?.scope==='native-current-campaign-battle'&&b.schemaVersion===1,'Actual Battle required, not a strength projection');return b;};
const player=fleet=>{campaign(fleet);return bool(fleet.isPlayerFleet);};
const playerFleet=s=>{const fleet=call(s,'readBattlePlayerFleet');campaign(fleet);return fleet;};
const playerFaction=fleet=>campaign(fleet).faction.factionId==='player';
const memory=fleet=>originalEntityMemoryWithoutUpdate(campaign(fleet).entity);
const flag=(fleet,key,s)=>originalCampaignMemoryBoolean(memory(fleet),key,s.memoryServices);
const isTrue=(fleet,key,s)=>{const m=memory(fleet);return originalCampaignMemoryContains(m,key,s.memoryServices)&&originalCampaignMemoryBoolean(m,key,s.memoryServices);};
const station=fleet=>{const c=campaign(fleet);check(Object.hasOwn(c.flags,'stationMode'),'Actual nullable station flag required');return c.flags.stationMode!==null;};
const transponder=fleet=>bool(campaign(fleet).entity.transponderOn);
function setTransponder(fleet,value){campaign(fleet).entity.transponderOn=bool(value);fleet.transponderOn=value;}
function sync(fleet,s){const state=fleet.synchronization;check(state&&typeof state.needsSync==='boolean','Actual fleet sync state required');if(state.needsSync&&!state.forceNoSync)synchronizeOriginalFleet(fleet,s);}
function fleetPoints(fleet,s){if(s.readBattleFleetPoints){const n=call(s,'readBattleFleetPoints',fleet);check(Number.isInteger(n)&&n>=-2147483648&&n<=2147483647,'Native int fleet points required');return n;}sync(fleet,s);return Math.max(-2147483648,Math.min(2147483647,Math.trunc(scalar(fleet.fleetPointsUsed))));}
function notifyAbilities(fleet,battle,s,event,engaged){
 const entity=campaign(fleet).entity;check(Object.hasOwn(entity,'abilities'),'Actual nullable ability map required');if(entity.abilities===null)return;
 const keys=call(s,'readBattleAbilityKeys',fleet);check(Array.isArray(keys)&&keys.every(k=>typeof k==='string'),'Actual ordered ability keys required');
 for(const id of keys){const ability=call(s,'readBattleAbility',fleet,id);check(ability&&typeof ability==='object','Actual ability plugin required');call(s,event,ability,battle,fleet,...(engaged===undefined?[]:[engaged]));}
}
function abilitiesJoined(fleet,battle,s){notifyAbilities(fleet,battle,s,'notifyBattleAbilityJoined');}
export function notifyOriginalBattleAbilitiesLeft(fleet,battle,engaged,services={}){bool(engaged);notifyAbilities(fleet,actual(battle),services,'notifyBattleAbilityLeft',engaged);}
export {fleetPoints as originalBattleFleetPoints};
/** These getters retain real FleetData synchronization; validation never calls them. */
export function originalBattleFleetMembers(fleet,services={}){campaign(fleet);sync(fleet,services);check(Array.isArray(fleet.membersWithoutNull),'Actual synchronized member cache required');return fleet.membersWithoutNull;}
/** Called with actual new-world random services. Does not allocate a native Sector UID. */
export function createOriginalCampaignBattle(first,second,services={}){
 campaign(first);campaign(second);
 const base=scalar(services.readBattleAutoresolveInterval?call(services,'readBattleAutoresolveInterval'):raw.settings.autoresolveBaseInterval);
 const tracker=createOriginalEngineInterval(f(base*f(.8)),f(base*f(1.2)),services.globalRandom);
 const flash=createOriginalEngineInterval(f(.8),f(1.2),services.globalRandom);
 const seed=call(services,'newBattleSeed');check(typeof seed==='string'&&/^-?\d+$/.test(seed)&&BigInt.asIntN(64,BigInt(seed)).toString()===seed,'Actual signed long Battle seed required');
 const objectRef=call(services,'newBattleObjectRef',first,seed);check(typeof objectRef==='string'&&objectRef.length>0,'Web Battle graph identity required');
 if(player(second))[first,second]=[second,first];
 const battle={scope:'native-current-campaign-battle',schemaVersion:1,objectRef,sideOne:[],sideTwo:[],snapshotSideOne:[],snapshotSideTwo:[],tracker,flash,memberSource:[],combinedOne:null,combinedTwo:null,primaryOne:null,primaryTwo:null,playerInvolvedAtStart:false,playerInvolvementFraction:0,seed,done:false,location:null};
 battle.sideOne.push(first);first.battle=battle;battle.sideTwo.push(second);second.battle=battle;
 abilitiesJoined(first,battle,services);abilitiesJoined(second,battle,services);
 battle.primaryOne=first;battle.primaryTwo=second;battle.playerInvolvedAtStart=player(first)||player(second);
 battle.location=campaign(first).entity.containingLocation;check(battle.location!==null,'Actual first-fleet containing location required');call(services,'addBattleLocationScript',battle.location,battle);
 return battle;
}
export function takeOriginalBattleSnapshots(battle){actual(battle);battle.snapshotSideOne=[...battle.sideOne];battle.snapshotSideTwo=[...battle.sideTwo];for(const side of [battle.sideOne,battle.sideTwo])for(const fleet of side){campaign(fleet);check(Array.isArray(fleet.members),'Actual live FleetData members required');fleet.snapshot=fleet.members.filter(m=>m.type!=='NULL');}return battle;}
export function originalBattleSnapshot(battle,side){actual(battle);check(side==='ONE'||side==='TWO','Actual snapshot side required');const key=side==='ONE'?'snapshotSideOne':'snapshotSideTwo';if(battle[key]===null)takeOriginalBattleSnapshots(battle);return battle[key];}
export function originalBattleSnapshotFor(battle,list){actual(battle);if(list===battle.sideOne||list===battle.snapshotSideOne)return originalBattleSnapshot(battle,'ONE');if(list===battle.sideTwo||list===battle.snapshotSideTwo)return originalBattleSnapshot(battle,'TWO');return null;}
export function originalBattleSide(battle,side){actual(battle);return side==='ONE'?battle.sideOne:side==='TWO'?battle.sideTwo:null;}
export function originalBattleSideFor(battle,fleet){actual(battle);if(battle.sideOne.includes(fleet))return battle.sideOne;if(battle.sideTwo.includes(fleet))return battle.sideTwo;if(originalBattleSnapshot(battle,'ONE').includes(fleet))return battle.sideOne;if(originalBattleSnapshot(battle,'TWO').includes(fleet))return battle.sideTwo;if(battle.combinedOne===fleet)return battle.sideOne;if(battle.combinedTwo===fleet)return battle.sideTwo;return null;}
export function originalBattleIsInvolved(battle,fleet){actual(battle);return battle.sideOne.includes(fleet)||battle.sideTwo.includes(fleet)||originalBattleSnapshot(battle,'ONE').includes(fleet)||originalBattleSnapshot(battle,'TWO').includes(fleet)||fleet!==null&&(battle.combinedOne===fleet||battle.combinedTwo===fleet);}
export function originalBattleIsPlayerSide(battle,list,services={}){actual(battle);if(list===null)return false;for(const fleet of list)if(fleet===playerFleet(services))return true;const snapshot=originalBattleSnapshotFor(battle,list);check(snapshot!==null,'Battle side identity required');for(const fleet of snapshot)if(fleet===playerFleet(services))return true;return false;}
export function originalBattlePlayerSide(battle,services={}){return originalBattleIsPlayerSide(battle,battle.sideOne,services)?battle.sideOne:originalBattleIsPlayerSide(battle,battle.sideTwo,services)?battle.sideTwo:null;}
export function originalBattlePrimary(battle,list,services={},excludePlayer=!battle.playerInvolvedAtStart){actual(battle);bool(excludePlayer);if(list===null)return null;let candidate=null,max=-1;for(const fleet of list){const points=fleetPoints(fleet,services);if(excludePlayer&&player(fleet)&&list.length>1)continue;if(points>max){max=points;candidate=fleet;}if(fleet===battle.primaryOne||fleet===battle.primaryTwo||player(fleet)&&battle.playerInvolvedAtStart)return fleet;}
 if(candidate===null){const snapshot=originalBattleSnapshotFor(battle,list);check(snapshot!==null,'Actual Battle side required');for(const fleet of snapshot){if(excludePlayer&&player(fleet)&&list.length>1)continue;const points=fleetPoints(fleet,services);if(points>max){max=points;candidate=fleet;}if(fleet===battle.primaryOne||fleet===battle.primaryTwo||player(fleet)&&battle.playerInvolvedAtStart)return fleet;}}return candidate;}
export function originalBattleIsPlayerPrimary(battle,services={}){if(originalBattlePlayerSide(battle,services)===null)return false;return player(originalBattlePrimary(battle,originalBattlePlayerSide(battle,services),services));}
export function originalBattleStationInvolved(battle){actual(battle);for(const fleet of battle.sideOne)if(station(fleet))return true;for(const fleet of battle.sideTwo)if(station(fleet))return true;for(const fleet of originalBattleSnapshot(battle,'ONE'))if(station(fleet))return true;for(const fleet of originalBattleSnapshot(battle,'TWO'))if(station(fleet))return true;return false;}
/** CampaignFleet.knowsWhoPlayerIs, including lazy real player FleetData synchronization. */
export function originalBattleFleetKnowsPlayer(fleet,services={}){if(playerFaction(fleet))return true;if(transponder(playerFleet(services))||flag(fleet,'$sawPlayerTransponderOn',services))return true;const current=playerFleet(services);if(services.readBattleFleetHasUniqueSignature)return bool(call(services,'readBattleFleetHasUniqueSignature',current));sync(current,services);return bool(current.counts?.hasUniqueSig);}
function sideKnowsPlayer(battle,list,s){for(const fleet of list)if(originalBattleFleetKnowsPlayer(fleet,s))return true;for(const fleet of originalBattleSnapshotFor(battle,list))if(originalBattleFleetKnowsPlayer(fleet,s))return true;return false;}
function playerOrCombinedPrimary(fleet,s){if(player(fleet))return true;check(Object.hasOwn(fleet,'battle'),'Actual nullable Battle required');return fleet.battle!==null&&originalBattleIsPlayerSide(actual(fleet.battle),originalBattleSideFor(fleet.battle,fleet),s)&&originalBattleIsPlayerPrimary(fleet.battle,s);}
/** CampaignFleet relationship logic. Faction/AI queries must be real services, never economic projections. */
export function originalBattleFleetHostileTo(fleet,target,services={}){
 const own=campaign(fleet),other=campaign(target);
 if(own.ai===null){
  if(playerOrCombinedPrimary(target,services)){if(isTrue(fleet,'$cfai_makeHostile',services))return true;if(isTrue(fleet,'$cfai_makeNonHostile',services))return false;if(isTrue(fleet,'$cfai_makeHostileWhileTOff',services)&&!transponder(playerFleet(services)))return true;}
  if(playerFaction(target)){if(isTrue(fleet,'$cfai_makeHostile',services))return true;if(isTrue(fleet,'$cfai_makeNonHostile',services))return false;}
  if(playerFaction(fleet)&&isTrue(target,'$cfai_makeHostile',services))return true;
 }
 let hostile=own.ai!==null&&bool(call(services,'isBattleAIHostileTo',own.ai,target,fleet));
 const reverse=other.ai!==null&&bool(call(services,'isBattleAIHostileTo',other.ai,fleet,target));hostile=hostile||reverse;
 if(own.ai===null){const factionHostile=bool(call(services,'areBattleFactionsHostile',own.faction,other.faction));hostile=hostile||factionHostile;}return hostile;
}
export function originalBattleFleetFriendlyTo(fleet,target,services={}){campaign(fleet);campaign(target);if(playerOrCombinedPrimary(target,services)&&!transponder(target)&&!originalBattleFleetKnowsPlayer(fleet,services))return false;return bool(call(services,'areBattleFactionsFriendly',fleet.campaign.faction,target.campaign.faction));}
const hostile=(a,b,s)=>s.isBattleFleetHostileTo?bool(call(s,'isBattleFleetHostileTo',a,b)):originalBattleFleetHostileTo(a,b,s);
const friendly=(a,b,s)=>s.isBattleFleetFriendlyTo?bool(call(s,'isBattleFleetFriendlyTo',a,b)):originalBattleFleetFriendlyTo(a,b,s);
export function pickOriginalBattleSide(battle,joining,services={},respectTransponder=true){
 actual(battle);campaign(joining);bool(respectTransponder);
 if(battle.sideOne.includes(joining))return 'ONE';if(battle.sideTwo.includes(joining))return 'TWO';
 let allowOne=false,allowTwo=false;
 if(player(joining)){for(const fleet of battle.sideOne)if(flag(fleet,'$cfai_allowPlayerBattleJoinTOff',services)){allowOne=true;break;}for(const fleet of battle.sideTwo)if(flag(fleet,'$cfai_allowPlayerBattleJoinTOff',services)){allowTwo=true;break;}}
 if(respectTransponder&&player(joining)&&(allowOne||allowTwo)){const side=pickOriginalBattleSide(battle,joining,services,false);if(side==='ONE'&&allowOne||side==='TWO'&&allowTwo)return side;}
 const patrol=isTrue(joining,'$isPatrol',services);flag(joining,'$isWarFleet',services); // Native unused lookup still executes.
 let knowsOne=sideKnowsPlayer(battle,battle.sideOne,services)||originalBattleIsPlayerSide(battle,battle.sideOne,services)&&battle.sideOne.length>1;
 let knowsTwo=sideKnowsPlayer(battle,battle.sideTwo,services)||originalBattleIsPlayerSide(battle,battle.sideTwo,services)&&battle.sideTwo.length>1;
 if(originalBattleIsPlayerSide(battle,battle.sideOne,services)&&playerFaction(joining))knowsOne=true;
 if(originalBattleIsPlayerSide(battle,battle.sideTwo,services)&&playerFaction(joining))knowsTwo=true;
 const oldTransponder=transponder(joining);if(!respectTransponder&&player(joining))setTransponder(joining,true);
 if(!respectTransponder||!player(joining)&&!originalBattleIsInvolved(battle,playerFleet(services))){knowsOne=true;knowsTwo=true;}
 if(!player(joining)&&!originalBattleIsPlayerSide(battle,battle.sideOne,services))knowsOne=true;
 if(!player(joining)&&!originalBattleIsPlayerSide(battle,battle.sideTwo,services))knowsTwo=true;
 const noRepImpact=flag(joining,'$noRepImpact',services),everyoneAgainst=flag(joining,'$everyoneJoinsBattleAgainst',services);
 const assess=list=>{const state={hostile:false,friendly:false,playerFaction:false,sameFaction:false,noRepImpact:false,everyoneAgainst:false};for(const fleet of list){if(hostile(fleet,joining,services))state.hostile=true;if(friendly(fleet,joining,services))state.friendly=true;if(playerFaction(fleet))state.playerFaction=true;if(fleet.campaign.faction===joining.campaign.faction)state.sameFaction=true;if(flag(fleet,'$noRepImpact',services))state.noRepImpact=true;if(flag(fleet,'$everyoneJoinsBattleAgainst',services))state.everyoneAgainst=true;}return state;};
 const one=assess(battle.sideOne),two=assess(battle.sideTwo);
 // javap offsets845..908: these returns intentionally precede transponder restoration.
 if(everyoneAgainst&&one.everyoneAgainst&&!two.everyoneAgainst)return 'ONE';if(everyoneAgainst&&!one.everyoneAgainst&&two.everyoneAgainst)return 'TWO';if(everyoneAgainst)return 'NO_JOIN';
 if(!respectTransponder&&player(joining))setTransponder(joining,oldTransponder);
 if(one.noRepImpact&&!noRepImpact){one.friendly=false;one.sameFaction=false;}if(two.noRepImpact&&!noRepImpact){two.friendly=false;two.sameFaction=false;}
 if(one.sameFaction){two.friendly=false;two.hostile=true;}if(two.sameFaction){one.friendly=false;one.hostile=true;}
 one.friendly=one.friendly&&knowsOne;two.friendly=two.friendly&&knowsTwo;
 if(playerFaction(joining)){if(one.playerFaction)two.friendly=false;else if(two.playerFaction)one.friendly=false;}
 if(patrol&&!one.hostile&&!one.noRepImpact&&two.hostile)one.friendly=true;if(patrol&&!two.hostile&&!two.noRepImpact&&one.hostile)two.friendly=true;
 if(one.everyoneAgainst){one.sameFaction=false;one.friendly=false;one.hostile=true;}if(two.everyoneAgainst){two.sameFaction=false;two.friendly=false;two.hostile=true;}
 if(patrol&&originalBattleIsPlayerPrimary(battle,services)&&!friendly(joining,playerFleet(services),services)){
  const list=originalBattleIsPlayerSide(battle,battle.sideOne,services)?battle.sideTwo:originalBattleIsPlayerSide(battle,battle.sideTwo,services)?battle.sideOne:null;check(list!==null,'Actual non-player side required');
  const everyone=list===battle.sideTwo?two.everyoneAgainst:one.everyoneAgainst;let nonHostileToPlayer=true,hostileToJoining=false;
  for(const fleet of list){if(hostile(fleet,playerFleet(services),services)||everyone)nonHostileToPlayer=false;if(hostile(fleet,joining,services)||everyone)hostileToJoining=true;}
  if(nonHostileToPlayer&&!hostileToJoining)return list===battle.sideOne?'ONE':'TWO';
 }
 if(allowOne&&!one.hostile)return 'ONE';if(allowTwo&&!two.hostile)return 'TWO';
 if(one.friendly&&knowsOne&&two.friendly&&knowsTwo)return 'NO_JOIN';if(one.hostile&&knowsOne&&two.hostile&&knowsTwo)return 'NO_JOIN';
 if(one.hostile&&!one.friendly&&!two.hostile&&knowsTwo)return 'TWO';if(!one.hostile&&two.hostile&&!two.friendly&&knowsOne)return 'ONE';
 if(one.friendly&&!one.hostile&&!two.friendly&&knowsOne)return 'ONE';if(!one.friendly&&two.friendly&&!two.hostile&&knowsTwo)return 'TWO';return 'NO_JOIN';
}
export function canJoinOriginalBattle(battle,fleet,services={}){actual(battle);const c=campaign(fleet);check(Object.hasOwn(c.flags,'isInJumpTransition'),'Actual nullable hyperspace transition flag required');if(c.flags.isInJumpTransition!==null)return false;if(station(fleet)&&originalBattleStationInvolved(battle))return false;return pickOriginalBattleSide(battle,fleet,services)!=='NO_JOIN';}
export function joinOriginalBattle(battle,fleet,services={},side){actual(battle);campaign(fleet);const list=originalBattleSide(battle,side===undefined?pickOriginalBattleSide(battle,fleet,services):side);if(list===null)return false;if(list.includes(fleet))return true;list.push(fleet);fleet.battle=battle;fleet.campaign.interactionTarget=null;abilitiesJoined(fleet,battle,services);return true;}
export function originalBattleClosestFleet(battle,joining){actual(battle);const position=campaign(joining).entity.position;let closest=null,min=3.4028234663852886e38;for(const fleet of [...battle.sideOne,...battle.sideTwo]){if(fleet===joining)continue;const other=campaign(fleet).entity.position,dx=f(position[0]-other[0]),dy=f(position[1]-other[1]),distance=f(Math.sqrt(f(f(dx*dx)+f(dy*dy))));if(distance<min){min=distance;closest=fleet;}}return closest;}
/** Structural graph validation only: never take lazy snapshots or synchronize during checkpoint checks. */
export function validateOriginalCampaignBattle(battle){
 actual(battle);check(typeof battle.objectRef==='string'&&battle.objectRef.length>0,'Actual Battle graph identity required');bool(battle.done);bool(battle.playerInvolvedAtStart);check(scalar(battle.playerInvolvementFraction)===battle.playerInvolvementFraction,'Native involvement float required');check(typeof battle.seed==='string'&&/^-?\d+$/.test(battle.seed)&&BigInt.asIntN(64,BigInt(battle.seed)).toString()===battle.seed,'Native signed long seed required');check(battle.location&&typeof battle.location==='object','Actual Battle location owner required');
 for(const interval of [battle.tracker,battle.flash]){check(interval&&typeof interval==='object','Actual Battle interval required');for(const key of ['minInterval','maxInterval','currInterval','elapsed'])check(scalar(interval[key])===interval[key],'Native interval float required');bool(interval.intervalElapsed);}
 const unique=new Set();for(const side of [battle.sideOne,battle.sideTwo]){check(Array.isArray(side),'Actual Battle side list required');for(const fleet of side){campaign(fleet);check(!unique.has(fleet),'Fleet occurs twice in Battle');unique.add(fleet);if(!battle.done)check(fleet.battle===battle,'Lost fleet/Battle identity');}}
 check(battle.sideOne!==battle.sideTwo,'Battle sides must be distinct arrays');
 for(const side of [battle.snapshotSideOne,battle.snapshotSideTwo]){check(side===null||Array.isArray(side),'Actual nullable Battle snapshot required');if(side!==null){check(side!==battle.sideOne&&side!==battle.sideTwo&&new Set(side).size===side.length,'Snapshot must be a separate list of actual fleets');for(const fleet of side)campaign(fleet);}}
 check(battle.snapshotSideOne===null||battle.snapshotSideTwo===null||battle.snapshotSideOne!==battle.snapshotSideTwo,'Distinct Battle snapshot arrays required');
 for(const key of ['primaryOne','primaryTwo','combinedOne','combinedTwo']){const fleet=battle[key];check(fleet===null||fleet&&typeof fleet==='object','Actual nullable Battle fleet required');if(fleet!==null){campaign(fleet);if(key.startsWith('combined')&&!battle.done)check(fleet.battle===battle,'Lost combined/Battle identity');}}
 check(Array.isArray(battle.memberSource),'Actual Battle member source map required');const members=new Set();for(const row of battle.memberSource){check(row.member&&row.member.objectRef===row.memberRef&&!members.has(row.member),'Actual unique member-source identity required');members.add(row.member);campaign(row.fleet);}return battle;
}
