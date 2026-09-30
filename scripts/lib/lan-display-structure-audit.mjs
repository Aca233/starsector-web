import {createHash} from 'node:crypto';

const opaqueEnvelope = value =>
 ['$displayDefinition','$component','$dynamicParticles','$explosionPuffs','$projectileColumns'].some(key=>Object.hasOwn(value,key))
 || ['$undefined','$ship','$vector','$number','$typed','$map','$set'].some(key=>!!value[key]);

/** Diagnostic-only unpacking of record wrappers. Keep all other protocol tags;
 * this is not a receiver, validator, or authority for accepting wire messages. */
export function expandAuditRecords(value, layouts, depth=0) {
 if(depth>128)throw Error('Audit nesting budget');
 if(value===null||typeof value!=='object')return value;
 if(Array.isArray(value))return value.map(v=>expandAuditRecords(v,layouts,depth+1));
 if(Object.hasOwn(value,'$record')||Object.hasOwn(value,'$records')) {
  const batch=Object.hasOwn(value,'$records'),index=batch?value.$records:value.$record;
  const keys=Number.isSafeInteger(index)&&index>=0?layouts[index]:undefined;
  if(!Array.isArray(keys)||!Array.isArray(value.values))throw Error('Invalid audit record');
  const row=values=>{
   if(!Array.isArray(values)||values.length!==keys.length)throw Error('Invalid audit row');
   return Object.fromEntries(keys.map((key,i)=>[key,expandAuditRecords(values[i],layouts,depth+1)]));
  };
  return batch?value.values.map(row):row(value.values);
 }
 // Preserve packed blocks, vectors and other atomic markers. Their internal
 // bookkeeping is not a target object's restored data-field count.
 if(opaqueEnvelope(value))return value;
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,expandAuditRecords(v,layouts,depth+1)]));
}

/** Count data-field guards in ordinary/record objects, not protocol tag keys.
 * Arrays perform element writes without assertDataField. Special envelopes
 * are opaque: their specialized work is not silently counted as zero CPU. */
export function restoreStructure(value) {
 const result={fields:0,arrayElements:0,objects:0,arrays:0,scalars:0,envelopes:0};
 const visit=(v,depth)=>{
  if(depth>128)throw Error('Audit nesting budget');
  if(v===null||typeof v!=='object'){result.scalars++;return;}
  if(Array.isArray(v)){result.arrays++;result.arrayElements+=v.length;for(const item of v)visit(item,depth+1);return;}
  const keys=Object.keys(v);
  if(opaqueEnvelope(v)){result.envelopes++;return;}
  result.objects++;result.fields+=keys.length;
  for(const key of keys)visit(v[key],depth+1);
 };
 visit(value,0);return result;
}

/** Order-sensitive data signature: preserve distinctions JSON alone loses.
 * Read descriptors, never invoke a getter or toJSON during an audit. */
export function definitionSignature(value) {
 let units=0,fields=0;const active=new Set();
 const visit=(v,depth)=>{
  if(depth>32||++units>200000)throw Error('Audit definition budget');
  if(v===undefined)return ['undefined'];
  if(v===null)return ['null'];
  if(typeof v==='number')return ['number',Object.is(v,-0)?'-0':String(v)];
  if(typeof v==='string'||typeof v==='boolean')return [typeof v,v];
  if(typeof v!=='object'||active.has(v))throw Error('Non-data audit definition');
  const array=Array.isArray(v),prototype=Object.getPrototypeOf(v);
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw Error('Non-plain audit definition');
  active.add(v);const pairs=[];
  for(const key of Object.keys(v)){
   const descriptor=Object.getOwnPropertyDescriptor(v,key);
   if(!descriptor||!('value' in descriptor))throw Error('Audit accessor');
   fields++;pairs.push([key,visit(descriptor.value,depth+1)]);
  }
  active.delete(v);return [array?'array':'object',array?v.length:null,pairs];
 };
 const text=JSON.stringify(visit(value,0));
 return {hash:createHash('sha256').update(text).digest('hex'),units,fields,signatureBytes:Buffer.byteLength(text)};
}

export function summarizeDefinitions(entries,previous=new Map(),previousRoots=new Map()) {
 const unique=new Map(),roots=new Set();let units=0,fields=0,changed=0,comparable=0,retainedRoots=0,replacedRoots=0;
 for(const {binding,value} of entries){
  const signature=definitionSignature(value);units+=signature.units;fields+=signature.fields;roots.add(value);
  const prior=previous.get(binding);if(prior!==undefined){comparable++;if(prior!==signature.hash)changed++;}
  if(previousRoots.has(binding)){if(previousRoots.get(binding)===value)retainedRoots++;else replacedRoots++;}
  previousRoots.set(binding,value);previous.set(binding,signature.hash);
  const row=unique.get(signature.hash);
  if(row)row.occurrences++;
  else unique.set(signature.hash,{...signature,occurrences:1,example:binding});
 }
 const definitions=[...unique.values()].sort((a,b)=>b.occurrences-a.occurrences||a.hash.localeCompare(b.hash));
 const uniqueUnits=definitions.reduce((sum,row)=>sum+row.units,0);
 return {occurrences:entries.length,distinctRoots:roots.size,uniqueContents:unique.size,units,fields,uniqueUnits,
  repeatedUnits:units-uniqueUnits,comparableBindings:comparable,changedBindings:changed,retainedRoots,replacedRoots,definitions};
}
