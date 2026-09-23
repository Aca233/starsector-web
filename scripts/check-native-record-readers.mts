import assert from 'node:assert/strict';import fs from 'node:fs';import {test} from 'node:test';
import {nativeRecordReader} from './lib/native-record-readers-experiment.generated';
import {captureCombat as oldCapture} from 'receiver-fields-control';import {captureCombat as newCapture,applyCombatSnapshots} from 'receiver-fields-candidate';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';import {assets,world} from './lib/native-projectile-fixture.mts';
const shapes: string[][]=JSON.parse(fs.readFileSync('scripts/lib/native-capture-shapes.json','utf8'));
for(const [i,keys]of shapes.entries())test('fixed native reader '+i+' reads exactly, freshly, in order and falls back on any shape drift',()=>{
 const fn=nativeRecordReader(keys)!;assert.equal(typeof fn,'function');const leaf={x:1};const cases=[null,undefined,NaN,Infinity,-Infinity,-0,true,'s',leaf,()=>0];
 const obj=Object.fromEntries(keys.map((key,j)=>[key,cases[j%cases.length]]));const before=fn(obj);assert.deepEqual(before,Object.values(obj));for(const k of keys)obj[k]=k;assert.deepEqual(fn(obj),Object.values(obj));assert.deepEqual(before,keys.map((_k,j)=>cases[j%cases.length]));
 assert.equal(nativeRecordReader([...keys,'__unknown']),undefined);assert.equal(nativeRecordReader(keys.toReversed()),undefined);const other=keys.slice();other[other.length-1]='__unknown';assert.equal(nativeRecordReader(other),undefined);
 const log:string[]=[],input={};for(const key of keys)Object.defineProperty(input,key,{enumerable:true,get(){log.push(key);return key;}});assert.deepEqual(fn(input),keys);assert.deepEqual(log,keys);
 const error=new Error('getter sentinel'),throws={},visited:string[]=[];for(const [j,key]of keys.entries())Object.defineProperty(throws,key,{enumerable:true,get(){visited.push(key);if(j===1)throw error;return j;}});assert.throws(()=>fn(throws),e=>e===error);assert.deepEqual(visited,keys.slice(0,2));
});
test('22-ship whole native battle capture is byte identical, immutable, restores complete state and stays generic for external callers',async()=>{
 await assets();const source=world(),viewerOld=world(),viewerNew=world();for(const s of source.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);s.fireControlMode='AI';}
 const take=(e:any,t:number,fn=oldCapture,native=true)=>fn(e,t,{0:t,1:t},0,true,true,true,native,true);const bytes=(f:any)=>encodeProjectedBinaryFrame(f,true)!;
 let retained:any,retainedBytes:any;let peak=0;for(let tick=0;tick<=1200;tick++){if(tick)source.fixedUpdate(1/60);peak=Math.max(peak,source.projectiles.length);if(tick%30)continue;
  const a=take(source,tick),b=take(source,tick,newCapture);assert.deepEqual(b,a,'entire projection tick '+tick);assert.deepEqual(bytes(b),bytes(a));if(tick===300){retained=b;retainedBytes=bytes(b).slice();}
  applyCombatSnapshots(viewerOld,[decodeBinaryFrame(bytes(a))],tick===0,undefined,{nativeTargeting:true,nativeProjection:true});applyCombatSnapshots(viewerNew,[decodeBinaryFrame(bytes(b))],tick===0,undefined,{nativeTargeting:true,nativeProjection:true});assert.deepEqual(bytes(take(viewerOld,tick)),bytes(take(viewerNew,tick)));
 }assert.ok(peak>30);assert.deepEqual(bytes(retained),retainedBytes,'prior frames never alias cached live values');
 const ship=source.allCapitalShips[0] as any;const probe:any={sources:{},cached:1,dirty:false};ship.__fixedCaptureProbe=probe;
 const same=()=>assert.deepEqual(take(source,1201,newCapture),take(source,1201));same();probe.cached=()=>1;same();probe.cached=NaN;same();probe.extra={position:{x:1,y:2},values:Object.assign(new Array(3),{0:1,2:3}),cycle:probe};same();delete probe.sources;same();probe.sources={x:42};same();delete ship.__fixedCaptureProbe;
 assert.deepEqual(take(source,1202,newCapture,false),take(source,1202,oldCapture,false));
});
