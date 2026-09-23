/** Battle.advance on actual fleet identities. Missing resolution/animation plugins fail at their native call site. */
import {requireThat} from '../core/Values.mjs';
import {ORIGINAL_CAMPAIGN_BATTLE,validateOriginalCampaignBattle,originalBattleSideFor,originalBattlePrimary,originalBattleStationInvolved,originalBattleFleetMembers,originalBattleFleetPoints,notifyOriginalBattleAbilitiesLeft} from './OriginalCampaignBattle.mjs';
import {advanceOriginalEngineInterval,setOriginalConstructedFleetLocation} from './OriginalCampaignFleet.mjs';
import {setOriginalConstructedFleetDestination,setOriginalConstructedFleetDesiredFacing} from './OriginalCampaignFleetMotion.mjs';
import {originalFleetSensorRadius} from './OriginalSensors.mjs';
import {getOriginalMovementFacing} from './OriginalMovement.mjs';
import {addOriginalFleetTemporaryMod} from './OriginalNativeFleetStats.mjs';
import {originalJavaNextDouble} from './OriginalJavaRandom.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_BATTLE_FRAME',m);
const scalar=n=>{check(typeof n==='number'&&Number.isFinite(n)&&Number.isFinite(f(n)),'Finite native Battle scalar required');return f(n);};
const bool=v=>{check(typeof v==='boolean','Actual Battle frame Boolean required');return v;};
const call=(s,k,...args)=>{check(typeof s[k]==='function','Actual Battle frame service required: '+k);const value=s[k](...args);check(!value||typeof value.then!=='function','Synchronous Battle frame service required: '+k);return value;};
const campaign=fleet=>{check(fleet?.campaign?.scope==='native-constructed-campaign-fleet','Actual constructed Battle fleet required');return fleet.campaign;};
const station=fleet=>{const c=campaign(fleet);check(Object.hasOwn(c.flags,'stationMode'),'Actual nullable station mode required');return c.flags.stationMode!==null;};
const position=fleet=>campaign(fleet).entity.position;
const radius=(fleet,s)=>scalar(s.readBattleFleetRadius?call(s,'readBattleFleetRadius',fleet):originalFleetSensorRadius(fleet));
const squared=v=>f(f(v[0]*v[0])+f(v[1]*v[1]));
const distance=(a,b)=>f(Math.sqrt(squared([f(a[0]-b[0]),f(a[1]-b[1])])));
const angle=(a,b)=>getOriginalMovementFacing([f(b[0]-a[0]),f(b[1]-a[1])]);
const unit=degrees=>{const radians=f(degrees*f(f(Math.PI)/180));return [f(Math.cos(radians)),f(Math.sin(radians))];};
const both=b=>[...b.sideOne,...b.sideTwo];
function clearTransient(battle){battle.snapshotSideTwo=null;battle.snapshotSideOne=null;battle.primaryTwo=null;battle.primaryOne=null;battle.combinedTwo=null;battle.combinedOne=null;}
/** BaseCampaignEntity.isAlive deliberately does not test expired. */
export function originalBattleFleetIsValid(fleet,services={}){
 if(originalBattleFleetMembers(fleet,services).length===0)return false;
 if(station(fleet))return true;const location=campaign(fleet).entity.containingLocation;
 if(location===null)return false;check(Array.isArray(location.repository?.contains),'Actual containing-location repository required');return location.repository.contains.includes(fleet);
}
/** Enter the removal loop only if that side initially has >1, as the Java iterator does. */
export function removeOriginalBattleEmptyFleets(battle,services={}){
 for(const side of [battle.sideOne,battle.sideTwo]){if(side.length<=1)continue;for(let index=0;index<side.length;){const fleet=side[index];if(bool(fleet.isPlayerFleet)||originalBattleFleetIsValid(fleet,services)){index++;continue;}side.splice(index,1);notifyOriginalBattleAbilitiesLeft(fleet,battle,true,services);fleet.battle=null;}}
}
export function applyOriginalBattleVisibility(fleet,services={}){
 campaign(fleet);const settings=services.readBattleVisibilitySettings?call(services,'readBattleVisibilitySettings'):ORIGINAL_CAMPAIGN_BATTLE.settings;
 const mult=scalar(settings.battleDetectabilityMult),flat=scalar(settings.battleDetectabilityFlat),stats=fleet.stats;check(stats?.detectedRangeMod,'Actual fleet detected-range stat required');
 addOriginalFleetTemporaryMod(stats,stats.detectedRangeMod,'battle_mod_flat',f(.1),'flat',flat,'在战斗中');
 addOriginalFleetTemporaryMod(stats,stats.detectedRangeMod,'battle_mod_mult',f(.1),'mult',mult,'在战斗中');
}
/** Native fourth-power repulsion/log movement and quantized fast-angle table. Not normalized double-precision steering. */
export function originalBattleMovementData(fleet,battle,services={}){
 const side=originalBattleSideFor(battle,fleet);check(side!==null,'Movement fleet must be involved in Battle');const other=side===battle.sideOne?battle.sideTwo:battle.sideOne;
 const center=[0,0],steer=[0,0],ownRadius=radius(fleet,services);let weight=0;
 const push=(direction,overlap)=>{for(let i=0;i<2;i++)steer[i]=f(steer[i]+f(f(f(f(f(f(direction[i]*overlap)*overlap)*overlap)*overlap)*10)+0));};
 for(const ally of side){if(ally===fleet)continue;const separation=distance(position(ally),position(fleet)),r=radius(ally,services),direction=unit(angle(position(ally),position(fleet)));
  if(separation<f(ownRadius+r)){push(direction,f(f(ownRadius+r)-separation));continue;}
  if(separation>f(f(ownRadius+r)+10)){const gap=f(f(separation-ownRadius)-r);for(let i=0;i<2;i++)steer[i]=f(steer[i]-f(f(direction[i]*gap)*2));}
 }
 for(const enemy of other){const separation=distance(position(enemy),position(fleet)),r=radius(enemy,services),direction=unit(angle(position(enemy),position(fleet)));
  if(separation<f(ownRadius+r))push(direction,f(f(ownRadius+r)-separation));else if(separation>f(f(ownRadius+r)+10)){const gap=f(f(separation-ownRadius)-r);for(let i=0;i<2;i++)steer[i]=f(steer[i]-f(direction[i]*gap));}
  if(separation<f(f(ownRadius+r)+100)){for(let i=0;i<2;i++)center[i]=f(center[i]+f(position(enemy)[i]*r));weight=f(weight+r);}
 }
 if(weight>0){center[0]=f(center[0]/weight);center[1]=f(center[1]/weight);}
 const length=f(Math.sqrt(squared(steer))),small=length<2;
 // Misc.normalise's new (1,0) fallback is IGNORED by the native caller (javap pop).
 if(squared(steer)>2**-149){const reciprocal=f(1/length);steer[0]=f(steer[0]*reciprocal);steer[1]=f(steer[1]*reciprocal);}
 let scale=f(Math.log(length));if(scale<2)scale=2;steer[0]=f(steer[0]*scale);steer[1]=f(steer[1]*scale);if(small){steer[0]=0;steer[1]=0;}
 return [steer[0],steer[1],weight>0?angle(position(fleet),center):campaign(fleet).desiredFacing];
}
/** Original addFlash scheduling. The receiving animation manager must execute the real delayed flash, not record it. */
export function scheduleOriginalBattleFlashes(battle,context,services={}){
 const primary=originalBattlePrimary(battle,battle.sideOne,services);if(primary===null)return;
 check(Object.hasOwn(context,'currentLocation'),'Actual nullable current location required');if(context.currentLocation!==campaign(primary).entity.containingLocation)return;
 call(services,'isBattlePositionNearViewport',position(primary),1000); // Native ignores this Boolean result.
 let count=f(f(f(both(battle).length)*f(f(.5)+f(f(originalJavaNextDouble(services.globalRandom))*1)))*1);if(count<1)count=1;
 for(let i=0;f(i)<count;i++){const random=f(originalJavaNextDouble(services.globalRandom));call(services,'scheduleBattleFlashAnimation',battle,f(random*random));}
}
function sideEmpty(side,s){return side.length===0||side.length===1&&originalBattleFleetMembers(side[0],s).length<=0;}
/** Does not own pause: EveryFrameScript.runWhilePaused=false is honored by the location dispatcher. */
export function advanceOriginalCampaignBattle(battle,seconds,context,services={}){
 validateOriginalCampaignBattle(battle);seconds=scalar(seconds);clearTransient(battle);if(battle.done)return;
 removeOriginalBattleEmptyFleets(battle,services);
 if(sideEmpty(battle.sideOne,services)||sideEmpty(battle.sideTwo,services)){let winner='TWO';if(sideEmpty(battle.sideTwo,services))winner='ONE';call(services,'finishBattle',battle,winner,false);return;}
 const fleets=both(battle),hasStation=originalBattleStationInvolved(battle);let first=null;
 for(const fleet of fleets){const data=originalBattleMovementData(fleet,battle,services),pos=position(fleet),entity=campaign(fleet).entity;check(Object.hasOwn(entity,'orbit'),'Actual nullable Battle fleet orbit required');
  if(entity.orbit===null){const mult=hasStation?4:1;setOriginalConstructedFleetDestination(fleet,f(pos[0]+f(data[0]*mult)),f(pos[1]+f(data[1]*mult)));setOriginalConstructedFleetDesiredFacing(fleet,data[2]);}
  applyOriginalBattleVisibility(fleet,services);
  if(!bool(context.fastAdvance))continue;if(first===null){first=fleet;continue;}
  const gap=f(f(distance(position(first),position(fleet))-radius(fleet,services))-radius(first,services));if(gap>100)setOriginalConstructedFleetLocation(fleet,...position(first));
 }
 let mult=1,one=0,two=0;for(const fleet of battle.sideOne)one=f(one+f(originalBattleFleetPoints(fleet,services)));for(const fleet of battle.sideTwo)two=f(two+f(originalBattleFleetPoints(fleet,services)));
 if(one>=1&&two>=1){mult=f(Math.max(one,two)/Math.min(f(one*2),f(two*2)));if(mult<1)mult=1;if(mult>5)mult=5;}
 if(originalBattleStationInvolved(battle))mult=f(mult*f(.25));
 const days=scalar(call(services,'convertBattleSecondsToDays',seconds));advanceOriginalEngineInterval(battle.tracker,f(days*mult),services.globalRandom);
 if(battle.tracker.intervalElapsed&&!battle.done)call(services,'resolveBattleRound',battle);
 // The source overwrites its computed side-count multiplier with 1 before flash.advance.
 advanceOriginalEngineInterval(battle.flash,f(f(seconds*1)*1),services.globalRandom);
 if(battle.flash.intervalElapsed)scheduleOriginalBattleFlashes(battle,context,services);
 clearTransient(battle);
}
