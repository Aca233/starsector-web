import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {nativeRecordPacker} from './lib/native-record-packers-experiment.generated';
import {captureCombat as oldCapture} from 'receiver-fields-control';
import {captureCombat as newCapture,applyCombatSnapshots} from 'receiver-fields-candidate';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {assets,world} from './lib/native-projectile-fixture.mts';
const shapes=JSON.parse(fs.readFileSync('scripts/lib/native-pack-shapes.json','utf8'));
function reference(fields:any[],shape:any,visit:(v:any,p:number)=>any) {
 let written=0,filtered:string[]|null=null;
 for(let i=0;i<shape.keys.length;i++){
  const field=fields[shape.indices[i]];
  if(typeof field==='function'){filtered??=shape.keys.slice(0,i);continue;}
  if(filtered)filtered.push(shape.keys[i]);
  fields[written++]=field===null||typeof field==='string'||typeof field==='boolean'||(typeof field==='number'&&Number.isFinite(field))?field:visit(field,shape.children[i]);
 }
 fields.length=written;return filtered;
}
for(const [index,shape] of shapes.entries())test('native packer '+index+' exact values, recursion order, projection, filters and throw prefix',()=>{
 const signature=(raw=shape.raw,p=shape.projection)=>p+':'+JSON.stringify(raw);
 const pack=nativeRecordPacker(signature())!;assert.equal(typeof pack,'function');
 const atoms=[null,undefined,NaN,Infinity,-Infinity,-0,true,'s',{x:1},()=>0,Object.assign(new Array(3),{0:1,2:3}),new Float32Array([1])];
 for(let shift=0;shift<atoms.length;shift++){
  const original=shape.raw.map((_:any,i:number)=>atoms[(i+shift)%atoms.length]),a=original.slice(),b=original.slice(),aa:any[]=[],bb:any[]=[];
  const visit=(log:any[])=>(v:any,p:number)=>{log.push([v,p]);return {v,p};};
  const left=reference(a,shape,visit(aa)),right=pack(b,visit(bb));assert.deepEqual(right,left);assert.deepEqual(b,a);assert.deepEqual(bb,aa);assert.deepEqual(original,shape.raw.map((_:any,i:number)=>atoms[(i+shift)%atoms.length]));
 }
 const a=shape.raw.map(()=>({})),b=a.slice(),error=new Error('visit sentinel');let ac=0,bc=0;
 const perform=(fn:any,fields:any[],count:()=>number)=>{try{return {keys:fn(fields,(v:any,p:number)=>{if(count()===2)throw error;return {v,p};})};}catch(e){assert.equal(e,error);return {error};}};
 assert.deepEqual(perform((f:any,v:any)=>reference(f,shape,v),a,()=>++ac),perform(pack,b,()=>++bc));assert.deepEqual(a,b);assert.equal(ac,bc);
 assert.equal(nativeRecordPacker(signature([...shape.raw,'__unknown'])),undefined);assert.equal(nativeRecordPacker(signature(shape.raw,999)),undefined);
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
