import assert from 'node:assert/strict';
import {createPresentationPacketOracle} from './presentation-packet-oracle.mjs';

// Compare first-seen BFS order, not just final values. Observers wrap only internal
// reference iterators during the test and are always removed, including on error.
export function checkDecoderWorklist(api) {
  const {LocalCombatKernel,CombatPresentationEncoder:Encoder,CombatPresentationDecoder:Decoder,
    BeforeCombatPresentationDecoder:Before,PresentationKind:Kind,PresentationTag:Tag} = api;
  let checks=0, packets=0, tracedNodes=0, rejected=0;
  const same=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
  const sameGraph=(left,right,label)=>{
    const forward=new Map(),backward=new Map(),pending=[[left,right]];
    for(let at=0;at<pending.length;at++){
      const [a,b]=pending[at];
      if(typeof a!=='object'||a===null||typeof b!=='object'||b===null){assert(Object.is(a,b),label);checks++;continue;}
      if(forward.has(a)){assert.equal(forward.get(a),b,label+'/alias');checks++;continue;}
      assert(!backward.has(b),label+'/reverse alias');checks++;forward.set(a,b);backward.set(b,a);
      assert.equal(Object.getPrototypeOf(a),Object.getPrototypeOf(b),label+'/prototype');checks++;
      if(ArrayBuffer.isView(a)){same(a.length,b.length,label+'/typed length');for(let i=0;i<a.length;i++)pending.push([a[i],b[i]]);}
      else if(a instanceof Map){same(a.size,b.size,label+'/map size');const other=b.entries();for(const [key,value]of a){const pair=other.next().value;pending.push([key,pair[0]],[value,pair[1]]);}}
      else if(a instanceof Set){same(a.size,b.size,label+'/set size');const other=b.values();for(const value of a)pending.push([value,other.next().value]);}
      else {if(Array.isArray(a))same(a.length,b.length,label+'/array length');const keys=Object.keys(a);same(keys,Object.keys(b),label+'/keys');for(const key of keys)pending.push([a[key],b[key]]);}
    }
  };
  const normalizePacket=createPresentationPacketOracle();
  let lastPacket,normalized;
  const parseRefs=packet=>{
    if(lastPacket!==packet){normalized=normalizePacket(packet);lastPacket=packet;}
    const plans=new Map();same(normalized.root[0],Tag.Ref,'root tag');
    for(const row of normalized.rows){
      const refs=[];
      if(row.kind!==Kind.Vector&&row.kind!==Kind.Typed)for(let j=0;j<row.values.length;j+=2)if(row.values[j]===Tag.Ref)refs.push(row.values[j+1]);
      plans.set(row.id,refs);
    }
    return {root:normalized.root[1],plans};
  };
  const expectedOrder=(decoder,packet)=>{
    const {root,plans}=parseRefs(packet),pending=[root],seen=new Set(),retained=[];
    for(let i=0;i<pending.length;i++){
      const id=pending[i];if(seen.has(id))continue;seen.add(id);
      const refs=plans.get(id)??decoder.objects.get(id)?.refs;
      assert(refs,'oracle missing reference');checks++;
      if(!plans.has(id))retained.push(id);
      for(const child of refs)if(!seen.has(child))pending.push(child);
    }
    same(seen.size,packet.liveNodeCount,'oracle full live count');return retained;
  };
  const observe=(decoder,run,stop)=>{
    const trace=[],restore=[];
    try {
      for(const [id,entry] of decoder.objects){
        const refs=entry.refs,descriptor=Object.getOwnPropertyDescriptor(refs,Symbol.iterator);
        Object.defineProperty(refs,Symbol.iterator,{configurable:true,value:function(){
          trace.push(id);if(id===stop)throw Error('worklist-stop/'+id);
          return Array.prototype[Symbol.iterator].call(this);
        }});
        restore.push(()=>{if(descriptor)Object.defineProperty(refs,Symbol.iterator,descriptor);else delete refs[Symbol.iterator];});
      }
      const result=run();return {trace,result};
    } finally {for(const restoreIterator of restore)restoreIterator();}
  };
  const k=new LocalCombatKernel({playerHull:'onslaught',enemyHull:'paragon',seed:77199,multicore:false});
  try {
    const encoder=new Encoder(619,'render'),current=new Decoder(619,'render'),old=new (Before??Decoder)(619,'render');
    const indexes=[current.objects,old.objects];
    const nodes=Array.from({length:96},(_,i)=>({i,value:i,next:null,mirror:null}));
    for(let i=0;i<nodes.length;i++){nodes[i].next=nodes[(i+1)%nodes.length];nodes[i].mirror=nodes[(i+37)%nodes.length];}
    const graph={nodes,frontier:Array.from({length:4096},(_,i)=>nodes[(i*37)%nodes.length]),map:new Map(nodes.map((n,i)=>[n,nodes[(i+1)%nodes.length]])),set:new Set(nodes),cycle:null};graph.cycle=graph;
    k.engine.orders.set('worklist',graph);
    let packet,shown,oldShown;
    for(let frame=0;frame<32;frame++){
      if(frame===3||frame===8)graph.frontier.reverse();
      if(frame===5)for(let i=0;i<12;i++)nodes[i].value+=.5;
      if(frame===7){graph.map.delete(nodes[0]);graph.map.set(nodes[0],nodes[11]);graph.set.delete(nodes[1]);graph.set.add(nodes[1]);}
      if(frame===10)graph.temporary=Array.from({length:220},(_,i)=>({i,alias:nodes[i%nodes.length]}));
      if(frame===12)delete graph.temporary;
      if(frame===15)k.engine.orders.delete('worklist');
      if(frame===16)k.engine.orders.set('worklist',graph);
      if(frame===18){graph.frontier.length=0;graph.set.clear();}
      if(frame===19){graph.frontier.push(...nodes,...nodes);for(const n of nodes)graph.set.add(n);}
      if(frame===22)nodes[4].next=nodes[4];
      if(frame===24)nodes[4].next=nodes[5];
      packet=encoder.capture(k.engine,0,packet?.buffer,packet?.visuals.buffer);
      const expected=expectedOrder(current,packet);same(expected,expectedOrder(old,packet),'frozen-reference BFS oracle');
      if(frame===4||frame===11||frame===17||frame===23){
        assert(expected.length>3);checks++;const stop=expected[Math.floor(expected.length/3)];
        for(const [decoder,visible] of [[current,shown],[old,oldShown]]){
          const before=structuredClone(visible),revision=decoder.revision,entries=[...decoder.objects];
          observe(decoder,()=>{assert.throws(()=>decoder.apply(structuredClone(packet)),{message:'worklist-stop/'+stop});checks++;},stop);
          same(decoder.revision,revision,'failed traversal does not consume revision');same([...decoder.objects],entries,'failed traversal preserves entries');
          sameGraph(structuredClone(visible),before,'failed traversal does not mutate display');rejected++;
        }
      }
      const a=observe(current,()=>current.apply(structuredClone(packet))),b=observe(old,()=>old.apply(structuredClone(packet)));
      shown=a.result;oldShown=b.result;
      same(a.trace,expected,'current retained visits equal first-seen BFS');same(b.trace,expected,'reference retained visits equal first-seen BFS');
      same(a.trace.length,new Set(a.trace).size,'retained node visited once');tracedNodes+=a.trace.length;
      sameGraph(shown,oldShown,'complete display with aliases/cycles/order');same(current.objects,indexes[0],'stable current index');same(old.objects,indexes[1],'stable reference index');
      same(current.retainedObjects,packet.liveNodeCount,'all nodes retained');packets++;
    }
  } finally {k.dispose();}
  return {checks,reports:[{kind:'decoder-set-worklist',checks,packets,tracedNodes,rejected,frozenReference:!!Before,
    note:'Operation/order correctness counters, not allocation or speed measurements.'}]};
}
