/** FleetMember strength + Misc quality/hull/captain multipliers, not FP as a proxy. */
import R from '../data/reference-fleet-sync.json' with {type:'json'};
import {originalAutofitCosts} from './OriginalAutofitCosts.mjs';
import {requireThat} from '../core/Values.mjs';
import {getOriginalMemberStats,originalMemberPlayerCommander} from './OriginalMemberEffects.mjs';
import {originalMemberCurrentCR,originalMemberCRThresholds} from './OriginalFleetMemberStats.mjs';
import {originalNativeMemberHullFraction} from './OriginalNativeRepair.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_STRENGTH',m);
const number=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n)&&n===f(n),'Actual native float required: '+label);return n;};
function call(services,key,...args){check(typeof services[key]==='function','Actual strength service required: '+key);const out=services[key](...args);check(!out||typeof out.then!=='function','Strength services must be synchronous');return out;}
function hull(member){const h=R.hulls[member.variant?.hullId];check(h&&Array.isArray(h.hints),'Actual native hull required');return h;}
function variant(member){const v=member.variant;check(v?.effects&&Array.isArray(v.weapons)&&Array.isArray(v.wings),'Actual fitted variant required');return v;}
export function originalNativeVariantOPCost(member){return originalAutofitCosts.readVariantOPCost(variant(member),null);}
export function originalNativeMemberIsCivilian(member){const h=hull(member),v=variant(member);if(h.hints.includes('CIVILIAN'))return true;if(h.hints.includes('STATION')||h.hints.includes('SHIP_WITH_MODULES')||h.hullSize==='FIGHTER')return false;return v.weapons.length===0&&!v.wings.some(w=>w!==null&&w!=='');}
export function originalNativeBaseMemberStrength(member,fleet,services={}){
 number(member.cachedStrength,'member strength cache');if(member.cachedStrength>=0)return member.cachedStrength;
 check(typeof member.repairTracker?.mothballed==='boolean','Actual mothball state required');if(member.repairTracker.mothballed){member.cachedStrength=0;return 0;}
 const h=hull(member),op=f(h.ordnancePoints),wing=member.type==='FIGHTER_WING'?R.wings[member.specId]:null;check(member.type!=='FIGHTER_WING'||wing,'Actual fighter wing required');let strength=f(wing?wing.fleetPoints:h.fleetPoints);
 if(op>0&&op<1000&&member.type!=='FIGHTER_WING'){const cost=services.readVariantOPCost?call(services,'readVariantOPCost',member):originalNativeVariantOPCost(member);check(Number.isInteger(cost)&&cost>=-2147483648&&cost<=2147483647,'Native int OP cost required');strength=f(strength*f(f(0.2)+f(f(f(0.8)*f(cost))/op)));}
 const s=getOriginalMemberStats(member,fleet),cr=originalMemberCurrentCR(member,fleet,{playerCommander:originalMemberPlayerCommander(member,fleet)}),threshold=originalMemberCRThresholds(s).malfunction;
 if(cr<threshold)strength=f(strength*f(f(0.2)+f(f(f(0.8)*cr)/threshold)));
 if(originalNativeMemberIsCivilian(member))strength=f(strength*f(0.25));member.cachedStrength=strength;return strength;
}
function inflaterQuality(source,services){
 check(source&&typeof source.inflated==='boolean'&&Object.hasOwn(source,'inflater'),'Actual native fleet inflation state required');if(source.inflater===null||source.inflated)return null;
 const inflater=source.inflater;let q;
 if(inflater.className==='com.fs.starfarer.api.impl.campaign.fleets.DefaultFleetInflater'){check(inflater.parameters,'Actual inflater parameters required');q={quality:inflater.parameters.quality,sMods:f(inflater.parameters.averageSMods??0)};}
 else q=call(services,'readInflaterStrength',inflater,source);
 return {quality:number(q.quality,'inflater quality'),sMods:number(q.sMods,'average S-mods')};
}
export function originalNativeMemberStrength(member,fleet,withHull=true,withQuality=true,withCaptain=true,services={}){
 check([withHull,withQuality,withCaptain].every(v=>typeof v==='boolean'),'Actual strength option flags required');let strength=Math.max(f(0.25),originalNativeBaseMemberStrength(member,fleet,services)),quality=f(0.5),sMods=0;
 if(member.fleetDataRef!==null&&fleet.attachedToCampaignFleet){check(member.fleetDataRef===fleet.dataRef,'Strength member belongs to another fleet');let source=inflaterQuality(fleet,services);
  if(!source){check(Object.hasOwn(fleet,'battle'),'Actual battle state required');if(fleet.battle!==null){check(Array.isArray(fleet.battle.memberSource),'Actual battle member-source map required');const entry=fleet.battle.memberSource.find(e=>e.memberRef===member.objectRef);if(entry)source=inflaterQuality(entry.fleet,services);}}
  if(source){quality=source.quality;sMods=source.sMods;}else{const v=variant(member);let dmods=0;for(const id of v.effects.hullMods){const spec=R.hullmodSpecs[id];check(spec,'Actual D-mod definition required');if(spec.tags.includes('dmod'))dmods++;}quality=Math.max(0,f(1-f(R.settings.qualityPerDMod*f(dmods))));sMods=f(v.effects.sMods.length);}
 }
 const station=hull(member).hints.includes('STATION');if(station)quality=1;if(sMods>0)quality=f(quality+f(sMods*R.settings.qualityPerSMod));
 let captainMult=1;check(member.captainRef!==undefined,'Actual captain identity required');if(member.captainRef!==null){const p=fleet.statPeople?.find(p=>p.objectRef===member.captainRef);check(p?.stats,'Actual captain statistics required');const level=f(f(p.stats.level)-1);captainMult=f(captainMult+f(level/(station?f(R.settings.officerMaxLevel*2):R.settings.officerMaxLevel)));}
 if(withQuality)strength=f(strength*Math.max(f(0.25),f(f(0.8)+f(quality*f(0.4)))));
 if(withHull)strength=f(strength*f(f(0.5)+f(f(0.5)*originalNativeMemberHullFraction(member,services))));
 if(withCaptain)strength=f(strength*captainMult);return strength;
}
