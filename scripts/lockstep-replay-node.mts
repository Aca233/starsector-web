import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const assets=await fs.realpath(process.env.LOCKSTEP_ASSETS??'public');
globalThis.fetch=async(input:any)=>{const file=await fs.realpath(path.resolve(assets,String(input).replace(/^\.?\//,'')));if(!file.startsWith(assets+path.sep))throw Error('Outside assets');return new Response(await fs.readFile(file));};
const out=path.resolve(process.env.LOCKSTEP_OUT??'artifacts/lockstep-20260920/node-replay');await fs.mkdir(out,{recursive:true});
const {replay}=await import('./lockstep-replay-fixture.mts');
const checkpoints:any[]=[];
const result=await replay({batch:Number(process.env.LOCKSTEP_BATCH??1),delay:Number(process.env.LOCKSTEP_DELAY??0)},async(tick,bytes,summary)=>{
 checkpoints.push({tick,sha256:createHash('sha256').update(bytes).digest('hex'),...summary});
 if([0,60,300,600,1200].includes(tick))await fs.writeFile(path.join(out,tick+'.bin'),bytes);
});
const report={...result,node:process.version,arch:process.arch,checkpoints};await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,ticks:result.ticks,checkpoints:checkpoints.length,last:checkpoints.at(-1)},null,2));
