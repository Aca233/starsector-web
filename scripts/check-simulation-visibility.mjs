/** Existing simulator visibility regression, updated for public Web combat (2026-09-30).
 * Uses installed custom hulls, real environment/visibility/snapshot/render code.
 * Independent headless browser; no user profile, saves or desktop input.
 * Starts isolated Vite unless COMBAT_TEST_URL is supplied; Playwright on NODE_PATH. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { createServer as netServer } from 'node:net';
const { chromium } = createRequire(import.meta.url)('playwright');
const output = path.resolve(process.env.COMBAT_TEST_ARTIFACTS ?? 'artifacts/battlefield-terrain-visibility-20260930');
await fs.mkdir(output, {recursive:true});
let server, testUrl = process.env.COMBAT_TEST_URL;
if (!testUrl) {
  const probe=netServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,open:false},logLevel:'error'});
  await server.listen();testUrl=`http://127.0.0.1:${port}`;
}
const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page = await browser.newPage({viewport:{width:960,height:540}});
const errors = []; page.on('pageerror', error => errors.push(String(error)));
try {
  await page.route('**/__simulation_visibility_check.html', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>html,body{margin:0;overflow:hidden;background:#000}canvas{display:block}</style></head><body><canvas id="battle" width="960" height="540"></canvas></body></html>'}));
  await page.goto(`${testUrl}/__simulation_visibility_check.html`);
  const result = process.env.COMBAT_TEST_OWNED_ONLY === 'true' ? await page.evaluate(async () => {
    const {checkOwnedStatWorker,checkRealLocalWorker}=await import('/scripts/lib/simulation-owned-stat-contracts.mjs');
    const {DEFAULT_PLAYER_HULL,DEFAULT_ENEMY_HULL}=await import('/src/engine/data/SandboxDefaults.ts');
    const ownedStats=await checkOwnedStatWorker(location.origin);
    const localWorker=await checkRealLocalWorker(location.origin,DEFAULT_PLAYER_HULL,DEFAULT_ENEMY_HULL);
    return {checks:['isolated Worker scalar/motion contracts','actual local Worker command/step/restore/render contract'],ownedStats,localWorker,scope:'Targeted retry of the added Worker contracts only.'};
  }) : await page.evaluate(async () => {
    const {CombatEngine} = await import('/src/engine/simulation/CombatEngine.ts');
    const {deploymentCost,BATTLE_HALF_EXTENT} = await import('/src/engine/simulation/CombatDeployment.ts');
    const {DEFAULT_PLAYER_HULL,DEFAULT_ENEMY_HULL} = await import('/src/engine/data/SandboxDefaults.ts');
    const {AsteroidSystem} = await import('/src/engine/simulation/systems/AsteroidSystem.ts');
    const {NebulaSystem} = await import('/src/engine/simulation/systems/NebulaSystem.ts');
    const {SimulationRandom} = await import('/src/engine/simulation/SimulationRandom.ts');
    const {contactVisible,updateCombatVisibility} = await import('/src/engine/simulation/systems/CombatVisibility.ts');
    const {WebGLCombatRenderer} = await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
    const {combatRenderView} = await import('/src/engine/render/CombatRenderView.ts');
    const {combatHudView} = await import('/src/engine/runtime/CombatHudView.ts');
    const {engineTacticalMapSource} = await import('/src/engine/runtime/TacticalMapView.ts');
    const {captureCombat,applyCombatSnapshot} = await import('/src/network/AuthorityCombatSnapshot.ts');
    const {assetManager} = await import('/src/engine/assets/AssetResolver.ts');
    const {contentManifestManager} = await import('/src/engine/content/ContentManifest.ts');
    const {VisualRandom} = await import('/src/engine/runtime/VisualRandom.ts');
    const {nebulaAppearance} = await import('/src/engine/render/NebulaAppearance.ts');
    const {TacticalMapPainter,fitTacticalView} = await import('/src/ui/tactical/TacticalMapPainter.ts');
    await assetManager.ensureManifestLoaded(); await contentManifestManager.ensureLoaded();
    const checks = [], verify = (value,name) => {if(!value)throw Error(name);checks.push(name);};
    const e = new CombatEngine(DEFAULT_PLAYER_HULL,DEFAULT_ENEMY_HULL,917);
    const sectors = [
      ['north',p=>p.y>3000&&Math.abs(p.x)<3000],['south',p=>p.y< -3000&&Math.abs(p.x)<3000],
      ['east',p=>p.x>3000&&Math.abs(p.y)<3000],['west',p=>p.x< -3000&&Math.abs(p.y)<3000],
      ['north-east',p=>p.x>3000&&p.y>3000],['north-west',p=>p.x< -3000&&p.y>3000],
      ['south-east',p=>p.x>3000&&p.y< -3000],['south-west',p=>p.x< -3000&&p.y< -3000]
    ];
    const coverage = sectors.map(([name,test])=>({name,asteroids:e.asteroids.filter(a=>test(a.pos)).length}));
    for(const sector of coverage)verify(sector.asteroids>0,sector.name+' contains physical asteroids');
    verify(e.asteroids.length===78,'asteroid count is bounded at 78, not camera-dependent');
    verify(e.nebulae.length===1,'only the first independently authored cloud is installed');
    verify(e.nebulae.every(n=>n.spriteUrl.includes('/authored/terrain/nebula-soft-veil-01/')),'new battles use the standalone asset, not the old atlas');
    const appearances=e.nebulae.map(n=>nebulaAppearance(n));
    verify(appearances.every(n=>n.u===0&&n.v===0&&n.u2===1&&n.v2===1&&n.rotationRad===0),'whole-image UVs keep the gradient coherent');
    const asteroids = new AsteroidSystem();asteroids.init();
    const repeatAsteroids = new AsteroidSystem();repeatAsteroids.init();
    verify(JSON.stringify(asteroids.asteroids)===JSON.stringify(repeatAsteroids.asteroids),'asteroid layout rebuilds deterministically');
    const clouds=new NebulaSystem(new SimulationRandom(19));clouds.init();
    const beforeClouds=JSON.stringify(clouds.nebulae);clouds.init();
    verify(JSON.stringify(clouds.nebulae)===beforeClouds,'restart does not accumulate repeated cloud fragments');
    const otherClouds=new NebulaSystem(new SimulationRandom(20));otherClouds.init();
    verify(JSON.stringify(otherClouds.nebulae)===beforeClouds,'art placement and opacity do not acquire seed-dependent noise');
    const a=asteroids.asteroids[0];a.pos.set(3000,2500);a.vel.set(0,0);asteroids.update(1);
    verify(a.pos.x===3000&&a.pos.y===2500,'asteroids no longer wrap at the old center bounds');
    const bound=BATTLE_HALF_EXTENT+500;a.pos.set(bound+1,-bound-2);asteroids.update(0);
    verify(a.pos.x===-bound+1&&a.pos.y===bound-2,'battlefield-edge wrap retains overshoot');
    a.pos.set(bound+bound*4+100,-bound-bound*4-200);asteroids.update(0);
    verify(a.pos.x===-bound+100&&a.pos.y===bound-200,'large impulses wrap within the real map bounds');
    a.gravityFixed=true;a.pos.set(7000,7000);asteroids.update(1);verify(a.pos.x===7000&&a.pos.y===7000,'fixed gravity terrain does not drift or wrap');
    // Collision-only fixtures stay inside the existing terrain/visibility scene.
    const {Vector2} = await import('/src/engine/math/Vector2.ts');
    const {forwardPathClear,avoidCollisions}=await import('/src/engine/ai/TacticalNavigation.ts');
    const navEngine=new CombatEngine(DEFAULT_PLAYER_HULL,DEFAULT_ENEMY_HULL,917),navigator=navEngine.playerShip;
    navigator.pos.set(0,0);navigator.vel.set(10,5);navEngine.enemyShip.pos.set(100,40);
    const poisonIndex={select:()=>{throw Error('authored exact-stat reuse must not enable native indexing');}};
    const navWorld={ships:navEngine.ships,asteroids:navEngine.asteroids,projectiles:[],beams:[],navigationObstacleIndex:poisonIndex};
    const originalMotion=navigator.getMotionStats,originalBonus=navigator.system.getSpeedFlatBonus;
    let motionReads=0;
    navigator.system.getSpeedFlatBonus=function(){motionReads++;return originalBonus.call(this);};
    const legacyMotion=function(){return originalMotion.call(this);};
    try{
      verify(!navigator.hasNativeThreatPhaseHooks&&navigator.hasExactThreatPhaseHooks,'authored hull has exact-stat but not native-index permission');
      motionReads=0;const clear=forwardPathClear(navigator,navWorld,100,3);
      verify(motionReads===1,'78 asteroids reuse maxSpeed within a single synchronous navigation scan');
      navigator.getMotionStats=legacyMotion;motionReads=0;
      const legacyClear=forwardPathClear(navigator,navWorld,100,3);
      verify(clear===legacyClear&&motionReads>=78,'custom motion reader retains legacy per-obstacle reads and identical corridor result');
      navigator.getMotionStats=originalMotion;motionReads=0;forwardPathClear(navigator,navWorld,100,3);
      verify(motionReads===1,'next scan recalculates motion instead of reusing a tick cache');
      for(const flux of [0,navigator.flux.maxFlux*.8]){
        navigator.flux.softFlux=flux;
        const desired=new Vector2(120,30),actual=avoidCollisions(navigator,desired,navWorld);
        navigator.getMotionStats=legacyMotion;const expected=avoidCollisions(navigator,desired,navWorld);navigator.getMotionStats=originalMotion;
        verify(JSON.stringify(actual)===JSON.stringify(expected),'authored navigation matches uncached motion at flux '+flux);
      }
      let callbacks=0;const observed={...navWorld,noteNavigationObstacle:()=>{callbacks++;}};
      motionReads=0;forwardPathClear(navigator,observed,100,3);
      verify(callbacks===navWorld.ships.length-1&&motionReads>=78,'owner navigation recorder preserves callbacks and uncached motion reads');
      const distance=navigator.pos.distanceTo;Object.defineProperty(navigator.pos,'distanceTo',{configurable:true,get:()=>distance});
      try{motionReads=0;forwardPathClear(navigator,navWorld,100,3);verify(motionReads>=78,'custom distance getter retains uncached navigation path');}
      finally{delete navigator.pos.distanceTo;}
    }finally{navigator.getMotionStats=originalMotion;navigator.system.getSpeedFlatBonus=originalBonus;}
    const rock = (id,x,y,radius=5,fixed=false) => ({...a,id,pos:new Vector2(x,y),vel:new Vector2(),radius,mass:100,hp:1e6,gravityFixed:fixed});
    const noop=()=>{};
    const fx={getPlayerPos:()=>new Vector2(),spawnShieldRipple:noop,addFloatingDamage:noop,addFloatingText:noop,
      spawnArmorDamageSparks:noop,spawnSparks:noop,spawnDebris:noop,spawnAuthenticExplosion:noop,detachContrail:noop};
    const outline = (width=20) => [[-width,-20],[width,-20],[width,20],[-width,20]];
    const hullFixture = (rocks,bounds=outline(),onContact=noop,facing=0) => {
      const system=new AsteroidSystem(new SimulationRandom(17),new SimulationRandom(23));system.asteroids=rocks;
      let contacts=0;
      const ship={pos:new Vector2(),vel:new Vector2(),facingRad:facing,isDead:false,isCollisionless:false,
        spec:{bounds,collisionRadius:1,mass:100},shield:{isActive:false},effectiveEmpDamageTakenMultiplier:1,
        armor:{takeDamage:()=>{contacts++;return {armorDamage:0,hullDamage:0};}},applyHullDamage:noop};
      ship.assemblyRoot=ship;
      const callbacks={...fx,spawnArmorDamageSparks:()=>onContact(ship)};
      return {system,ship,advance:()=>system.resolveShipCollisions([ship],callbacks),contacts:()=>contacts};
    };
    const rotated=hullFixture([rock(1,0,198)],outline(200),noop,Math.PI/2);rotated.advance();
    verify(rotated.contacts()===1,'mutable rotated bounds beyond collisionRadius retain exact hull contact');
    const refit=hullFixture([rock(1,190,0)]);refit.advance();verify(refit.contacts()===0,'distant mutable hull does not collide');
    refit.ship.spec.bounds=outline(200);refit.advance();
    verify(refit.contacts()===1,'hull envelope rebuilds after a between-tick refit');
    const expand=hullFixture([rock(1,190,0),rock(2,0,0),rock(3,190,0)],outline(),ship=>{ship.spec.bounds[1][0]=ship.spec.bounds[2][0]=200;});
    expand.advance();verify(expand.contacts()===2,'contact callback invalidates an in-place edited hull envelope');
    const move=hullFixture([rock(1,190,0),rock(2,0,0),rock(3,190,0)],outline(),ship=>ship.pos.set(190,0));
    move.advance();verify(move.contacts()===2,'later pairs read same-step ship motion, not a cached world center');
    const circle=hullFixture([rock(1,5,0)],[]);circle.ship.spec.collisionRadius=10;circle.advance();
    verify(circle.contacts()===1,'circle-only hull fallback remains supported');

    // Literal pre-optimization vector arithmetic is the projectile oracle.
    const segmentBefore=(start,end,center,radius)=>{
      const d=end.clone().sub(start),f=start.clone().sub(center),aa=d.dot(d);
      if(aa<=1e-12)return start.distanceTo(center)<=radius?{t:0,point:start.clone()}:null;
      const b=2*f.dot(d),c=f.dot(f)-radius*radius,disc=b*b-4*aa*c;
      if(disc<0)return null;
      const sqrt=Math.sqrt(disc),t1=(-b-sqrt)/(2*aa),t2=(-b+sqrt)/(2*aa);
      const t=t1>=0&&t1<=1?t1:t2>=0&&t2<=1?t2:null;
      return t===null?null:{t,point:start.clone().addScaled(d,t)};
    };
    const queryBefore=(rocks,p)=>{
      let best=null;
      for(let j=0;j<rocks.length;j++){
        const r=rocks[j];if(r.hp<=0||p.damagedTargetIds?.includes('terrain:asteroid:'+r.id))continue;
        const hit=segmentBefore(p.prevPos,p.pos,r.pos,r.radius+p.radius);
        if(hit&&(!best||hit.t<best.t))best={asteroidIndex:j,...hit};
      }
      return best;
    };
    const random=new SimulationRandom(2601001),query=new AsteroidSystem();
    for(let trial=0;trial<160;trial++){
      query.asteroids=Array.from({length:12},(_,i)=>rock(i,(random.next()-.5)*800,(random.next()-.5)*800,random.next()*70));
      const p={prevPos:new Vector2((random.next()-.5)*800,(random.next()-.5)*800),pos:new Vector2((random.next()-.5)*800,(random.next()-.5)*800),radius:3,damagedTargetIds:trial%2?['terrain:asteroid:0']:undefined};
      if(trial%8===0)p.pos.copy(p.prevPos);
      const expected=queryBefore(query.asteroids,p),actual=query.queryProjectileImpact(p);
      verify(actual===null&&expected===null||!!actual&&!!expected&&actual.asteroidIndex===expected.asteroidIndex
        &&Object.is(actual.t,expected.t)&&Object.is(actual.point.x,expected.point.x)&&Object.is(actual.point.y,expected.point.y),'projectile vector-oracle equality '+trial);
    }
    for(const [label,start,end,radius,damaged,hp] of [
      ['nearest and equal-t array order',[-20,0],[20,0],5,undefined,1e6],
      ['tangent',[-20,5],[20,5],5,undefined,1e6],
      ['inside stationary',[0,0],[0,0],5,undefined,1e6],
      ['stationary boundary',[5,0],[5,0],5,undefined,1e6],
      ['near-zero segment',[5,0],[5+1e-8,0],5,undefined,1e6],
      ['already damaged',[-20,0],[20,0],5,['terrain:asteroid:1'],1e6],
      ['dead asteroid',[-20,0],[20,0],5,undefined,0],
      ['exceptional coordinates',[1e150,0],[-1e150,0],5,undefined,1e6]
    ]){
      query.asteroids=[rock(1,0,0,radius),rock(2,0,0,radius)];query.asteroids[0].hp=hp;
      const p={prevPos:new Vector2(...start),pos:new Vector2(...end),radius:0,damagedTargetIds:damaged};
      const expected=queryBefore(query.asteroids,p),actual=query.queryProjectileImpact(p);
      verify(actual===null&&expected===null||!!actual&&!!expected&&actual.asteroidIndex===expected.asteroidIndex
        &&Object.is(actual.t,expected.t)&&Object.is(actual.point.x,expected.point.x)&&Object.is(actual.point.y,expected.point.y),'projectile edge case: '+label);
    }

    const pairBefore=(rocks,rng)=>{
      for(let i=0;i<rocks.length;i++)for(let j=i+1;j<rocks.length;j++){
        const first=rocks[i],second=rocks[j];if(first.gravityFixed&&second.gravityFixed)continue;
        const diff=second.pos.clone().sub(first.pos),distance=diff.length(),radius=first.radius+second.radius;
        if(distance<radius){
          const normal=distance>1e-12?diff.scale(1/distance):new Vector2(1,0);
          const inv1=first.gravityFixed?0:1/first.mass,inv2=second.gravityFixed?0:1/second.mass;
          const kick=Math.max(0,2*first.vel.clone().sub(second.vel).dot(normal)/(inv1+inv2));
          if(!first.gravityFixed){first.vel.subScaled(normal,kick*inv1);first.pos.subScaled(normal,(radius-distance)*inv1/(inv1+inv2));}
          if(!second.gravityFixed){second.vel.addScaled(normal,kick*inv2);second.pos.addScaled(normal,(radius-distance)*inv2/(inv1+inv2));}
          rng.next();
        }
      }
    };
    const pairs=new AsteroidSystem(new SimulationRandom(17),new SimulationRandom(23)),oracleRng=new SimulationRandom(23);
    pairs.asteroids=Array.from({length:36},(_,i)=>rock(i,(random.next()-.5)*500,(random.next()-.5)*500,5+random.next()*60,i%6===0));
    pairs.asteroids[1].pos.copy(pairs.asteroids[0].pos);
    pairs.asteroids[2].pos.set(1e150,0); // Extreme values fail open to the old exact path.
    const expectedPairs=pairs.asteroids.map(r=>({...r,pos:r.pos.clone(),vel:r.vel.clone()}));
    for(let tick=0;tick<12;tick++){
      for(const rocks of [pairs.asteroids,expectedPairs])for(const r of rocks)if(!r.gravityFixed)r.pos.addScaled(r.vel,1/60);
      pairBefore(expectedPairs,oracleRng);pairs.resolveShipCollisions([],fx);
      verify(pairs.asteroids.every((r,i)=>Object.is(r.pos.x,expectedPairs[i].pos.x)&&Object.is(r.pos.y,expectedPairs[i].pos.y)
        &&Object.is(r.vel.x,expectedPairs[i].vel.x)&&Object.is(r.vel.y,expectedPairs[i].vel.y)),'pair response/order equality '+tick);
      verify(JSON.stringify(pairs.visualRandom.checkpointWitness())===JSON.stringify(oracleRng.checkpointWitness()),'pair visual RNG equality '+tick);
    }
    e.playerShip.pos.set(0,0);e.playerShip.prevPos.copy(e.playerShip.pos);e.enemyShip.teamId=32;
    for(const distance of [3000,6000,12000,50000])for(const legacyPolicy of [undefined,false,true]){
      e.enemyShip.pos.set(distance,0);e.enemyShip.prevPos.copy(e.enemyShip.pos);
      updateCombatVisibility(e.ships,legacyPolicy);
      verify(e.enemyShip.isVisibleTo(0)&&e.enemyShip.isVisibleTo(1)&&e.enemyShip.isVisibleTo(63),'live hull visible at '+distance+' with legacy policy '+legacyPolicy);
      verify(contactVisible(e.enemyShip,[],0,legacyPolicy),'map contact visible without observer at '+distance+' with legacy policy '+legacyPolicy);
    }
    verify(e.openBattlefield===true,'ordinary combat defaults to public visibility');
    e.playerShip.playerTargetId=e.enemyShip.id;
    const hud=combatHudView(e);
    verify(hud.ships.find(s=>s.id===e.enemyShip.id)?.isVisibleTo(0),'far hull retained in real HUD projection');
    e.isTacticalMap=true;const map=engineTacticalMapSource(e).read().map;
    verify(map.openBattlefield&&map.capitalShips.some(s=>s.id===e.enemyShip.id),'far hull retained on real tactical map');
    const chart=document.createElement('canvas');chart.width=960;chart.height=540;const chartCtx=chart.getContext('2d');
    let fogDraws=0;const chartDraw=chartCtx.drawImage.bind(chartCtx);chartCtx.drawImage=(image,...args)=>{if(image instanceof HTMLCanvasElement)fogDraws++;return chartDraw(image,...args);};
    const chartPainter=new TacticalMapPainter(),chartView=fitTacticalView(map,960,540);
    const cloudImage=new Image();cloudImage.src=map.nebulae[0].spriteUrl;await cloudImage.decode();
    chartPainter.images.set(map.nebulae[0].spriteUrl,cloudImage);
    const chartClouds=[];let cloudAngle=0;const chartRotate=chartCtx.rotate.bind(chartCtx);
    chartCtx.rotate=angle=>{cloudAngle=angle;return chartRotate(angle);};
    chartCtx.drawImage=(image,...args)=>{
      if(image===cloudImage)chartClouds.push({sourceX:args[0],sourceY:args[1],sourceWidth:args[2],sourceHeight:args[3],width:args[6],height:args[7],rotation:cloudAngle});
      if(image instanceof HTMLCanvasElement)fogDraws++;return chartDraw(image,...args);
    };
    chartPainter.draw(chartCtx,960,chartView,{...map,openBattlefield:false},{pos:e.playerShip.pos,width:960,height:540,zoom:.65},null,540);
    verify(chartClouds.length===map.nebulae.length,'actual tactical painter draws each complete cloud exactly once');
    const chartScale=960/chartView.span;
    verify(chartClouds.every((n,i)=>Math.abs(n.rotation-appearances[i].rotationRad)<1e-8&&Math.abs(n.width-appearances[i].width*chartScale)<1e-8&&Math.abs(n.height-appearances[i].height*chartScale)<1e-8),'actual map draw rotations and proportions match battle');
    verify(chartClouds.every(n=>n.sourceX===0&&n.sourceY===0&&n.sourceWidth===cloudImage.naturalWidth&&n.sourceHeight===cloudImage.naturalHeight),'map consumes the entire standalone PNG rather than one atlas cell');
    window.__nebulaMapPng=chart.toDataURL('image/png');
    verify(fogDraws===0,'real tactical painter never overlays legacy sensor-range fog');
    for(const flag of ['isDead','isRetreated','isDocked']){
      e.enemyShip[flag]=true;updateCombatVisibility(e.ships);
      verify(!contactVisible(e.enemyShip,[],0)&&!e.enemyShip.isVisibleTo(0),flag+' still removes live contact');e.enemyShip[flag]=false;
    }
    updateCombatVisibility(e.ships);e.isTacticalMap=false;
    const copy=new CombatEngine(DEFAULT_PLAYER_HULL,DEFAULT_ENEMY_HULL,917);
    applyCombatSnapshot(copy,captureCombat(e,1,{},0),true);
    verify(copy.enemyShip.isVisibleTo(0)&&copy.enemyShip.pos.x===50000,'authority snapshot retains far contact and position');
    verify(copy.asteroids.length===e.asteroids.length&&copy.nebulae.length===e.nebulae.length,'authority snapshot retains full-map terrain');
    verify(JSON.stringify(copy.nebulae.map(n=>nebulaAppearance(n)))===JSON.stringify(appearances),'authority snapshot preserves whole-cloud rendering without new wire fields');
    const cost=deploymentCost(copy.playerShip.spec);copy.beginSimulationDeployment(cost,20000);
    verify(copy.openBattlefield,'design-trial deployment retains public visibility');
    const entry={specId:{...e.enemyShip.spec,id:'visibility-check-enemy'},cost:deploymentCost(e.enemyShip.spec)};
    const [first]=copy.deploySimulationShips([entry],false),[later]=copy.deploySimulationShips([entry],false);
    verify(first.pos.distanceTo(copy.playerShip.pos)<3000,'initial enemy formation remains near the player');
    verify(Math.abs(later.pos.y)>BATTLE_HALF_EXTENT&&later.isVisibleTo(copy.playerShip.teamId),'later reinforcements remain visible at the battlefield edge');
    copy.switchPlayerShip(DEFAULT_PLAYER_HULL,DEFAULT_ENEMY_HULL);
    verify(copy.openBattlefield,'restart does not restore sensor-distance limits');
    const canvas=document.getElementById('battle'),gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
    verify(!!gl,'WebGL2 available');
    const renderer=new WebGLCombatRenderer(canvas,gl);await renderer.prepareAssets(combatRenderView(e));
    const draw=renderer.batcher.drawSprite.bind(renderer.batcher);let draws=[];
    renderer.batcher.drawSprite=(...args)=>{draws.push({texture:args[0],x:args[1],y:args[2],width:args[3],height:args[4],rotation:args[5],alpha:args[11],uv:args.slice(12,16)});return draw(...args);};
    const frame={visualTime:1,random:new VisualRandom(917),layers:new Set(['background','nebula','asteroid','hull','weapon','shield']),damageEnabled:true};
    const farRock=e.asteroids.find(a=>a.pos.x>3000&&a.pos.y>3000);
    verify(!!farRock,'far camera has physical asteroids');
    const camera=farRock.pos.clone();
    e.enemyShip.pos.set(camera.x+150,camera.y);e.enemyShip.prevPos.copy(e.enemyShip.pos);updateCombatVisibility(e.ships);
    const enemyTexture=renderer.textures.getTexture(e.enemyShip.spec.spriteUrl),cloudTexture=renderer.textures.getTexture(e.nebulae[0].spriteUrl),rockTexture=renderer.textures.getTexture(farRock.spriteUrl);
    const frames=[];
    for(const zoom of [.65,.2]){
      const environmentFrame={...frame,layers:new Set(['background','nebula','asteroid'])};
      renderer.render(combatRenderView(e),1,camera,zoom,environmentFrame);const environmentPixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,environmentPixels);
      draws=[];verify(renderer.render(combatRenderView(e),1,camera,zoom,frame),'far render submits at zoom '+zoom);
      verify(draws.some(d=>d.texture===enemyTexture),'far hull reaches actual sprite renderer at zoom '+zoom);
      verify(draws.some(d=>d.texture===rockTexture),'far asteroid reaches actual sprite renderer at zoom '+zoom);
      const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let lit=0,hullPixels=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]>15||pixels[i+1]>15||pixels[i+2]>20)lit++;if(pixels[i]!==environmentPixels[i]||pixels[i+1]!==environmentPixels[i+1]||pixels[i+2]!==environmentPixels[i+2])hullPixels++;}
      verify(hullPixels>100,'far hull contributes actual GPU pixels at zoom '+zoom);
      verify(lit>1000,'actual far GPU frame contains visible pixels at zoom '+zoom);verify(gl.getError()===0,'far frame has no WebGL error at zoom '+zoom);
      frames.push({camera:{x:camera.x,y:camera.y},zoom,hullDistance:e.enemyShip.pos.distanceTo(e.playerShip.pos),spriteSubmissions:draws.length,culled:renderer.batcher.culledSprites,litPixels:lit,hullPixels});
      if(zoom===.65)window.__farClosePng=canvas.toDataURL('image/png');else window.__farWidePng=canvas.toDataURL('image/png');
    }
    e.enemyShip.pos.set(150,600);e.enemyShip.prevPos.copy(e.enemyShip.pos);draws=[];
    verify(renderer.render(combatRenderView(e),1,e.playerShip.pos,.65,frame),'near-camera frame still renders');
    verify(draws.some(d=>d.texture===enemyTexture),'near hull still rendered after visiting far camera');
    verify(e.asteroids.length===78,'camera travel never creates or deletes asteroids');
    window.__nearPng=canvas.toDataURL('image/png');
    // Inspect a complete formation at its own center, not a fixed atlas tile.
    const cloudFrame={...frame,layers:new Set(['background','nebula'])};
    renderer.render(combatRenderView(e),1,e.playerShip.pos.clone().set(0,0),.04,cloudFrame);
    window.__terrainWidePng=canvas.toDataURL('image/png');
    const detailCamera=e.nebulae[0].pos.clone();
    renderer.render(combatRenderView(e),1,detailCamera,.55,{...cloudFrame,layers:new Set(['background'])});
    const backgroundPixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,backgroundPixels);
    draws=[];renderer.render(combatRenderView(e),1,detailCamera,.55,cloudFrame);
    const cloudDraws=draws.filter(d=>d.texture===cloudTexture);
    verify(cloudDraws.length===1,'actual GPU renders the formation as one sprite, without repeated tiles');
    verify(cloudDraws[0].width===2200&&cloudDraws[0].height===2200&&JSON.stringify(cloudDraws[0].uv)==='[0,0,1,1]','actual GPU uses configured size and full-image UVs');
    const cloudPixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,cloudPixels);
    let cloudContribution=0;for(let i=0;i<cloudPixels.length;i+=4)if(cloudPixels[i]!==backgroundPixels[i]||cloudPixels[i+1]!==backgroundPixels[i+1]||cloudPixels[i+2]!==backgroundPixels[i+2])cloudContribution++;
    verify(cloudContribution>1000,'standalone cloud contributes visible real GPU pixels');
    window.__nebulaDetailPng=canvas.toDataURL('image/png');
    verify(gl.getError()===0,'whole-cloud close/whole-map renders have no WebGL errors');
    renderer.dispose();
    const {checkOwnedStatWorker,checkRealLocalWorker}=await import('/scripts/lib/simulation-owned-stat-contracts.mjs');
    const ownedStats=await checkOwnedStatWorker(location.origin);
    verify(ownedStats.unknownCallbacksLive&&ownedStats.inlineLegacyDispatch,'isolated Worker scalar/motion contracts');
    const localWorker=await checkRealLocalWorker(location.origin,DEFAULT_PLAYER_HULL,DEFAULT_ENEMY_HULL);
    verify(localWorker.restore&&localWorker.renderDecode,'actual local Worker command/step/restore/render contract');
    return {checks,ownedStats,localWorker,coverage,cloudContribution,terrain:{asteroids:e.asteroids.length,nebulaTiles:e.nebulae.length},frames,scope:'Production rules, HUD/map, authority snapshot and real WebGL; not live multiplayer or native-game/UI end-to-end'};
  });
  for(const [name,key] of [['far-close','__farClosePng'],['far-wide','__farWidePng'],['near','__nearPng'],['terrain-wide','__terrainWidePng'],['nebula-detail','__nebulaDetailPng'],['nebula-map','__nebulaMapPng']]){
    const png=await page.evaluate(key=>window[key],key);if(!png)continue;await fs.writeFile(path.join(output,name+'.png'),Buffer.from(png.split(',')[1],'base64'));
  }
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'verification.json'),JSON.stringify({...result,pageErrors:errors},null,2));
  console.log(JSON.stringify({checks:result.checks.length,ownedStats:result.ownedStats,localWorker:result.localWorker,terrain:result.terrain,frames:result.frames,pageErrors:errors},null,2));
} finally {await browser.close();await server?.close();}
