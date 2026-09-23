/** CampaignEventTarget/Pair keys and Java HashMap list bins. Unknown Java object methods are explicit dependencies. */
import {requireThat} from '../core/Values.mjs';
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_EVENT_KEYS',message);
const call=(services,name,...args)=>{check(typeof services[name]==='function','Actual event key service required: '+name);return services[name](...args);};
const int=value=>{check(Number.isInteger(value)&&value===(value|0),'Actual Java int hash required');return value;};
export function originalEventStringHash(value){let hash=0;for(let i=0;i<value.length;i++)hash=(Math.imul(hash,31)+value.charCodeAt(i))|0;return hash;}
function hash(value,services){if(value===null)return 0;if(typeof value==='string')return originalEventStringHash(value);if(typeof value==='boolean')return value?1231:1237;return int(call(services,'eventValueHashCode',value));}
function equal(one,two,services){if(one===two)return true;if(one===null||two===null)return false;if(['string','boolean'].includes(typeof one))return one===two;const result=call(services,'eventValueEquals',one,two);check(typeof result==='boolean','Actual Java equals Boolean required');return result;}
export function createOriginalCampaignEventTarget({custom=null,location=null,entity=null,extra=null}={}){return validateOriginalCampaignEventTarget({scope:'native-campaign-event-target',custom,location,entity,extra});}
export function validateOriginalCampaignEventTarget(target){check(target?.scope==='native-campaign-event-target'&&['custom','location','entity','extra'].every(k=>Object.hasOwn(target,k)),'Actual CampaignEventTarget fields required');check((target.location===null||typeof target.location==='object')&&(target.entity===null||typeof target.entity==='object'),'Actual event target identities required');return target;}
export function originalCampaignEventTargetEquals(one,two,services={}){if(one===two)return true;if(one===null||two===null||one.scope!==two.scope)return false;if(one.custom!==null&&equal(one.custom,two.custom,services))return true;if(!equal(one.custom,two.custom,services))return false;return one.entity===two.entity&&one.location===two.location&&equal(one.extra,two.extra,services);}
export function originalCampaignEventKeyHash(key,services={}){const target=validateOriginalCampaignEventTarget(key.target);let result=1;if(target.custom!==null)result=(Math.imul(31,result)+hash(target.custom,services))|0;else for(const value of [target.entity,target.location,target.extra])result=(Math.imul(31,result)+hash(value,services))|0;return (Math.imul(31,(31+originalEventStringHash(key.eventType))|0)+result)|0;}
const spread=hash=>(hash^(hash>>>16))|0;
export function originalCampaignEventMapEntry(map,key,services={}){const h=spread(originalCampaignEventKeyHash(key,services));return map.entries.find(row=>row.hash===h&&(row.key===key||row.key.eventType===key.eventType&&originalCampaignEventTargetEquals(row.key.target,key.target,services)))??null;}
export function putOriginalCampaignEventMap(map,key,probability,services={}){
 const old=originalCampaignEventMapEntry(map,key,services);if(old){old.probability=probability;return old;}
 const h=spread(originalCampaignEventKeyHash(key,services));if(map.capacity===0)map.capacity=16;
 const bucket=h&(map.capacity-1),count=map.entries.filter(row=>(row.hash&(map.capacity-1))===bucket).length;
 if(count>=8){check(map.capacity<64,'Java HashMap tree bins require a complete native map adapter');map.capacity*=2;}
 const row={key,hash:h,probability};map.entries.push(row);if(map.entries.length>map.capacity*.75&&map.capacity<1073741824)map.capacity*=2;return row;
}
export function removeOriginalCampaignEventMap(map,key,services={}){const row=originalCampaignEventMapEntry(map,key,services);if(row===null)return false;map.entries.splice(map.entries.indexOf(row),1);return true;}
/** Stable bucket order, including the original chain insertion order retained across splits. */
export function originalCampaignEventMapKeys(map){return [...map.entries].sort((a,b)=>(a.hash&(map.capacity-1))-(b.hash&(map.capacity-1))).map(row=>row.key);}
export function validateOriginalCampaignEventMap(map){check(map&&Number.isInteger(map.capacity)&&map.capacity>=0&&map.capacity<=1073741824&&(map.capacity===0||map.capacity>=16&&(map.capacity&(map.capacity-1))===0)&&Array.isArray(map.entries),'Actual Java HashMap capacity/list-bin state required');check(map.capacity!==0||map.entries.length===0,'Nonempty unallocated event map');const keys=new Set();for(const row of map.entries){check(row.key&&typeof row.key.eventType==='string'&&!keys.has(row.key),'Actual event Pair key required');keys.add(row.key);validateOriginalCampaignEventTarget(row.key.target);int(row.hash);}return map;}
