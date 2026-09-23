/** Selected native Memory closure, or a value-free view of an explicitly bound complete Memory. */
import {requireThat} from '../core/Values.mjs';
import {validateOriginalCampaignMemory,originalCampaignMemoryContains,originalCampaignMemoryBoolean,setOriginalCampaignMemory,unsetOriginalCampaignMemory,addOriginalCampaignMemoryRequired} from './OriginalCampaignMemory.mjs';
const isView=m=>m?.scope==='native-memory-flag-view';
const check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_MEMORY_FLAGS',m);
export function validateOriginalMemoryFlags(memory){
 check((memory?.scope==='native-memory-flag-closure'||isView(memory))&&Array.isArray(memory.unresolved)&&memory.unresolved.length===0,'Complete actual memory flag closure required');
 for(const key of ['roots','keys'])check(Array.isArray(memory[key])&&new Set(memory[key]).size===memory[key].length&&memory[key].every(k=>typeof k==='string'&&k.startsWith('$')),'Invalid memory closure keys');
 check(memory.roots.every(k=>memory.keys.includes(k))&&typeof memory.objectRef==='string','Invalid memory closure identity');
 if(isView(memory)){check(Object.keys(memory).every(k=>['scope','objectRef','roots','keys','unresolved','memory'].includes(k)),'Bound flag view must not retain duplicate memory state');validateOriginalCampaignMemory(memory.memory);return memory;}
 check(!Object.hasOwn(memory,'memory')&&Number.isSafeInteger(memory.nextObjectId)&&memory.nextObjectId>=0,'Invalid unbound closure identity');
 for(const list of ['data','requirements','requiredFor']){check(Array.isArray(memory[list])&&new Set(memory[list].map(e=>e.key)).size===memory[list].length,'Duplicate memory map key');for(const e of memory[list])check(memory.keys.includes(e.key),'Memory edge outside captured closure');}
 for(const e of memory.requirements)check(typeof e.objectRef==='string'&&Array.isArray(e.requiredKeys)&&new Set(e.requiredKeys).size===e.requiredKeys.length&&e.requiredKeys.every(k=>memory.keys.includes(k)),'Incomplete required-memory keys');
 for(const e of memory.requiredFor)check(memory.keys.includes(e.parentKey),'Incomplete reverse memory dependency');
 check(Array.isArray(memory.expires)&&memory.expires.every(e=>memory.keys.includes(e.key)&&typeof e.objectRef==='string'&&Number.isFinite(e.timeLeft)&&Math.fround(e.timeLeft)===e.timeLeft),'Invalid memory expirations');return memory;
}
/** Validate before conversion. This never reconstructs complete Memory from a selected capture. */
export function bindOriginalMemoryFlags(memory,complete){
 const m=validateOriginalMemoryFlags(memory),full=validateOriginalCampaignMemory(complete);
 if(isView(m)){check(m.memory===full,'Cannot replace the bound complete Memory');return m;}
 check(Object.keys(m).every(key=>['scope','objectRef','roots','keys','unresolved','data','expires','requirements','requiredFor','nextObjectId'].includes(key)),'Unsupported closure fields cannot bind');
 const primitive=value=>{
  check(value&&typeof value.text==='string','Actual captured primitive required');const {type,text}=value;
  if(type==='st')return text;
  if(type==='bp'){check(text==='true'||text==='false','Invalid captured Boolean');return text==='true';}
  check(['ip','lp','fp','dp'].includes(type)&&text.trim()!=='','Unsupported captured memory value');
  const n=Number(text);check(Number.isFinite(n),'Nonfinite captured primitive requires its actual representation');
  if(type==='ip'||type==='lp')check(/^[+-]?\d+$/.test(text)&&Number.isSafeInteger(n)&&BigInt(text)===BigInt(n)&&(type!=='ip'||n>=-2147483648&&n<=2147483647),'Lossy captured integer cannot bind to a Number');
  return type==='fp'?Math.fround(n):n;
 };
 const selected=rows=>rows.filter(row=>m.keys.includes(row.key));
 const equalRows=(a,b,equal,label)=>check(a.length===b.length&&a.every((row,i)=>row.key===b[i].key&&equal(row,b[i])),'Complete Memory disagrees with captured '+label);
 equalRows(m.data,selected(full.data),(a,b)=>Object.is(primitive(a.value),b.value),'values');
 equalRows(m.expires,selected(full.expire),(a,b)=>Object.is(a.timeLeft,b.timeLeft),'expiry order');
 equalRows(m.requirements,selected(full.require),(a,b)=>a.requiredKeys.length===b.req.length&&a.requiredKeys.every((key,i)=>key===b.req[i]),'requirements');
 equalRows(m.requiredFor,selected(full.reqFor),(a,b)=>a.parentKey===b.value,'reverse dependencies');
 // Preserve the shared wrapper identity, but retire all value-bearing closure collections.
 for(const key of ['data','requirements','requiredFor','expires','nextObjectId'])delete m[key];
 m.scope='native-memory-flag-view';m.memory=full;return validateOriginalMemoryFlags(m);
}
function knows(m,key){check(m.keys.includes(key),'Memory key was not captured; refusing to infer absence');}
function present(m,key,services){knows(m,key);return isView(m)?originalCampaignMemoryContains(m.memory,key,services):m.data.some(e=>e.key===key);}
function unset(m,key,services){
 knows(m,key);if(isView(m)){unsetOriginalCampaignMemory(m.memory,key,services);return;}const at=m.requiredFor.findIndex(e=>e.key===key),parent=at<0?null:m.requiredFor.splice(at,1)[0].parentKey;
 const data=m.data.findIndex(e=>e.key===key);if(data>=0)m.data.splice(data,1);
 if(parent!==null){const i=m.requirements.findIndex(e=>e.key===parent),req=m.requirements[i];if(req&&!req.requiredKeys.some(k=>present(m,k))){m.requirements.splice(i,1);unset(m,parent);}}
 // Native unset does not remove expires or the surviving Require object's set member.
}
function setTrue(m,key,expiry){
 knows(m,key);if(isView(m)){setOriginalCampaignMemory(m.memory,key,true,expiry===null?undefined:expiry);return;}const value={type:'bp',text:'true'},old=m.data.find(e=>e.key===key);if(old)old.value=value;else m.data.push({key,value});
 const at=m.expires.findIndex(e=>e.key===key);
 if(expiry===null){if(at>=0)m.expires.splice(at,1);return;}
 if(at>=0){m.expires[at].timeLeft=expiry;if(expiry<0)m.expires.splice(at,1);}
 else if(expiry>=0)m.expires.push({objectRef:'created-memory-expiry:'+m.objectRef+':'+m.nextObjectId++,key,timeLeft:expiry});
}
export function setOriginalMemoryFlagWithReason(memory,flagKey,reason,value,expiry=-1,services={}){
 const m=validateOriginalMemoryFlags(memory);check(m.roots.includes(flagKey)&&typeof reason==='string'&&reason.length>0&&typeof value==='boolean','Actual captured flag root/reason required');
 check(Number.isFinite(expiry)&&Math.fround(expiry)===expiry,'Native memory expiry float required');const requiredKey=flagKey+'_'+reason;knows(m,requiredKey);
 if(value){
  setTrue(m,flagKey,null);setTrue(m,requiredKey,expiry);
  if(isView(m)){addOriginalCampaignMemoryRequired(m.memory,flagKey,requiredKey);return present(m,flagKey,services);}
  let req=m.requirements.find(e=>e.key===flagKey);if(!req){req={objectRef:'created-memory-require:'+m.objectRef+':'+m.nextObjectId++,key:flagKey,requiredKeys:[]};m.requirements.push(req);}
  if(!req.requiredKeys.includes(requiredKey))req.requiredKeys.push(requiredKey);
  const reverse=m.requiredFor.find(e=>e.key===requiredKey);if(reverse)reverse.parentKey=flagKey;else m.requiredFor.push({key:requiredKey,parentKey:flagKey});
 }else unset(m,requiredKey,services);
 return present(m,flagKey,services);
}
export function originalMemoryFlagPresent(memory,key,services={}){return present(validateOriginalMemoryFlags(memory),key,services);}

export function originalMemoryFlagBoolean(memory,key,services={}){
 const m=validateOriginalMemoryFlags(memory);knows(m,key);
 // MilitaryBase uses Memory.is(key, true): contains restores IDs before getBoolean.
 if(isView(m))return originalCampaignMemoryContains(m.memory,key,services)&&originalCampaignMemoryBoolean(m.memory,key,services);
 const value=m.data.find(e=>e.key===key)?.value;
 if(!value)return false;check(typeof value.text==='string','Actual primitive memory text required');
 const text=value.text.toLowerCase();let start=0,end=text.length;while(start<end&&text.charCodeAt(start)<=32)start++;while(end>start&&text.charCodeAt(end-1)<=32)end--;return text.slice(start,end)==='true';
}
export function originalMemoryFlagExpire(memory,key){const m=validateOriginalMemoryFlags(memory);knows(m,key);return (isView(m)?m.memory.expire:m.expires).find(e=>e.key===key)?.timeLeft??-1;}
export function setOriginalMemoryTrue(memory,key,expiry){const m=validateOriginalMemoryFlags(memory);check(Number.isFinite(expiry)&&Math.fround(expiry)===expiry,'Actual float expiry required');setTrue(m,key,expiry);}
export function unsetOriginalMemoryFlag(memory,key,services={}){unset(validateOriginalMemoryFlags(memory),key,services);}
/** A selected closure phase, in caller-supplied game days. Native expires at < 0, not <= 0. */
export function advanceOriginalMemoryFlags(memory,days,paused=false){
 const m=validateOriginalMemoryFlags(memory);check(Number.isFinite(days)&&Math.fround(days)===days&&days>=0&&typeof paused==='boolean','Actual nonnegative game days and pause state required');
 check(!isView(m),'Bound flag view cannot advance separately; complete Memory owns the clock');
 const expired=[];if(paused)return expired;
 for(let i=0;i<m.expires.length;){const e=m.expires[i];e.timeLeft=Math.fround(e.timeLeft-days);if(e.timeLeft<0){unset(m,e.key);expired.push(e.key);m.expires.splice(i,1);}else i++;}
 // Ordinary reason removals are already handled by unset. A pre-existing empty Require needs
 // the whole native LinkedHashMap's iterator/fail-fast ordering, including uncaptured keys.
 check(m.requirements.every(e=>e.requiredKeys.some(key=>present(m,key))),'Empty native Require needs full Memory iteration; refusing to silently repair it');
 return expired;
}
