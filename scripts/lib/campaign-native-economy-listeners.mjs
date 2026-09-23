/** Actual update roster, plus the independent persisted manager registration order. */
import { captureNativeResourceCargo } from './campaign-native-retail-inputs.mjs';
const check=(ok,message)=>{if(!ok)throw Error('NATIVE_SAVE_ECONOMY_LISTENERS: '+message);};
const bool=(text,label)=>{check(text==='true'||text==='false','Invalid '+label);return text==='true';};
export function captureNativeEconomyListeners(g,r,markets){
 const marketByRef=new Map(markets.map(m=>[m.objectRef,m.marketId]));
 const pirateObjects=new Set([...g.objects.values()].filter(n=>(n.attributes.cl??n.name)==='PirateActivity').map(n=>g.child(n,'i')));
 const economy=g.child(g.root,'economy',true),list=g.child(economy,'listeners'),objects={},roster=[],unresolved=[];
 const manager=g.child(g.root,'listenerManager'),repository=manager?g.child(manager,'listeners'):null,saved=repository?g.child(repository,'saved'):null;
 // The transient repository is reset by ListenerManager.readResolve, not serialized.
 const managedRoster=saved?[...new Set(r.members(saved).map(n=>r.ref(n)))]:null;
 // Economy.getUpdateListeners lazily creates an empty list only when the serialized field is null.
 for(const node of r.members(list)){
  const objectRef=r.ref(node),classAlias=node.attributes.cl??node.name;roster.push(objectRef);if(Object.hasOwn(objects,objectRef))continue;
  let kind=classAlias==='ShipQuality'?'ship-quality':classAlias==='LocalResourcesSubmarketPlugin'?'local-resources':classAlias==='LuddicPathBaseIntel'?'pather-base':classAlias==='PirateBaseIntel'||pirateObjects.has(node)?'pirate-base':'unsupported';
  const object={objectRef,classAlias,kind,marketId:null,marketRef:null,ended:null,tier:null,large:null,submarketSpecId:null};
  if(kind==='unsupported'){unresolved.push('unsupported-listener:'+classAlias);objects[objectRef]=object;continue;}
  if(kind!=='ship-quality'){
   const market=g.child(node,'m',true);object.marketRef=r.ref(market);object.marketId=marketByRef.get(object.marketRef)??null;
   if(object.marketId===null)unresolved.push('listener-market-not-in-economy');
   if(kind==='local-resources'){
    const sub=g.child(node,'s',true);check(g.child(sub,'m',true)===market&&g.child(sub,'p',true)===node,'Local resources listener owner mismatch');
    check(typeof sub.attributes.s==='string','Missing local resource spec');object.submarketSpecId=sub.attributes.s;
    object.taken=captureNativeResourceCargo(g,r,g.child(node,'taken'));
    object.left=captureNativeResourceCargo(g,r,g.child(node,'left'));
   }else{
    const ended=r.value(node,'ended')??r.attr(node,'ended');object.ended=ended===null?null:bool(ended,'intel ended');
    if(kind==='pather-base')object.large=bool(r.attr(node,'l'),'pather base size');
    else {object.tier=r.attr(node,'t');check(['TIER_1_1MODULE','TIER_2_1MODULE','TIER_3_2MODULE','TIER_4_3MODULE','TIER_5_3MODULE'].includes(object.tier),'Unknown pirate base tier');}
   }
  }
  objects[objectRef]=object;
 }
 let singleton=null,found=false;for(const entry of r.members(g.child(g.child(g.root,'memory'),'d'))){check(entry.name==='e'&&entry.children.length===2,'Invalid sector memory entry');if(g.resolve(entry.children[0]).text!=='$core_shipQualityManager')continue;check(!found,'Duplicate ship quality singleton');found=true;singleton=g.resolve(entry.children[1]);}
 if(singleton?.name==='null')singleton=null;
 const shipQualitySingleton={objectRef:singleton?.attributes.z?r.ref(singleton):null,classAlias:singleton?(singleton.attributes.cl??singleton.name):null};
 if(shipQualitySingleton.classAlias==='ShipQuality'&&!objects[shipQualitySingleton.objectRef])objects[shipQualitySingleton.objectRef]={objectRef:shipQualitySingleton.objectRef,classAlias:'ShipQuality',kind:'ship-quality',marketId:null,marketRef:null,ended:null,tier:null,large:null,submarketSpecId:null};
 return {scope:'native-economy-update-listeners',roster,managedRoster,objects,unresolved,shipQualitySingleton};
}
