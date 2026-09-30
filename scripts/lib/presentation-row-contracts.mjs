import assert from 'node:assert/strict';

/** Exact emitted-row bounds: the encoder must neither omit data nor change
 * packet layout/capacity while eliminating per-scalar buffer growth checks. */
export function checkPresentationRows(api) {
  const {CombatPresentationEncoder,BeforeCombatPresentationEncoder,CombatPresentationDecoder,Vector2}=api;
  const encoders=[CombatPresentationEncoder,...(BeforeCombatPresentationEncoder?[BeforeCombatPresentationEncoder]:[])];
  let checks=0,packets=0,exactPackets=0;
  const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
  const ok=value=>{assert.ok(value);checks++;};
  const effective=p=>({...p,buffer:new Uint8Array(p.buffer,0,p.length*8)});
  const envelope=hud=>({kind:'lan-presentation-ui',hud,map:{},deployment:{},presence:[]});
  const reports=[];
  for(const initialBytes of [undefined,0,8191,8192,8200,12288,32768,2048000]) {
    const arms=encoders.map(C=>{
      const wide=Object.fromEntries(Array.from({length:1301},(_,i)=>['field-'+i,i%3?'value-'+i:i]));
      const list=Array.from({length:2053},(_,i)=>i%4?i:'字符串'+i);
      const backing=new ArrayBuffer(8*1023,{maxByteLength:8*65537}),typed=new Float64Array(backing);
      for(let i=0;i<typed.length;i++)typed[i]=i+.125;
      typed[0]=-0;typed[1]=NaN;typed[2]=Infinity;typed[3]=-Infinity;
      const root={wide,list,typed,otherTyped:[new Float32Array([-0,NaN,Infinity]),new Int32Array([-2147483648,2147483647]),new Uint32Array([0,4294967295]),new Int16Array([-32768,32767]),new Uint16Array([0,65535]),new Int8Array([-128,127]),new Uint8Array([0,255]),new Uint8ClampedArray([0,255])],vector:new Vector2(-0,NaN),map:new Map(list.map((v,i)=>[i,v])),set:new Set(list),left:list,right:list,cycle:null};
      root.cycle=root;const reads=[];
      Object.defineProperty(root,'observed',{enumerable:true,get(){reads.push(typed.length);return typed.length;}});
      const recycled=initialBytes===undefined?undefined:new ArrayBuffer(initialBytes);
      if(recycled)new Uint8Array(recycled).fill(0x5a);
      return {encoder:new C(83,'render-strict','ui'),decoder:new CombatPresentationDecoder(83,'render-strict','ui'),root,backing,reads,recycled};
    });
    for(let frame=0;frame<4;frame++) {
      for(const arm of arms){
        if(frame===1){arm.backing.resize(8*65537);arm.root.typed[65536]=-.125;arm.root.list.push('tail');arm.root.wide['field-3']='changed';}
        if(frame===2){arm.backing.resize(8);arm.root.list.length=1;arm.root.map.clear();arm.root.set.clear();delete arm.root.wide['field-7'];arm.root.vector.set(0,Infinity);}
        if(frame===3){arm.backing.resize(8*1025);arm.root.typed[1024]=NaN;arm.root.map.set(arm.root.list,arm.root.typed);arm.root.set.add(arm.root.typed);arm.root.wide['field-7']=undefined;}
        arm.reads.length=0;
        arm.packet=arm.encoder.captureUi(envelope(arm.root),0,arm.recycled);packets++;
        arm.visible=arm.decoder.applyUi(structuredClone(arm.packet)).hud;arm.recycled=arm.packet.buffer;
        equal(arm.reads,[arm.root.typed.length]);equal(arm.visible.observed,arm.root.typed.length);
        equal(arm.visible.left,arm.visible.right);equal(arm.visible.left,arm.visible.list);equal(arm.visible.cycle,arm.visible);
        equal(arm.visible.typed.length,arm.root.typed.length);equal(arm.visible.typed[0],arm.root.typed[0]);
        equal([...arm.visible.otherTyped].map(v=>[Object.getPrototypeOf(v),...v]),arm.root.otherTyped.map(v=>[Object.getPrototypeOf(v),...v]));
        ok(arm.packet.length*8<=arm.packet.buffer.byteLength);ok(arm.packet.buffer.byteLength<=8*8000000);
        if(frame===3){equal(arm.visible.map.get(arm.visible.list),arm.visible.typed);ok(arm.visible.set.has(arm.visible.typed));}
      }
      if(arms.length===2){equal(effective(arms[0].packet),effective(arms[1].packet));equal(arms[0].packet.buffer.byteLength,arms[1].packet.buffer.byteLength);
        // Same recycled input and doubling rule also preserve the unused tail.
        equal(new Uint8Array(arms[0].packet.buffer),new Uint8Array(arms[1].packet.buffer));exactPackets++;}
    }
    // A late field error must poison the epoch, including when reusing a buffer
    // that has already been grown and shrunk through several packet layouts.
    for(const arm of arms){arm.root.invalid=()=>{};assert.throws(()=>arm.encoder.captureUi(envelope(arm.root),0,arm.recycled),/Unsupported presentation value/);checks++;
      delete arm.root.invalid;assert.throws(()=>arm.encoder.captureUi(envelope(arm.root),0,arm.recycled),/new epoch/);checks++;}
    reports.push({scenario:'presentation-row-buffer-boundaries',initialBytes:initialBytes??'default',frames:4,largestTypedRow:65537,sameTick:0,allTypedConstructors:true,exactBaseline:arms.length===2});
  }
  reports.push({scenario:'presentation-row-summary',checks,packets,exactPackets,capacityAndRecycledTailCompared:true});
  return {checks,reports};
}
