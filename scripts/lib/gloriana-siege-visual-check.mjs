/** Visual branch of check-gloriana-armory. Production simulation + production WebGL,
 * deterministic single-shot frames in a headless-only page, not a new test app/project. */
export async function runSiegeVisualCheck() {
  const assert=(await import('node:assert/strict')).default;
  const {mkdir,writeFile}=await import('node:fs/promises');
  const {resolve}=await import('node:path');const {createRequire}=await import('node:module');
  const {createServer}=await import('vite');
  const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
  const out=resolve('artifacts/gloriana/siege');await mkdir(out,{recursive:true});
  const server=await createServer({server:{host:'127.0.0.1',port:0,open:false,watch:null},
    plugins:[{name:'siege-frames',configureServer(s){s.middlewares.use((req,res,next)=>{
      if(req.url!=='/__siege-frames')return next();res.setHeader('Content-Type','text/html');
      res.end('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#090e18;color:#dfdfdf;font:15px sans-serif}header{padding:12px}canvas{display:block}</style><header id="label">攻城炮 · 隔离定帧检查（真实模拟 / WebGL）</header><canvas width="1200" height="650"></canvas>');
    });}}]});
  let browser;const errors=[],failedAssets=[],frames=[],loaded=new Set();
  try{
    await server.listen();await server.watcher.close();
    browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1200,height:695}});page.setDefaultTimeout(60000);
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/game-assets/')){if(r.status()>=400)failedAssets.push(r.url());else loaded.add(new URL(r.url()).pathname);}});
    await page.goto(server.resolvedUrls.local[0]+'__siege-frames');
    await page.evaluate(async()=>{
      const {CombatEngine}=await import('/src/engine/simulation/CombatEngine.ts');
      const {modManager}=await import('/src/engine/modding/ModManager.ts');
      const {glorianaWeapons,GLORIANA_WEAPONS}=await import('/src/engine/content/GlorianaArmory.ts');
      const {createSiegeScene}=await import('/scripts/lib/gloriana-siege-fixture.mjs');
      const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');await assetManager.ensureManifestLoaded();
      const {WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
      const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');
      const {Vector2}=await import('/src/engine/math/Vector2.ts');
      const {VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
      const {updateGraphicsSettings}=await import('/src/engine/runtime/GraphicsSettings.ts');updateGraphicsSettings({maxFrameRate:0,renderScale:1,screenShake:0});
      const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 unavailable');
      const renderer=new WebGLCombatRenderer(canvas,gl);
      const api={CombatEngine,modManager,glorianaWeapons,GLORIANA_WEAPONS};
      window.siege={api,createSiegeScene,renderer,gl,combatRenderView,Vector2,VisualRandom,scene:null};
    });
    for(const shield of [false,true]){
      await page.evaluate(async shield=>{const p=window.siege;p.scene=p.createSiegeScene(p.api,shield);await p.renderer.prepareAssets(p.combatRenderView(p.scene.engine));},shield);
      const phases=shield?['shield-hit']:['muzzle','flight','hull-hit','hull-after-flash'];
      for(const phase of phases){
        const result=await page.evaluate(phase=>{
          const p=window.siege,s=p.scene,e=s.engine;
          const reached=()=>phase==='muzzle'?s.fired:phase==='flight'?e.projectiles.some(shot=>shot.elapsedTime>.32):s.fired&&!e.projectiles.length;
          let ticks=0;while(!reached()&&ticks++<360)s.step();if(!reached())throw Error('No actual '+phase);
          if(phase==='hull-after-flash')for(let i=0;i<12;i++)s.step();
          const shot=e.projectiles[0];const hit=e.explosions[0]?.pos??e.hitGlows[0]?.pos;
          const camera=phase==='muzzle'?s.source.pos.clone().add(new p.Vector2(70,0)):phase==='flight'?shot.pos:hit;
          if(!camera)throw Error('No phase position: '+phase);
          const labels={muzzle:'短促炮口爆闪',flight:'红色实体弹头 / 短尾迹','hull-hit':'装甲命中 / 瞬时爆闪','hull-after-flash':'爆闪消退后的碎屑与烟尘','shield-hit':'护盾命中 / 无舰体火团'};
          document.getElementById('label').textContent='破城攻城炮 · '+labels[phase]+' · 隔离定帧（真实模拟 / WebGL）';
          const frame={visualTime:e.combatTime,random:new p.VisualRandom(91),layers:new Set(['background','hull','weapon','trail','shield','explosion']),damageEnabled:true};
          let renderedTailLength;
          const ribbon=p.renderer.ribbonBatcher,draw=ribbon.drawBallisticProjectile;
          const tailBefore=shot?.ballisticTail?.clone();
          ribbon.drawBallisticProjectile=function(...args){renderedTailLength=args[2].distanceTo(args[3]);return draw.apply(this,args);};
          try{
            const view=p.combatRenderView(e);p.renderer.updateVisual(view,0,frame);p.renderer.render(view,1,camera,2.4,frame);p.gl.finish();
          }finally{ribbon.drawBallisticProjectile=draw;}
          if(tailBefore&&tailBefore.distanceTo(shot.ballisticTail)!==0)throw Error('Rendering changed simulation tail');
          if(phase==='flight'&&!(Math.abs(renderedTailLength-22)<.001))throw Error('Siege tail too long: '+renderedTailLength);
          let noseRedCentroid;
          if(phase==='flight'){
            // The painted red nose must be in front of the neutral gray base, not trailing it.
            const pixels=new Uint8Array(36*28*4);p.gl.readPixels(600,311,36,28,p.gl.RGBA,p.gl.UNSIGNED_BYTE,pixels);
            let total=0,weighted=0;for(let i=0;i<36*28;i++){const red=Math.max(0,pixels[i*4]-Math.max(pixels[i*4+1],pixels[i*4+2])-30);total+=red;weighted+=(i%36)*red;}
            if(total<100)throw Error('Red siege nose not visible');noseRedCentroid=weighted/total;
            if(noseRedCentroid<18)throw Error('Shell nose faces backwards: '+noseRedCentroid);
          }
          return {phase,noseRedCentroid,renderedTailLength,time:e.combatTime,shots:e.projectiles.length,explosions:e.explosions.length,debris:e.debris.length,
            shot:shot&&{speed:shot.vel.length(),width:shot.projWidth,length:shot.projLength,sprite:shot.projSpriteUrl},
            targetHull:s.target.hullHp,targetFlux:s.target.flux.totalFlux,glError:p.gl.getError()};
        },phase);
        assert.equal(result.glError,0);if(phase==='shield-hit'){assert.equal(result.explosions,0);assert.equal(result.debris,0);assert(result.targetFlux>0);}
        if(phase==='hull-hit'){assert.equal(result.explosions,1);assert.equal(result.debris,3);}
        await page.screenshot({path:resolve(out,phase+'.png')});frames.push(result);
      }
    }
    assert(loaded.has('/game-assets/graphics/missiles/shell_hellbore.png'));
    assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
    await page.evaluate(()=>window.siege.renderer.dispose());
    await writeFile(resolve(out,'visual-check.json'),JSON.stringify({scope:'Isolated production CombatEngine + WebGL; no live desktop, not Worker input or multiplayer verification',frames,errors,failedAssets},null,2));
    console.log('PASS siege WebGL frames: '+frames.map(f=>f.phase).join(', '));
  }finally{await browser?.close();await server.close();}
}
