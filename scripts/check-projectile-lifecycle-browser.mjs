import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const output = path.resolve('artifacts/projectile-lifecycle-tests'), publicRoot = path.resolve('public');
fs.mkdirSync(output, { recursive: true });
const code = (await build({ stdin: { contents: `
export { SpriteBatcher } from './src/engine/render/webgl/SpriteBatcher';
export { RibbonBatcher } from './src/engine/render/webgl/RibbonBatcher';
export { WebGLTextureManager } from './src/engine/render/webgl/WebGLTextureManager';
export { WebGLProjectilePass } from './src/engine/render/webgl/passes/WebGLProjectilePass';
export { Vector2 } from './src/engine/math/Vector2';
export { assetManager } from './src/engine/assets/AssetResolver';
export { initializeSourceProjectile, advanceSourceProjectile } from './src/engine/simulation/systems/weapon/SourceProjectileLifecycle';
export { advanceSourceMissile } from './src/engine/simulation/systems/weapon/SourceMissileLifecycle';
export { default as weapons } from './src/engine/data/generated/weapons.json';
`, resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'iife', globalName: 'fixture', write: false,
  define: { __LAN_BUILD_ID__: '"lifecycle-visual-test"', 'import.meta.env': '{"BASE_URL":"/","DEV":false}' }, logLevel: 'warning' })).outputFiles[0].text;
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_PATH, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 640 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()); if (url.origin !== 'http://lifecycle.test') return route.abort();
    if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><title>Projectile expiry regression</title>
<style>body{margin:0;background:#05060a;color:#ccc;font:16px sans-serif}h2{margin:20px}header{display:flex;margin-left:130px;width:950px}header span{width:190px;text-align:center}canvas{display:block}footer{margin:12px 20px;color:#aaa}</style>
<h2>Web expiry test — native configuration, current Web artwork</h2><header><span>Powered</span><span>Coasting / fade start</span><span>50% faded</span><span>90% faded</span><span>Expired</span></header>
<canvas width="1100" height="480"></canvas><footer>Rows: Plasma · Voltaic · Reaper · Harpoon. Native live visual comparison not verified.</footer>`});
    const file=path.resolve(publicRoot,decodeURIComponent(url.pathname).replace(/^\//,'')); if(!file.startsWith(publicRoot+path.sep))return route.abort();
    try { return await route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.png')?'image/png':file.endsWith('.json')?'application/json':'application/octet-stream'}); }
    catch { return route.fulfill({status:404,body:''}); }
  });
  await page.goto('http://lifecycle.test'); await page.addScriptTag({content:code});
  const result=await page.evaluate(async()=>{
    const F=fixture; await F.assetManager.ensureManifestLoaded();
    const canvas=document.querySelector('canvas'), gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false}); if(!gl)throw Error('No WebGL2');
    const textures=new F.WebGLTextureManager(gl), batcher=new F.SpriteBatcher(gl), ribbonBatcher=new F.RibbonBatcher(gl), pass=new F.WebGLProjectilePass();
    const paths=['hit_glow.png','beam_rough2_fringe.png','beamfringe.png','beam_rough2_core.png','beamcore.png','projtrail.png','projbody.png','engineglow32.png','engineflame32.png'].map(x=>'/game-assets/graphics/fx/'+x);
    await textures.preload([...paths,F.weapons.reaper.projSpriteUrl,F.weapons.harpoon.projSpriteUrl]);
    const engine={projectiles:[],fxSystem:{movingRayFades:[]},muzzleParticles:[],muzzleFlashes:[]},states=[];
    const ids=['plasma','voltaic_cannon','reaper','harpoon'];
    for(let row=0;row<ids.length;row++)for(let column=0;column<5;column++){
      const id=ids[row],w=F.weapons[id],p={...w,id:row*10+column,specId:id,sourceShipId:'visual',
        pos:new F.Vector2(),prevPos:new F.Vector2(),vel:new F.Vector2(w.projSpeed,0),damage:w.damagePerShot,empDamage:w.empPerShot,
        damageType:w.type,radius:w.projRadius,rangeRemaining:0,totalRange:w.range,elapsedTime:2,facingRad:0,
        flightTimeRemaining:0,hitpoints:w.missileHp,armedWhileFizzling:true};
      let expired=false;
      if(w.isRocket){const s=w.missileLifecycleSpec;const t=[0,s.flameoutTime/2,s.flameoutTime-s.fadeTime*.5,s.flameoutTime-s.fadeTime*.1,s.flameoutTime+.01][column];
        if(column===0)p.flightTimeRemaining=w.flightTime;else expired=F.advanceSourceMissile(p,t);
      }else{F.initializeSourceProjectile(p,w.projSpeed);expired=F.advanceSourceProjectile(p,[0,0,.25,.45,.51][column]);}
      p.pos.set((225+190*column)/1.5,(60+120*row)/1.5);p.prevPos.copy(p.pos);p.prevFadeProgress=p.fadeProgress;
      if(!expired)engine.projectiles.push(p);states.push({id,column,expired,fade:p.fadeProgress??0});
    }
    gl.viewport(0,0,1100,480);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
    batcher.begin(new F.Vector2(550/1.5,240/1.5),1.5,1100,480);
    pass.renderProjectilesAndMuzzle(engine,{gl,canvas,textures,batcher,ribbonBatcher,alpha:1,hitGlowTex:textures.getTexture(paths[0])});batcher.end();
    const pixels=new Uint8Array(1100*480*4);gl.readPixels(0,0,1100,480,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const energies=ids.map((id,row)=>({id,columns:Array.from({length:5},(_,column)=>{let sum=0;const x=225+190*column,y=480-(60+120*row);
      for(let dy=-50;dy<50;dy++)for(let dx=-85;dx<85;dx++){const i=((y+dy)*1100+x+dx)*4;sum+=pixels[i]+pixels[i+1]+pixels[i+2];}return sum;})}));
    return {states,energies,glError:gl.getError()};
  });
  assert.deepEqual(errors,[]);assert.equal(result.glError,0);
  for(const {id,columns:c} of result.energies){assert.ok(c[0]>0 && c[1]>c[2] && c[2]>c[3] && c[3]>0,`${id}: fade not monotonic ${c}`);assert.equal(c[4],0);}
  await page.screenshot({path:path.join(output,'expiry-timeline.png'),fullPage:true});
  fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify({...result,errors},null,2)+'\n');
  console.log('Headless WebGL: 4 projectile rows × 5 lifecycle states, monotonic fade, expired cells empty, no page/GL errors.');
}finally{await browser.close();}
