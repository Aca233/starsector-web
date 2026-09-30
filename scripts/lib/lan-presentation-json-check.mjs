import assert from 'node:assert/strict';
/** Post-measurement real relay wire fallback. No payload injection into client
 * private methods; the server sends its fully decoded actual authority state. */
export async function checkPresentationJson({pages,room,until,stage}){
 const guest=pages[1],peer=room.peers[1];let socket=peer.ws,json=true,sent=0,binarySent=0;
 const decorate=ws=>{ws.sendSnapshot=snapshot=>{assert.equal(snapshot.metadataOnly,undefined,'JSON fixture requires actual full authority decode');assert.ok(snapshot.state.frame?.ships);if(json){sent++;ws.send(JSON.stringify(snapshot.state));}else{binarySent++;ws.send(snapshot.bytes,{binary:true});}};return ws;};
 // The resume path reuses this authenticated peer and assigns its new socket.
 // Never modify the authority's simulation, admission, ACKs, or actual frames.
 Object.defineProperty(peer,'ws',{configurable:true,enumerable:true,get:()=>socket,set:ws=>{socket=decorate(ws);}});
 stage('presentation: message transport and JSON fallback');
 await guest.evaluate(()=>{
  window.jsonFallback=true;window.originalConnectionSend=connection.send.bind(connection);
  connection.send=m=>window.originalConnectionSend(m.type==='hello'&&window.jsonFallback?{...m,binaryDelta:0,motionReference:0,motionState:0,visualState:0,combatState:0}:m);
  connection.socket.close(4000,'isolated JSON fallback negotiation');
 });
 await until(()=>!peer.loaded,'JSON reconnect begins',10000);
 await until(()=>peer.loaded&&sent>=10,'real JSON states consumed',30000);
 await until(()=>guest.evaluate(()=>{const h=document.querySelector('.lan-hud');return h&&!h.inert&&window.presentationProbe.status?.ready;}),'JSON controls enabled');
 const start=await guest.evaluate(()=>({generation:window.presentationProbe.generations.at(-1),tick:window.presentationProbe.status.tick,ack:window.presentationProbe.acked,fallbacks:window.presentationProbe.fallbacks,controls:window.presentationProbe.controls,graphics:window.presentationProbe.graphicsUpdates,transport:window.presentationRealtimeKind}));
 assert.equal(start.transport,'messages');
 const target=sent+25;await until(()=>sent>=target,'sustained JSON stream',15000);
 const sustained=await guest.evaluate(()=>({generation:window.presentationProbe.generations.at(-1),tick:window.presentationProbe.status.tick,ack:window.presentationProbe.acked,fallbacks:window.presentationProbe.fallbacks,controls:window.presentationProbe.controls,graphics:window.presentationProbe.graphicsUpdates}));
 assert.equal(sustained.generation,start.generation,'same-format JSON must not revoke UI/playback for every state');
 assert.ok(sustained.tick>start.tick&&sustained.ack>start.ack&&sustained.fallbacks>start.fallbacks,'JSON must advance actual rendered state and authoritative input ACKs');
 assert.ok(sustained.controls>start.controls);assert.equal(sustained.graphics,start.graphics,'unchanged graphics must not be resent every frame');
 const original=await guest.evaluate(async()=>{const g=await import('/src/engine/runtime/GraphicsSettings.ts');const old={...g.getGraphicsSettings()};g.updateGraphicsSettings({screenShake:.375});return old;});
 await until(()=>guest.evaluate(()=>window.presentationProbe.status?.graphics.screenShake===.375),'changed graphics crosses control channel');
 await guest.evaluate(async old=>(await import('/src/engine/runtime/GraphicsSettings.ts')).updateGraphicsSettings(old),original);
 await until(()=>guest.evaluate(value=>window.presentationProbe.status?.graphics.screenShake===value,original.screenShake),'graphics preference restored');
 stage('presentation: queued action survives missing coordinates');
 const actionStart=await guest.evaluate(async()=>{
  const {LanPresentationWorkerClient:Client}=await import('/src/network/LanPresentationWorkerClient.ts');
  window.savedRealtimeRead=Client.prototype.readRealtime;window.savedInputAdmission=connection.canSendInput.bind(connection);
  connection.canSendInput=()=>false;
  const seq=connection.inputSequence;
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit2',cancelable:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'Digit2',cancelable:true}));
  Client.prototype.readRealtime=function(...args){return window.suspendCoordinateRead?null:window.savedRealtimeRead.apply(this,args);};
  window.suspendCoordinateRead=true;connection.canSendInput=window.savedInputAdmission;return seq;
 });
 await new Promise(resolve=>setTimeout(resolve,150));
 const during=await guest.evaluate(()=>connection.inputSequence);
 assert.equal(during,actionStart,'unavailable coordinates must not consume a sequence');
 await guest.evaluate(async()=>{window.suspendCoordinateRead=false;(await import('/src/network/LanPresentationWorkerClient.ts')).LanPresentationWorkerClient.prototype.readRealtime=window.savedRealtimeRead;});
 await until(()=>guest.evaluate(seq=>window.presentationProbe.inputs.some(i=>i.seq>seq&&i.actions.some(a=>a.kind==='group'&&a.value===1)&&window.presentationProbe.acked>=i.seq),actionStart),'queued group action really sent and authority acknowledged');
 assert.equal(await guest.evaluate(seq=>window.presentationProbe.inputs.filter(i=>i.seq>seq).flatMap(i=>i.actions).filter(a=>a.kind==='group'&&a.value===1).length,actionStart),1,'do not replay action edges');
 await until(()=>guest.evaluate(()=>document.querySelector('.lan-hud')?.dataset.group==='2'),'real group state reflected in HUD');
 json=false;stage('presentation: JSON to binary');
 await until(()=>binarySent>=10&&peer.loaded,'binary states after JSON',30000);
 await until(()=>guest.evaluate(tick=>window.presentationProbe.status?.tick>tick&&!document.querySelector('.lan-hud')?.inert,sustained.tick),'binary live render and input restored');
 const after=await guest.evaluate(()=>({generation:window.presentationProbe.generations.at(-1),tick:window.presentationProbe.status.tick,ack:window.presentationProbe.acked,fallbacks:window.presentationProbe.fallbacks}));
 await guest.evaluate(()=>{connection.send=window.originalConnectionSend;window.jsonFallback=false;});
 // Keep the per-socket sender through scene cleanup so a queued relay callback
 // cannot encounter a removed method; this test peer dies with the test room.
 return {start,sustained,after,sent,binarySent,queuedAction:{sequenceBefore:actionStart,sequenceWhileUnavailable:during,preserved:true},scope:'Real JSON wire stream on a reconnect negotiated without motion/delta, followed by real full binary states; production validation and consumption ACKs unchanged. Conversion overhead excluded from preceding timing window.'};
}
