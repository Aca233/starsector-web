// Extends the existing headless Offscreen scenario. Calls capabilities directly;
// never injects keyboard/mouse or gives the receive world simulation authority.
import { LanPresentationCommandClient, LanPresentationCommandOwner, guardLanViewCommand } from '../../src/network/LanPresentationCommands';
import { LanPresentationUiPublisher } from '../../src/network/LanPresentationUiTransport';
import { createLanPresentationViews } from '../../src/network/LanPresentationViews';
import { createLanDisplayWorld } from '../../src/network/LanDisplayBootstrap';
import { decodeBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
import { assets, bytes } from './offscreen-presentation-page.mts';
const check=(ok,why)=>{if(!ok)throw Error(why);};
const tick=()=>Promise.resolve();
const caught=p=>p.then(value=>({value}),error=>({error:String(error)}));
function harness(data, timeout=6000, sendOverride) {
 const frame=decodeBinaryFrame(bytes(data.cases[0].wire)),world=createLanDisplayWorld(data.match,0,frame).world;
 const views=createLanPresentationViews(data.match,world),ui=[],results=[],requests=[],audio=[],errors=[];
 const publisher=new LanPresentationUiPublisher(()=>views.captureForTransfer(),(packet,transfer)=>ui.push(structuredClone(packet,{transfer})),e=>errors.push(String(e)));
 const owner=new LanPresentationCommandOwner(publisher,()=>views,()=>frame.tick,reply=>results.push(structuredClone(reply)),e=>errors.push(String(e)));
 let client;client=new LanPresentationCommandClient(owner.session,request=>sendOverride?sendOverride(request,client):requests.push(structuredClone(request)),sound=>audio.push(sound),e=>errors.push(String(e)),timeout);
 const receiveResults=()=>{while(results.length)client.receiveResult(results.shift());};
 const consume=()=>{const packet=ui.shift();check(packet,'Missing UI packet');const receipt=client.receiveUi(packet);check(receipt,'UI session rejected');return receipt;};
 const acknowledge=receipt=>{const transferred=structuredClone(receipt,{transfer:[receipt.buffer]});check(receipt.buffer.byteLength===0,'UI receipt not transferred');check(owner.completeUi(transferred),'UI credit not completed');};
 owner.publish();acknowledge(consume());
 return {world,views,publisher,owner,client,ui,results,requests,audio,errors,consume,acknowledge,receiveResults,close(){client.close();owner.close();views.dispose();}};
}
export async function checkPresentationCommands(data) {
 await assets();
 const h=harness(data);let cases=0;
 try {
  check(!(h.views.setMapOpen(false) instanceof Promise),'Default command became async');cases++;
  h.owner.publish(); // An older UI frame is already in flight before the command.
  let done=false;const opened=h.client.views.setMapOpen(true).then(result=>{done=true;return result;});
  check(!h.world.isTacticalMap&&!done,'Request treated as execution');
  h.owner.receive(h.requests.shift());h.receiveResults();await tick();
  check(h.world.isTacticalMap&&!done&&h.owner.stats.dirty,'Execution alone was presented as success');
  const old=h.consume();await tick();check(!done,'Pre-command UI satisfied receipt');
  h.acknowledge(old);check(h.ui.length===1,'No bounded refresh after old UI completion');
  const current=h.consume();check((await opened).accepted&&h.client.views.map.read().map,'Accepted open lacks actual map');h.acknowledge(current);cases++;
  const player=h.world.playerShip.id;
  const selected=h.client.views.tactical({action:'select',unitId:player});const request=h.requests.shift();h.owner.receive(request);
  // UI and result may be delivered in either order, but both are required.
  let selectedDone=false;void selected.then(()=>{selectedDone=true;});const selectedUi=h.consume();await tick();check(!selectedDone&&h.audio.length===0,'UI alone confirmed selection');
  h.receiveResults();check((await selected).accepted,'Friendly selection rejected');
  check(h.client.views.map.read().map.selectedUnitId===player,'Selected view stale');
  check(h.audio.length===1&&h.audio[0].key==='map_open'&&h.audio[0].volume===.8,'Selection sound changed');
  const floating=h.world.floatingTexts.length;h.owner.receive(request);h.receiveResults();
  check(h.world.floatingTexts.length===floating&&h.audio.length===1,'Duplicate command repeated effects');h.acknowledge(selectedUi);cases++;
  const enemy=h.client.views.tactical({action:'select',unitId:h.world.enemyShip.id});h.owner.receive(h.requests.shift());h.receiveResults();check(!(await enemy).accepted&&h.audio.length===1,'Enemy selection bypassed owner');cases++;
  const stale=h.client.views.tactical({action:'select',unitId:player});h.world.playerShip.isRetreated=true;h.owner.receive(h.requests.shift());h.receiveResults();check(!(await stale).accepted,'Departure after submit was not revalidated');h.world.playerShip.isRetreated=false;cases++;
  for(const action of [{action:'retreat',unitIds:[player],full:true},{action:'order',unitId:player,order:{type:'ENGAGE',targetShipId:h.world.enemyShip.id}},{action:'target',targetId:h.world.enemyShip.id}]){
   check(!(await h.client.views.tactical(action)).accepted&&h.requests.length===0,'Gameplay authority escaped read port');cases++;
  }
  const clear=h.client.views.tactical({action:'select',unitId:null});h.owner.receive(h.requests.shift());h.receiveResults();const clearUi=h.consume();check((await clear).accepted,'Clear selection failed');h.acknowledge(clearUi);
  check(h.audio.at(-1).key==='command_deselect'&&h.audio.at(-1).volume===.7,'Clear sound changed');cases++;
  const closing=h.client.views.tactical({action:'close'});h.owner.receive(h.requests.shift());h.receiveResults();const closedUi=h.consume();check((await closing).accepted&&h.client.views.map.read().map===null,'Close success still exposed map');h.acknowledge(closedUi);
  check(h.audio.at(-1).key==='map_close'&&h.audio.at(-1).volume===.85,'Close sound changed');cases++;
  const abandoned=caught(h.client.views.setMapOpen(true)),oldRequest=h.requests.shift(),oldEpoch=h.client.views.commandEpoch;
  h.owner.reset();check(h.client.reset(h.owner.session),'Client failed to reset');check((await abandoned).error&&h.client.views.commandEpoch>oldEpoch,'Reset did not reject pending operation');
  check(!h.owner.receive(oldRequest),'Old command crossed reset');h.owner.publish();h.acknowledge(h.consume());cases++;
  // A fulfilled Promise can still have an unrun continuation when reset happens.
  const guarded=guardLanViewCommand(h.views,()=>Promise.resolve({accepted:true}));h.views.invalidateCommands();check(!(await guarded).accepted,'Stale UI continuation succeeded');cases++;
  const pending=Array.from({length:16},()=>caught(h.client.views.setMapOpen(true)));
  check(!(await h.client.views.setMapOpen(false)).accepted&&h.client.stats.pending===16&&h.requests.length===16,'Command admission is unbounded');
  h.client.close();check((await Promise.all(pending)).every(r=>r.error)&&h.client.stats.pending===0,'Close leaked command promises');cases++;
 } finally {h.close();}
 const timed=harness(data,15);
 try {const p=caught(timed.client.views.setMapOpen(true));await new Promise(r=>setTimeout(r,30));check((await p).error.includes('操作状态未知')&&timed.client.stats.closed,'Timeout pretended cancellation/acceptance');cases++;}finally{timed.close();}
 const throwing=harness(data,6000,(request,client)=>{
  client.receiveResult({...request,result:{accepted:true},afterRevision:1,sounds:[]});throw Error('send failed after callback');
 });
 try{check((await caught(throwing.client.views.setMapOpen(true))).error&&throwing.client.stats.closed,'Synchronous callback bypassed send failure');cases++;}finally{throwing.close();}
 for(const kind of ['gap','conflict','malformed-reply']){
  const bad=harness(data);
  try{
   const p=caught(bad.client.views.setMapOpen(true)),request=bad.requests.shift();let rejected=false;
   try{
    if(kind==='gap')bad.owner.receive({...request,id:2});
    else if(kind==='conflict'){bad.owner.receive(request);bad.owner.receive({...request,operation:{kind:'map',open:false}});}
    else bad.client.receiveResult({...request,result:{accepted:true},afterRevision:0,sounds:[]});
   }catch{rejected=true;}
   check(rejected,kind+' was accepted');bad.client.close();check((await p).error,kind+' reported success');cases++;
  }finally{bad.close();}
 }
 // At most 16 idempotence entries; stale evicted IDs never execute again.
 const bounded=harness(data);
 try{
  for(let id=1;id<=24;id++){const p=bounded.client.views.setMapOpen(id%2===0);bounded.owner.receive(bounded.requests.shift());bounded.receiveResults();const ack=bounded.consume();await p;bounded.acknowledge(ack);}
  check(bounded.owner.stats.retainedReplies===16&&!bounded.owner.receive({...bounded.owner.session,id:1,operation:{kind:'map',open:false}}),'Unbounded replay cache or evicted replay executed');cases++;
 }finally{bounded.close();}
 return {cases,synchronousDefault:true,executionAndUiBarrier:true,arrivalOrders:true,observerOnly:true,ownerRevalidation:true,
  idempotentEffects:true,audioOnce:true,epochRevocation:true,unknownOutcomeTimeout:true,boundedRequests:16,boundedReplies:16,guardedContinuation:true,inputEvents:false};
}

export async function checkPresentationCommandWorker(request) {
 const initial=await request({type:'commands-open'}),audio=[],errors=[],requests=[];
 const client=new LanPresentationCommandClient(initial.session,r=>requests.push(r),sound=>audio.push(sound),e=>errors.push(String(e)));
 const apply=result=>{
  for(const reply of result.replies??[])client.receiveResult(reply);
  return result.packet?client.receiveUi(result.packet):null;
 };
 const ack=async receipt=>{
  const result=await request({type:'commands-ack',receipt},[receipt.buffer]);check(receipt.buffer.byteLength===0,'Worker UI buffer not returned');return result;
 };
 try {
  const bootstrap=apply(initial);let finished=false;const opening=client.views.setMapOpen(true).then(r=>{finished=true;return r;});
  const executed=await request({type:'commands-receive',request:requests.shift()});apply(executed);await tick();
  check(executed.state.map&&!finished&&!executed.packet,'Worker execution bypassed old UI credit');
  const next=await ack(bootstrap),newAck=apply(next);check((await opening).accepted&&client.views.map.read().map,'Actual Worker map not received');await ack(newAck);
  const selected=client.views.tactical({action:'select',unitId:client.views.hud.playerShip.id}),selectionRequest=requests.shift();
  const selection=await request({type:'commands-receive',request:selectionRequest});const selectedAck=apply(selection);check((await selected).accepted,'Worker selection rejected');await ack(selectedAck);
  const duplicate=await request({type:'commands-receive',request:selectionRequest});apply(duplicate);
  check(duplicate.state.floating===selection.state.floating&&audio.length===1,'Worker replay repeated floating text/audio');
  const closing=client.views.tactical({action:'close'}),closeResult=await request({type:'commands-receive',request:requests.shift()});const closeAck=apply(closeResult);check((await closing).accepted&&client.views.map.read().map===null,'Worker close not applied');await ack(closeAck);
  const pending=caught(client.views.setMapOpen(true)),old=requests.shift();const reset=await request({type:'commands-reset'});client.reset(reset.session);check((await pending).error,'Worker reset left a pending promise');
  const late=await request({type:'commands-receive',request:old});check(!late.accepted,'Worker accepted old-epoch input');
  const published=await request({type:'commands-publish'});await ack(apply(published));
  check(audio.map(x=>x.key).join(',')==='map_open,map_close'&&errors.length===0,'Worker audio relay mismatch');
  const ended=await request({type:'commands-close'});check(ended.closed,'Worker command owner remained open');
  return {actualWorker:true,oldUiCreditBarrier:true,selectionAndClose:true,idempotentFloatingAndAudio:true,reset:true,audio:audio.map(x=>({key:x.key,volume:x.volume})),errors};
 }finally{client.close();await request({type:'commands-close'});}
}
