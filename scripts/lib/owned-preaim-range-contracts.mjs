import assert from 'node:assert/strict';

export function checkOwnedPreAimRange(lab, fixture, snapshot) {
  const {Vector2,PreAimRangeIndex,AutofireController,BeforeAutofireController,FireControlQueryRoster:Roster,FireControlQueryBatch:Batch}=lab;
  let checks=0,queries=0,reduced=0,compared=0;
  const equal=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
  const ok=(value,message)=>{assert.ok(value,message);checks++;};
  let seed=971;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const radius=s=>Math.max(s.spec.collisionRadius,s.shield.isActive&&s.shield.type!=='NONE'&&s.shield.type!=='PHASE'?s.shield.radius+s.getShieldCenter().distanceTo(s.pos):0);
  // Frozen old predicate, not the index's implementation or a squared-distance surrogate.
  const outside=(s,q)=>{
    const limit=q.range+radius(s),horizon=q.delay+(q.beam?0:limit/q.speed);
    const reach=limit+(Math.abs(s.vel.x-q.velocity.x)+Math.abs(s.vel.y-q.velocity.y))*horizon;
    const distance=Math.max(Math.abs(s.pos.x-q.origin.x),Math.abs(s.pos.y-q.origin.y));
    const pad=1e-6*Math.max(1,Math.abs(s.pos.x),Math.abs(s.pos.y),Math.abs(q.origin.x),Math.abs(q.origin.y),Math.abs(reach));
    return q.speed>0&&q.delay>=0&&limit>=0&&horizon>=0&&Number.isFinite(reach)&&distance>reach+pad;
  };
  for(let layout=0;layout<12;layout++){
    const ships=Array.from({length:64},(_,i)=>({pos:new Vector2((random()-.5)*(layout%2?600:60000),(random()-.5)*(layout%2?60000:600)),vel:new Vector2((random()-.5)*2400,(random()-.5)*2400),spec:{collisionRadius:20+random()*400},shield:{isActive:i%3===0,type:i%7===0?'PHASE':'OMNI',radius:random()*800,currentArcDeg:0},offset:new Vector2((random()-.5)*800,(random()-.5)*800),getShieldCenter(){return this.pos.clone().add(this.offset);}}));
    if(layout===8)ships[3].vel.x=NaN;
    if(layout===9)ships[3].pos.y=Infinity;
    if(layout===10)for(const s of ships){s.pos.x*=1e299;s.vel.x*=1e299;}
    if(layout===11)for(const s of ships){s.pos.x*=1e-310;s.pos.y*=1e-310;s.vel.set(0,0);s.spec.collisionRadius=0;s.shield.isActive=false;}
    const index=new PreAimRangeIndex(ships);
    for(let query=0;query<96;query++){
      const q={origin:new Vector2((random()-.5)*2000,(random()-.5)*2000),velocity:new Vector2((random()-.5)*400,(random()-.5)*400),range:random()*2000,speed:200+random()*2200,delay:random()*2,beam:query%4===0};
      if(query===0)q.range=-1;if(query===1)q.speed=0;if(query===2)q.delay=-1;if(query===3)q.origin.x=NaN;
      if(query===4)q.range=Infinity;if(query===5)q.speed=Infinity;if(query===6)q.velocity.y=Infinity;if(query===7)q.delay=Infinity;
      if(query===8)q.speed=Number.MIN_VALUE;if(query===9){q.range=0;q.delay=0;q.origin.set(0,0);}
      const result=index.query(q.origin,q.velocity,q.range,q.speed,q.delay,q.beam);queries++;if(result.length<ships.length)reduced++;
      const kept=new Set(result);equal(result,ships.filter(s=>kept.has(s)),'original order and no duplicates');
      for(const s of ships)if(!outside(s,q))ok(kept.has(s),'must contain every target admitted by the old predicate');
      if(layout===8||layout===9)equal(result,ships,'uncertain target state keeps full roster');
    }
  }
  ok(reduced>100,'math contract must exercise actual pruning');
  // Tangency and roundoff, inward motion, and shields with an unfolding zero arc.
  const contacts=Array.from({length:64},(_,i)=>({pos:new Vector2(i?20000+i*100:1200,0),vel:new Vector2(),spec:{collisionRadius:10},shield:{isActive:true,type:'OMNI',radius:100,currentArcDeg:0},getShieldCenter(){return this.pos.clone().add(new Vector2(100,0));}}));
  for(const [x,vx] of [[1200,0],[1200*(1+1e-6),0],[10000,-20000],[Number.MAX_VALUE,-Number.MAX_VALUE]]){
    contacts[0].pos.x=x;contacts[0].vel.x=vx;
    const q={origin:new Vector2(),velocity:new Vector2(),range:1000,speed:1000,delay:0,beam:false};
    const result=new PreAimRangeIndex(contacts).query(q.origin,q.velocity,q.range,q.speed,q.delay,q.beam);
    if(!outside(contacts[0],q))ok(result.includes(contacts[0]),'contact boundary retained');
  }
  const f=fixture();Roster.ownForWorker(f.engine);const roster=Roster.create(f.ships,f.engine);ok(roster);
  const old=new (BeforeAutofireController??AutofireController)(),current=new AutofireController();
  const targets=f.ships.filter(s=>s.teamId!==f.ship.teamId);
  const query={origin:new Vector2(),range:1600,speed:1000,delay:0};const mount=f.ship.weapons.find(m=>m.mountType!=='HARDPOINT');ok(mount);
  const plain=Batch.fromRoster(f.ship,f.ships);
  for(let i=0;i<3;i++)equal(plain.preAimTargets(query,mount),plain.targets(),'generic batches keep original candidates');
  equal(plain.preAimIndex,undefined,'no ambient Worker permission');plain.close();
  let built=0,indexedBatches=0;
  for(let stage=0;stage<8;stage++){
    for(let i=0;i<targets.length;i++){targets[i].pos.set(1000+(i%5)*20,15000+i*150);targets[i].vel.set(0,0);targets[i].shield.isActive=false;}
    targets[stage%targets.length].pos.set(600+stage*20,0);
    if(stage===2)targets[2].vel.set(0,-20000);
    if(stage===3){targets[3].shield.isActive=true;targets[3].shield.radius=2200;targets[3].shield.currentArcDeg=0;targets[3].pos.set(2600,0);}
    if(stage===4)targets[4].pos.x=NaN;
    if(stage===5)targets[5].vel.x=Infinity;
    if(stage===6)f.ship.currentTargetShip=targets[6];else f.ship.currentTargetShip=null;
    const batch=roster.begin(f.ship,f.world);ok(batch,'real Worker-owned admission, not fromRoster bypass');
    equal(batch.preAimTargets(query,mount),batch.targets(),'first query does not build');equal(batch.preAimIndex,undefined);
    const selected=batch.preAimTargets(query,mount);ok(batch.preAimIndex);built++;if(selected.length<batch.targets().length)indexedBatches++;
    for(const weapon of f.ship.weapons){
      const read=(controller,world)=>{const value=controller.aim(.1,f.ship,weapon,world),pre=controller.preAim(f.ship,weapon,world),decision=controller.decide(f.ship,weapon,value,world,.1);
        return {state:snapshot(controller,{...f,mount:weapon},value),pre:pre&&[pre.x,pre.y],decision};};
      equal(read(current,{...f.world,queryBatch:batch}),read(old,f.world),`mount ${stage}/${weapon.slotId}`);compared++;
    }
    batch.close();equal(batch.preAimIndex,undefined);equal(batch.forShip(f.ship,f.ships),undefined);equal(batch.preAimTargets(query,mount),f.ships,'closed batch never uses stale geometry');
  }
  for(const count of [15,16,27]){
    for(let i=0;i<targets.length;i++)targets[i].visibilityMask=i<count?3:0;
    const batch=roster.begin(f.ship,f.world);ok(batch);equal(batch.targets().length,count,'real filtered target count');
    batch.preAimTargets(query,mount);equal(batch.preAimIndex,undefined,'first query remains unindexed');
    batch.preAimTargets(query,mount);equal(!!batch.preAimIndex,count>=16,'visibility-filtered threshold '+count);batch.close();
  }
  roster.close();ok(indexedBatches>=4);ok(compared>=100);
  return {checks,queries,reduced,built,indexedBatches,compared,baseline:!!BeforeAutofireController};
}
