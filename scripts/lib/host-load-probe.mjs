// Test-only aggregate machine load. No process names/arguments or user data.
import os from 'node:os';
export function hostLoadProbe() {
 const total=()=>os.cpus().reduce((a,c)=>{for(const [k,n] of Object.entries(c.times)){a.total+=n;if(k==='idle')a.idle+=n;}return a;},{total:0,idle:0});
 let previous=total();const rows=[];
 const sample=()=>{const now=total(),elapsed=now.total-previous.total;rows.push({at:Date.now(),busyPercent:elapsed?100*(1-(now.idle-previous.idle)/elapsed):null,freeMemory:os.freemem(),nodeHeapUsed:process.memoryUsage().heapUsed});previous=now;};
 const timer=setInterval(sample,1000);timer.unref();
 return {stop(){clearInterval(timer);sample();return{logicalCpus:os.cpus().length,scope:'Whole-machine CPU interval, not authority Worker CPU utilization or proof of causation',rows};}};
}
