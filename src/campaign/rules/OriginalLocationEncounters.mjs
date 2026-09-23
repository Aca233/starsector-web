/** BaseLocation's three encounter passes. Battle/AI/listener effects are real dependencies,
 * not the legacy reference battle lifecycle or the captured member-strength projection. */
import raw from '../data/reference-location-encounters.json' with {type:'json'};
import {requireThat,immutableJSON} from '../core/Values.mjs';
import {originalEntityMemoryWithoutUpdate,originalCampaignMemoryBoolean,originalCampaignMemoryGet} from './OriginalCampaignMemory.mjs';
import {originalFleetSensorRadius} from './OriginalSensors.mjs';
import {originalLocationEntityState} from './OriginalLocationOrbits.mjs';
import {originalWorldLocationObjects} from './OriginalFleetWorld.mjs';
export const ORIGINAL_LOCATION_ENCOUNTERS=immutableJSON(raw);
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_LOCATION_ENCOUNTER',m);
const call=(s,k,...args)=>{check(typeof s[k]==='function','Actual encounter service required: '+k);const v=s[k](...args);check(!v||typeof v.then!=='function','Encounter services must be synchronous: '+k);return v;};
const bool=v=>{check(typeof v==='boolean','Actual encounter Boolean required');return v;};
const scalar=v=>{check(Number.isFinite(v)&&Number.isFinite(f(v)),'Actual finite encounter float required');return f(v);};
const isFleet=o=>o?.campaign?.scope==='native-constructed-campaign-fleet';
const campaign=o=>{check(isFleet(o),'Actual constructed encounter fleet required, not a historical projection');return o.campaign;};
const memory=o=>originalEntityMemoryWithoutUpdate(campaign(o).entity);
const station=o=>{const flags=campaign(o).flags;check(Object.hasOwn(flags,'stationMode'),'Actual nullable station flag required');return flags.stationMode!==null;};
const battle=o=>{campaign(o);check(Object.hasOwn(o,'battle'),'Actual nullable battle required');return o.battle;};
const ai=o=>{const c=campaign(o);check(Object.hasOwn(c,'ai'),'Actual nullable fleet AI required');return c.ai;};
const player=o=>{campaign(o);return bool(o.isPlayerFleet);};
const playerFleet=s=>{const fleet=call(s,'readEncounterPlayerFleet');campaign(fleet);return fleet;};
const listener=s=>{const value=call(s,'readEncounterListener');check(value===null||value&&typeof value==='object','Actual encounter listener or known null required');return value;};
const list=(state,type,s)=>{const value=s.readLocationObjects?call(s,'readLocationObjects',state.location,type):originalWorldLocationObjects(state.location,type);check(Array.isArray(value),'Actual ordered encounter repository list required');return value;};
function target(fleet,s){const ref=campaign(fleet).interactionTarget;if(ref===null)return null;check(typeof ref==='string','Actual native interaction target reference required');const value=call(s,'resolveEncounterEntity',ref);check(value&&typeof value==='object','Unresolved actual interaction target');return value;}
function position(entity,s){const p=originalLocationEntityState(entity,s).position;check(Array.isArray(p)&&p.length===2,'Actual encounter position required');return p;}
function distance(a,b,s){const p=position(a,s),q=position(b,s),x=f(scalar(p[0])-scalar(q[0])),y=f(scalar(p[1])-scalar(q[1]));return scalar(Math.sqrt(f(f(x*x)+f(y*y))));}
function size(entity,s,selection=false){if(isFleet(entity))return scalar(s.readFleetRadius?call(s,'readFleetRadius',entity):originalFleetSensorRadius(entity));return scalar(call(s,selection?'readEncounterEntitySelectionSize':'readEncounterEntityRadius',entity));}
/** Do not add empty/hidden/expired/transition filtering here: those are different native phases. */
export function originalFleetCanBeEngaged(fleet,services={}){
 const c=campaign(fleet);if(originalCampaignMemoryBoolean(memory(fleet),'$canOnlyBeEngagedWhenVisibleToPlayer',services.memoryServices)){
  const visibility=call(services,'readVisibilityToPlayer',fleet);check(['NONE','SENSOR_CONTACT','COMPOSITION_DETAILS','COMPOSITION_AND_FACTION_DETAILS'].includes(visibility),'Actual native visibility level required');if(visibility==='NONE')return false;
 }
 check(Object.hasOwn(c,'noCombat')&&Object.hasOwn(c.flags,'fadeAndExpire'),'Actual native engagement flags required');return c.noCombat===null&&c.flags.fadeAndExpire===null;
}
/** Misc: station market's primary entity and station position are independent support centers. */
export function originalStationInSupportRange(fleet,stationFleet,services={}){
 campaign(fleet);campaign(stationFleet);const range=scalar(services.readEncounterBattleJoinRange?call(services,'readEncounterBattleJoinRange'):raw.settings.battleJoinRange);let primaryDistance=10000;
 const candidate=originalCampaignMemoryGet(memory(stationFleet),'$stationMarket',services.memoryServices);
 if(candidate!==null&&typeof candidate==='object'&&bool(call(services,'isEncounterMarket',candidate)))primaryDistance=distance(fleet,call(services,'readEncounterMarketPrimaryEntity',candidate),services);
 const stationDistance=distance(fleet,stationFleet,services);return primaryDistance<=range||stationDistance<=range;
}
function support(fleet,stationFleet,s){return s.isEncounterStationInSupportRange?bool(call(s,'isEncounterStationInSupportRange',fleet,stationFleet)):originalStationInSupportRange(fleet,stationFleet,s);}
function singleBattle(a,b){const one=battle(a),two=battle(b);return (one!==null)!==(two!==null)?{battle:one??two,joining:one===null?a:b}:null;}
function closest(pair,s){const value=call(s,'readEncounterClosestBattleFleet',pair.battle,pair.joining);if(value!==null)campaign(value);return value;}
function join(pair,result,s){call(s,'joinEncounterBattle',pair.battle,pair.joining);result.joinAttempts++;}
function notify(fleet,other,s){const actual=ai(fleet);if(actual!==null)call(s,'notifyEncounterAIInteracted',actual,other,fleet);}
function start(actualListener,fleet,entity,phase,result,s){call(s,'startEncounterInvolvingPlayerFleet',actualListener,fleet,entity,phase);result.playerEncounterCalls++;}
/** The caller supplies the real live globals. In particular a missing player/listener is not an empty world. */
export function advanceOriginalLocationEncounters(state,context,services={}){
 check(state?.scope==='native-location-natural-frame','Actual location state required');
 const result={scope:'native-location-encounter-phase',pairsChecked:0,joinAttempts:0,battleCreationCalls:0,playerEncounterCalls:0,playerEncounterStarted:false,readyForAuthority:false};
 const fleets=list(state,raw.classes.fleet,services);
 // These are live lists, not snapshots: native callbacks may add/remove fleets mid-pass.
 for(let i=0;i<fleets.length;i++){
  const a=fleets[i];if(!originalFleetCanBeEngaged(a,services))continue;
  for(let j=i+1;j<fleets.length;j++){
   const b=fleets[j];if(!originalFleetCanBeEngaged(b,services))continue;result.pairsChecked++;
   const separation=distance(a,b,services);let range=f(size(a,services)+size(b,services));if(bool(context.fastAdvance))range=f(range+1000);
   let pair=singleBattle(a,b);
   if(pair!==null){const nearest=closest(pair,services);if(nearest!==null&&station(pair.joining)&&support(nearest,pair.joining,services)&&bool(call(services,'canJoinEncounterBattle',pair.battle,pair.joining))){join(pair,result,services);continue;}}
   if(target(a,services)!==b&&target(b,services)!==a)continue;
   const involvesPlayer=player(a)||player(b);
   distance(playerFleet(services),a,services); // Native unused local still performs this lookup.
   pair=singleBattle(a,b);
   if(pair!==null){
    const nearest=closest(pair,services);
    if(nearest!==null){
     if(station(pair.joining)){
      if(support(nearest,pair.joining,services)&&bool(call(services,'canJoinEncounterBattle',pair.battle,pair.joining))){join(pair,result,services);continue;}
     }else if(distance(nearest,pair.joining,services)<f(size(nearest,services)+size(pair.joining,services))&&!involvesPlayer&&ai(pair.joining)!==null&&bool(call(services,'encounterAIWantsToJoin',ai(pair.joining),pair.battle,false,pair.joining))&&bool(call(services,'canJoinEncounterBattle',pair.battle,pair.joining))){join(pair,result,services);continue;}
    }
   }
   if(!(separation<range)||campaign(a).faction===campaign(b).faction)continue;
   const actualListener=listener(services),actualPlayer=playerFleet(services);
   const hostileA=ai(a)!==null&&bool(call(services,'isEncounterAIHostileTo',ai(a),b,a));
   const hostileB=ai(b)!==null&&bool(call(services,'isEncounterAIHostileTo',ai(b),a,b)); // |= evaluates both.
   if(involvesPlayer&&actualListener!==null&&!result.playerEncounterStarted){const other=player(a)?b:a;notify(other,actualPlayer,services);start(actualListener,actualPlayer,other,'fleet-pair',result,services);result.playerEncounterStarted=true;}
   else if(!involvesPlayer&&(bool(call(services,'areEncounterFactionsHostile',campaign(a).faction,campaign(b).faction))||hostileA||hostileB)&&!(station(a)&&station(b))){
    notify(a,b,services);notify(b,a,services);
    if(battle(a)===null&&battle(b)===null){call(services,'createEncounterBattle',a,b,state.location);result.battleCreationCalls++;}
   }
  }
 }
 const stations=list(state,raw.classes.station,services);
 for(let i=0;i<fleets.length;i++){
  const fleet=fleets[i];if(!originalFleetCanBeEngaged(fleet,services))continue;
  for(let j=0;j<stations.length;j++){
   const entity=stations[j],separation=distance(fleet,entity,services),range=f(size(fleet,services)+size(entity,services,true));
   if(target(fleet,services)===entity&&separation<range){const actualListener=listener(services),actualPlayer=playerFleet(services);if(player(fleet)&&actualListener!==null)start(actualListener,actualPlayer,entity,'orbital-station',result,services);}
  }
 }
 const actualPlayer=playerFleet(services);
 if(!result.playerEncounterStarted&&target(actualPlayer,services)!==null&&originalFleetCanBeEngaged(actualPlayer,services)){
  for(const entity of [...list(state,raw.classes.entity,services)]){
   if(isFleet(entity)&&!originalFleetCanBeEngaged(entity,services))continue;
   const separation=distance(actualPlayer,entity,services),range=f(size(actualPlayer,services)+size(entity,services));
   if(target(actualPlayer,services)!==entity||!(separation<range))continue;
   const actualListener=listener(services);if(actualListener===null||result.playerEncounterStarted)continue;
   start(actualListener,actualPlayer,entity,'player-entity',result,services);result.playerEncounterStarted=true;
  }
 }
 return result;
}
