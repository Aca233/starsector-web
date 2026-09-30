import assert from 'node:assert/strict';
// Extends the existing simulation-hotpaths scenario; no separate test project.
export function checkNavigationPhaseIndex(api){
 const {Vector2,LocalCombatKernel,NavigationObstacleIndex:Index,FireControlQueryRoster:Roster,avoidCollisions,forwardPathClear,reference,referenceForward}=api;
 let checks=0,seed=3917,pruned=0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
 const rows=Array.from({length:128},(_,i)=>({id:i,pos:new Vector2(),vel:new Vector2(),spec:{collisionRadius:10},shield:{radius:20,isActive:false,type:'OMNI'}}));
 for(let trial=0;trial<360;trial++){
  const scale=trial<340?1:[1e-15,1e15,1e76,1e160,1e300][trial%5];
  for(const s of rows){s.pos.set((random()-.5)*16000*scale,(random()-.5)*16000*scale);s.vel.set((random()-.5)*1000*scale,(random()-.5)*1000*scale);s.spec.collisionRadius=random()*150*scale;s.shield.radius=random()*250*scale;s.shield.isActive=random()>.5;s.shield.type=random()>.3?'OMNI':'PHASE';}
  const x=(random()-.5)*3000*scale,y=(random()-.5)*3000*scale,radius=100*scale,maxSpeed=random()*200*scale,speed=random()*200*scale,horizon=trial%7===0?0:random()*8;
  const index=new Index(rows),selected=index.select(rows,x,y,radius,maxSpeed,speed,horizon)??rows;
  const accepted=rows.filter(s=>!(Math.hypot(x-s.pos.x,y-s.pos.y)>radius+Math.max(s.spec.collisionRadius,s.shield.isActive&&s.shield.type!=='PHASE'?s.shield.radius:0)+(maxSpeed+speed+Math.hypot(s.vel.x,s.vel.y))*horizon));
  const set=new Set(selected);equal(accepted.every(s=>set.has(s)),true,'never reject an original obstacle '+trial);
  equal(selected.map(s=>rows.indexOf(s)),selected.map(s=>rows.indexOf(s)).toSorted((a,b)=>a-b),'preserve roster order '+trial);
  if(selected.length<rows.length)pruned++;
  equal(index.select(rows.slice(),x,y,radius,maxSpeed,speed,horizon),undefined,'foreign roster');
  index.close();equal(index.select(rows,x,y,radius,maxSpeed,speed,horizon),undefined,'closed phase');
 }
 assert.ok(pruned>100,'must really prune rather than trivially return the entire roster');checks++;
 const negative=Array.from({length:12},(_,i)=>({pos:new Vector2(i===0?15:1000+i*100,0),vel:new Vector2(),spec:{collisionRadius:-10},shield:{radius:-20,isActive:false,type:'NONE'}}));
 const negativeIndex=new Index(negative);equal(negativeIndex.select(negative,0,0,20,0,0,0),[negative[0]],'inactive shield contributes zero even for invalid negative metadata');negativeIndex.close();
 const near={pos:new Vector2(15,0),vel:new Vector2(),spec:{collisionRadius:5},shield:{radius:5,isActive:false,type:'NONE'}};
 const far={...near,pos:new Vector2(10000,0),vel:new Vector2()};
 const rest=Array.from({length:10},(_,i)=>({...near,pos:new Vector2(20000+i*100,0)}));
 const roster=[far,near,...rest,near],index=new Index(roster);
 equal(index.select(roster,0,0,10,0,0,0),[near,near],'inclusive exact boundary and duplicate identity order');
 far.shield={...far.shield,radius:10001};index.invalidate(far);
 equal((index.select(roster,0,0,10,0,0,0)??roster).includes(far),true,'expanded inactive shield bound');
 far.pos.x=0;index.invalidate(far);equal(index.select(roster,0,0,10,0,0,0),undefined,'motion invalidates sorted phase');
 const speedIndex=new Index(roster);speedIndex.select(roster,0,0,10,0,0,1);rest[0].vel=new Vector2(-1e6,0);speedIndex.invalidate(rest[0]);
 equal((speedIndex.select(roster,0,0,10,0,0,1)??roster).includes(rest[0]),true,'increased speed bound');speedIndex.close();
 for(const bad of [NaN,Infinity,-Infinity]){const unsafe=new Index([{...near,pos:new Vector2(bad,0)},...rest]);equal(unsafe.select(unsafe.ships,0,0,10,0,0,1),undefined,'nonfinite position');unsafe.close();}
 for(const horizon of [-1,NaN,Infinity]){const unsafe=new Index(roster);equal(unsafe.select(roster,0,0,10,0,0,horizon),undefined,'nonfinite/negative horizon');unsafe.close();}
 const changed=[...roster],membership=new Index(changed);membership.select(changed,0,0,10,0,0,1);changed.pop();equal(membership.select(changed,0,0,10,0,0,1),undefined,'membership length');membership.close();

 const kernel=new LocalCombatKernel({playerHull:'onslaught',enemyHull:'onslaught',seed:917,multicore:false});
 try{
  const engine=kernel.engine;for(let i=0;i<98;i++)engine.addShip('onslaught',i%2===0,new Vector2((i%10)*600-3000,Math.floor(i/10)*600-3000),0);
  const ships=engine.ships,ship=engine.playerShip,world={ships,asteroids:[],projectiles:[],beams:[]};
  for(let trial=0;trial<48;trial++){
   ship.pos.set(0,0);ship.vel.set((random()-.5)*100,(random()-.5)*100);ship.facingRad=random()*Math.PI*2;
   for(let i=1;i<ships.length;i++){const other=ships[i];other.pos.set((random()-.5)*8000,(random()-.5)*8000);other.vel.set((random()-.5)*200,(random()-.5)*200);other.isDead=i%31===trial%31;other.shield.isActive=(i+trial)%2===0;}
   // Include nearby moving hulls so risk scoring/detour ordering is exercised.
   ships[1].isDead=false;ships[1].pos.set(80,0);ships[1].vel.set(-40,20);
   const phase=new Index(ships),scene={...world,navigationObstacleIndex:phase},desired=new Vector2((random()-.5)*200,(random()-.5)*200);
   equal(avoidCollisions(ship,desired,scene),reference(ship,desired,world),'full collision-risk result '+trial);
   equal(forwardPathClear(ship,scene,150,3),referenceForward(ship,world,150,3),'full forward corridor '+trial);
   ships[1].shield.isActive=!ships[1].shield.isActive;ships[1].shield.phaseEffectLevel=1;ships[1].shield.phaseState='ACTIVE';
   const type=ships[1].shield.type;ships[1].shield.type='PHASE';phase.invalidate(ships[1]);
   equal(avoidCollisions(ship,desired,scene),reference(ship,desired,world),'live phase/defense eligibility '+trial);
   ships[1].shield.type=type;ships[1].shield.phaseState='IDLE';ships[1].shield.phaseEffectLevel=0;phase.close();
  }
  // An owner dependency recorder must still observe EVERY original obstacle,
  // including far rows. A poisoned index proves no broadphase call sneaks in.
  const poison={select(){throw Error('forbidden index call');}},log=[];
  const observed={...world,navigationObstacleIndex:poison,noteNavigationObstacle:(_ship,other,horizon)=>log.push([other.id,horizon])};
  const desired=new Vector2(60,20);const a=avoidCollisions(ship,desired,observed),first=log.splice(0),b=reference(ship,desired,observed);
  equal(a,b,'dependency recorder result');equal(log,first,'dependency recorder retains original call order');
  // A generic caller never opted into the index. Merely checking whether the
  // optimized path is available must not introduce extra observable reads.
  const position=ship.pos,descriptor=Object.getOwnPropertyDescriptor(position,'distanceTo'),distance=position.distanceTo;let reads=0;
  Object.defineProperty(position,'distanceTo',{configurable:true,get(){reads++;return distance;}});
  try{
   reads=0;const oldResult=reference(ship,desired,world),oldReads=reads;
   reads=0;const newResult=avoidCollisions(ship,desired,world),newReads=reads;
   equal(newResult,oldResult,'generic distance reader result');equal(newReads,oldReads,'generic distance reader call count');
  }finally{if(descriptor)Object.defineProperty(position,'distanceTo',descriptor);else delete position.distanceTo;}
  const motion=ship.getMotionStats;ship.getMotionStats=function(){return motion.call(this);};
  try{equal(avoidCollisions(ship,desired,{...world,navigationObstacleIndex:poison}),reference(ship,desired,world),'custom motion retains legacy path');}finally{ship.getMotionStats=motion;}
 }finally{kernel.dispose();}
 // Real integration: no ambient admission on a generic engine. Only the private
 // Worker marker AND existing native phase gate can supply the new read index.
 const live=new LocalCombatKernel({playerHull:'onslaught',enemyHull:'onslaught',seed:917,multicore:false});
 const calls=[],select=Index.prototype.select;
 try{
  for(let i=0;i<98;i++)live.engine.addShip('onslaught',i%2===0,new Vector2((i%10)*600-3000,Math.floor(i/10)*600-3000),0);
  Index.prototype.select=function(...args){calls.push({index:this,args});return select.apply(this,args);};
  equal(Roster.isWorkerOwned(live.engine),false,'generic ownership');live.engine.fixedUpdate(1/60);equal(calls.length,0,'generic engine stays uncached');
  Roster.ownForWorker(live.engine);live.engine.fixedUpdate(1/60);assert.ok(calls.length>0,'real engine uses native index');checks++;
  const {index:closed,args}=calls.at(-1);equal(select.apply(closed,args),undefined,'engine finally closes index');calls.length=0;
  live.engine.enemyShip.damageTakenModifiers.set('external',()=>1);live.engine.fixedUpdate(1/60);equal(calls.length,0,'unknown hook disables native phase');
 }finally{Index.prototype.select=select;live.dispose();}
 console.log('navigation phase index:',checks,'assertions,',pruned,'conservative pruning cases');return checks;
}
