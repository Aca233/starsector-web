/** Candidate-only fused writer. Requires a locally constructed, non-Proxy graph. */
type RecordSpan = [number,number,number];
type CaptureSink = {readonly position:number;visit:((value:any,projection:CaptureProjection)=>void)|null;fields(fields:any[],indices:number[],keys:string[]|null,children:CaptureProjection[]):void;compactRecords(start:number,id:number,spans:RecordSpan[]):void;value(value:any):void;key(key:string):void;map(count:number):void;array(count:number):void;end():void};
type SinkPlan = {keys:string[];children:CaptureProjection[];fields:any[];indices:number[];shape:NativeCaptureShape|null};
const fusedCounts={objects:0,batches:0,arrays:0,packedFallbacks:0};
export function fusedCaptureDiagnostics(){return {...fusedCounts};}
function sinkPlan(value:any,projection:CaptureProjection):SinkPlan {
  const raw=Object.keys(value),fields=Object.values(value);
  projection=nativeCaptureProjection(value,projection);
  const shape=capturePlansEnabled?nativeCaptureShape(value,raw,projection):null;
  let keys=shape?.keys??raw.filter(k=>!SKIP.has(k)&&!omitCapturedField(projection,k));
  let indices=shape?.indices??keys.map(k=>raw.indexOf(k)),children=shape?.children??keys.map(k=>captureChildProjection(projection,k));
  if(indices.some(i=>typeof fields[i]==='function')) {
    const kept=indices.map((_,i)=>i).filter(i=>typeof fields[indices[i]]!=='function');
    keys=kept.map(i=>keys[i]);indices=kept.map(i=>indices[i]);children=kept.map(i=>children[i]);
    return {keys,indices,children,fields,shape:null};
  }
  return {keys,indices,children,fields,shape};
}
function sinkRecord(plan:SinkPlan,layouts:SnapshotLayouts):number|null {
  const record=plan.shape?layouts.recordPlanned(plan.shape,[]):layouts.record(plan.keys,[]);
  return record?.$record??null;
}
function captureSinkRoot(value:any,refs:Map<string,Ship>,layouts:SnapshotLayouts,projection:CaptureProjection){
  return captureProjectionFragment((w:CaptureSink)=>{
    const seen:object[]=[];w.visit=(field,child)=>{packToSink(w,field,seen,refs,layouts,false,child);};
    packToSink(w,value,seen,refs,layouts,true,projection);
  });
}
function sinkFields(w:CaptureSink,plan:SinkPlan,named:boolean) {
  w.fields(plan.fields,plan.indices,named?plan.keys:null,plan.children);
}
function sinkObject(w:CaptureSink,value:any,plan:SinkPlan,seen:object[],refs:Map<string,Ship>,layouts:SnapshotLayouts,plain:boolean,wantSpan:boolean):RecordSpan|undefined {
  const id=plain?null:sinkRecord(plan,layouts);
  seen.push(value);fusedCounts.objects++;let span:RecordSpan|undefined;
  if(id!==null){
    w.map(2);w.key('$record');w.value(id);w.key('values');const from=w.position;
    w.array(plan.keys.length);sinkFields(w,plan,false);w.end();w.end();
    if(wantSpan)span=[id,from,w.position];
  }
  else{w.map(plan.keys.length);sinkFields(w,plan,true);w.end();}
  seen.pop();return span;
}
function packToSink(w:CaptureSink,value:any,seen:object[],refs:Map<string,Ship>,layouts:SnapshotLayouts,plain=false,projection=CaptureProjection.None,wantSpan=false):RecordSpan|undefined {
  if(value===undefined||typeof value==='function'){w.value(layouts.absent);return;}
  if(typeof value==='number'&&!Number.isFinite(value)){w.value({$number:String(value)});return;}
  if(value===null||typeof value!=='object'){w.value(value);return;}
  if(value instanceof Ship&&!plain){refs.set(value.id,value);w.value({$ship:value.id});return;}
  if(value instanceof Vector2){w.map(1);w.key('$vector');w.array(2);w.value(value.x);w.value(value.y);w.end();w.end();return;}
  if(ArrayBuffer.isView(value)){w.map(2);w.key('$typed');w.value(value.constructor.name);w.key('values');const items=Array.from(value as any);w.array(items.length);for(const item of items)w.value(item);w.end();w.end();return;}
  // Keep the existing specialized recipe/column algorithms and their budgets.
  const special=projection===CaptureProjection.Projectiles&&layouts.compactProjectiles
    ||projection===CaptureProjection.DynamicParticles&&layouts.compactParticles
    ||projection===CaptureProjection.ExplosionPuffs&&layouts.compactPuffs;
  if(special||value instanceof Map||value instanceof Set){fusedCounts.packedFallbacks++;w.value(pack(value,seen,refs,layouts,plain,projection));return;}
  if(seen.includes(value)){w.value(layouts.absent);return;}
  if(Array.isArray(value)) {
    if(Object.getPrototypeOf(value)!==Array.prototype||Object.hasOwn(value,'map')||Object.hasOwn(value,'constructor')
      ||value.map!==captureArrayMap||value.constructor!==Array||Array[Symbol.species]!==Array){fusedCounts.packedFallbacks++;w.value(pack(value,seen,refs,layouts,plain,projection));return;}
    const member=projection===CaptureProjection.Weapons?CaptureProjection.Weapon
      :projection===CaptureProjection.Engines?CaptureProjection.Engine
      :projection===CaptureProjection.Projectiles?CaptureProjection.Projectile
      :projection===CaptureProjection.Explosions?CaptureProjection.Explosion:CaptureProjection.None;
    // Preserve row-by-row reads, including mutations from a fallback mapper.
    // Compact the already-owned encoded spans only AFTER every row was visited.
    const start=w.position,length=value.length;let id=-1,spans:RecordSpan[]|null=null;
    seen.push(value);fusedCounts.arrays++;w.array(length);
    for(let i=0;i<length;i++) {
      let span:RecordSpan|undefined;
      if(i in value)span=packToSink(w,value[i],seen,refs,layouts,false,member,id!==-2);else w.value(null);
      if(i===0&&span){id=span[0];spans=[span];}
      else if(id>=0&&span?.[0]===id)spans!.push(span);
      else{id=-2;spans=null;}
    }
    w.end();seen.pop();
    if(id>=0&&spans&&spans.length>1){w.compactRecords(start,id,spans);fusedCounts.batches++;}
    return;
  }
  return sinkObject(w,value,sinkPlan(value,projection),seen,refs,layouts,plain,wantSpan);
}
