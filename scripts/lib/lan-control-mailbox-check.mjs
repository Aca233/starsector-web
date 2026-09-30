import assert from 'node:assert/strict';

// Only the isolated existing multiplayer page installs these wrappers. Production
// has no input override, withheld acknowledgement, or test worker message.
export async function installControlMailboxProbe(page){
 await page.evaluate(async()=>{
  const {LanPresentationWorkerClient:Client}=await import('/src/network/LanPresentationWorkerClient.ts');
  const configure=Client.prototype.configure;
  window.heldControlReceipts=[];window.controlOverride=null;
  Client.prototype.configure=function(value){window.controlClient=this;window.controlLatest=value;return configure.call(this,{...value,...window.controlOverride});};
 });
}

async function atomicCheck(page){
 return page.evaluate(async()=>{
  const {LanPresentationControlMailbox:Mailbox,LAN_CONTROL_BYTES}=await import('/src/network/LanPresentationControlMailbox.ts');
  const make=r=>({revision:r,revocations:Math.floor(r/7),pointerRevocations:Math.floor(r/11),controls:{
   zoom:1+r/65536,seq:r*3,keys:r%256,minTick:r*5,syncId:'mailbox-check',
   pointer:r%2?[r+.25,-r-.5]:null,
   viewport:r%3?{width:r+1,height:r+2,rect:{left:-r,top:r+.5,width:r+.75,height:r+1.25}}:null,
   visible:!!(r&1),launched:!!(r&2),synced:!!(r&4),focused:!!(r&8),blocked:!!(r&16),firing:!!(r&32),
  }});
  const buffer=new SharedArrayBuffer(LAN_CONTROL_BYTES),gate=new SharedArrayBuffer(8),mailbox=new Mailbox(buffer),count=30000,generation=71;
  mailbox.write(generation,make(1));
  const url=URL.createObjectURL(new Blob([`
   import {LanPresentationControlMailbox} from ${JSON.stringify(location.origin+'/src/network/LanPresentationControlMailbox.ts')};
   const make=${make.toString()};
   const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);
   onmessage=({data:{buffer,gate,count,generation}})=>{
    const mailbox=new LanPresentationControlMailbox(buffer),lock=new Int32Array(gate);
    postMessage({type:'armed'});Atomics.wait(lock,0,0,5000);
    const until=performance.now()+10000;let reads=0,unchanged=0,contended=0,revision=0,concurrent=0;const errors=[];
    postMessage({type:'reading'});
    while(performance.now()<until){
     const sample=mailbox.read(generation,'mailbox-check',revision);
     if(sample===null)contended++;else if(sample===false)unchanged++;else{
      reads++;revision=sample.revision;
      if(revision>1&&revision<count&&Atomics.load(lock,1)===0)concurrent++;
      if(canonical(sample)!==canonical(make(revision))&&errors.length<8)errors.push({revision,sample});
     }
     if(Atomics.load(lock,1)===1&&revision===count){postMessage({type:'done',reads,unchanged,contended,revision,concurrent,errors});return;}
    }
    postMessage({type:'failed',revision,reads,errors});
   };
  `],{type:'text/javascript'})),worker=new Worker(url,{type:'module'});
  let timer;const events=[],waiters=new Map();
  const wait=type=>new Promise((resolve,reject)=>{const found=events.find(e=>e.type===type);if(found)resolve(found);else waiters.set(type,{resolve,reject});});
  worker.onmessage=({data})=>{events.push(data);waiters.get(data.type)?.resolve(data);if(data.type==='failed')for(const w of waiters.values())w.reject(Error(JSON.stringify(data)));};
  worker.onerror=e=>{for(const w of waiters.values())w.reject(Error(e.message));};
  timer=setTimeout(()=>{for(const w of waiters.values())w.reject(Error('Atomic control mailbox test timed out'));},15000);
  try{
   worker.postMessage({buffer,gate,count,generation});await wait('armed');Atomics.store(new Int32Array(gate),0,1);Atomics.notify(new Int32Array(gate),0);await wait('reading');
   for(let r=2;r<=count;r++)mailbox.write(generation,make(r));Atomics.store(new Int32Array(gate),1,1);
   const result=await wait('done');
   const unchanged=mailbox.read(generation,'mailbox-check',count)===false,wrongGeneration=mailbox.read(generation+1,'mailbox-check')===null;
   // Deliberately held odd lock must fail in the bounded read, not wait/spin.
   Atomics.add(new Int32Array(buffer),0,1);const oddLock=mailbox.read(generation,'mailbox-check')===null;Atomics.add(new Int32Array(buffer),0,1);
   mailbox.write(generation,null);const revoked=mailbox.read(generation,'mailbox-check')===null;
   return {...result,count,bytes:LAN_CONTROL_BYTES,unchanged,wrongGeneration,oddLock,revoked,scope:'Correlated scalar coherence and explicit epoch/revocation fencing; separate test Worker, not performance throughput.'};
  }finally{clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);}
 });
}

const frameReport=async(page,until)=>{
 await page.evaluate(()=>{window.workerSubmitFrames=null;window.presentationMeasureWorker.postMessage({type:'test-submit-frames'});});
 await until(()=>page.evaluate(()=>!!window.workerSubmitFrames),'Worker-local actual draw report');
 return page.evaluate(()=>window.workerSubmitFrames);
};
export async function checkControlMailbox({guest,until,stage,retain}){
 await installControlMailboxProbe(guest);
 const evidence={};const save=async()=>retain?.(evidence);
 try{
  if(process.env.MULTIPLAYER_FLIGHT_READ_UNAVAILABLE_CHECK){
   const mode=process.env.MULTIPLAYER_FLIGHT_READ_UNAVAILABLE_CHECK;assert.ok(['baseline','fixed'].includes(mode));
   stage('control mailbox: held flight key with unreadable coordinates');
   evidence.flightEdges=await checkFlightReadUnavailable(guest,until,mode);await save();
  }
  stage('control mailbox: atomic coherence');evidence.atomic=await atomicCheck(guest);await save();
  assert.deepEqual(evidence.atomic.errors,[]);assert.equal(evidence.atomic.revision,30000);assert.ok(evidence.atomic.reads>1&&evidence.atomic.concurrent>0,'must actually overlap independent writer/reader');
  for(const flag of ['unchanged','wrongGeneration','oddLock','revoked'])assert.equal(evidence.atomic[flag],true,flag);
  await until(()=>guest.evaluate(()=>window.controlClient?.readRealtime()&&!window.controlClient.stats.pendingControls),'idle shared control credit');
  stage('control mailbox: held wake ACK');
  const original=await guest.evaluate(async()=>{
   const settings=await import('/src/engine/runtime/GraphicsSettings.ts'),original=settings.getGraphicsSettings();
   window.holdControlReceipt=true;settings.updateGraphicsSettings({screenShake:original.screenShake===.375?.625:.375});
   window.controlClient.configure(window.controlLatest);return original;
  });
  try{
   await until(()=>guest.evaluate(()=>window.heldControlReceipts.length===1),'real wake ACK withheld',3000);
   evidence.busy=await guest.evaluate(()=>{
    const client=window.controlClient,before={stats:client.stats,frame:client.readRealtime()},at=performance.timeOrigin+performance.now();
    for(let i=0;i<400;i++){window.controlOverride={zoom:1+i/1000,keys:i%2?2:1};client.configure(window.controlLatest);}
    // Override ordinary RAF configure until evidence is collected, not authority
    // input admission or any consumption receipt.
    const from=performance.timeOrigin+performance.now(),end=performance.now()+70;while(performance.now()<end){}
    return {before,at,from,to:performance.timeOrigin+performance.now(),after:{stats:client.stats,frame:client.readRealtime()},held:window.heldControlReceipts.length};
   });
   await save();
   const b=evidence.busy;assert.equal(b.held,1);assert.equal(b.after.stats.controlsSent,b.before.stats.controlsSent,'ordinary controls must not queue IPC while ACK is held');
   assert.equal(b.after.stats.pendingControls,true);assert.equal(b.after.stats.queuedControls,false);assert.ok(b.after.stats.controlsPublished>=b.before.stats.controlsPublished+400);
   assert.equal(b.after.frame?.zoom,1.399);assert.ok(b.after.frame.at>=b.from&&b.after.frame.at<=b.to,'fresh realtime frame must be produced DURING the busy task');assert.ok(b.after.frame.frame>b.before.frame.frame);
   evidence.busy.frames=(await frameReport(guest,until)).filter(f=>f.at>=b.from&&f.at<=b.to);await save();
   assert.ok(evidence.busy.frames.some(f=>f.keys===2&&f.active),'new controls must reach actual active drawing while main is busy');
   await guest.evaluate(()=>{
    const client=window.controlClient;
    window.controlOverride={focused:true,blocked:false,pointer:[400,300]};client.configure(window.controlLatest);
    window.controlOverride={focused:false,blocked:true,pointer:null};client.configure(window.controlLatest);
    window.controlOverride={focused:true,blocked:false,pointer:[410,310]};client.configure(window.controlLatest);
   });
   await until(()=>guest.evaluate(before=>{const c=window.controlClient.stats.status?.control;return c&&c.revocations>before.revocations&&c.pointerRevocations>before.pointerRevocations;},b.before.stats.status.control),'transient revocations retained in latest mailbox',3000);
   evidence.revocations=await guest.evaluate(()=>window.controlClient.stats.status.control);await save();
  }finally{
   await guest.evaluate(async original=>{window.holdControlReceipt=false;for(const release of window.heldControlReceipts.splice(0))release();window.controlOverride=null;(await import('/src/engine/runtime/GraphicsSettings.ts')).updateGraphicsSettings(original);window.controlClient.configure(window.controlLatest);},original);
  }
  await until(()=>guest.evaluate(()=>!window.controlClient.stats.pendingControls&&!window.controlClient.stats.queuedControls),'wake channel drained');
  stage('control mailbox: hide and resume');
  evidence.hidden={immediate:await guest.evaluate(()=>{window.controlOverride={visible:false};window.controlClient.configure(window.controlLatest);return window.controlClient.readRealtime();})};
  assert.equal(evidence.hidden.immediate,null);
  await until(()=>guest.evaluate(()=>!window.controlClient.stats.pendingControls),'hide applied');
  const beforeHidden=await frameReport(guest,until);await new Promise(resolve=>setTimeout(resolve,160));const afterHidden=await frameReport(guest,until);
  evidence.hidden.framesBefore=beforeHidden.length;evidence.hidden.framesAfter=afterHidden.length;assert.equal(afterHidden.length,beforeHidden.length,'hidden owner must not keep drawing');
  const resumeAt=await guest.evaluate(()=>{window.controlOverride=null;const at=performance.timeOrigin+performance.now();window.controlClient.configure(window.controlLatest);return at;});
  await until(()=>guest.evaluate(at=>window.controlClient.readRealtime()?.at>=at,resumeAt),'fresh frame after resume');
  evidence.resumed=await guest.evaluate(()=>window.controlClient.readRealtime());await save();
  stage('control mailbox: real reconnect');
  evidence.reconnect={before:await guest.evaluate(()=>({generation:window.controlClient.generation,tick:window.controlClient.stats.status.tick,match:window.match.id}))};
  await guest.evaluate(()=>connection.socket.close(4000,'isolated control mailbox reconnect'));
  await until(()=>guest.evaluate(old=>window.controlClient.generation>old.generation&&window.controlClient.stats.status?.tick>old.tick&&!!window.controlClient.readRealtime()&&!document.querySelector('.lan-hud')?.inert,evidence.reconnect.before),'new explicit epoch with fresh state and controls',30000);
  evidence.reconnect.after=await guest.evaluate(()=>({generation:window.controlClient.generation,tick:window.controlClient.stats.status.tick,match:window.match.id,frame:window.controlClient.readRealtime(),control:window.controlClient.stats.status.control}));
  assert.equal(evidence.reconnect.after.match,evidence.reconnect.before.match);await save();
  evidence.scope='Same production LanBattle/Worker/relay after timing window; ACK interception does not forge input/state credit. DOM and synthetic configure probes only; no OS input or visibility change.';
  return evidence;
 }catch(error){evidence.error=String(error);throw error;}finally{await save();}
}

async function checkFlightReadUnavailable(page,until,mode){
 await until(()=>page.evaluate(()=>window.controlClient?.readRealtime()&&!document.querySelector('.lan-hud')?.inert),'flight input ready');
 const evidence={mode};
 try{
  evidence.pressed=await page.evaluate(()=>{
   for(const code of ['KeyW','KeyS'])window.dispatchEvent(new KeyboardEvent('keyup',{code,cancelable:true}));
   const client=window.controlClient;
   window.flightRealtimeDescriptor=Object.getOwnPropertyDescriptor(client,'readRealtime');
   window.flightRealtimeRead=client.readRealtime;window.flightReadUnavailable=true;
   client.readRealtime=function(...args){return window.flightReadUnavailable?null:window.flightRealtimeRead.apply(this,args);};
   const seq=connection.inputSequence,event=new KeyboardEvent('keydown',{code:'KeyW',cancelable:true});
   window.dispatchEvent(event);
   return {seq,prevented:event.defaultPrevented,keys:window.controlLatest.keys,at:performance.timeOrigin+performance.now()};
  });
  await new Promise(r=>setTimeout(r,150));
  evidence.unavailable=await page.evaluate(()=>({seq:connection.inputSequence,keys:window.controlLatest.keys}));
  assert.equal(evidence.unavailable.seq,evidence.pressed.seq,'no invented aim or sequence while coordinates are unavailable');
  assert.equal(evidence.pressed.prevented,mode==='fixed');
  assert.equal(evidence.unavailable.keys,mode==='fixed'?1:0,'held flight key retained without requiring a coordinate read');
  evidence.restoredAt=await page.evaluate(()=>{window.flightReadUnavailable=false;return performance.timeOrigin+performance.now();});
  if(mode==='baseline'){
   evidence.counterexample='Old real DOM handler ignores flight key when one coordinate source is unavailable; no key is retained for retry.';
   return evidence;
  }
  await until(()=>page.evaluate(seq=>window.presentationProbe.inputs.some(i=>i.seq>seq&&i.keys===1&&window.presentationProbe.acked>=i.seq),evidence.pressed.seq),'retained flight input actually sent and cumulatively acknowledged');
  evidence.accepted=await page.evaluate(seq=>({input:window.presentationProbe.inputs.find(i=>i.seq>seq&&i.keys===1),ack:window.presentationProbe.acked}),evidence.pressed.seq);
  const frames=await frameReport(page,until);evidence.draw=frames.find(f=>f.at>=evidence.restoredAt&&f.keys===1&&f.active);
  assert.ok(evidence.draw,'actual active draw must sample recovered held key');
  evidence.released=await page.evaluate(()=>{
   window.flightReadUnavailable=true;
   window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',cancelable:true}));
   const down=new KeyboardEvent('keydown',{code:'KeyS',cancelable:true});window.dispatchEvent(down);
   const retained=window.controlLatest.keys;
   window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyS',cancelable:true}));
   return {seq:connection.inputSequence,retained,keys:window.controlLatest.keys};
  });
  assert.equal(evidence.released.retained,2);assert.equal(evidence.released.keys,0);
  await new Promise(r=>setTimeout(r,150));assert.equal(await page.evaluate(()=>connection.inputSequence),evidence.released.seq);
  await page.evaluate(()=>{window.flightReadUnavailable=false;});
  await until(()=>page.evaluate(seq=>window.presentationProbe.inputs.some(i=>i.seq>seq&&i.keys===0&&window.presentationProbe.acked>=i.seq),evidence.released.seq),'released controls recover without resurrecting a held key');
  assert.equal(await page.evaluate(seq=>window.presentationProbe.inputs.some(i=>i.seq>seq&&i.keys!==0),evidence.released.seq),false);
  evidence.textFocus=await page.evaluate(()=>{
   window.flightReadUnavailable=true;
   const field=document.createElement('input');field.setAttribute('aria-label','isolated input permission test');document.body.append(field);field.focus();
   try{const event=new KeyboardEvent('keydown',{code:'KeyW',cancelable:true});window.dispatchEvent(event);return {seq:connection.inputSequence,prevented:event.defaultPrevented,keys:window.controlLatest.keys,focused:document.activeElement===field};}
   finally{field.blur();field.remove();window.flightReadUnavailable=false;}
  });
  assert.equal(evidence.textFocus.focused,true);assert.equal(evidence.textFocus.prevented,false);assert.equal(evidence.textFocus.keys,0);
  evidence.scope='Real isolated DOM handler + real send admission/Worker draw/authority cumulative ACK. Forced null coordinate reads only; no forged ACK, coordinate, input packet or OS focus change. Cumulative ACK does not prove every superseded sample was individually simulated.';
  return evidence;
 }finally{
  await page.evaluate(()=>{
   const client=window.controlClient;if(window.flightRealtimeDescriptor)Object.defineProperty(client,'readRealtime',window.flightRealtimeDescriptor);else delete client.readRealtime;
   window.flightReadUnavailable=false;
   for(const code of ['KeyW','KeyS'])window.dispatchEvent(new KeyboardEvent('keyup',{code,cancelable:true}));
  });
 }
}
