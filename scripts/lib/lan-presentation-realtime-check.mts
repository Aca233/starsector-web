import { LAN_REALTIME_BYTES, LanRealtimeMailbox, LanRealtimePublisher, copyRealtimeFrame } from '../../src/network/LanPresentationRealtime';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sample=n=>({frame:n,tick:n,at:performance.timeOrigin+performance.now(),cameraX:n,cameraY:-n,zoom:1,
  aimX:n*3,aimY:n*7,width:640,height:360,hudZoom:.5,configuration:n});
export async function checkRealtimePrimitives(){
  const shared=new SharedArrayBuffer(LAN_REALTIME_BYTES),writer=new LanRealtimeMailbox(shared),reader=new LanRealtimeMailbox(shared);
  check(LAN_REALTIME_BYTES===120&&reader.read(1)===null,'Uninitialized mailbox was readable');
  writer.write(1,sample(1));const initial=reader.read(1);check(initial?.cameraX===1&&!reader.read(2),'Mailbox generation mismatch');
  initial.cameraX=999;check(reader.read(1).cameraX===1,'Reader mutated owned mailbox state');
  Atomics.add(new Int32Array(shared),0,1);check(reader.read(1)===null,'In-progress write was read or spun indefinitely');
  Atomics.add(new Int32Array(shared),0,1);
  Atomics.store(new Int32Array(shared),0,0x7ffffffe);writer.write(1,sample(2));check(reader.read(1).tick===2,'Signed version wrap broke snapshot');
  writer.write(2,null);check(!reader.read(1)&&!reader.read(2),'Invalidation exposed old coordinates');
  let rejected=0;for(const bad of [{...sample(2),aimX:NaN},{...sample(2),width:0},{...sample(2),frame:.5}])try{copyRealtimeFrame(bad);}catch{rejected++;}
  check(rejected===3&&!('extra' in copyRealtimeFrame({...sample(2),extra:{world:true}})),'Unbounded/invalid data entered scalar view');
  const packets=[],publisher=new LanRealtimePublisher(null,p=>packets.push(p));publisher.reset(1);
  for(let i=1;i<=100;i++)publisher.publish(sample(i));check(packets.length===1&&publisher.stats.pending&&publisher.stats.dirty,'Fallback queued frame history');
  check(!publisher.complete({generation:2,serial:1})&&!publisher.complete({generation:1,serial:999}),'Forged receipt opened the queue');
  publisher.complete(packets[0]);check(packets.length===2&&packets[1].frame.frame===100,'Fallback did not coalesce latest');
  publisher.reset(2);const afterReset=packets.length;check(!publisher.complete(packets[1])&&packets.length===afterReset,'Old receipt crossed reset');
  publisher.close();publisher.publish(sample(101));check(packets.length===afterReset,'Closed publisher posted again');
  const noMessages=[],direct=new LanRealtimePublisher(writer,p=>noMessages.push(p));direct.reset(3);direct.publish(sample(3));
  check(reader.read(3).tick===3&&!noMessages.length,'Shared mode emitted per-frame IPC');direct.close();check(!reader.read(3),'Close left shared state readable');

  // Deliberate cross-thread racing checks the production atomic word protocol,
  // not gameplay speed. Relation among every scalar catches mixed publications.
  const done=new SharedArrayBuffer(8),flag=new Int32Array(done),moduleUrl=new URL('/src/network/LanPresentationRealtime.ts',location.href).href;
  const url=URL.createObjectURL(new Blob([`import {LanRealtimeMailbox} from ${JSON.stringify(moduleUrl)};
    postMessage('ready');onmessage=event=>{const box=new LanRealtimeMailbox(event.data.shared),done=new Int32Array(event.data.done);
      postMessage('armed');Atomics.wait(done,0,0,10000);if(Atomics.load(done,0)!==1)throw Error('Race reader did not start');
      for(let n=1;n<=40000;n++)box.write(4,{frame:n,tick:n,at:n,cameraX:n,cameraY:-n,zoom:1,aimX:n*3,aimY:n*7,width:640,height:360,hudZoom:.5,configuration:n});
      Atomics.store(done,1,1);postMessage('done');};`],{type:'text/javascript'}));
  const worker=new Worker(url,{type:'module'});let reads=0,runtimeError='';
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Mailbox race worker startup timed out')),10000);
      worker.onmessage=e=>{if(e.data==='ready'){clearTimeout(timer);resolve(null);}};worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};});
    worker.onerror=event=>{runtimeError=event.message;};
    writer.write(4,null);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Mailbox race worker not armed')),10000);
      worker.onmessage=event=>{if(event.data==='armed'){clearTimeout(timer);resolve(null);}};worker.postMessage({shared,done});});
    Atomics.store(flag,0,1);Atomics.notify(flag,0);const end=performance.now()+3000;
    while(!Atomics.load(flag,1)&&performance.now()<end){const value=reader.read(4);if(!value)continue;reads++;
      check(value.frame===value.tick&&value.frame===value.at&&value.cameraX===value.frame&&value.cameraY===-value.frame
        &&value.aimX===value.frame*3&&value.aimY===value.frame*7&&value.configuration===value.frame,'Torn scalar publication');}
    await new Promise(resolve=>setTimeout(resolve,0));
    check(Atomics.load(flag,1)===1&&reads>0&&reader.read(4)?.frame===40000,'Concurrent mailbox race did not finish/sample: '+JSON.stringify({done:Atomics.load(flag,1),reads,last:reader.read(4),runtimeError}));
  }finally{worker.terminate();URL.revokeObjectURL(url);}
  return {mailboxBytes:LAN_REALTIME_BYTES,atomicWrites:40000,coherentReads:reads,finiteRetry:true,fallbackLatestOnly:true,generationFenced:true};
}
