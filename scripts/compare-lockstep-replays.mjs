import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
const base=path.resolve('artifacts/lockstep-20260920');
const labels=['node-a','node-b','browser-a','browser-b',...(fs.existsSync(path.join(base,'arm/results.json'))?['arm']:[])];
const reports=Object.fromEntries(labels.map(name=>[name,JSON.parse(fs.readFileSync(path.join(base,name,'results.json'),'utf8'))]));
const load=(name,tick)=>decodeBinaryFrame(fs.readFileSync(path.join(base,name,tick+'.bin')));
function differences(a,b,field='$',out=[]){
 if(Object.is(a,b))return out;
 if(a&&b&&typeof a==='object'&&typeof b==='object')for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
  differences(a[key],b[key],field+'.'+key,out);if(out.length>=12)break;
 }else out.push({field,a,b,...(typeof a==='number'&&typeof b==='number'?{delta:b-a}:{})});
 return out;
}
const comparisons=[];
for(const [a,b] of [['node-a','node-b'],['browser-a','browser-b'],['node-a','browser-a'],...(reports.arm?[['node-a','arm'],['browser-a','arm']]:[])]){
 const x=reports[a],y=reports[b];assert.equal(x.seed,y.seed);assert.equal(x.ships,y.ships);assert.equal(x.ticks,y.ticks);assert.deepEqual(x.checkpoints.map(c=>c.tick),y.checkpoints.map(c=>c.tick));
 const unequal=x.checkpoints.filter((c,i)=>c.sha256!==y.checkpoints[i].sha256).map(c=>c.tick);
 const sample=unequal.length?[0,60,300,600,1200].find(t=>t>=unequal[0]):null;
 const p=load(a,x.ticks),q=load(b,y.ticks);
 comparisons.push({a,b,versionA:x.node??x.browser,versionB:y.node??y.browser,firstDifferentCheckpoint:unequal[0]??null,differingCheckpoints:unequal.length,
  finalCombatRngEqual:JSON.stringify(p.combatRng)===JSON.stringify(q.combatRng),finalVisualRngEqual:JSON.stringify(p.visualRng)===JSON.stringify(q.visualRng),
  diagnosticSampleTick:sample,examples:sample!=null?differences(load(a,sample),load(b,sample)):[]});
}
const result={passed:comparisons.every(c=>c.differingCheckpoints===0),scope:'32 ships, 1200 fixed logical steps, same input tape; 21 presentation+RNG checks. NOT exhaustive internal state or general determinism proof. First differing checkpoint is sampled, not necessarily first divergent tick.',comparisons};
fs.writeFileSync(path.join(base,'comparison.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,comparisons:comparisons.map(({examples,...rest})=>({...rest,firstExample:examples[0]??null}))},null,2));
if(!result.passed)process.exitCode=1;
