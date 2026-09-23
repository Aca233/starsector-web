/** CampaignFleet.updateCounts/updateFleetSizeCount, preserving native transient ordering. */
import R from '../data/reference-fleet-sync.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {getOriginalMemberStats} from './OriginalMemberEffects.mjs';
import {originalTopKValuesSum} from './OriginalFleetEffects.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_COUNTS',m);
const round=n=>f(Math.max(-2147483648,Math.min(2147483647,Math.floor(n+0.5))));
const bonus=(base,modifiers)=>effective({base,modifiers});
const countKey={CAPITAL_SHIP:'numCapitals',CRUISER:'numCruisers',DESTROYER:'numDestroyers',FRIGATE:'numFrigates',FIGHTER:'numFighters'};
function roster(fleet){check(Array.isArray(fleet.membersWithoutNull),'Synchronized native members required');return fleet.membersWithoutNull;}
function hull(member){const h=R.hulls[member.variant?.hullId];check(h,'Native member hull required');return h;}
function fp(member){if(member.type!=='FIGHTER_WING')return hull(member).fleetPoints;const w=R.wings[member.specId];check(w,'Native fighter wing required');return w.fleetPoints;}
export function createOriginalNativeFleetCounts(){return {numCapitals:0,numCruisers:0,numDestroyers:0,numFrigates:0,numFighters:0,hasUniqueSig:false,largestShipSize:null,mostExpensiveShip:null,isOnlyOneLargestShip:false,fleetSizeNum:0};}
export function updateOriginalNativeFleetCounts(fleet){
 const c=fleet.counts;check(c&&fleet.stats&&typeof fleet.isPlayerFleet==='boolean','Actual native counts/stats/player identity required');
 check(fleet.forceNoSensorProfileUpdate===null||typeof fleet.forceNoSensorProfileUpdate==='boolean','Actual sensor profile update flag required');
 for(const key of Object.values(countKey))c[key]=0;c.hasUniqueSig=false;
 if(fleet.isPlayerFleet)for(const m of roster(fleet)){check(Array.isArray(m.variant?.effects?.tags),'Actual native variant tags required');c.hasUniqueSig ||= m.variant.effects.tags.includes('ship_unique_signature');}
 let maximumFP=0;const profiles=[],sensors=[];
 for(const m of roster(fleet)){
  const h=hull(m),key=countKey[h.hullSize];if(key)c[key]=(c[key]+1)|0;
  const s=getOriginalMemberStats(m,fleet);check(typeof m.repairTracker?.mothballed==='boolean','Actual mothball state required');
  profiles.push(round(effective(s.sensorProfile)));sensors.push(m.repairTracker.mothballed?0:round(effective(s.sensorStrength)));
  const cost=fp(m);if(cost>maximumFP&&c.largestShipSize===h.hullSize){maximumFP=cost;c.mostExpensiveShip=m;}
 }
 const k=Math.min(Math.trunc(R.settings.maxSensorShips),profiles.length);
 const profile=bonus(f(originalTopKValuesSum(profiles,k)+R.settings.sensorRangeBase),fleet.stats.sensorProfileMod);
 const sensor=bonus(f(originalTopKValuesSum(sensors,k)+R.settings.sensorRangeBase),fleet.stats.sensorStrengthMod);
 if(fleet.forceNoSensorProfileUpdate!==true){fleet.sensorProfile=profile;if(fleet.campaign)fleet.campaign.entity.sensorProfile=profile;}fleet.sensorStrength=sensor;if(fleet.campaign)fleet.campaign.entity.sensorStrength=sensor;
 c.isOnlyOneLargestShip=false;for(const [size,key]of Object.entries(countKey))if(c[key]>0){c.isOnlyOneLargestShip=c[key]===1;c.largestShipSize=size;break;}
 c.largestShipSize??='FRIGATE';return c;
}
export function updateOriginalNativeFleetSizeCount(fleet){
 check(typeof fleet.despawning==='boolean'&&fleet.counts,'Actual despawn/count state required');if(fleet.despawning)return fleet.counts.fleetSizeNum;
 let total=0;for(const member of roster(fleet)){const h=hull(member);check(Array.isArray(h.hints),'Native hull hints required');let size=({CRUISER:3,DESTROYER:2,FRIGATE:1,FIGHTER:0,DEFAULT:0})[h.hullSize];if(h.hullSize==='CAPITAL_SHIP')size=h.hints.includes('STATION')?25:4;check(size!==undefined,'Unknown native hull size');total=(total+size)|0;}
 fleet.counts.fleetSizeNum=total;return total;
}
