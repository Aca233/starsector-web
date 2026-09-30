import assert from 'node:assert/strict';
/** Invoked by the existing army scenario; production rules/Ship, no duplicate model. */
export function checkGlorianaFeedback(m,test,fit){
 const make=()=>new m.Ship('feedback',fit.spec,true,new m.Vector2(),0);
 const part=(s,id)=>s.childModules.find(c=>c.moduleMount.slotId===id);
 const tick=(s,dt=1/60)=>s.update(dt,null,()=>{},()=>{});
 const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 const start=(s,side='P')=>{s.aimTargetWorld.set(0,side==='P'?-3000:3000);assert(s.system.activate());};
 test('feedback: accepted side, stage strength, cursor/pose independence, no core or engine aura',()=>{
  for(const side of ['P','S']){
   const s=make();start(s,side);assert(s.assemblyShips.every(c=>!c.surfaceFeedback));
   s.system.update(.4);const parts=s.childModules.filter(c=>c.surfaceFeedback);
   assert.deepEqual(parts.map(c=>c.moduleMount.slotId).sort(),[1,2,3].map(n=>side+n));
   for(const c of parts){assert.equal(c.surfaceFeedback.mode,'ORDER');near(c.surfaceFeedback.level,.5);}
   s.aimTargetWorld.set(0,side==='P'?3000:-3000);s.facingRad=1.7;s.pos.set(300,800);
   assert.deepEqual(s.childModules.filter(c=>c.surfaceFeedback).map(c=>c.moduleMount.slotId),parts.map(c=>c.moduleMount.slotId));
   s.system.update(.4);near(parts[0].surfaceFeedback.level,1);
   s.system.update(6.5);assert.equal(s.system.state,'OUT');near(parts[0].surfaceFeedback.level,.5);
   s.system.update(.5);assert(s.assemblyShips.every(c=>!c.surfaceFeedback));
  }
 });
 test('feedback: source interruption and module unavailability remove only real beneficiaries',()=>{
  const mutations=[s=>s.flux.isVenting=true,s=>s.flux.isOverloaded=true,s=>s.retreating=true,s=>s.system.disabled=true,s=>s.hullHp=0,s=>s.isRetreated=true,s=>s.isDocked=true];
  for(const mutate of mutations){const s=make();start(s);s.system.update(.8);mutate(s);assert(s.childModules.every(c=>!c.surfaceFeedback));}
  for(const mutate of [c=>c.flux.isVenting=true,c=>c.flux.isOverloaded=true,c=>c.hullHp=0,c=>c.parentShip=null,c=>c.weapons.forEach(w=>w.isDisabled=true),c=>c.weapons.forEach(w=>w.ammo=0)]){
   const s=make();start(s);s.system.update(.8);const p=part(s,'P1');mutate(p);assert.equal(p.surfaceFeedback,undefined);assert.equal(part(s,'P2').surfaceFeedback.mode,'ORDER');
  }
  const s=make();start(s);s.system.update(.8);s.flux.isVenting=true;
  m.glorianaEdict.onAdvance(s,1/60,null,s.system);s.flux.isVenting=false;
  assert(s.childModules.every(c=>!c.surfaceFeedback),'fast vent completion must not revive cancelled order');
 });
 test('feedback: actual local sealing/payment, waiting, pause, expiry, exhausted stock, and dead owner',()=>{
  const s=make(),p=part(s,'P1');start(s);s.system.update(.8);
  p.hullHp=p.maxHullHp*.4;p.flux.hardFlux=p.flux.maxFlux*.8;
  assert.equal(p.surfaceFeedback.mode,'WAITING');tick(p);assert.equal(p.surfaceFeedback.mode,'WAITING');assert(!p.system.blocksWeapons);
  const paid=[],spend=p.flux.increaseFluxClamped.bind(p.flux);p.flux.increaseFluxClamped=(amount,hard)=>{paid.push({amount,hard});spend(amount,hard);};
  p.flux.hardFlux=0;tick(p);assert.equal(p.surfaceFeedback.mode,'SEALED');assert.deepEqual(paid,[{amount:p.flux.maxFlux*.25,hard:true}]);assert(p.system.blocksWeapons);
  tick(p,.2);const snapshot=p.surfaceFeedback;near(snapshot.progress,.2/6);assert(snapshot.level>0&&snapshot.level<1);
  tick(p,0);assert.deepEqual(p.surfaceFeedback,snapshot);assert.equal(part(s,'P2').surfaceFeedback.mode,'ORDER');assert.equal(part(s,'S1').surfaceFeedback,undefined);
  tick(p,5.6);assert(p.surfaceFeedback.level<.5);tick(p,.2);assert(!p.system.blocksWeapons);assert.equal(p.surfaceFeedback.mode,'ORDER');
  s.system.update(7);tick(p);assert.equal(p.surfaceFeedback,undefined,'spent seal cannot relight');
  const fresh=make(),q=part(fresh,'S2');q.hullHp=q.maxHullHp*.4;tick(q);tick(q,.5);assert.equal(q.surfaceFeedback.mode,'SEALED');fresh.hullHp=0;assert.equal(q.surfaceFeedback,undefined);
 });
 test('feedback: local, LAN and fixed display lane sample pure data and clear reused records',()=>{
  const s=make();start(s);s.system.update(.8);const p=part(s,'P1');
  const local=new m.RenderShipProjection(),lan=new m.LanShipProjection(),encoder=new m.ShipDisplayEncoder(),decoder=new m.ShipDisplayDecoder();
  for(let i=0;i<3;i++){
   if(i===1){p.hullHp=p.maxHullHp*.4;tick(p);tick(p,.5);}
   if(i===2)p.hullHp=0;
   const expected=p.surfaceFeedback;local.begin();assert(local.supports([s,p]));assert.deepEqual(local.project(p).surfaceFeedback,expected);local.finish();
   lan.begin();assert.deepEqual(lan.project(p).surfaceFeedback,expected);lan.finish();
   const received=decoder.decode(encoder.capture([s,p],i+1,i===0)).ships.find(c=>c.id===p.id);
   assert.deepEqual(received.surfaceFeedback,expected);assert.equal(received.update,undefined);
   if(expected)assert.deepEqual(Object.keys(received.surfaceFeedback).sort(),['level','mode','progress']);
  }
  for(const v of [null,{mode:'ORDER',level:NaN,progress:0},{mode:'ORDER',level:2,progress:0},{mode:'NOPE',level:1,progress:1}])assert(!m.validSurfaceFeedback(v));
 });
 test('feedback: receiver glow uses fixed texture windows, not recoiling barrels or phantom firing',()=>{
  const s=make(),p=part(s,'P1'),mount=p.weapons.find(w=>w.spec.id===m.GLORIANA_WEAPONS.macro);
  const calls=[],ctx={batcher:{setBlendMode(){},drawSprite:(...args)=>calls.push(args)}};
  mount.recoil=.9;const state={ammo:mount.ammo,recoil:mount.recoil,charge:mount.glowAlpha};
  m.renderGlorianaOrderReceiver(ctx,mount,'texture',100,200,.6,.8,1);
  const profile=m.glorianaRecoilProfiles[mount.spec.id];assert.equal(calls.length,profile.fixed.length);assert(calls.length>0);
  for(const [i,rect] of profile.fixed.entries()){near(calls[i][12],rect.x/profile.width);near(calls[i][13],rect.y/profile.height);near(calls[i][11],.8*.22);}
  assert.deepEqual({ammo:mount.ammo,recoil:mount.recoil,charge:mount.glowAlpha},state);
  calls.length=0;mount.isDisabled=true;m.renderGlorianaOrderReceiver(ctx,mount,'texture',0,0,0,1,1);assert.equal(calls.length,0);
 });
}
