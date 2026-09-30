import assert from 'node:assert/strict';
import {createPresentationPacketOracle} from './presentation-packet-oracle.mjs';
import {checkPresentationDecoderIndex} from './render-projection-contracts.mjs';

export function checkPresentationObjectPatches(api) {
  const {LocalCombatKernel,CombatPresentationEncoder:Encoder,CombatPresentationDecoder:Decoder,
    BeforeCombatPresentationEncoder:ReferenceEncoder,BeforeCombatPresentationDecoder:ReferenceDecoder} = api;
  const BeforeEncoder=ReferenceEncoder??Encoder,BeforeDecoder=ReferenceDecoder??Decoder;
  // The existing full-row decoder scene remains applicable to the new decoder.
  const existing = checkPresentationDecoderIndex({...api,CombatPresentationEncoder:BeforeEncoder,BeforeCombatPresentationDecoder:undefined});
  let checks=existing.checks,packets=0,rejected=0,patchRows=0;
  const same=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
  const graphEqual=(left,right)=>{
    const forward=new Map(),reverse=new Map(),pending=[[left,right]];
    for(let at=0;at<pending.length;at++){
      const [a,b]=pending[at];
      if(!a||!b||typeof a!=='object'||typeof b!=='object'){assert(Object.is(a,b));checks++;continue;}
      if(forward.has(a)){assert.equal(forward.get(a),b);checks++;continue;}
      assert(!reverse.has(b));forward.set(a,b);reverse.set(b,a);same(Object.getPrototypeOf(a),Object.getPrototypeOf(b),'prototype');
      if(ArrayBuffer.isView(a)){same(a.length,b.length,'typed size');for(let i=0;i<a.length;i++)pending.push([a[i],b[i]]);}
      else if(a instanceof Map||a instanceof Set){same(a.size,b.size,'collection size');const other=b.entries();for(const [key,v]of a.entries()){const pair=other.next().value;pending.push([key,pair[0]],[v,pair[1]]);}}
      else {same(Object.keys(a),Object.keys(b),'keys/order');for(const key of Object.keys(a))pending.push([a[key],b[key]]);}
    }
  };
  const k=new LocalCombatKernel({playerHull:'wolf',enemyHull:'lasher',seed:8674,multicore:false});
  try {
    const oldE=new BeforeEncoder(893),newE=new Encoder(893),oldD=new BeforeDecoder(893),newD=new Decoder(893);
    const oldOracle=createPresentationPacketOracle(),newOracle=createPresentationPacketOracle();
    const storage=new ArrayBuffer(16,{maxByteLength:64}),typed=new Float64Array(storage);typed.set([-0,Infinity]);
    const leaf={a:'leaf'},record=Object.fromEntries(Array.from({length:12},(_,i)=>['a'+i,i]));
    record.a1=NaN;record.a2=-0;record.a3='kept text';record.a4=leaf;record.a6=typed;record.a8=api.immutableCopy({value:'metadata'});
    const graph={record,alias:record,leaf,typed,typedMap:new Map([[typed,typed]]),typedSet:new Set([typed])};graph.self=graph;
    k.engine.orders.set('patch-probe',graph);
    let oldPacket,newPacket,oldView,newView;
    const patchOffset=(packet,id)=>{
      const data=new Float64Array(packet.buffer,0,packet.length);let at=2;
      for(let i=0;i<packet.nodeCount;i++){
        const start=at,node=data[at++],kind=data[at++];
        if(kind===6){patchRows++;if(node===id)return start;at+=1+data[at]*3;}
        else if(kind===0)at+=1+packet.shapes[data[at]].keys.length*2;
        else if(kind===5)at+=2;else if(kind===4){at++;at+=1+data[at];}else at+=1+data[at]*2;
      }return -1;
    };
    const reject=(packet,change)=>{
      const bad=structuredClone(packet);change(bad,new Float64Array(bad.buffer));
      const entries=[...newD.objects],rows=entries.map(([id,e])=>[id,e,e.row,e.row?.slice()]),revision=newD.revision,tick=newD.tick,metadata=newD.metadata;
      const view=structuredClone(newView);
      assert.throws(()=>newD.apply(bad));checks++;rejected++;
      same(newD.revision,revision,'revision after reject');same(newD.tick,tick,'tick after reject');assert.equal(newD.metadata,metadata);checks++;
      same([...newD.objects],entries,'accepted entries after reject');
      for(const [id,entry,row,values]of rows){assert.equal(newD.objects.get(id),entry);assert.equal(entry.row,row);same(entry.row,values,'row rollback');checks+=2;}
      same(structuredClone(newView),view,'visible graph rollback');
    };
    for(let frame=0;frame<24;frame++){
      if(frame===1)record.a0++;
      if(frame===2){record.a2=0;record.a3=leaf;}
      if(frame===3){record.a3='new string';record.a4=undefined;}
      if(frame===4){record.a5=Infinity;record.a7=-Infinity;}
      if(frame===5){record.a0++;storage.resize(32);typed[2]=NaN;typed[3]=42;}
      if(frame===6){const v=record.a0;delete record.a0;record.a0=v;}
      if(frame===7)delete record.a9;
      if(frame===8)record.a9='returned';
      if(frame===9){graph.record=null;graph.alias=null;}
      if(frame===10){graph.record=record;graph.alias=record;}
      if(frame===11){record.a8=api.immutableCopy({value:'new metadata'});}
      if(frame>=12)record.a0=frame%2?-0:frame;
      oldPacket=oldE.capture(k.engine,frame,oldPacket?.buffer,oldPacket?.visuals.buffer);
      newPacket=newE.capture(k.engine,frame,newPacket?.buffer,newPacket?.visuals.buffer);
      same(newOracle(newPacket),oldOracle(oldPacket),'canonical full wire rows');
      const offset=patchOffset(newPacket,newE.identities.get(record).id);
      if(frame===1){
        assert(offset>=0);checks++;
        reject(newPacket,(_,d)=>{d[offset+2]=0;});
        reject(newPacket,(_,d)=>{d[offset+3]=99;});
        reject(newPacket,(_,d)=>{d[offset+3]=.5;});
        reject(newPacket,(_,d)=>{d[offset+4]=99;});
        reject(newPacket,(_,d)=>{d[offset+4]=6;d[offset+5]=999999;});
        reject(newPacket,(_,d)=>{d[offset+4]=7;d[offset+5]=999999;});
        reject(newPacket,(_,d)=>{d[offset+4]=5;d[offset+5]=999999;});
        reject(newPacket,(_,d)=>{d[offset+4]=8;});
        reject(newPacket,(p)=>{p.removed.push(newE.identities.get(record).id);p.liveNodeCount--;});
        reject(newPacket,(p)=>{p.length--;});
        const base=newD.objects.get(newE.identities.get(record).id),units=base.units;
        base.units=8_000_000;try{reject(newPacket,()=>{});}finally{base.units=units;}
      }
      if(frame===2){assert(offset>=0);checks++;reject(newPacket,(_,d)=>{d[offset+6]=d[offset+3];});}
      oldView=oldD.apply(structuredClone(oldPacket));newView=newD.apply(structuredClone(newPacket));
      graphEqual(oldView,newView);same(newD.retainedObjects,newPacket.liveNodeCount,'retained count');packets++;
      const a=oldView.hud.tactical.orders.get('patch-probe'),b=newView.hud.tactical.orders.get('patch-probe');
      if(frame===0||frame===4){for(const shown of [a,b]){shown.record.a10='consumer mutation';delete shown.record.a11;shown.record.extra='kept by old decoder';}}
      if(frame===1||frame===5){same(b.record.a10,record.a10,'unchanged field restored');same(b.record.a11,record.a11,'deleted field restored');}
      if(frame===5){assert.equal(b.record.a6,b.typed);assert.equal(b.typedMap.get(b.typed),b.typed);assert(b.typedSet.has(b.typed));checks+=3;}
    }
    const uiOld=new BeforeEncoder(895,'render','ui'),uiNew=new Encoder(895,'render','ui');
    const hud={record},map={},deployment={},presence=[];
    let x,y;
    for(let i=0;i<4;i++){
      record.a0=i;const root={kind:'lan-presentation-ui',hud,map,deployment,presence};
      x=uiOld.captureUi(root,i);y=uiNew.captureUi(root,i);
      same({...x,buffer:new Uint8Array(x.buffer,0,x.length*8)},{...y,buffer:new Uint8Array(y.buffer,0,y.length*8)},'UI byte identity');
    }
    assert(patchRows>0);checks++;
    return {checks,packets,rejected,patchRows,frozenFullRowReference:!!ReferenceEncoder&&!!ReferenceDecoder,existing,scope:'Independent normalized wire rows, full display graph/prototype/alias equality, consumer writes, strings/-0/NaN, resize, layouts, retire/reentry, UI exact bytes and rejected-frame isolation.'};
  } finally {k.dispose();}
}
