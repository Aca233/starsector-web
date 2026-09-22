import {projectileColumnPlan} from './ProjectileColumns';
import type {CombatSnapshot} from './CombatSnapshot';
/** Flatten frame-local layout/column envelopes, not semantic values. Vector,
 * undefined, ship refs and all other projection tags stay declarative. This is
 * a bounded bridge into entity revisions; no engine or renderer is mutated. */
export function expandSnapshotProjectiles(frame: Pick<CombatSnapshot,'world'|'layouts'>): Record<string, any>[] {
 const layouts=frame.layouts??[];
 if(!Array.isArray(layouts)||layouts.length>1024)throw Error('Invalid projectile layouts');
 const denied=new Set(['__proto__','prototype','constructor']);
 for(const keys of layouts)if(!Array.isArray(keys)||keys.length>2048||new Set(keys).size!==keys.length||keys.some(k=>typeof k!=='string'||k.length>256||denied.has(k)))throw Error('Invalid projectile layout');
 let nodes=0;
 const expand=(value:any,depth=0):any=>{
  if(++nodes>262144||depth>32)throw Error('Projectile expansion budget');
  if(value===null||typeof value!=='object')return value;
  if(Array.isArray(value)){if(value.length>262144)throw Error('Projectile array budget');return value.map(v=>expand(v,depth+1));}
  const record=(index:number,values:any[])=>{
   const keys=Number.isInteger(index)&&index>=0?layouts[index]:undefined;
   if(!keys||!Array.isArray(values)||keys.length!==values.length)throw Error('Invalid projectile record');
   return Object.fromEntries(keys.map((key,i)=>[key,expand(values[i],depth+1)]));
  };
  if(Object.hasOwn(value,'$record')){if(Object.keys(value).length!==2)throw Error('Invalid projectile envelope');return record(value.$record,value.values);}
  if(Object.hasOwn(value,'$records')){if(Object.keys(value).length!==2||!Array.isArray(value.values)||value.values.length>4096)throw Error('Invalid projectile records');return value.values.map((v:any)=>record(value.$records,v));}
  const out:Record<string,any>={};
  for(const key of Object.keys(value)){if(denied.has(key))throw Error('Invalid projectile key');out[key]=expand(value[key],depth+1);}return out;
 };
 const raw=frame.world?.projectiles;
 let rows;
 if(raw&&Object.hasOwn(raw,'$projectileColumns')){
  const plan=projectileColumnPlan(raw,layouts);
  rows=plan.rows.map(row=>{
   if(!Array.isArray(row))return expand(row);
   const t=plan.templates[row[0]],record:Record<string,any>={};
   for(let col=0;col<t.keys.length;col++)record[t.keys[col]]=expand(t.dynamic[col]?row[t.dynamic[col]]:t.fixed[col],1);
   return record;
  });
 }else rows=expand(raw);
 if(!Array.isArray(rows)||rows.length>4096||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('Invalid projectile rows');
 return rows;
}
