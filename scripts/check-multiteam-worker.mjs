/** Actual authority Worker -> JSON packets -> guest snapshots and playback, without a live room. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({headless: true, ...(process.env.BROWSER_PATH ? {executablePath: process.env.BROWSER_PATH} : {})});
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/__multiteam_worker_check.html', route => route.fulfill({contentType:'text/html', body:'<!doctype html><body></body>'}));
  await page.goto(`${process.env.COMBAT_TEST_URL ?? 'http://127.0.0.1:5173'}/__multiteam_worker_check.html`);
  const result = await page.evaluate(async (workerUrl) => {
    window.__LAN_BUILD_ID__ = 'worker-visibility-check';
    const {createLanWorld, setLanPerspective} = await import('/src/network/LanWorld.ts');
    const {applyCombatSnapshot} = await import('/src/network/CombatSnapshot.ts');
    const {lanTeamPresence} = await import('/src/network/LanBattleRoster.ts');
    const {SnapshotPlayback} = await import('/src/network/SnapshotPlayback.ts');
    const {assetManager} = await import('/src/engine/assets/AssetResolver.ts');
    const {contentManifestManager} = await import('/src/engine/content/ContentManifest.ts');
    await assetManager.ensureManifestLoaded(); await contentManifestManager.ensureLoaded();
    const match = {id:'worker-check',seed:918,hostId:'p0',snapshotHz:10,players:[{id:'p0',name:'host',seat:0,team:0,hull:'onslaught',design:null}],
      options:{aiHulls:[[],['paragon'],['onslaught'],['paragon'],['onslaught']],assignment:'teams',battleSize:2000,initialDeploymentLimit:60}};
    const world = createLanWorld(match), engine=world.engine, playback=new SnapshotPlayback();
    setLanPerspective(engine,world.controlled,0);
    const reserveMatch={...match,options:{...match.options,aiHulls:[['paragon'],...match.options.aiHulls.slice(1)]}};
    const reserveWorld=createLanWorld(reserveMatch).engine;
    const reserveRows=lanTeamPresence(reserveMatch,reserveWorld);
    const hostRow=reserveRows.find(r=>r.team===0);
    if(hostRow.total!==2||hostRow.deployed!==1||hostRow.reserve!==1||hostRow.missing!==0)throw Error('reserve diagnostic miscounts');
    const victim=reserveWorld.enemyShip;
    victim.isDead=true;
    if(lanTeamPresence(reserveMatch,reserveWorld).find(r=>r.team===victim.teamId).destroyed!==1)throw Error('loss diagnostic miscounts');
    victim.isDead=false;victim.isRetreated=true;
    if(lanTeamPresence(reserveMatch,reserveWorld).find(r=>r.team===victim.teamId).retreated!==1)throw Error('retreat diagnostic miscounts');
    victim.isRetreated=false;
    const removed=reserveWorld.reinforcements.pop();
    if(removed && !lanTeamPresence(reserveMatch,reserveWorld).some(r=>r.missing===1))throw Error('missing identity not diagnosed');
    const worker = new Worker(workerUrl,{type:'module'});
    const snapshots=[];
    try {
      await new Promise((resolve,reject)=>{
        const timeout = setTimeout(()=>reject(Error('Worker timed out; frames='+snapshots.length)),60000);
        const fail=error=>{clearTimeout(timeout);reject(error);};
        worker.onerror = event=>fail(Error(event.message));
        worker.onmessage=event=>{
          const m=event.data;
          if(m.type==='error')return fail(Error(m.message));
          if(m.type==='ready')worker.postMessage({type:'start'});
          if(m.type!=='snapshot')return;
          try {
            const frame=JSON.parse(m.json);
            playback.push(frame);
            const sample=playback.sample(frame.tick*1000/60,true);
            for(const f of sample.frames)applyCombatSnapshot(engine,f,sample.reset);
            const active=frame.deployment.rows.filter(r=>r.status==='deployed'||r.status==='retreating');
            const capitals=engine.capitalShips.filter(s=>!s.isDead&&!s.isDocked&&!s.isRetreated);
            const visible=capitals.filter(s=>s.isVisibleTo(engine.playerShip.teamId));
            const finite=capitals.every(s=>Number.isFinite(s.pos.x)&&Number.isFinite(s.pos.y));
            if(capitals.length!==active.length||visible.length!==active.length||!finite)throw Error(JSON.stringify({tick:frame.tick,active:active.length,capitals:capitals.length,visible:visible.length,finite}));
            if(new Set(capitals.map(s=>s.teamId)).size!==5)throw Error('missing team at tick '+frame.tick);
            if(lanTeamPresence(match,engine).some(r=>r.total!==1||r.known!==1||r.deployed!==1||r.visible!==1||r.missing))throw Error('live roster diagnostic mismatches');
            snapshots.push({tick:frame.tick,authority:active.length,client:capitals.length,visible:visible.length});
            worker.postMessage({type:'snapshot-consumed',tick:frame.tick});
            if(frame.tick>=180){clearTimeout(timeout);resolve();}
          }catch(error){fail(error);}
        };
        worker.postMessage({type:'init',match,hidden:false});
      });
    }finally{worker.terminate();}
    return {snapshots,mode:engine.openBattlefield};
  }, process.env.COMBAT_WORKER_URL ?? '/src/network/host.worker.ts?worker_file&type=module');
  assert.deepEqual(errors,[]); assert.ok(result.mode); assert.ok(result.snapshots.at(-1).tick>=180);
  console.log(JSON.stringify({...result,pageErrors:errors},null,2));
}finally{await browser.close();}
