/** Actual newly constructed Memory container; not a reconstruction of uncaptured save flags.
 * Implements the ordered value/dependency/expiry APIs used by campaign entities.
 * Native XML entity-id restoration requires the caller's real world lookup; Web graph saves retain identity. */
import {requireThat} from '../core/Values.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_CAMPAIGN_MEMORY',m);
const put=(rows,key,value)=>{const row=rows.find(r=>r.key===key);if(row)row.value=value;else rows.push({key,value});};
const remove=(rows,key)=>{const at=rows.findIndex(r=>r.key===key);return at<0?null:rows.splice(at,1)[0];};
const scalar=n=>{check(typeof n==='number'&&Number.isFinite(n)&&Number.isFinite(f(n)),'Finite native memory duration required');return f(n);};
export function createOriginalCampaignMemory(){return {scope:'native-campaign-memory',data:[],expire:[],require:[],reqFor:[],restored:false};}
export function validateOriginalCampaignMemory(memory){
 check(memory?.scope==='native-campaign-memory'&&typeof memory.restored==='boolean','Actual Memory constructor state required');
 for(const key of ['data','expire','require','reqFor']){check(Array.isArray(memory[key]),'Actual ordered memory collection required');const seen=new Set();for(const row of memory[key]){check(typeof row.key==='string'&&!seen.has(row.key),'Duplicate/invalid memory key');seen.add(row.key);}}
 for(const row of memory.expire)check(scalar(row.timeLeft)===row.timeLeft,'Native float expiry required');
 for(const row of memory.require)check(Array.isArray(row.req)&&row.req.every(k=>typeof k==='string')&&new Set(row.req).size===row.req.length,'Invalid memory requirement set');
 return memory;
}
export function originalEntityMemoryWithoutUpdate(entity){
 check(Object.hasOwn(entity,'memory'),'Uncaptured historical entity memory cannot be inferred');
 if(entity.memory===null)entity.memory=createOriginalCampaignMemory();return validateOriginalCampaignMemory(entity.memory);
}
function restore(memory,services){
 if(memory.restored)return;
 for(const row of [...memory.data]){if(typeof row.value!=='string')continue;const prefix=row.value.startsWith('enRef_')?'enRef_':row.value.startsWith('mRef_')?'mRef_':null;if(prefix===null)continue;
  const lookup=prefix==='enRef_'?services.resolveEntity:services.resolveMarket;check(typeof lookup==='function','Actual world lookup required to restore memory reference');const value=lookup(row.value.slice(prefix.length));check(value!==undefined&&!(value&&typeof value.then==='function'),'Synchronous object or null lookup required');if(value===null)remove(memory.data,row.key);else row.value=value;
 }memory.restored=true;
}
export function originalCampaignMemoryGet(memory,key,services={}){restore(memory,services);return memory.data.find(r=>r.key===key)?.value??null;}
export function originalCampaignMemoryContains(memory,key,services={}){restore(memory,services);return memory.data.some(r=>r.key===key);}
/** getBoolean calls getString, not get/contains: do not trigger id restoration here. */
export function originalCampaignMemoryBoolean(memory,key,services={}){
 const row=memory.data.find(r=>r.key===key);if(!row)return false;const value=row.value;check(value!==null&&value!==undefined,'Native getString on a null memory value');
 if(typeof value==='boolean')return value;if(typeof value==='number')return false;
 const text=typeof value==='string'?value:services.javaToString?.(value);check(typeof text==='string','Actual Java toString required for object-valued memory boolean');
 // String.trim in Java removes only UTF-16 code units <= U+0020, unlike JS trim.
 let start=0,end=text.length;while(start<end&&text.charCodeAt(start)<=32)start++;while(end>start&&text.charCodeAt(end-1)<=32)end--;
 return text.slice(start,end).toLowerCase()==='true';
}
export function expireOriginalCampaignMemory(memory,key,days){days=scalar(days);const row=memory.expire.find(r=>r.key===key);if(row){row.timeLeft=days;if(days<0)remove(memory.expire,key);}else if(days>=0)memory.expire.push({key,timeLeft:days});}
export function setOriginalCampaignMemory(memory,key,value,days){
 check(typeof key==='string'&&key.startsWith('$'),'Memory key must start with $');put(memory.data,key,value);
 if(days===undefined)remove(memory.expire,key);else expireOriginalCampaignMemory(memory,key,days);
}
export function addOriginalCampaignMemoryRequired(memory,key,required){let row=memory.require.find(r=>r.key===key);if(!row){row={key,req:[]};memory.require.push(row);}if(!row.req.includes(required))row.req.push(required);put(memory.reqFor,required,key);}
export function removeOriginalCampaignMemoryRequired(memory,key,required){const row=memory.require.find(r=>r.key===key);if(!row)return;const at=row.req.indexOf(required);if(at>=0)row.req.splice(at,1);if(!row.req.length)remove(memory.require,key);remove(memory.reqFor,required);}
export function unsetOriginalCampaignMemory(memory,key,services={}){
 const parent=remove(memory.reqFor,key);remove(memory.data,key);
 if(parent){const row=memory.require.find(r=>r.key===parent.value);if(row&&!row.req.some(k=>originalCampaignMemoryContains(memory,k,services))){remove(memory.require,row.key);unsetOriginalCampaignMemory(memory,row.key,services);}}
 // Native unset deliberately does not delete its expiry record.
}
/** Native seconds are converted by the caller's current clock. Base.advance owns this phase. */
export function advanceOriginalCampaignMemory(memory,days,{paused},services={}){
 days=scalar(days);check(typeof paused==='boolean','Actual campaign pause state required');restore(memory,services);if(paused)return;
 for(let i=0;i<memory.expire.length;){const row=memory.expire[i];row.timeLeft=f(row.timeLeft-days);if(row.timeLeft<0){unsetOriginalCampaignMemory(memory,row.key,services);memory.expire.splice(i,1);}else i++;}
 const entries=[...memory.require];for(let i=0;i<entries.length;i++){const row=entries[i];if(row.req.some(k=>originalCampaignMemoryContains(memory,k,services)))continue;remove(memory.require,row.key);unsetOriginalCampaignMemory(memory,row.key,services);
  // LinkedHashMap.values iterator throws on its next element after structural removal.
  check(i===entries.length-1,'Native Memory.require concurrent modification');
 }
}

/** Memory.getInt reads data directly (unlike get/contains it does not restore entity IDs). */
export function originalCampaignMemoryInteger(memory,key,services={}){
 const row=memory.data.find(r=>r.key===key);if(!row)return 0;const value=row.value;
 const int=n=>Number.isNaN(n)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));
 if(typeof value==='number')return int(Number.isInteger(value)&&value>=-2147483648&&value<=2147483647?value:f(value));
 const text=typeof value==='string'?value:services.javaToString?.(value);check(typeof text==='string','Actual Java toString required for integer memory');
 if(/^[+-]?\d+$/.test(text)){const n=Number(text);if(n>=-2147483648&&n<=2147483647)return n;}
 let start=0,end=text.length;while(start<end&&text.charCodeAt(start)<=32)start++;while(end>start&&text.charCodeAt(end-1)<=32)end--;const trimmed=text.slice(start,end);
 if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?$/.test(trimmed))return int(f(Number(trimmed.replace(/[fFdD]$/,''))));
 if(['NaN','Infinity','+Infinity','-Infinity'].includes(trimmed))return int(Number(trimmed));
 check(typeof services.parseJavaFloat==='function','Actual Java Float parser required for integer memory');const parsed=services.parseJavaFloat(text);check(typeof parsed==='number','Java float parser must return a number');return int(f(parsed));
}
