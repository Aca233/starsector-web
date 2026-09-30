import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

/** Runs inside the existing Ark acceptance bundle against the registered production content. */
export function checkExtensionBallistics(m,test,setup,out) {
 const V=m.Vector2,report={ranges:{},flights:[],contacts:[],render:[]};
 const approx=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
 const open=()=>{const e=setup();e.playerShip.pos.set(-10000,-10000);e.playerShip.prevPos.copy(e.playerShip.pos);e.playerShip.syncModuleTree(true);e.enemyShip.pos.set(15000,15000);e.enemyShip.prevPos.copy(e.enemyShip.pos);return e;};
 const launch=(e,id,overrides={})=>m.spawnSystemProjectile(e.playerShip,id,new V(),0,{projectiles:e.projectiles,combatRandom:e.random},overrides);
 const tick=(e,dt)=>e.weaponSystem.updateProjectiles(dt,e.getWeaponSimContext());
 const wreck=(e,x)=>({id:99,pos:new V(x,0),vel:new V(),facingRad:0,angularVel:0,sourceShip:e.enemyShip,age:1,breakup:null,
  bounds:[[-25,-90],[25,-90],[25,90],[-25,90]].map(p=>new V(...p)),visualBounds:null,mountSlotIds:[],localOffset:new V(),collisionRadius:100});
 const rock=(x)=>({id:998,pos:new V(x,0),vel:new V(),facingRad:0,angularVel:0,radius:20,mass:100,hp:100000,maxHp:100000,spriteUrl:'/game-assets/graphics/asteroids/asteroid1.png'});
 test('extension ballistics ranges match launched ships, role ladder and torpedo endurance',()=>{
  const expected={web_gloriana_macro:2200,web_gloriana_lance:2600,web_gloriana_siege:2000,web_gloriana_torpedo:3200,web_gloriana_bolter:700,web_gloriana_interceptor:850,
   web_sc2_hyperion_ata:1600,web_sc2_hyperion_al:1350,web_sc2_hyperion_pd:650,web_sc2_hyperion_yamato_shot:2400,
   web_ark_solar_lance:3800,web_ark_phase_battery:3200,web_ark_ion_battery:2800,web_ark_guard_prism:1050};
  // IDs are resolved from registered content; never fabricate replacement weapon definitions.
  for(const [id,range] of Object.entries(expected)){
   const spec=m.modManager.getWeapon(id);assert(spec,id);assert.equal(spec.range,range,id);report.ranges[id]=range;
   if(!spec.isBeam){const e=open(),p=launch(e,id);approx(p.totalRange,spec.systemOnly?range:m.combatWeaponRange(e.playerShip,spec));}
  }
  const e=open(),p=launch(e,'web_gloriana_torpedo');p.isGuided=false;
  // A real missile can reach its declared range before losing propulsion.
  for(let i=0;i<720&&e.projectiles.includes(p)&&p.pos.x<3200;i++)tick(e,1/60);
  assert(p.pos.x>=3195,`torpedo vanished too early: ${p.pos.x}`);assert(p.flightTimeRemaining>0);
  report.torpedo={distance:p.pos.x,flightRemaining:p.flightTimeRemaining};
 });
 test('extension ballistics travel beyond nominal range with bounded damage/visual fade, not instant deletion',()=>{
  for(const id of ['web_gloriana_macro','web_gloriana_siege','web_gloriana_bolter','web_sc2_hyperion_ata','web_sc2_hyperion_al','web_sc2_hyperion_yamato_shot','web_ark_solar_lance','web_ark_phase_battery','web_ark_ion_battery','web_ark_air_capacitor']){
   const e=open();e.playerShip.vel.set(240,70);const p=launch(e,id),before=p.damage;
   assert(m.hasSourceProjectileLifecycle(p),id);
   for(let i=0;i<1200&&p.rangeRemaining>0;i++)tick(e,1/120);
   assert(e.projectiles.includes(p),id+' removed at range boundary');
   for(let i=0;i<Math.ceil(p.fadeTime*.45*120);i++)tick(e,1/120);
   assert(e.projectiles.includes(p));assert(p.fadeProgress>0&&p.fadeProgress<1);assert(p.damage>0&&p.damage<before);assert.equal(p.softFlux,true);
   // Travel is muzzle/world space; range consumes projectile-relative speed, not carrier drift.
   approx(p.rangeRemaining,p.totalRange-p.sourceMoveSpeed*p.elapsedTime);
   const viewer=open();m.applyCombatSnapshot(viewer,JSON.parse(JSON.stringify(m.captureCombat(e,1,{0:0},0))),true);
   const replica=viewer.projectiles.find(x=>x.id===p.id);assert(replica);approx(replica.fadeProgress,p.fadeProgress);
   report.flights.push({id,range:p.totalRange,time:p.elapsedTime,fade:p.fadeProgress,damageFraction:p.damage/before,worldX:p.pos.x});
   for(let i=0;i<180;i++)tick(e,1/120);assert(!e.projectiles.includes(p),id+' leaked');
  }
 });
 test('extension ballistics solid contacts use weapon materials and settle the first obstruction only',()=>{
  for(const surface of ['wreck','asteroid'])for(const id of ['web_gloriana_siege','web_sc2_hyperion_yamato_shot','web_ark_solar_lance','web_gloriana_torpedo']){
   const e=open();if(surface==='wreck'){const h=wreck(e,240);h.collisionRadius=250;h.bounds=[[-25,-245],[25,-245],[25,245],[-25,245]].map(p=>new V(...p));e.hulkFragments.push(h);}else e.asteroids.push(rock(240));
   const p=launch(e,id);p.vel.set(3000,0);p.isGuided=false;if(p.isRocket){p.engineAcceleration=0;p.maxSpeed=3000;p.proximityFuse=undefined;}
   tick(e,.1);assert(p.didDamage);assert(p.pos.x>=180&&p.pos.x<250,JSON.stringify(p.pos));
   assert(e.hitGlows.length>0||e.explosions.length>0,id+' missing impact');
   if(id==='web_ark_solar_lance')assert(e.hitGlows.some(g=>g.spriteUrl===m.ARK_IMPACT_FX));
   if(id==='web_gloriana_siege'||id==='web_sc2_hyperion_yamato_shot')assert(e.explosions.some(x=>x.puffs?.length),id+' missing authored burst');
   const glows=e.hitGlows.length,explosions=e.explosions.length,hp=e.asteroids[0]?.hp;
   tick(e,.05);assert.equal(e.hitGlows.length,glows);assert.equal(e.explosions.length,explosions);assert.equal(e.asteroids[0]?.hp,hp,'duplicate asteroid damage');
   report.contacts.push({id,surface,point:{...p.pos},glows,explosions});
   e.fxSystem.updateHitGlows(5);e.fxSystem.updateExplosions(5);assert.equal(e.hitGlows.length,0);assert.equal(e.explosions.length,0);
  }
  // Old code consumed on the rear wreck before even asking for the front contact.
  for(const first of ['ship','asteroid','wreck']){
   const e=open(),t=e.enemyShip;t.pos.set(first==='ship'?650:1300,0);t.prevPos.copy(t.pos);t.shield.isActive=false;t.shield.currentArcDeg=0;
   e.asteroids.push(rock(first==='asteroid'?220:1000));e.hulkFragments.push(wreck(e,first==='wreck'?210:1600));
   const initial=t.hullHp,armor=t.armor.cells.reduce((a,b)=>a+b,0),stone=e.asteroids[0].hp;
   const p=launch(e,'web_gloriana_siege');p.vel.set(2200,0);tick(e,.9);
   const shipHit=t.hullHp<initial||t.armor.cells.reduce((a,b)=>a+b,0)<armor;
   assert.equal(shipHit,first==='ship',first);assert.equal(e.asteroids[0].hp<stone,first==='asteroid',first);
   assert(p.pos.x<(first==='ship'?900:260),JSON.stringify({first,pos:p.pos}));
  }
 });
 test('extension ballistics heavy hits pierce missiles and destroyed fighters, but not intact shields',()=>{
  const e=open(),p=launch(e,'web_ark_solar_lance'),missile=launch(e,'web_gloriana_torpedo');
  missile.isPlayer=false;missile.teamId=1;missile.sourceShipId=e.enemyShip.id;missile.pos.set(100,0);missile.prevPos.copy(missile.pos);missile.vel.set(0,0);missile.maxSpeed=0;missile.engineAcceleration=0;missile.isGuided=false;missile.proximityFuse=undefined;
  tick(e,.1);assert(e.projectiles.includes(p));assert(!e.projectiles.includes(missile));assert(!p.didDamage);
  const f=new m.Ship('pierce-fighter',m.modManager.requireShip('web_ark_interceptor'),false,new V(270,0),Math.PI);f.teamId=1;f.shield.isActive=false;f.shield.currentArcDeg=0;e.fighterSystem.fighters.push(f);
  tick(e,.1);assert(f.isDead||f.hullHp<=0);assert(e.projectiles.includes(p));assert(!p.didDamage);
  const t=e.enemyShip;t.pos.set(900,0);t.prevPos.copy(t.pos);t.shield.isActive=true;t.shield.currentArcDeg=360;t.shield.facingAngleRad=Math.PI;
  tick(e,.35);assert(p.didDamage);assert(!e.projectiles.includes(p));assert(t.flux.totalFlux>0);assert(t.hullHp>0);
 });
 test('extension ballistics terrain penetration spends real energy and still hits the next solid in the same step',()=>{
  const e=open(),r=rock(100);r.hp=r.maxHp=350;e.asteroids.push(r);e.hulkFragments.push(wreck(e,210));
  const p=launch(e,'web_ark_solar_lance'),full=p.damage;tick(e,.18);
  assert(r.hp<=0);assert(e.projectiles.includes(p));assert(!p.didDamage);assert(p.damage<=full-950+1e-6);const left=p.damage;tick(e,.02);approx(p.damage,left);
  assert(p.damagedTargetIds.includes('terrain:asteroid:998'));assert(p.damagedTargetIds.includes('terrain:wreck:99'));
  assert(e.hitGlows.length>=2);report.penetration={initial:full,remaining:p.damage,passed:[...p.damagedTargetIds]};
  // A low-energy fading shot cannot regenerate enough energy to pass a new intact obstacle.
  const weak=open(),solid=rock(100);solid.hp=1000;weak.asteroids.push(solid);const q=launch(weak,'web_ark_solar_lance');q.damage=q.unfadedDamage=400;tick(weak,.1);assert(q.didDamage);assert(solid.hp>0);
  // Piercing a small wreck does not defer the following shield until the next tick.
  const after=open(),t=after.enemyShip;t.pos.set(850,0);t.prevPos.copy(t.pos);t.shield.isActive=true;t.shield.currentArcDeg=360;t.shield.facingAngleRad=Math.PI;
  after.hulkFragments.push(wreck(after,100));const shot=launch(after,'web_ark_solar_lance');tick(after,.65);assert(shot.didDamage);assert(t.flux.totalFlux>0);assert(!after.projectiles.includes(shot));
 });
 test('extension ballistics Yamato obstacle detonation damages nearby enemies without friendly fire or direct-hit double damage',()=>{
  const e=open(),r=rock(230);r.hp=350;e.asteroids.push(r);
  const hostile=new m.Ship('splash-hostile',m.modManager.requireShip('web_ark_interceptor'),false,new V(220,140),0);
  const friendly=new m.Ship('splash-friendly',m.modManager.requireShip('web_ark_interceptor'),true,new V(220,-140),0);
  for(const f of [hostile,friendly]){f.teamId=f.isPlayer?e.playerShip.teamId:e.enemyShip.teamId;f.shield.isActive=false;f.shield.currentArcDeg=0;e.fighterSystem.fighters.push(f);}
  const hostileHP=hostile.hullHp,friendlyHP=friendly.hullHp;launch(e,'web_sc2_hyperion_yamato_shot');tick(e,.3);
  assert(hostile.hullHp<hostileHP);assert.equal(friendly.hullHp,friendlyHP);assert(r.hp<=0);assert(e.explosions.some(x=>x.puffs?.length));
  tick(e,.02);assert.equal(e.weaponSystem.explosions.active.length,0,'damage volume must not drift beyond contact');
  // Splash removes a lower-index missile; it must not delete an unrelated later round.
  const indexed=open();indexed.asteroids.push({...rock(230),hp:350});
  const intercepted=launch(indexed,'web_gloriana_torpedo');intercepted.isPlayer=false;intercepted.teamId=indexed.enemyShip.teamId;intercepted.sourceShipId=indexed.enemyShip.id;intercepted.pos.set(215,100);intercepted.prevPos.copy(intercepted.pos);intercepted.vel.set(0,0);intercepted.engineAcceleration=0;intercepted.maxSpeed=0;intercepted.isGuided=false;intercepted.proximityFuse=undefined;
  const blast=launch(indexed,'web_sc2_hyperion_yamato_shot'),unrelated=launch(indexed,'web_gloriana_macro');unrelated.pos.set(1500,1500);unrelated.prevPos.copy(unrelated.pos);
  tick(indexed,.3);assert(!indexed.projectiles.includes(intercepted));assert(!indexed.projectiles.includes(blast));assert(indexed.projectiles.includes(unrelated),'splash removed the wrong projectile');
  const hits=[];
  for(const splash of [false,true]){const a=open(),t=a.enemyShip;t.pos.set(750,0);t.prevPos.copy(t.pos);t.shield.isActive=false;t.shield.currentArcDeg=0;const q=launch(a,'web_sc2_hyperion_yamato_shot');if(!splash)q.projectileExplosionSpec=undefined;tick(a,.7);hits.push({hp:t.hullHp,armor:Array.from(t.armor.cells)});assert(q.didDamage);}
  assert.deepEqual(hits[0],hits[1]);report.yamato={enemyDamage:hostileHP-hostile.hullHp,friendlyDamage:friendlyHP-friendly.hullHp,directHitNotDoubled:true};
 });
 test('extension ballistics bitmap body, tail and tip glints fade together through production render pass',()=>{
  const e=open(),p=launch(e,'web_gloriana_siege');p.pixelsPerTexel=undefined;p.elapsedTime=.6;
  const calls=[],noop=()=>{},ctx={alpha:1,zoom:1,hitGlowTex:'hit',viewport:{left:-10000,right:10000,top:-10000,bottom:10000},textures:{getTexture:u=>u},
   batcher:{flush:noop,resumeProgram:noop,setBlendMode:noop,drawSprite:(...a)=>calls.push(a)},ribbonBatcher:{begin:noop,end:noop}};
  const view={ships:[],projectiles:[p],localMuzzles:[],muzzleParticles:[],muzzleFlashes:[],movingRayFades:[]};
  const pass=new m.WebGLProjectilePass();
  p.fadeProgress=p.prevFadeProgress=0;pass.renderProjectilesAndMuzzle(view,ctx);const full=calls.map(c=>c.at(-1));assert(full.length>=5);
  calls.length=0;p.fadeProgress=p.prevFadeProgress=.6;pass.renderProjectilesAndMuzzle(view,ctx);assert.equal(calls.length,full.length);calls.forEach((c,i)=>approx(c.at(-1),full[i]*.4));
  report.render={layers:full.length,remainingOpacity:.4};
  writeFileSync(resolve(out,'extension-ballistics.json'),JSON.stringify(report,null,2));
 });
}
