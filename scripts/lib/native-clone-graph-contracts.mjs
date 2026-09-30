import assert from 'node:assert/strict';
export function checkNativeCloneGraph(api) {
 const{prepareNativeCloneGraph:prepare,restoreNativeCloneGraph:restore,screenNativeCloneGraph:screen,Vector2,ProjectedRenderShip,HudContactRecord,immutableCopy}=api;
 let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=(fn,pattern)=>{assert.throws(fn,pattern);checks++;};
 const metadata=immutableCopy({colors:[NaN,-0,Infinity],optional:undefined});
 const nil=Object.assign(Object.create(null),{u:undefined,n:null});const vector=new Vector2(-0,NaN),ship=new ProjectedRenderShip(),hud=new HudContactRecord();
 const root={vector,alias:vector,ship,hud,nil,metadata,array:[vector,undefined,null],map:new Map(),set:new Set(),typed:new Float64Array([-0,NaN,Infinity,-Infinity])};
 root.self=root;root.map.set(vector,root);root.set.add(root);root.set.add(vector);
 const result=screen(root),copy=result.root;equal(copy,root);equal(copy.self,copy);equal(copy.alias,copy.vector);equal(copy.map.get(copy.vector),copy);equal([...copy.set],[copy,copy.vector]);
 equal(Object.isFrozen(copy.metadata),true);equal(Object.isFrozen(copy.metadata.colors),true);equal(Object.getPrototypeOf(copy.nil),null);equal(Object.getPrototypeOf(copy.ship),ProjectedRenderShip.prototype);equal(Object.getPrototypeOf(copy.vector),Vector2.prototype);equal(Object.is(copy.typed[0],-0),true);
 for(const n of Object.values(result.timing))assert(n>=0&&Number.isFinite(n));checks++;
 let reads=0;const getter=Object.defineProperty({},'v',{enumerable:true,get(){reads++;return 1;}});reject(()=>prepare(getter),/accessor/);equal(reads,0);
 reject(()=>prepare({bad:()=>1}),/unsupported scalar/);reject(()=>prepare({bad:Symbol('x')}),/unsupported scalar/);
 const unsafe=Object.defineProperty({},'__proto__',{value:vector,enumerable:true});reject(()=>prepare(unsafe),/unsafe property/);
 const shadow=Object.assign(new Vector2(),{add:1});reject(()=>prepare(shadow),/unsafe property/);
 const map=new Map();map.extra=vector;reject(()=>prepare({map}),/drop own fields/);
 const typed=new Uint8Array(2);typed.extra=1;reject(()=>prepare({typed}),/drop own fields/);
 for(const mutate of [
  p=>p.nodes.push(p.nodes[0]),p=>p.nodes.push([{},0,false]),p=>p.nodes[0][1]=999,
  p=>p.nodes[0][1]=3,p=>p.nodes[0][2]=0,p=>p.root={},p=>p.root.unlisted={},
  p=>Object.defineProperty(p.root,'constructor',{value:1,enumerable:true}),p=>p.nodes.pop(),
 ]){
  const packet=structuredClone(prepare(root)),sampleVector=packet.root.vector,sampleMetadata=packet.root.metadata;mutate(packet);
  const proto=Object.getPrototypeOf(sampleVector);reject(()=>restore(packet),/Native clone probe/);equal(Object.getPrototypeOf(sampleVector),proto);equal(Object.isFrozen(sampleMetadata),false);
 }
 // No hidden cross-publication identity promise: direct native clone makes a new graph.
 assert.notEqual(screen(root).root.vector,copy.vector);checks++;
 return{checks,nodes:result.stats.nodes,metadataBrandPreserved:api.isImmutableMetadata(copy.metadata),scope:'Same-frame value/alias/prototype/frozen graph only; not production ACK, metadata branding or cross-frame identity.'};
}
