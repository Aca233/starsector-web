import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {decodeBinaryState,decodeBinaryStateForRelay} from '../src/network/BinarySnapshot.mjs';
import {summarizeCombatFrame} from '../src/network/CombatFrameSummary.mjs';
const source=resolve(process.argv[2]??'artifacts/network-stream-20260921/phase13/particle-paired/recipe');
const out=resolve(process.argv[3]??'artifacts/network-stream-20260921/phase15');mkdirSync(out,{recursive:true});
const files=readdirSync(source).filter(f=>/^\d+\.bin$/.test(f)).sort((a,b)=>parseInt(a)-parseInt(b));
const frames=files.map(f=>readFileSync(resolve(source,f)));
const ships=decodeBinaryState(frames[0]).frame.ships.length;
const hash=()=>createHash('sha256').update(Buffer.concat(frames)).digest('hex'),before=hash();
const run=(decoder,bytes)=>{const s=decoder(bytes);return summarizeCombatFrame(s.frame,ships,-1);};
for(const bytes of frames)assert.deepEqual(run(decodeBinaryStateForRelay,bytes),run(decodeBinaryState,bytes));
for(let warm=0;warm<3;warm++)for(const bytes of frames){run(decodeBinaryState,bytes);run(decodeBinaryStateForRelay,bytes);}
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {samples:values.length,totalMs:values.reduce((a,b)=>a+b,0),p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)]};};
const series={full:[],relay:[]},rounds=[];
for(let round=0;round<3;round++)for(const name of ['full','relay','relay','full']){
  const times=[],decoder=name==='full'?decodeBinaryState:decodeBinaryStateForRelay;
  for(const bytes of frames){const t=performance.now();run(decoder,bytes);times.push(performance.now()-t);}
  series[name].push(...times);rounds.push({round,name,...stats(times)});
}
assert.equal(hash(),before);
const full=stats(series.full),relay=stats(series.relay);
const sources=Object.fromEntries(['src/network/BinarySnapshot.mjs','src/network/CombatFrameSummary.mjs','server/lan-server.mjs','server/steam/gateway.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const report={sources,scope:'Sequential warmed ABBA codec+same semantic validation only. Not gameplay FPS/Hz, native Steam, n2n or network latency. No bandwidth savings.',
  at:new Date().toISOString(),node:process.version,source,frames:frames.length,ships,totalBytes:frames.reduce((n,b)=>n+b.length,0),inputSha256:before,
  exactSummaries:true,inputUnchanged:true,full,relay,reductionPercent:{total:100*(1-relay.totalMs/full.totalMs),p50:100*(1-relay.p50Ms/full.p50Ms),p95:100*(1-relay.p95Ms/full.p95Ms)},rounds};
writeFileSync(resolve(out,'relay-projection-benchmark.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
