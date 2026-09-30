import assert from 'node:assert/strict';
/** Runs only inside check-normal-multiplayer-browser's real headless room.
 * DOM dispatch is scoped to isolated pages; no OS input or visible window. */
export async function checkPresentationPage({pages,room,until,stage}) {
 const mode=page=>page.evaluate(()=>document.querySelector('.lan-canvas')?.dataset.presentation);
 assert.equal(await mode(pages[0]),'main','computing host must retain original renderer');
 assert.equal(await mode(pages[1]),'worker','guest must actually select production Worker');
 assert.equal(await mode(pages[2]),'main','startup failure must fall back');
 assert.equal(await pages[2].evaluate(()=>!!window.failedPresentationCanvas && window.failedPresentationCanvas!==document.querySelector('.lan-canvas') && !window.failedPresentationCanvas.isConnected),true,'React must replace the transferred canvas');
 const guest=pages[1];
 const ready=()=>guest.evaluate(()=>{const h=document.querySelector('.lan-hud');return h&&!h.inert&&window.presentationProbe.status?.ready;});
 await until(ready,'Worker controls enabled');
 stage('presentation: actual input + map');
 const before=await guest.evaluate(()=>({x:window.presentationProbe.status.telemetry.px,y:window.presentationProbe.status.telemetry.py,ack:window.presentationProbe.acked}));
 await guest.evaluate(()=>{const c=document.querySelector('.lan-canvas'),r=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent('mousemove',{clientX:r.left+r.width*.65,clientY:r.top+r.height*.3}));window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',cancelable:true}));});
 await until(()=>guest.evaluate(ack=>window.presentationProbe.inputs.some(i=>i.keys!==0&&i.seq>ack&&window.presentationProbe.acked>=i.seq),before.ack),'real held input acknowledged by authority');
 await guest.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',cancelable:true})));
 await until(()=>guest.evaluate(b=>Math.hypot(window.presentationProbe.status.telemetry.px-b.x,window.presentationProbe.status.telemetry.py-b.y)>.1,before),'authoritative player movement');
 const tab=()=>guest.evaluate(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'Tab',bubbles:true,cancelable:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'Tab',bubbles:true,cancelable:true}));});
 await tab();await until(()=>guest.locator('[aria-label="战术地图"]').count(),'Worker map command and UI revision');
 await tab();await until(async()=>await guest.locator('[aria-label="战术地图"]').count()===0,'Worker map close and UI revision');
 const commands=await guest.evaluate(()=>window.presentationProbe.commands);
 assert.ok(commands.length>=2&&commands.slice(-2).every(c=>c.accepted&&c.revision>0),'map commands require real accepted revisions');
 await tab();await until(()=>guest.locator('[aria-label="战术地图"]').count(),'map open across epoch revocation');
 stage('presentation: guest reconnect');
 const tick=room.lastTick,generation=await guest.evaluate(()=>window.presentationProbe.generations.at(-1));
 await guest.evaluate(()=>connection.socket.close(4000,'isolated presentation guest reconnect'));
 await until(()=>!room.peers[1].loaded,'guest disconnect observed',10000);
 await until(()=>room.peers.every(p=>p.loaded)&&room.lastTick>tick+20,'same battle fresh baseline',30000);
 await until(()=>guest.locator('[aria-label="战术地图"]').count(),'map republished after reconnect',30000);
 await tab();await until(async()=>await guest.locator('[aria-label="战术地图"]').count()===0,'map close after reconnect');
 await until(ready,'Worker input re-enabled after reconnect',30000);
 await until(()=>guest.evaluate(g=>window.presentationProbe.generations.at(-1)>g&&window.presentationProbe.status.tick>=0,generation),'new presentation generation');
 const after=await guest.evaluate(()=>({generation:window.presentationProbe.generations.at(-1),status:window.presentationProbe.status,ack:window.presentationProbe.acked,inputs:window.presentationProbe.inputs.slice(-4)}));
 assert.ok(after.status.tick>tick,'new baseline must advance, not reuse old UI');
 assert.equal(await mode(guest),'worker','reconnect must not silently replace render owner');
 return {host:'main',guest:'worker',fallback:'fresh React canvas after transfer failure',before,after,commands,reconnected:true};
}
