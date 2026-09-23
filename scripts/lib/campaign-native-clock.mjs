/** Read-only clock import using the installed trusted classes; never deserializes a native save. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import calendarReference from '../../src/campaign/data/reference-calendar.json' with {type:'json'};
import {OriginalNativeClock,originalJavaZoneOffset} from '../../src/campaign/rules/OriginalNativeClock.mjs';
import {originalCalendarDateFromUnixMilliseconds} from '../../src/campaign/rules/OriginalCalendar.mjs';
const project=fileURLToPath(new URL('../..',import.meta.url)),install=path.resolve(project,'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(ok,message)=>{if(!ok)throw Error('NATIVE_CLOCK_CAPTURE: '+message);};
const run=(file,args)=>new Promise((resolve,reject)=>execFile(file,args,{cwd:project,windowsHide:true,timeout:30000,maxBuffer:8*1024*1024},(error,stdout,stderr)=>error?reject(Object.assign(Error('Native clock adapter failed: '+stderr),{cause:error})):resolve(stdout)));
async function compiler(){
 const candidates=[process.env.CALENDAR_JAVAC,process.env.JAVA_HOME&&path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'javac.exe':'javac'),...(process.platform==='win32'?['C:/Program Files/Java/jdk-17/bin/javac.exe','C:/Program Files/Java/jdk-21/bin/javac.exe']:[])].filter(Boolean);
 for(const candidate of candidates)if(await fs.access(candidate).then(()=>true,()=>false))return candidate;return 'javac';
}
export async function captureNativeClock(saved,{zoneId}={}){
 check(typeof saved.timestamp==='string'&&/^-?\d+$/.test(saved.timestamp)&&Number.isSafeInteger(Number(saved.timestamp)),'Exact saved timestamp required');
 check(Number.isFinite(saved.secondsPerDay)&&saved.secondsPerDay>0&&saved.secondsPerDay===Math.fround(saved.secondsPerDay),'Native float clock rate required');
 check(zoneId===undefined||typeof zoneId==='string'&&/^[A-Za-z0-9_+/:.-]{1,256}$/.test(zoneId),'Invalid explicit Java timezone');
 const evidence={};
 for(const relative of ['decompiled/starfarer_obf/com/fs/starfarer/campaign/CampaignClock.java','starsector-core/starfarer_obf.jar','starsector-core/starfarer.api.jar']){
  const expected=calendarReference.sources.find(row=>row.path===relative);check(expected,'Missing reviewed clock provenance');
  const hash=sha(await fs.readFile(path.join(install,relative)));check(hash===expected.sha256,'Original clock source changed; review it before capture');evidence[relative]=hash;
 }
 for(const relative of ['jre/release','jre/lib/tzdb.dat'])evidence[relative]=sha(await fs.readFile(path.join(install,relative)));
 const source=path.join(project,'scripts/lib/NativeClockCapture.java'),sourceHash=sha(await fs.readFile(source));evidence['web:NativeClockCapture.java']=sourceHash;
 const artifacts=await fs.realpath(path.join(project,'artifacts'));
 check(artifacts.startsWith(path.resolve(project)+path.sep),'Artifacts must remain in the workspace');
 const directory=path.join(artifacts,'native-clock-'+sourceHash.slice(0,16));await fs.mkdir(directory,{recursive:true});
 check(await fs.realpath(directory)===directory,'Native clock cache cannot be redirected');
 const jars=['starfarer_obf.jar','starfarer.api.jar','fs.common_obf.jar'].map(name=>path.join(install,'starsector-core',name)).join(path.delimiter);
 if(!await fs.access(path.join(directory,'NativeClockCapture.class')).then(()=>true,()=>false))await run(await compiler(),['--release','17','-encoding','UTF-8','-cp',jars,'-d',directory,source]);
 const java=path.join(install,'jre/bin',process.platform==='win32'?'java.exe':'java');
 const raw=JSON.parse(await run(java,['--add-opens','java.base/sun.util.calendar=ALL-UNNAMED','--add-opens','java.base/java.util=ALL-UNNAMED','-cp',directory+path.delimiter+jars,'NativeClockCapture',saved.timestamp,String(saved.secondsPerDay),...(zoneId===undefined?[]:[zoneId])]));
 const state={schemaVersion:1,timestamp:Number(saved.timestamp),secondsPerDay:saved.secondsPerDay,zone:raw.zone},clock=new OriginalNativeClock(state);
 check(isDeepStrictEqual(clock.date(),raw.readback.date)&&raw.readback.timestamp===state.timestamp,'Captured native civil date differs');
 for(const row of raw.readbacks){check(originalJavaZoneOffset(raw.zone,row.timestamp)===row.offset,'Captured zone boundary mismatch');check(isDeepStrictEqual(originalCalendarDateFromUnixMilliseconds(row.timestamp,row.offset),row.date),'Native hybrid calendar boundary mismatch');}
 for(const row of raw.steps){const result=clock.advance(Math.fround(row.amount));check(result.timestamp===row.timestamp&&isDeepStrictEqual(result.date,row.date),'Native per-frame clock advancement mismatch');}
 return {scope:'native-campaign-clock-with-java-zone-table',state,readback:raw.readback,source:{runtimeVersion:raw.runtimeVersion,zoneOrigin:raw.zoneOrigin,evidence},verifiedDateReadbacks:raw.readbacks.length,verifiedFrameAdvances:raw.steps.length};
}
