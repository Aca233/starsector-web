import { checkRealtimePrimitives } from './lan-presentation-realtime-check.mts';
import { clientToCombatWorldInViewport } from '../../src/engine/runtime/PlayerControls';
import { Vector2 } from '../../src/engine/math/Vector2';
import { withoutBulkProjectiles } from '../../src/network/ProjectileBulkVariant.mjs';
import { ProjectileVisualReplica } from '../../src/network/ProjectileVisualReplica';
import { getGraphicsSettings, updateGraphicsSettings } from '../../src/engine/runtime/GraphicsSettings';
import { VISUAL_FRAGMENT_BYTES } from '../../src/network/ProjectileVisualPacket.mjs';
import { LanPresentationWorkerClient } from '../../src/network/LanPresentationWorkerClient';
import { idleWorkerControls } from '../../src/network/LanPresentationWorkerProtocol';
import { LanConnection } from '../../src/network/protocol';
import { createLanDisplayWorld } from '../../src/network/LanDisplayBootstrap';
import { decodeBinaryFrame, encodeBinaryState, encodeProjectedBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
import { encodeMotionFrame, motionToText } from '../../src/network/MotionFrame.mjs';
import { captureCriticalCombat } from '../../src/network/CriticalCombatReplica';
import { assets, base64, bytes } from './offscreen-presentation-page.mts';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const until=async(probe,message)=>{const end=performance.now()+10000;while(!probe()){if(performance.now()>end)throw Error(message);await new Promise(r=>setTimeout(r,5));}};
const config=syncId=>({...idleWorkerControls(),syncId,viewport:{width:640,height:360,rect:{left:0,top:0,width:640,height:360}},launched:true,synced:true,focused:true,blocked:false});
const surface=()=>{const c=document.createElement('canvas');c.width=640;c.height=360;document.body.append(c);return c;};
/** Uses the production entry URL/client, not the old test Worker's raw RPCs. */
export async function checkProductionPresentationWorker(data,url){
  await assets();const realtime=await checkRealtimePrimitives();const cases=[],pass=name=>cases.push(name),events=[],workerErrors=[],networkErrors=[],aux=[],views=[],sounds=[],motionAcks=[];
  const originalGraphics=getGraphicsSettings();updateGraphicsSettings({...originalGraphics,screenShake:.35});
  const source=createLanDisplayWorld(data.match,0,decodeBinaryFrame(bytes(data.cases[0].wire))).world;
  const motion=tick=>motionToText(encodeMotionFrame({tick,time:tick/60,acknowledged:{0:tick},ships:source.allCapitalShips.filter(s=>!source.deployment.isReserve(s.id)).map(s=>[s.id,s.pos.x+3,s.pos.y-2,s.vel.x,s.vel.y,s.facingRad,s.angularVelRad,s.teleportSequence,(s.isDead?1:0)|(s.isRetreated?2:0)])}));
  const combat=tick=>base64(captureCriticalCombat(source,tick,true));
  const canvas=surface(),connection=new LanConnection();let stateEvents=0,componentEvents=0,resetOnSound=false,viewsAtReset=0;
  const client=await LanPresentationWorkerClient.create(canvas,data.match,0,{
    onState:(value,parseMs)=>{check(connection.presentationConsumption.state>0,'State ACK preceded ancillary retention');aux.push({value,parseMs});},
    onMotionAcknowledged:ack=>{check(connection.presentationConsumption.motion>0,'Motion ACK preceded caller retention');motionAcks.push(ack);},
    onViews:(view,status)=>views.push({tick:status.tick,received:status.receivedTick,hp:view.hud.playerShip.hullHp,map:!!view.map.read().map}),
    playViewSound:value=>{sounds.push(value);if(resetOnSound){resetOnSound=false;viewsAtReset=views.length;connection.close(false);}},onError:error=>workerErrors.push(String(error)),
  });
  connection.subscribe(message=>{events.push(message);if(message.type==='state')stateEvents++;if(message.type==='motion'||message.type==='combat-state'||message.type==='projectile-visual')componentEvents++;if(message.type==='error')networkErrors.push(message.message);});
  const control=message=>check(connection.send({type:'test-control',message}),'Control send failed');
  const wire=(index,seq,changes={},omitProjectiles=false)=>{let frame={...decodeBinaryFrame(bytes(data.cases[index].wire)),...changes};if(omitProjectiles)frame=withoutBulkProjectiles(frame);const encoded=encodeProjectedBinaryFrame(frame,true);check(encoded,'Fixture binary fallback');check(connection.send({type:'test-wire',data:base64(encodeBinaryState(data.match.id,seq,encoded))}),'Wire send failed');};
  const stateAcks=()=>events.filter(m=>m.type==='test-ack').map(m=>m.seq);
  const components=()=>events.filter(m=>m.type==='test-component-ack');
  const sendComponent=(kind,tick,text)=>control({type:kind==='motion'?'motion':'combat-state',matchId:data.match.id,syncId:'production-worker',tick,data:text});
  const internal=client as any,actual=internal.worker.onmessage,held=[];
  let holdRetained=false,holdControls=false,holdUi=false;
  internal.worker.onmessage=event=>{
    if(holdRetained&&event.data.type==='retained'||holdControls&&event.data.type==='controls-applied'||holdUi&&event.data.type==='ui'){held.push(event);return;}
    actual(event);
  };
  const release=predicate=>{const index=held.findIndex(e=>predicate(e.data));check(index>=0,'Missing held reply');actual(held.splice(index,1)[0]);};
  const visualAcks=()=>events.filter(m=>m.type==='test-visual-ack');
  const visual=packet=>control({...packet,syncId:internal.session.components.syncId});
  const visualPackets=data.components.visualPackets,baseline=visualPackets.find(p=>p.kind==='baseline'),updates=visualPackets.filter(p=>p.kind==='update');
  let disposal;
  try{
    check(client.stats.phase==='ready','Native production Worker did not initialize');
    client.attach(connection);connection.connect(url,'production-presentation');await until(()=>connection.ready,'Welcome missing');
    check(connection.motionState&&connection.combatState,'Component capabilities not negotiated');
    control({type:'launch',matchId:data.match.id,syncId:'production-worker'});
    await until(()=>internal.session?.components?.syncId==='production-worker','Explicit session reset not installed');
    client.configure(config('production-worker'));await until(()=>!client.stats.pendingControls,'Controls not installed');
    wire(0,1,{acknowledged:{0:4},sounds:[{id:1,key:'fire',volume:.5,rate:1,pos:[1,2],extra:{mustNotTransfer:true}},{id:2,key:'x'.repeat(1000),volume:1,rate:1}]});
    await until(()=>stateAcks().includes(1)&&client.stats.status?.ready&&views.length,'Cold production owner did not render/publish');
    check(aux[0].value.acknowledged===4&&aux[0].value.sounds.length===2,'Ancillary data missing');
    check(!('extra' in aux[0].value.sounds[0])&&aux[0].value.sounds[1].key===''&&aux[0].value.sounds[1].id===2,'Ancillary projection/order changed');
    check(Object.keys(aux[0].value).sort().join(',')==='acknowledged,listener,sounds,tick','Full render graph leaked in retention');
    check(!stateEvents&&!componentEvents&&!('world' in client.views),'Default subscriber/world leak');pass('real production entry, raw decode/render, bounded auxiliary and UI-only return');

    const render=client.stats.renderConfiguration;
    check(render.context.alpha===false&&render.context.antialias===true&&render.context.powerPreference==='high-performance','Worker changed native context settings');
    check(render.layers.join(',')==='background,nebula,asteroid,trail,hull,weapon,beam,shield,explosion,identification','Worker omitted battle identification layer');
    check(client.stats.status.graphics.screenShake===.35,'Startup graphics preference not mirrored');
    updateGraphicsSettings({...originalGraphics,screenShake:.65});client.configure(config('production-worker'));
    await until(()=>client.stats.status?.graphics.screenShake===.65,'Changed preference not mirrored through bounded controls');
    pass('same page/Worker layer and actual WebGL attributes; explicit graphics preference mirroring');

    check(client.stats.realtimeMode==='shared','Cross-origin-isolated client did not use shared mode');
    await until(()=>!!client.readRealtime(),'First realtime frame missing');
    holdUi=true;await until(()=>held.some(e=>e.data.type==='ui'),'UI publication not intercepted');
    const oldHud=client.stats.status,firstRealtime=client.readRealtime(),oldViews=views.length;
    client.configure({...config('production-worker'),zoom:1.2,focused:false,blocked:true});
    await until(()=>client.readRealtime()?.zoom===1.2&&client.readRealtime()?.frame>=firstRealtime.frame+2,'Realtime progress depended on HUD receipt');
    check(client.stats.status===oldHud&&views.length===oldViews,'HUD advanced while its publication was held');
    const rect={left:31,top:79,width:320,height:180},pointer=[171,209],current=client.readRealtime();
    const expected=clientToCombatWorldInViewport({x:pointer[0],y:pointer[1]},{width:current.width,height:current.height,rect},new Vector2(current.cameraX,current.cameraY),current.zoom);
    const actions=[{id:99,kind:'target',aim:[9,8]}],operations=client.stats.pendingOperations,inputFromFrame=client.readInput(pointer,rect,91,2,true,actions);
    check(inputFromFrame.aim[0]===expected.x&&inputFromFrame.aim[1]===expected.y&&inputFromFrame.pointerActive,'Realtime input changed offset/high-DPI projection');
    const idleInput=client.readInput(null,rect,92,0,false,[]);check(idleInput.aim[0]===current.aimX&&idleInput.aim[1]===current.aimY&&!idleInput.pointerActive,'Inactive pointer lost same-frame authority aim');
    actions[0].aim[0]=777;check(inputFromFrame.actions[0].aim[0]===9&&client.stats.pendingOperations===operations,'Input building consumed/sent actions or retained caller references');
    holdUi=false;release(m=>m.type==='ui');client.configure(config('production-worker'));
    pass('shared same-frame camera/aim advances with HUD held; exact existing projection and no implicit input send');

    // The real fixture contains 173 projectiles and a multi-fragment baseline.
    // Partial fragment credit stays in transport, never grants baseline-ready.
    check(connection.visualState&&data.components.sizes[0].projectiles>0,'Real visual fixture/capability missing');
    const raw=bytes(baseline.data);check(raw.length>VISUAL_FRAGMENT_BYTES,'Expected a real multi-fragment baseline');
    const receivedBuffers=[],receiveVisual=client.receiveVisual.bind(client);
    client.receiveVisual=(packet,receipt)=>{const buffer=packet.data;receivedBuffers.push(buffer.byteLength);receiveVisual(packet,receipt);check(buffer.byteLength===0,'Visual body was cloned rather than transferred');};
    const parts=Math.ceil(raw.length/VISUAL_FRAGMENT_BYTES);holdRetained=true;
    for(let offset=0;offset<raw.length;offset+=VISUAL_FRAGMENT_BYTES)visual({...baseline,offset,total:raw.length,data:base64(raw.subarray(offset,offset+VISUAL_FRAGMENT_BYTES))});
    await until(()=>held.some(e=>e.data.kind==='visual')&&visualAcks().length===parts-1,'Visual fragments/owner reply missing');
    check(visualAcks().every(m=>m.status==='fragment')&&connection.presentationConsumption.visual===1&&receivedBuffers.join(',')===String(raw.length),'Fragment granted baseline credit or leaked a decoded graph');
    await until(()=>client.stats.status?.visual.tick===baseline.tick,'Actual Worker did not retain visual baseline');
    check(client.stats.status.visual.entities===data.components.sizes[0].projectiles,'Projectile count changed in Worker');
    release(m=>m.kind==='visual');holdRetained=false;
    await until(()=>visualAcks().length===parts,'Final baseline ACK missing');
    check(visualAcks().at(-1).status==='consumed'&&visualAcks().at(-1).offset===(parts-1)*VISUAL_FRAGMENT_BYTES,'Final baseline identity/status wrong');
    pass('complete visual buffer transfer; fragment ACK never grants baseline-ready before owner retention');

    client.configure({...config('production-worker'),focused:false,blocked:true});
    check((await client.views!.setMapOpen(true)).accepted,'Visual map setup failed');
    visual(updates[0]);await until(()=>visualAcks().some(m=>m.tick===updates[0].tick&&m.status==='consumed')&&client.stats.status?.visual.tick===updates[0].tick,'Map/focus incorrectly blocked projectile reception');
    check(client.stats.status.visual.entities===data.components.sizes.find(s=>s.tick===updates[0].tick).projectiles,'Visual update changed entity count');
    check((await client.views!.setMapOpen(false)).accepted,'Visual map cleanup failed');sounds.length=0;
    client.configure(config('production-worker'));
    const damaged=bytes(updates[1].data);damaged[damaged.length-1]^=1;
    visual({...updates[1],data:base64(damaged)});
    await until(()=>visualAcks().some(m=>m.tick===updates[1].tick&&m.status==='discarded'),'Invalid complete visual was not discarded');
    check(client.stats.phase==='ready'&&client.stats.status.visual.tick===updates[0].tick,'Bad visual poisoned the valid owner/anchor');
    visual(updates[1]);await until(()=>client.stats.status?.visual.tick===updates[1].tick&&visualAcks().some(m=>m.tick===updates[1].tick&&m.status==='consumed'),'Valid update could not reuse unchanged anchor');
    pass('projectiles continue under map/focus block; CRC failure atomically discards without losing the anchor');

    client.configure({...config('production-worker'),visible:false});check(client.readRealtime()===null,'Hidden main thread could read old coordinates');await until(()=>!client.stats.pendingControls,'Hide controls missing');
    visual(updates[2]);await until(()=>visualAcks().some(m=>m.tick===updates[2].tick&&m.status==='discarded'),'Hidden visual was consumed');
    client.configure(config('production-worker'));await until(()=>!client.stats.pendingControls,'Show controls missing');
    visual(updates[2]);await until(()=>client.stats.status?.visual.tick===updates[2].tick&&visualAcks().some(m=>m.tick===updates[2].tick&&m.status==='consumed'),'Resumed visual not retained');
    pass('hidden visual discard does not advance the anchor or lose a later valid update');

    // Hold actual completed Worker messages at the main event boundary. Posting,
    // decoding, applying and even UI publication alone cannot return LAN credits.
    holdRetained=true;wire(1,2,{},true);wire(2,3,{},true);
    sendComponent('motion',700,motion(700));sendComponent('motion',701,motion(701));sendComponent('combat',702,combat(702));
    await until(()=>held.filter(e=>e.data.type==='retained').length===5,'Retained replies missing');
    await until(()=>client.stats.status?.tick===602&&client.stats.status?.visual.renderEntities===data.components.sizes[3].projectiles,'Independent visual layer never reached the real render view');
    check(client.stats.status.visual.bulkEntities===0,'Test still contained full-world projectiles that could mask the missing visual lane');
    pass('after baseline-ready, real bulk-omitted snapshots draw the independent full projectile layer');
    check(stateAcks().join(',')==='1'&&!components().length&&connection.presentationConsumption.pending===5,'Early network ACK');
    const retainedStates=held.filter(e=>e.data.kind==='state').map(e=>e.data.id).sort((a,b)=>a-b);
    release(m=>m.kind==='state'&&m.id===retainedStates[1]);
    check(!stateAcks().includes(3),'Later cumulative state ACK overtook predecessor');
    release(m=>m.kind==='combat');await until(()=>components().length===1,'Combat blocked behind state/motion');
    check(components()[0].tick===702,'Wrong combat ACK');
    const motionIds=held.filter(e=>e.data.kind==='motion').map(e=>e.data.id).sort((a,b)=>a-b);
    release(m=>m.id===motionIds[1]);check(components().length===1,'Later cumulative motion overtook predecessor');
    release(m=>m.id===motionIds[0]);await until(()=>components().length===3,'Ordered motion ACK missing');
    check(components().filter(m=>m.kind==='motion-consumed').map(m=>m.tick).join(',')==='700,701','Wrong motion ACK order');
    const revokedViews=client.views!;
    control({type:'ended',matchId:data.match.id,report:{}});await new Promise(r=>setTimeout(r,30));
    check(!events.some(m=>m.type==='ended'),'Terminal overtook pending state');
    release(m=>m.kind==='state');await until(()=>events.some(m=>m.type==='ended'),'Terminal barrier never released');
    // The local terminal barrier resolves after send acceptance, before the
    // fixture peer's asynchronous ACK echo returns through the socket Worker.
    await until(()=>stateAcks().join(',')==='1,2,3','Terminal/cumulative ACK echo missing');
    check(!connection.presentationConsumption.pending,'Terminal retained delivery debt');holdRetained=false;
    check(motionAcks.join(',')==='701,700','Actual ACK metadata lost at reorder boundary');pass('post/retain alone cannot ACK; real lane independence, ordering and terminal barrier');

    control({type:'launch',matchId:data.match.id,syncId:'production-worker-2'});
    await until(()=>internal.session?.components?.syncId==='production-worker-2','New epoch missing');
    check(client.views===null&&!client.stats.status&&client.readRealtime()===null,'Old UI/realtime state remained accessible during reset');
    let revoked=false;try{void revokedViews.hud.playerShip;}catch{revoked=true;}
    check(revoked,'Previously issued UI view survived epoch reset');
    client.configure(config('production-worker-2'));wire(0,4);
    await until(()=>stateAcks().includes(4)&&client.stats.status?.tick===600&&client.stats.status?.ready,'Cold epoch did not accept lower tick');
    pass('explicit reconnect epoch clears UI/control capabilities and accepts fresh baseline');
    check(client.stats.status.visual.tick===-1,'Visual baseline crossed reconnect');
    const beforeVisual=visualAcks().length;client.configure({...config('production-worker-2'),minTick:updates[0].tick});
    visual(baseline);await until(()=>visualAcks().length===beforeVisual+1,'Old baseline credit missing');
    check(visualAcks().at(-1).status==='consumed'&&client.stats.status.visual.tick===-1,'Below-minimum base became display evidence');
    visual(updates[0]);await until(()=>client.stats.status?.visual.tick===updates[0].tick&&visualAcks().some(m=>m.syncId==='production-worker-2'&&m.tick===updates[0].tick&&m.status==='consumed'),'Retained old base did not decode eligible update');
    client.configure(config('production-worker-2'));
    pass('reset clears visual history; below-minTick base can decode a later eligible update');

    await until(()=>!client.stats.pendingControls&&!client.stats.queuedControls,'Visual setup controls did not drain');
    // One controls message in flight, one latest sample. Mutating caller-owned
    // config after configure must not rewrite the retained latest sample.
    holdControls=true;const sent=client.stats.controlsSent,graphicsBeforeControls=getGraphicsSettings();
    if(client.stats.controlMode==='shared')updateGraphicsSettings({screenShake:graphicsBeforeControls.screenShake===.375?.5:.375});
    client.configure({...config('production-worker-2'),zoom:.8});
    await until(()=>held.some(e=>e.data.type==='controls-applied'),'Controls reply not intercepted');
    for(let i=0;i<80;i++)client.configure({...config('production-worker-2'),zoom:1+i/100});
    const last={...config('production-worker-2'),zoom:1.35};client.configure(last);last.zoom=9;
    check(client.stats.controlsSent===sent+1&&client.stats.pendingControls,'Unbounded controls IPC queue');
    if(client.stats.controlMode==='shared'){
      await until(()=>client.readRealtime()?.zoom===1.35,'Shared controls waited for main receipt');
      check(!client.stats.queuedControls,'Ordinary shared controls queued a wake');
    }else check(client.stats.queuedControls,'Latest fallback control was not retained');
    holdControls=false;release(m=>m.type==='controls-applied');
    await until(()=>!client.stats.pendingControls&&client.stats.status?.zoom===1.35,'Latest copied control sample was not applied');
    check(client.stats.controlsSent===sent+(client.stats.controlMode==='shared'?1:2),'Intermediate pointer samples were queued');
    updateGraphicsSettings(graphicsBeforeControls);pass('bounded latest-only control transport and owned scalar copies');

    const input={seq:1,keys:0,aim:[2,3],firing:false,pointerActive:false,actions:[]};
    check(connection.send({type:'input',matchId:data.match.id,syncId:'production-worker-2',input}),'Actual input transport did not accept');
    check(await client.recordAcceptedInput(input,performance.now(),true),'Accepted input not recorded in owner');
    let bad=false;try{client.recordAcceptedInput({...input,aim:[NaN,0]},performance.now(),true);}catch{bad=true;}check(bad&&!client.stats.pendingOperations,'Invalid input crossed Worker boundary');
    pass('explicit successful-send input record and cross-realm clock path');
    const opened=await client.views!.setMapOpen(true);check(opened.accepted,'Remote map command failed');
    check(client.views!.hud.isTacticalMap&&!!client.views!.map.read().map,'Post-command UI not visible');
    check(sounds.length===0,'Map open added a sound absent from the existing presentation views');
    check((await client.views!.tactical({action:'select',unitId:client.views!.hud.playerShip.id})).accepted,'Remote selection failed');
    const closed=await client.views!.setMapOpen(false);check(closed.accepted,'Remote map close failed');
    check(sounds.map(s=>s.key).join(',')==='map_open,map_close','Command sound/afterRevision mismatch');
    const denied=await client.views!.tactical({action:'retreat',unitIds:[source.playerShip.id],full:true});check(!denied.accepted,'UI port granted authority');
    pass('real UI command + posterior UI revision + audio receipt; authority remains denied');

    // Stale queued data replies must not grant the newly installed epoch credits.
    holdRetained=true;wire(1,5);const oldVisualCount=visualAcks().length;visual(updates[1]);await until(()=>held.some(e=>e.data.kind==='state')&&held.some(e=>e.data.kind==='visual'),'Stale state/visual not held');
    const oldSession=internal.session;control({type:'launch',matchId:data.match.id,syncId:'production-worker-3'});
    await until(()=>internal.session?.epoch>oldSession.epoch,'Reset did not revoke old data');
    check(!client.stats.pendingDeliveries&&!connection.presentationConsumption.pending,'Reset kept delivery debt');
    release(m=>m.kind==='state');release(m=>m.kind==='visual');check(!stateAcks().includes(5)&&visualAcks().length===oldVisualCount,'Stale data reply ACKed new session');holdRetained=false;
    client.configure(config('production-worker-3'));wire(0,6);await until(()=>stateAcks().includes(6)&&client.stats.status?.ready,'Third epoch failed');
    pass('already-posted old data completion fenced by locally-issued session/receipt');
    check((await client.views!.setMapOpen(true)).accepted,'Reentrant command setup failed');
    resetOnSound=true;let commandRevoked=false;try{await client.views!.setMapOpen(false);}catch{commandRevoked=true;}
    check(commandRevoked&&client.stats.phase==='ready'&&!client.views&&!client.stats.status&&views.length===viewsAtReset,'UI callback reset published stale views or failed client');
    pass('sound callback can reset the real connection during UI apply without stale publication/credit');
    check(workerErrors.length===0&&networkErrors.length===0&&!stateEvents&&!componentEvents,'Unexpected normal-path errors/leaks');
    connection.close(false);disposal=await client.dispose();check(disposal.residentTextures===0&&disposal.pendingUploads===0,'Worker resources not released');
    check(await client.dispose()===disposal,'Dispose not idempotent');pass('graceful production Worker disposal and renderer resource release');
  }finally{connection.close(false);if(client.stats.phase!=='closed')await client.dispose().catch(()=>{});canvas.remove();updateGraphicsSettings(originalGraphics);}

  // The unchanged default subscriber path must still consume the same bytes via
  // the real codec and its original consumption receipts.
  const legacy=new LanConnection(),legacyEvents=[],legacyReplica=new ProjectileVisualReplica(data.match.id);
  let legacyBodies=0;
  legacy.subscribe((m,receipt)=>{
    legacyEvents.push(m);
    if(m.type==='projectile-visual'){
      legacyBodies++;try{legacyReplica.receive(m.key,m.kind,m.visualBytes,performance.now(),0);receipt.complete('consumed');}
      catch{receipt.complete('discarded');}
    }
  });
  try{
    legacy.connect(url,'default-visual');await until(()=>legacy.ready,'Default receiver welcome missing');
    legacy.send({type:'test-control',message:{type:'launch',matchId:data.match.id,syncId:'default-visual'}});
    for(const packet of [baseline,updates[0],updates[1]])legacy.send({type:'test-control',message:{...packet,syncId:'default-visual'}});
    await until(()=>legacyEvents.filter(m=>m.type==='test-visual-ack').length===3,'Default visual consumption missing');
    check(legacyBodies===3&&legacyReplica.stats().tick===updates[1].tick&&legacyReplica.stats().entities===data.components.sizes[2].projectiles,'Default visual subscriber/replica changed');
    check(legacyEvents.filter(m=>m.type==='test-visual-ack').every(m=>m.status==='consumed')&&!legacy.presentationConsumption.pending,'Default receipts did not drain');
    pass('default no-owner route still uses the same bytes/real replica and consumption receipts');
  }finally{legacy.close(false);legacyReplica.clear();}

  // Malformed full component body: header admission succeeds, actual owner codec
  // fails. No unearned receipt and no restart of that poisoned Worker.
  const c=surface(),badConnection=new LanConnection(),badEvents=[],badErrors=[];let badClient;
  try{
    badClient=await LanPresentationWorkerClient.create(c,data.match,0,{onState:()=>{},playViewSound:()=>{},onError:e=>badErrors.push(String(e))},{realtime:'messages'});
    badClient.attach(badConnection);badConnection.subscribe(m=>badEvents.push(m));badConnection.connect(url,'bad-production-worker');await until(()=>badConnection.ready,'Bad-test welcome');
    badConnection.send({type:'test-control',message:{type:'launch',matchId:data.match.id,syncId:'bad'}});
    await until(()=>(badClient as any).session?.components?.syncId==='bad','Bad-test epoch');badClient.configure(config('bad'));
    badConnection.send({type:'test-wire',data:base64(encodeBinaryState(data.match.id,1,bytes(data.cases[0].wire)))});
    await until(()=>badClient.stats.status?.ready,'Bad-test baseline');
    check(badClient.stats.realtimeMode==='messages','Explicit non-shared fallback not selected');
    await until(()=>!!badClient.readRealtime(),'Fallback frame missing');
    const fallback=badClient as any,deliver=fallback.worker.onmessage,heldRealtime=[];let holdRealtime=true;
    fallback.worker.onmessage=event=>{if(holdRealtime&&event.data.type==='realtime'&&event.data.packet.frame){heldRealtime.push(event);return;}deliver(event);};
    await until(()=>heldRealtime.length===1,'Fallback packet not intercepted');
    const oldRealtime=heldRealtime[0],oldFrame=oldRealtime.data.packet.frame.frame;
    badClient.configure({...config('bad'),zoom:1.4});await new Promise(r=>setTimeout(r,300));
    check(heldRealtime.length===1&&badClient.readRealtime()===null,'Fallback queued frames or reused an expired sample');
    holdRealtime=false;deliver(heldRealtime[0]);await until(()=>badClient.readRealtime()?.zoom===1.4,'Fallback did not deliver latest coordinates after receipt');
    check(badClient.readRealtime().frame>oldFrame+1,'Fallback replayed intermediate history');
    const stopping=badClient.stop();check(badClient.readRealtime()===null,'Stop exposed an old realtime input sample');
    check(await stopping,'Production Worker did not stop');
    badConnection.resetPresentationConsumption();check(badClient.readRealtime()===null,'New generation exposed old fallback');
    deliver(oldRealtime);check(badClient.readRealtime()===null,'Late fallback frame crossed generation');
    badClient.configure(config('bad'));badConnection.send({type:'test-wire',data:base64(encodeBinaryState(data.match.id,2,bytes(data.cases[0].wire)))});
    await until(()=>badClient.stats.status?.ready&&!!badClient.readRealtime(),'Fallback fresh epoch not restored');
    pass('real non-shared fallback: one in-flight, latest-only, expiry and old-generation fencing');
    const text=motion(710);badConnection.send({type:'test-control',message:{type:'motion',matchId:data.match.id,syncId:'bad',data:text.slice(0,-4)+'!!!!'}});
    await until(()=>badClient.stats.phase==='closed','Bad component did not fail closed');
    check(badErrors.length===1&&badClient.readRealtime()===null&&!badEvents.some(m=>m.type==='test-component-ack')&&!badConnection.presentationConsumption.pending,'Bad component granted ACK or leaked debt');
    const closedOwner=badClient as any;let resetRejected=false;
    try{badClient.reset({...closedOwner.session,epoch:closedOwner.session.epoch+1});}catch{resetRejected=true;}
    let unearned=0,rejected=0;const receipt={defer:()=>{},complete:()=>{unearned++;return true;},reject:()=>{rejected++;}};
    badClient.receive({owner:'stale',epoch:0} as any,receipt);
    badClient.receiveComponent({owner:'stale',epoch:0} as any,receipt);
    badClient.receiveVisual({owner:'stale',epoch:0} as any,receipt);
    check(resetRejected&&unearned===0&&rejected===3,'Failed owner revived or discarded with unearned credit');
    badConnection.close(false);await badClient.dispose().catch(()=>{});
    check(closedOwner.release===null,'Explicit failed-client disposal kept network claim');
    pass('header admission cannot bypass full owner codec; failed owner cannot reset or grant stale ACK');
  }finally{badConnection.close(false);if(badClient&&badClient.stats.phase!=='closed')await badClient.dispose().catch(()=>{});c.remove();}
  return {cases,realtime,workerErrors,networkErrors,disposal,auxiliaryCount:aux.length,uiPublications:views.length,stateAcks:stateAcks(),motionAcks,visualAcks:visualAcks(),visualFixture:data.components.sizes.slice(0,4),
    scope:'Actual production Worker + LAN connection/socket-I/O, loopback fixture peer. Main-thread raw forwarding remains; not default LanBattle or a latency benchmark.'};
}
