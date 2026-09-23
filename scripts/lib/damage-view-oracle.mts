import {PackedSnapshotNumbers} from '../../src/network/PackedSnapshotNumbers.mjs';
/** Test oracle independent of the candidate capture/restore implementations. */
const FULL_MARK_KEYS = ['cellIndex','localPos','opacity','intensity','heat','justHit','flash','flashElapsed','phase','pulsePeriod','size','rotationRad','kind','variant'];
export const DAMAGE_INTERNAL_FIELDS = ['heat','justHit','flash','flashElapsed','phase','pulsePeriod'];
export function normalizedProjection(frame: any, renderMarks = false): any {
 const layouts = frame.layouts;
 const record = (id: number, values: any[]): any => {
  const keys = layouts[id];
  if (!keys || values.length !== keys.length) throw Error('Oracle invalid layout');
  return Object.fromEntries(keys.map((key: string,i: number) => [key,visit(values[i])]));
 };
 const visit = (value: any): any => {
  if (!value || typeof value !== 'object') return value;
  if (value instanceof PackedSnapshotNumbers) return value.toJSON();
  if (Array.isArray(value)) return value.map(visit);
  if (Object.hasOwn(value,'$record')) return record(value.$record,value.values);
  if (Object.hasOwn(value,'$records')) return value.values.map((row:any[]) => record(value.$records,row));
  if (Object.hasOwn(value,'$projectileColumns')) {
   return value.values.map((row:any) => {
    if (!Array.isArray(row)) return visit(row);
    const template=value.$projectileColumns[row[0]],keys=layouts[template[0]],fixed=new Map(template[1].map((index:number,i:number)=>[index,template[2][i]]));
    let dynamic=1;
    return Object.fromEntries(keys.map((key:string,i:number)=>[key,visit(fixed.has(i)?fixed.get(i):row[dynamic++])]));
   });
  }
  return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,visit(v)]));
 };
 const normalized=Object.fromEntries(Object.entries(frame).filter(([key])=>key!=='layouts').map(([key,value])=>[key,visit(value)]));
 if(renderMarks)for(const row of [...normalized.ships,...normalized.crafts]){
  const marks=row.state?.damageDecals?.marks;
  if(!Array.isArray(marks))continue;
  for(const mark of marks){
   if(!mark || typeof mark!=='object')continue;
   const keys=Object.keys(mark);
   if(keys.length===FULL_MARK_KEYS.length&&keys.every((key,i)=>key===FULL_MARK_KEYS[i]))
    for(const key of DAMAGE_INTERNAL_FIELDS)delete mark[key];
  }
 }
 return normalized;
}
export function renderMark(mark:any) {
 return Object.fromEntries(['cellIndex','localPos','opacity','intensity','size','rotationRad','kind','variant'].map(key=>[key,mark[key]]));
}
