/** IntelManager communication reach: not sensor range or viewport visibility. */
import R from '../data/reference-intel-manager.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
export const ORIGINAL_INTEL_COMMUNICATIONS=Object.freeze(R.settings);
const f=Math.fround,check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_INTEL_COMMUNICATIONS',message);
const call=(services,name,...args)=>{check(typeof services[name]==='function','Actual intel spatial service required: '+name);const value=services[name](...args);check(!value||typeof value.then!=='function','Intel spatial services must be synchronous');return value;};
const bool=value=>{check(typeof value==='boolean','Actual communication Boolean required');return value;};
const vector=value=>{check(Array.isArray(value)&&value.length===2&&value.every(v=>typeof v==='number'&&Number.isFinite(v)&&f(v)===v),'Actual float communication vector required');return value;};
export function originalIntelDistance(one,two){const a=vector(one),b=vector(two),dx=f(a[0]-b[0]),dy=f(a[1]-b[1]);return f(Math.sqrt(f(f(dx*dx)+f(dy*dy))));}
export function originalIntelSettings(services={}){const s=services.readIntelRangeSettings?call(services,'readIntelRangeSettings'):ORIGINAL_INTEL_COMMUNICATIONS;for(const key of ['unitsPerLightYear','maxRelayRangeInHyperspace','commRelayRangeAroundSystem'])check(typeof s[key]==='number'&&Number.isFinite(s[key])&&f(s[key])===s[key],'Actual communication settings required');check(s.unitsPerLightYear>0,'Positive light-year scale required');return s;}
export function findOriginalCommRelay(observer,world,services){
 if(observer===null)return null;const settings=originalIntelSettings(services),hyper=vector(call(services,'readIntelEntityHyperPosition',observer));let nearest=null,min=3.4028234663852886e38;
 const relays=location=>{const list=call(services,'readIntelRelays',location);check(Array.isArray(list),'Actual ordered tagged relay list required');return list;};
 if(bool(call(services,'isIntelEntityInHyperspace',observer))){
  for(const relay of relays(world.hyperspace)){if(bool(call(services,'isIntelRelayNonfunctional',relay)))continue;const distance=f(originalIntelDistance(call(services,'readIntelEntityHyperPosition',relay),hyper)/settings.unitsPerLightYear);if(distance<min&&distance<=settings.maxRelayRangeInHyperspace){min=distance;nearest=relay;}}
  for(const system of world.starSystems){const distance=f(originalIntelDistance(call(services,'readIntelSystemHyperPosition',system),hyper)/settings.unitsPerLightYear);if(distance>settings.commRelayRangeAroundSystem)continue;
   const list=[...relays(system)].filter(relay=>!bool(call(services,'isIntelRelayNonfunctional',relay)));if(!list.length)continue;
   if(distance<min&&distance<=settings.commRelayRangeAroundSystem){min=distance;const index=call(services,'chooseIntelSystemRelay',list.length);check(Number.isInteger(index)&&index>=0&&index<list.length,'Actual new-Random relay selection required');nearest=list[index];}
  }
 }else{const location=call(services,'readIntelEntityLocation',observer);for(const relay of relays(location)){if(bool(call(services,'isIntelRelayNonfunctional',relay)))continue;const distance=originalIntelDistance(call(services,'readIntelEntityPosition',observer),call(services,'readIntelEntityPosition',relay));if(distance<min){min=distance;nearest=relay;}}}
 return nearest;
}
