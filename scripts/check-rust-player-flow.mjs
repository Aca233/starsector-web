import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
const root=process.cwd(),args=process.argv.slice(2),option=(flag,fallback)=>{const at=args.indexOf(flag);return at<0?fallback:args[at+1];};
if(args.includes('--out')&&(!option('--out')||option('--out').startsWith('--')))throw Error('--out requires a path');
const out=path.resolve(option('--out','artifacts/rust-combat-core-20261008/verification-player-flow'));fs.mkdirSync(out,{recursive:true});
const wasmPath=path.resolve(option('--wasm','public/game-assets/runtime/combat-core.wasm'));
const bytes=fs.readFileSync(wasmPath),sha256=createHash('sha256').update(bytes).digest('hex');
const require=createRequire(import.meta.url),{chromium}=require(require.resolve('playwright',{paths:[root,'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const server=await createServer({root,configFile:path.join(root,'vite.combat.config.ts'),server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
let browser;
try{
  await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:720}});
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));page.on('console',event=>{if(event.text().startsWith('RUST-FLOW '))console.log(event.text());});
  await page.route('**/__rust_player_flow.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"><canvas id="combat" width="1280" height="720"></canvas></body></html>'}));
  // Optional artifact input exercises the actual production loader against this
  // exact digest; the final run uses the installed shared browser/desktop assets.
  if(args.includes('--wasm')){
    await page.route('**/game-assets/runtime/combat-core.wasm',route=>route.fulfill({contentType:'application/wasm',body:bytes}));
    await page.route('**/game-assets/runtime/combat-core.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,bytes:bytes.length,sha256})}));
  }
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__rust_player_flow.html`);
  const result=await page.evaluate(async({sha256,mode})=>{
    await(await import('/src/engine/modding/ShipPackBootstrap.ts')).initializeShipPacks();
    const {LocalWorkerHost}=await import('/src/engine/runtime/local/LocalWorkerHost.ts');
    const {contentRegistry}=await import('/src/engine/content/ContentRegistry.ts');
    const {runtimeShipPacks}=await import('/src/engine/modding/ShipPackCatalog.ts');
    const {validateShipPack}=await import('/src/engine/modding/ShipPackValidation.ts');
    const {sameReplayWitness,copyReplayCheckpoint}=await import('/src/engine/runtime/local/CombatReplayCheckpoint.ts');
    const {LOCAL_COMBAT_PROTOCOL}=await import('/src/engine/runtime/local/LocalCombatProtocol.ts');
    const {simulationRoster}=await import('/src/engine/content/SimulationCatalog.ts');
    const {createFleetMember}=await import('/src/engine/game/CombatHandoff.ts');
    const {Ship}=await import('/src/engine/simulation/Ship.ts');
    const {modManager}=await import('/src/engine/modding/ModManager.ts');
    const packs=runtimeShipPacks();
    const fits=packs.flatMap(pack=>validateShipPack(pack,false,packs).compiled.map((spec,i)=>{
      const hull='rust-flow-fit-'+pack.id+'-'+i;
      modManager.registerShip({...spec,id:hull,sourceHullId:spec.sourceHullId??spec.id},{requireBundledAssets:false});
      return{pack:pack.id,hull,sourceHull:spec.id,variant:pack.variants[i].id};
    }));
    const content={ships:contentRegistry.getAllShips(),weapons:contentRegistry.getAllWeapons(),packs};
    const cases=[],failures=[],hosts=new Set();let transactions=0,strict=0,geometry=0,maximumDifference=0;
    const sample={autopilot:false,blocked:false,keys:{},aim:[0,-1500],firing:false,mouseSteering:false,pointerActive:true};
    const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);
    const compare=(a,b,label)=>{
      if(a.tick!==b.tick||a.witness.length!==b.witness.length)throw Error(label+': tick/witness layout differs');
      if(canonical(a.results)!==canonical(b.results))throw Error(label+': command receipt differs '+canonical(a.results)+'/'+canonical(b.results));
      const geometric=new Set([8,9,10,11,12,16,17]);
      a.witness.forEach((value,i)=>{if(geometric.has(i)){geometry++;const d=Math.abs(value-b.witness[i]);maximumDifference=Math.max(maximumDifference,d);if(d>Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(value),Math.abs(b.witness[i]))))throw Error(`${label}: geometry[${i}] ${value}/${b.witness[i]}`);}
        else{strict++;if(!Object.is(value,b.witness[i]))throw Error(`${label}: strict[${i}] ${value}/${b.witness[i]}`);}});
      const audioGeometry=(actual,expected,path)=>{
        if(typeof actual==='number'&&typeof expected==='number'){
          if(/\.(position|listener)\[\d+\]$/.test(path)){geometry++;const difference=Math.abs(actual-expected);maximumDifference=Math.max(maximumDifference,difference);if(difference>Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(actual),Math.abs(expected))))throw Error(path+': geometry '+actual+'/'+expected);}
          else{strict++;if(!Object.is(actual,expected))throw Error(path+': strict '+actual+'/'+expected);}return;
        }
        if(actual&&expected&&typeof actual==='object'&&typeof expected==='object'){
          const keys=Object.keys(actual),other=Object.keys(expected);if(Array.isArray(actual)!==Array.isArray(expected)||keys.length!==other.length||keys.some(k=>!other.includes(k)))throw Error(path+': audio layout differs');
          for(const key of keys)audioGeometry(actual[key],expected[key],Array.isArray(actual)?path+'['+key+']':path+'.'+key);return;
        }strict++;if(!Object.is(actual,expected))throw Error(path+': audio value differs '+actual+'/'+expected);
      };
      audioGeometry(a.audio,b.audio,label+'.audio');
      const own=a.presentation.hud.read.playerShip,other=b.presentation.hud.read.playerShip;
      for(const key of ['hullHp','currentCR','selectedGroupIndex','fighterRecall','fireControlMode']){strict++;if(!Object.is(own[key],other[key]))throw Error(label+': player '+key+' differs');}
      if(own instanceof Ship||a.presentation.view.playerShip instanceof Ship)throw Error('Presentation hydrated an executable Ship');
    };
    const host=async config=>{const h=new LocalWorkerHost({...config,content,multicore:false,presentation:'render-strict'});hosts.add(h);await h.ready;return h;};
    const pair=async config=>{const a=await host({...config,backend:'rust-wasm'}),b=await host({...config,backend:'typescript'});if(a.latest.authority.kind!=='rust-wasm'||a.latest.authority.sha256!==sha256)throw Error('Production Worker did not acknowledge this Rust artifact');compare(a.latest,b.latest,'cold');return[a,b];};
    const commands=async(pair,edges,label)=>{const frames=await Promise.all(pair.map(h=>h.commands(edges)));transactions+=2;compare(...frames,label);return frames;};
    const step=async(pair,input,label)=>{const frames=await Promise.all(pair.map(h=>h.step(input)));transactions+=2;compare(...frames,label);return frames;};
    const close=pair=>pair.forEach(h=>{h.dispose();hosts.delete(h);});
    const run=async(label,fn)=>{try{const details=await fn();cases.push({label,...details});console.log('RUST-FLOW '+label+' passed');}catch(error){failures.push({label,error:String(error),stack:error?.stack});console.log('RUST-FLOW '+label+' FAILED '+String(error));}};
    try{
      if(mode==='render'){
        const {WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
        const {VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
        const {Vector2}=await import('/src/engine/math/Vector2.ts');
        const {assemblySpriteLayout}=await import('/src/engine/content/ModuleGeometry.ts');
        const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');
        const {contentManifestManager}=await import('/src/engine/content/ContentManifest.ts');
        await assetManager.ensureManifestLoaded();await contentManifestManager.ensureLoaded();
        window.__rustRenderImages=[];
        for(const fit of fits)await run('render:'+fit.pack+':'+fit.hull,async()=>{
          const p=await pair({playerHull:fit.hull,enemyHull:fit.hull,seed:917});const renderers=[];
          try{
            await commands(p,[{kind:'ship',command:{kind:'shield'}}],'render-shield');
            const frames=[];
            for(const h of p){
              const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
              const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 unavailable');
              const renderer=new WebGLCombatRenderer(canvas,gl);renderers.push(renderer);
              const view=h.latest.presentation.view;await renderer.prepareAssets(view);
              const layout=assemblySpriteLayout(view.playerShip.spec),zoom=Math.min(.65,720*.68/Math.max(layout.width,layout.height));
              const frame={visualTime:0,random:new VisualRandom(917),layers:new Set(['background','nebula','asteroid','trail','hull','weapon','beam','shield','explosion']),damageEnabled:true};
              renderer.updateVisual(view,0,frame);
              if(!renderer.render(view,1,new Vector2(view.playerShip.pos.x,view.playerShip.pos.y),zoom,frame))throw Error('Renderer refused complete frame');
              const pixels=new Uint8Array(1280*720*4);gl.readPixels(0,0,1280,720,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
              const code=gl.getError();if(code!==gl.NO_ERROR)throw Error('WebGL error '+code);
              const colors=new Set();for(let i=0;i<pixels.length;i+=64)colors.add(pixels[i]+','+pixels[i+1]+','+pixels[i+2]);
              const stats=renderer.getResourceStats();if(colors.size<16||stats.drawCalls<1||stats.residentTextures<1)throw Error('Blank or incomplete combat canvas');
              frames.push({pixels,stats,colors:colors.size,png:canvas.toDataURL('image/png').split(',')[1]});
            }
            let differentPixels=0,maximumChannelDifference=0;
            for(let i=0;i<frames[0].pixels.length;i+=4){let different=false;for(let c=0;c<3;c++){const d=Math.abs(frames[0].pixels[i+c]-frames[1].pixels[i+c]);maximumChannelDifference=Math.max(maximumChannelDifference,d);different||=d>0;}differentPixels+=+different;}
            window.__rustRenderImages.push({id:fit.hull,rust:frames[0].png,source:frames[1].png});
            return{drawCalls:frames[0].stats.drawCalls,textures:frames[0].stats.residentTextures,colors:frames[0].colors,differentPixels,maximumChannelDifference};
          }finally{renderers.forEach(r=>r.dispose());close(p);}
        });
      }
      if(mode==='all'||mode==='startup')for(const fit of fits)await run('fit:'+fit.pack+':'+fit.hull,async()=>{
        const p=await pair({playerHull:fit.hull,enemyHull:fit.hull,seed:917});try{
          await commands(p,[{kind:'ship',command:{kind:'shield'}}],'shield');
          for(let tick=0;tick<12;tick++)await step(p,{...sample,keys:tick<4?{}:{KeyW:true},firing:tick>=4},'tick'+tick);
          await commands(p,[{kind:'stop-firing'},{kind:'clear-input'},{kind:'toggle-map'}],'pause-edges');
          if(p[0].latest.tick!==12)throw Error('Paused edge advanced authority');return{ticks:12};
        }finally{close(p);}
      });
      const hull=fits.find(f=>f.pack==='foundry.zhuyuan')?.hull??fits[0].hull;
      if(mode==='all'||mode==='dynamic')await run('simulator-deployment-and-recovery',async()=>{
        const p=await pair({playerHull:hull,enemyHull:hull,seed:917,simulationPointLimit:20000});try{
          const sourceHull=fits.find(f=>f.hull===hull).sourceHull;
          const options=simulationRoster(),enemy=options.find(o=>o.spec.id===sourceHull&&o.origin==='default')??options.find(o=>o.spec.id===sourceHull);if(!enemy)throw Error('Missing authored simulation fit');
          await commands(p,[{kind:'deployment',command:{kind:'simulation-wave',ally:[],enemy:[enemy.id]}}],'first-enemy-wave');
          await commands(p,[{kind:'deployment',command:{kind:'simulation-limit',limit:1}}],'rejected-budget');
          if(p[0].latest.results[0].accepted||p[0].status!=='ready')throw Error('Budget rejection killed Worker');
          await commands(p,[{kind:'add-ship',hull,isPlayer:true,position:[800,1700],facing:-Math.PI/2}],'ordinary-reinforcement');
          await commands(p,[{kind:'tactical',command:{action:'close'}}],'close-map');
          for(let tick=0;tick<12;tick++)await step(p,{...sample,keys:{KeyW:true}},'sim-tick'+tick);
          const checkpoint=p[0].checkpoint(),saved=copyReplayCheckpoint(checkpoint,LOCAL_COMBAT_PROTOCOL);
          const restored=new LocalWorkerHost(saved.config,90000,saved);hosts.add(restored);const frame=await restored.ready;
          if(!sameReplayWitness(frame.witness,saved.witness)||frame.audio.length)throw Error('Recovery witness or audio differs');
          const continued=await restored.step(sample),expected=await p[0].step(sample);transactions+=2;
          if(!sameReplayWitness(continued.witness,expected.witness))throw Error('Recovered authority continuation differs');
          restored.dispose();hosts.delete(restored);
          const changed=structuredClone(saved);changed.authority.sha256='0'.repeat(64);let refused=false;
          const bad=new LocalWorkerHost(changed.config,90000,changed);hosts.add(bad);try{await bad.ready;}catch{refused=true;}finally{bad.dispose();hosts.delete(bad);}
          if(!refused)throw Error('Changed Wasm replay was accepted');return{ticks:13,recovery:true,digestRefusal:true};
        }finally{close(p);}
      });
      if(mode==='game-session')await run('actual-game-session-save-once',async()=>{
        const {GameSession}=await import('/src/engine/game/GameSession.ts');
        const {GameSaveStore}=await import('/src/engine/game/GameSaveStore.ts');
        const {createGameState,beginCombat,settleCombat}=await import('/src/engine/game/GameState.ts');
        const player=createFleetMember(hull,'saved-player'),enemy=createFleetMember(hull,'saved-enemy'),reserve=createFleetMember(hull,'saved-reserve');
        enemy.hullFraction=.00001;reserve.hullFraction=.7;
        const encounter={id:'rust-save-flow:1',kind:'fleet',seed:917,playerFleet:[player,reserve],enemyFleet:[enemy],deploymentPointLimit:20000};
        const initial=beginCombat({...createGameState('rust-save-flow',player),fleet:[player,reserve]},encounter);
        const key='isolated-rust-save-flow',values=new Map([[key,JSON.stringify(initial)]]);let writes=0;
        const storage={getItem:k=>values.get(k)??null,setItem:(k,value)=>{if(k===key)writes++;values.set(k,value);}};
        const game=new GameSession(new GameSaveStore(()=>storage,key),hull);
        try{
          game.combat.enableWorker('rust-wasm');game.activate();await game.combat.prepare(document.getElementById('combat'));game.combat.start();
          if(game.combat.workerHost.latest.authority.kind!=='rust-wasm'||game.combat.workerHost.latest.authority.sha256!==sha256)throw Error('GameSession actual Rust authority missing');
          const before=structuredClone(game.getSnapshot()),beforeWrites=writes;
          await game.combat.dispatchControl({kind:'ship',command:{kind:'autofire',value:0}});
          await game.combat.dispatchControl({kind:'pilot',autopilot:true});let ticks=0;
          while(game.getSnapshot().pendingCombat&&ticks++<7200){await game.combat.fixedUpdateControlled(1/60,{...sample,autopilot:true,pointerActive:false});if(ticks%120===0)console.log('RUST-FLOW game-session tick '+ticks);}
          await game.combat.barrier();const outcome=game.combat.workerHost.latest.outcome;
          if(!outcome||game.getSnapshot().pendingCombat||game.error)throw Error('Actual GameSession did not settle: '+game.error);
          const expected=settleCombat(before,outcome),saved=JSON.parse(values.get(key));
          if(canonical(game.getSnapshot())!==canonical(expected)||canonical(saved)!==canonical(expected))throw Error('GameSession/save writeback differs from native outcome');
          if(writes!==beforeWrites+1)throw Error('Settlement saved '+(writes-beforeWrites)+' times');
          if(canonical(saved.fleet.find(m=>m.id===reserve.id))!==canonical(reserve))throw Error('Saved reserve changed');
          const finalWrites=writes;game.combat.start();for(let i=0;i<12;i++)await game.combat.fixedUpdateControlled(1/60,{...sample,autopilot:true,pointerActive:false});await game.combat.barrier();
          if(writes!==finalWrites||canonical(game.getSnapshot())!==canonical(expected))throw Error('Aftermath saved settlement again');
          const reloaded=new GameSaveStore(()=>storage,key).load();if(canonical(reloaded)!==canonical(expected))throw Error('Saved result failed real reload');
          return{ticks,saveWrites:1,reservePreserved:true,reload:true,actualGameSession:true};
        }finally{game.dispose();}
      });
      if(mode==='all'||mode==='settlement')await run('fleet-combat-settlement',async()=>{
        const player=createFleetMember(hull,'flow-player'),enemy=createFleetMember(hull,'flow-enemy');enemy.hullFraction=.00001;
        const reserve=createFleetMember(hull,'flow-reserve');reserve.hullFraction=.7;
        const encounter={id:'rust-flow-fleet',kind:'fleet',seed:917,playerFleet:[player,reserve],enemyFleet:[enemy],deploymentPointLimit:20000};
        const p=await pair({playerHull:hull,enemyHull:hull,seed:917,encounter});try{
          await commands(p,[{kind:'ship',command:{kind:'autofire',value:0}},{kind:'pilot',autopilot:true}],'fleet-autopilot');
          let damaged=false,ticks=0;while(ticks++<7200&&!p[0].latest.presentation.hud.isBattleResultReady){const frames=await step(p,{...sample,autopilot:true,pointerActive:false},'fleet-tick'+ticks);
            damaged||=frames[0].presentation.hud.read.playerShip.hullHp<frames[0].presentation.hud.read.playerShip.maxHullHp;if(ticks%120===0)console.log('RUST-FLOW fleet tick '+ticks);}
          const final=p[0].latest;if(!final.presentation.hud.isBattleResultReady||!final.outcome)throw Error('Combat did not reach native settlement');
          if(canonical(final.outcome)!==canonical(p[1].latest.outcome))throw Error('Native fleet settlement differs');
          if(canonical(final.outcome.playerFleet.find(member=>member.id===reserve.id))!==canonical(reserve))throw Error('Reserve persistent state changed');
          const outcome=structuredClone(final.outcome),witness=final.witness.slice(),time=final.presentation.hud.read.combatTime;
          for(let i=0;i<12;i++)await step(p,{...sample,autopilot:true,pointerActive:false},'aftermath'+i);
          if(canonical(outcome)!==canonical(p[0].latest.outcome)||p[0].latest.presentation.hud.read.combatTime!==time
            ||p[0].latest.witness.slice(1,4).some((value,i)=>value!==witness[i+1]))throw Error('Aftermath changed settlement, rules RNG or combat time');
          return{ticks,damaged,outcome:true,reservePreserved:true,aftermath:true};
        }finally{close(p);}
      });
    }finally{hosts.forEach(h=>h.dispose());}
    return{passed:failures.length===0,cases,failures,transactions,strict,geometry,maximumDifference,fits:fits.length,productionLocalWorkerHost:true,purePresentation:true,wasmSHA256:sha256};
  },{sha256,mode:option('--mode','all')});
  if(option('--mode','all')==='render')for(const item of await page.evaluate(()=>window.__rustRenderImages??[])){
    const id=item.id.replace(/[^a-z0-9_-]/gi,'_');fs.writeFileSync(path.join(out,id+'-rust.png'),Buffer.from(item.rust,'base64'));fs.writeFileSync(path.join(out,id+'-source.png'),Buffer.from(item.source,'base64'));
  }
  result.pageErrors=errors;result.visibleWindows=false;result.installedAssetInput=!args.includes('--wasm');
  if(errors.length)result.passed=false;fs.writeFileSync(path.join(out,'result-'+option('--mode','all')+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
}finally{await browser?.close();await server.close();}
