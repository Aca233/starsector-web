// Compare entire captured authoritative frames; report differences, never mask them.
import fs from 'node:fs';import path from 'node:path';import {isDeepStrictEqual} from 'node:util';
import {decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
export function firstDifferences(a,b,limit=12){
 const found=[];
 function walk(a,b,where){
  if(found.length>=limit||Object.is(a,b))return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
   for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
    if(!(key in a)||!(key in b)){found.push({path:where+'.'+key,a:key in a?'present':'absent',b:key in b?'present':'absent'});}
    else walk(a[key],b[key],where+'.'+key);
    if(found.length>=limit)break;
   }
  }else found.push({path:where,a,b});
 }
 walk(a,b,'frame');return found;
}
export function compareSteadyFixtures(before,after){
 const a=JSON.parse(fs.readFileSync(path.join(before,'steady-fixture.json'))),b=JSON.parse(fs.readFileSync(path.join(after,'steady-fixture.json')));
 const inputsEqual=isDeepStrictEqual(a.release.inputs,b.release.inputs)&&isDeepStrictEqual(a.prepared?.inputs,b.prepared?.inputs);
 const effectiveInputsEqual = a.inputTransitions || b.inputTransitions ? isDeepStrictEqual(a.inputTransitions,b.inputTransitions) : null;
 const checkpoints=a.checkpoints.map(row=>{
  const other=b.checkpoints.find(r=>r.tick===row.tick);if(!other)return {tick:row.tick,equal:false,missing:true};
  const equal=row.sha256===other.sha256;
  return {tick:row.tick,equal,beforeBytes:row.bytes,afterBytes:other.bytes,differences:equal?[]:firstDifferences(
   decodeBinaryFrame(fs.readFileSync(path.join(before,'checkpoint-'+row.tick+'.bin'))),
   decodeBinaryFrame(fs.readFileSync(path.join(after,'checkpoint-'+row.tick+'.bin'))))};
 });
 return {inputsEqual,effectiveInputsEqual,checkpoints,equal:inputsEqual&&effectiveInputsEqual!==false&&a.checkpoints.length===b.checkpoints.length&&checkpoints.every(r=>r.equal)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('scripts/compare-steady-multiplayer.mjs')){
 const result=compareSteadyFixtures(...process.argv.slice(2));console.log(JSON.stringify(result,null,2));if(!result.equal)process.exitCode=1;
}
