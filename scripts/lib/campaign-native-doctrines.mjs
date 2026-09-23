import {DOCTRINE_INTS,DOCTRINE_FLOATS,DOCTRINE_LISTS} from '../../src/campaign/rules/OriginalFactionDoctrine.mjs';
const check=(v,m)=>{if(!v)throw Error('NATIVE_DOCTRINE_CAPTURE: '+m);};
export function captureNativeFactionDoctrines(g,r){
 const entries=[],unresolved=[],registry=g.child(g.child(g.root,'factionManager'),'factions');if(!registry)unresolved.push('missing-faction-registry');
 for(const entry of r.members(registry)){check(entry.name==='e'&&entry.children.length===2,'Invalid faction registry');const n=g.resolve(entry.children[1]),factionId=g.resolve(entry.children[0]).text;check(r.value(n,'id')===factionId,'Faction registry key mismatch');const d=g.child(n,'doctrine');let doctrine=null;
  if(d){doctrine={objectRef:r.ref(d)};for(const k of [...DOCTRINE_INTS,...DOCTRINE_FLOATS]){const raw=r.attr(d,k)??r.value(d,k),v=raw===null?0:Number(raw);check(Number.isFinite(v)&&(!DOCTRINE_INTS.includes(k)||Number.isInteger(v)&&v>=-2147483648&&v<=2147483647),'Invalid saved doctrine number');doctrine[k]=DOCTRINE_INTS.includes(k)?v:Math.fround(v);}const strict=r.value(d,'strictComposition')??r.attr(d,'strictComposition');check(strict===null||strict==='true'||strict==='false','Invalid doctrine composition');doctrine.strictComposition=strict==='true';for(const k of DOCTRINE_LISTS)doctrine[k]=r.members(g.child(d,k)).map(v=>{check((v.attributes.cl??v.name)==='st','Invalid doctrine skill');return v.text;});}
  entries.push({objectRef:r.ref(n),factionId,doctrine});
 }
 return {scope:'native-faction-doctrine-inputs',entries,unresolved};
}
