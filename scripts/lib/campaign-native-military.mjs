/** Capture patrol/military/disruption roots plus their forward/reverse dependency closure. */
import {validateOriginalMemoryFlags} from '../../src/campaign/rules/OriginalMemoryFlags.mjs';
const check=(v,m)=>{if(!v)throw Error('NATIVE_MILITARY_CAPTURE: '+m);};
export function captureNativeMilitaryMemory(g,r,market){
 const node=g.child(market,'memory'),roots=['$patrol','$military','$core_disrupted_MilitaryBase'],needed=new Set([...roots,...roots.slice(0,2).flatMap(k=>['patrolhq','militarybase','highcommand'].map(id=>k+'_ind_'+id))]);
 const entries=n=>r.members(n).map(e=>{check(e.name==='e'&&e.children.length===2,'Invalid memory map');const key=g.resolve(e.children[0]);check((key.attributes.cl??key.name)==='st','Invalid memory string key');return [key.text,g.resolve(e.children[1])];});
 const rawData=entries(g.child(node,'d')),requirements=entries(g.child(node,'r')).map(([key,v])=>({objectRef:r.ref(v),key:r.attr(v,'k'),mapKey:key,requiredKeys:r.members(g.child(v,'r')).map(s=>{check((s.attributes.cl??s.name)==='st','Invalid required-memory key');return s.text;})})),requiredFor=entries(g.child(node,'rF')).map(([key,v])=>{check((v.attributes.cl??v.name)==='st','Invalid reverse memory dependency');return {key,parentKey:v.text};});
 for(const e of requirements)check(e.mapKey===e.key,'Required-memory identity mismatch');
 let changed=true;while(changed){changed=false;const add=k=>{if(!needed.has(k)){needed.add(k);changed=true;}};for(const e of requirements)if(needed.has(e.key))for(const k of e.requiredKeys)add(k);for(const e of requiredFor)if(needed.has(e.key))add(e.parentKey);}
 const unresolved=[],data=rawData.filter(([key])=>needed.has(key)).map(([key,v])=>{const type=v.attributes.cl??v.name,text=v.text;if(!['st','bp','ip','lp','fp','dp'].includes(type)||v.children.length||type==='st'&&/^(enRef_|mRef_)/.test(text))unresolved.push('nonprimitive-or-unresolved-flag-value');return {key,value:{type,text}};});
 const expires=r.members(g.child(node,'e')).filter(e=>needed.has(r.attr(e,'k'))).map(e=>{const t=r.attr(e,'t');check(t!==null&&t!==''&&Number.isFinite(Number(t)),'Invalid memory expiry');return {objectRef:r.ref(e),key:r.attr(e,'k'),timeLeft:Math.fround(Number(t))};});
 const memory={scope:'native-memory-flag-closure',objectRef:node?r.ref(node):'created-market-memory:'+r.ref(market),roots,keys:[...needed],data,requirements:requirements.filter(e=>needed.has(e.key)).map(({mapKey:_mapKey,...e})=>e),requiredFor:requiredFor.filter(e=>needed.has(e.key)),expires,nextObjectId:0,unresolved};
 if(unresolved.length===0)validateOriginalMemoryFlags(memory);return memory;
}
