import fs from 'node:fs';import path from 'node:path';
const root=process.argv[2]??'artifacts/network-stream-20260921/phase22';
const summaries=[];
for(const name of fs.readdirSync(root)){
 const probeFile=name.startsWith('probe-')?path.join(root,name,'hz-probes.json'):name.startsWith('authority-')&&name.endsWith('.json')?path.join(root,name):null;if(!probeFile||!fs.existsSync(probeFile))continue;
 const r=JSON.parse(fs.readFileSync(probeFile));if(!Array.isArray(r.probes??r.rows))continue;const rows=(r.probes??r.rows).filter(s=>s.at>=r.started&&s.end<=(r.measuredUntil??r.end));if(!rows.length)continue;
 const ms=rows.reduce((n,s)=>n+s.end-s.at,0),sum=(key,bag='counts')=>rows.reduce((n,s)=>n+(s[bag][key]??0),0),keys=[...new Set(rows.flatMap(s=>Object.keys(s.counts)))];
 const counts=Object.fromEntries(keys.map(k=>[k,{n:sum(k),rate:sum(k)*1000/ms,meanMs:sum(k)?sum(k,'ms')/sum(k):0,msPerSecond:sum(k,'ms')*1000/ms,maxMs:Math.max(...rows.map(s=>s.max[k]??0))}]));
 const hist={};for(const s of rows)for(const[k,h]of Object.entries(s.hist))for(const[x,n]of Object.entries(h)){hist[k]??={};hist[k][x]=(hist[k][x]??0)+n;}
 const resultPath=path.join(root,name,'result.json');
 const result=fs.existsSync(resultPath)?JSON.parse(fs.readFileSync(resultPath)):null;
 const accepted=result ? !result.error && !result.errors?.length && !result.failures?.length && result.cleanupCompleted===true : null;
 const summary={name,accepted,error:result?.error??null,windowCount:rows.length,seconds:ms/1000,counts,hist};
 if(r.relayAfter){const seconds=(r.measuredUntil-r.started)/1000;summary.relay=r.relayAfter.map((after,i)=>{const before=r.relayBefore[i];return{seat:after.seat,receivedHz:(after.flow.received-before.flow.received)/seconds,sentHz:(after.flow.sent-before.flow.sent)/seconds,skipCreditHz:(after.flow.skippedCredit-before.flow.skippedCredit)/seconds,skipSocketHz:(after.flow.skippedSocket-before.flow.skippedSocket)/seconds,ackCounterReset:after.credits.acked<before.credits.acked,consumedHz:after.credits.acked<before.credits.acked?null:(after.credits.acked-before.credits.acked)/seconds};});}
 summaries.push(summary);
 console.log(JSON.stringify({name,accepted,seconds:+summary.seconds.toFixed(2),physicsHz:+(counts.physics?.rate??0).toFixed(2),networkHz:+(counts.networkPublications?.rate??0).toFixed(2),displayHz:+(counts.displayPublications?.rate??0).toFixed(2),captureHz:+(counts.capture?.rate??0).toFixed(2),physicsMsPerSecond:+(counts.physics?.msPerSecond??0).toFixed(1),captureMsPerSecond:+(counts.capture?.msPerSecond??0).toFixed(1),encodeMsPerSecond:+(counts.encode?.msPerSecond??0).toFixed(1),ioReturnMs:+(counts.ioReturn?.meanMs??0).toFixed(2),relay:summary.relay}));
}
fs.writeFileSync(path.join(root,'instrumented-summary.json'),JSON.stringify(summaries,null,2));
