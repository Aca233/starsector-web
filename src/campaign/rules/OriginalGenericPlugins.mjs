/** GenericPluginManager current-runtime checkpoint model; no executable functions in state. */
import {requireThat,isRecord,jsonCopy} from '../core/Values.mjs';
export const ORIGINAL_GENERIC_PLUGIN_TYPE='com.fs.starfarer.api.campaign.GenericPluginManagerAPI$GenericPlugin';
export const ORIGINAL_GENERIC_PLUGIN_PRIORITIES=Object.freeze({CORE_GENERAL:0,MOD_GENERAL:100,CORE_SUBSET:200,MOD_SUBSET:300,CORE_SPECIFIC:400,MOD_SPECIFIC:500,HIGHEST:2147483647});
const OBJECT='java.lang.Object',LIMIT=4096;
const check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_GENERIC_PLUGINS',m);
function key(value,label){check(typeof value==='string'&&value.length>0&&value.length<=1024,label+' required');return value;}
function descriptor(value){
 check(isRecord(value),'Actual checkpointable GenericPlugin descriptor required');jsonCopy(value);
 key(value.objectRef,'Plugin object identity');key(value.classId,'Exact plugin class identity');
 check(Array.isArray(value.types)&&value.types.length>0&&value.types.length<=LIMIT&&new Set(value.types).size===value.types.length,'Actual complete unique class/interface closure required');
 for(const type of value.types)key(type,'Plugin assignable type');
 check(value.types.includes(value.classId)&&value.types.includes(OBJECT)&&value.types.includes(ORIGINAL_GENERIC_PLUGIN_TYPE),'Plugin types must include its concrete class, Object and GenericPlugin');
 check(Object.hasOwn(value,'data'),'Explicit plugin data required (null allowed)');return value;
}
const signature=p=>JSON.stringify([...p.types].sort());
/** Caller supplies actual extra superclass/interface IDs; only universally guaranteed types are added. */
export function createOriginalGenericPluginDescriptor(objectRef,classId,types=[],data=null){
 check(Array.isArray(types),'Actual plugin type closure required');return descriptor({objectRef,classId,types:[...new Set([classId,OBJECT,ORIGINAL_GENERIC_PLUGIN_TYPE,...types])],data:jsonCopy(data)});
}
export function createOriginalGenericPluginManager(){return {scope:'native-generic-plugin-manager',objects:[],plugins:[],transientPlugins:[]};}
export function validateOriginalGenericPluginManager(state){
 check(isRecord(state)&&state.scope==='native-generic-plugin-manager','Actual GenericPluginManager history required');jsonCopy(state);
 check(Array.isArray(state.objects)&&state.objects.length<=LIMIT,'Actual canonical plugin descriptor table required');
 const objects=new Map(),classes=new Map();for(const p of state.objects){descriptor(p);check(!objects.has(p.objectRef),'Duplicate canonical plugin object identity');objects.set(p.objectRef,p);
  const types=signature(p);check(!classes.has(p.classId)||classes.get(p.classId)===types,'Conflicting assignability closure for the same native class');classes.set(p.classId,types);
 }
 const registered=new Set();for(const name of ['plugins','transientPlugins']){
  const list=state[name];check(Array.isArray(list)&&list.length<=LIMIT&&new Set(list).size===list.length,'Actual ordered identity-deduplicated '+name+' repository required');
  for(const ref of list){key(ref,'Repository object reference');check(objects.has(ref),'Unresolved GenericPlugin repository reference: '+ref);registered.add(ref);}
 }
 check(registered.size===objects.size,'Unregistered descriptors cannot stand in for actual repository objects');return state;
}
function registeredObject(state,p){
 descriptor(p);const current=state.objects.find(value=>value.objectRef===p.objectRef);
 check(current===undefined||current===p,'Split GenericPlugin identity; use the actual current descriptor, not a copy');return current;
}
/** Identity-deduplicates within this repository, never across saved and transient repositories. */
export function addOriginalGenericPlugin(state,p,isTransient=false){
 validateOriginalGenericPluginManager(state);check(typeof isTransient==='boolean','Actual isTransient boolean required');const current=registeredObject(state,p),list=isTransient?state.transientPlugins:state.plugins;
 if(list.includes(p.objectRef))return;
 check(list.length<LIMIT&&(current!==undefined||state.objects.length<LIMIT),'GenericPlugin repository work limit');
 for(const other of state.objects)if(other.classId===p.classId)check(signature(other)===signature(p),'Conflicting assignability closure for the same native class');
 if(current===undefined)state.objects.push(p);list.push(p.objectRef);
}
export function removeOriginalGenericPlugin(state,p){
 validateOriginalGenericPluginManager(state);const current=registeredObject(state,p);if(current===undefined)return;
 for(const list of [state.plugins,state.transientPlugins]){const index=list.indexOf(p.objectRef);if(index>=0)list.splice(index,1);}
 state.objects.splice(state.objects.indexOf(p),1);
}
/** API returns a fresh list; each element is still the real registered descriptor. */
export function originalGenericPluginsOfClass(state,typeId){
 validateOriginalGenericPluginManager(state);key(typeId,'Requested class/interface');const byRef=new Map(state.objects.map(p=>[p.objectRef,p]));
 return [...state.plugins,...state.transientPlugins].map(ref=>byRef.get(ref)).filter(p=>p.types.includes(typeId));
}
/** Java getClass()==clazz, not assignability. */
export function hasOriginalGenericPlugin(state,classId){
 validateOriginalGenericPluginManager(state);key(classId,'Exact requested class');const byRef=new Map(state.objects.map(p=>[p.objectRef,p]));
 return [...state.plugins,...state.transientPlugins].some(ref=>byRef.get(ref).classId===classId);
}
export function pickOriginalGenericPlugin(state,typeId,params,services={}){
 const candidates=originalGenericPluginsOfClass(state,typeId);let selected=null,best=-1;
 for(const p of candidates){
  check(typeof services?.readGenericPluginPriority==='function','Actual synchronous GenericPlugin priority reader required');const priority=services.readGenericPluginPriority(p,params);
  check(!priority||typeof priority.then!=='function','GenericPlugin priority reader must be synchronous');
  check(Number.isInteger(priority)&&priority>=-2147483648&&priority<=2147483647,'Actual native int32 handling priority required');
  if(priority>=0&&priority>best){selected=p;best=priority;}
 }
 return selected;
}
