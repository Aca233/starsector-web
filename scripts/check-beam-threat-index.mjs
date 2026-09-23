import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const dir=path.resolve('artifacts/beam-threat-contracts',`${Date.now()}-${process.pid}`);fs.mkdirSync(dir,{recursive:true});
await build({stdin:{loader:'ts',resolveDir:process.cwd(),contents:`
 export {CombatEngine} from './src/engine/simulation/CombatEngine';
 export {assessThreats as reference} from './scripts/lib/threat-assessment-reference';
 export {assessThreats as candidate} from './src/engine/ai/ThreatAssessment';
 export {BeamThreatIndex} from './src/engine/ai/BeamThreatIndex';
 export {Ship} from './src/engine/simulation/Ship';
 export {Vector2} from './src/engine/math/Vector2';
 export {segmentCircleEntry} from './src/engine/math/Geometry';
 export {modManager} from './src/engine/modding/ModManager';`},outfile:path.join(dir,'check.mjs'),bundle:true,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':JSON.stringify('/')}});
const {reference,candidate,BeamThreatIndex,Ship,Vector2,segmentCircleEntry,modManager,CombatEngine}=await import(pathToFileURL(path.join(dir,'check.mjs')));
let checks=0,seed=90222,queries=0,scanned=0,retained=0;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const ship=(id,team)=>{const s=new Ship(id,modManager.requireShip('paragon'),team===0,new Vector2(),0);s.teamId=team;s.weapons=[];return s;};
const ships=[ship('own',0),ship('enemy',1),ship('third',2)];
const beam=(id,x=0,y=0)=>({id,sourceShipId:ships[id%3].id,slotId:'slot-'+id%6,startPos:new Vector2(x,y),endPos:new Vector2(x+500,y),duration:2,damagePerSec:100,damageType:'ENERGY'});
for(let scene=0;scene<12;scene++){
 const beams=Array.from({length:200},(_,id)=>beam(id,(random()-.5)*20000,(random()-.5)*20000));
 for(const b of beams){b.endPos.set(b.startPos.x+(random()-.5)*5000,b.startPos.y+(random()-.5)*5000);b.duration=random()*3-.2;b.damageActive=random()>.08;b.damagePerSec=random()*1000;}
 beams.push(beams[0]);
 const index=BeamThreatIndex.create(ships,beams);assert.ok(index);checks++;
 for(let q=0;q<100;q++){
  const center=new Vector2((random()-.5)*20000,(random()-.5)*20000),radius=random()*700;
  const result=index.query(beams,ships,ships[0],center,radius);assert.ok(result);checks++;queries++;scanned+=beams.length;retained+=result.length;
  eq(result.filter(b=>segmentCircleEntry(b.startPos,b.endPos,center,radius)!==null),beams.filter(b=>segmentCircleEntry(b.startPos,b.endPos,center,radius)!==null),'ordered exact contacts');
  if(q%10===0){ships[0].pos.copy(center);const world={ships,beams,projectiles:[],asteroids:[]};eq(candidate(ships[0],{...world,beamThreatIndex:index},5,1),reference(ships[0],world,5,1),'complete beam threat result');}
 }
 eq(index.query(beams.slice(),ships,ships[0],new Vector2(),300),null,'replacement beam array falls back');
 eq(index.query(beams,ships.slice(),ships[0],new Vector2(),300),null,'replacement roster falls back');
 index.close();eq(index.query(beams,ships,ships[0],new Vector2(),300),null,'closed phase falls back');
}
ships[0].pos.set(0,0);
for(const magnitude of [0,1e-12,1,1000,1e10,1e40,1e76,1e160,Infinity,NaN]){
 const beams=[beam(0),beam(1),beam(2)];for(const b of beams){b.startPos.set(magnitude,-magnitude);b.endPos.set(-magnitude,magnitude);}
 const index=BeamThreatIndex.create(ships,beams);assert.ok(index);checks++;
 for(const radius of [0,-1,100,1e40,Infinity,NaN]){
  const world={ships,beams,projectiles:[],asteroids:[]};const query=index.query(beams,ships,ships[0],new Vector2(),radius)??beams;
  eq(query.filter(b=>segmentCircleEntry(b.startPos,b.endPos,new Vector2(),radius)!==null),beams.filter(b=>segmentCircleEntry(b.startPos,b.endPos,new Vector2(),radius)!==null),'extreme geometry is conservative');
  eq(candidate(ships[0],{...world,beamThreatIndex:index},5,1),reference(ships[0],world,5,1),'extreme full assessment');
 }
}
{
 const duplicates=[ships[0],ships[1],ship('enemy',0),ships[2]];
 const beams=[beam(1),beam(1),beam(2),beam(0)];beams[0].damageActive=false;
 const index=BeamThreatIndex.create(duplicates,beams);assert.ok(index);checks++;
 const world={ships:duplicates,beams,projectiles:[],asteroids:[]};
 eq(candidate(ships[0],{...world,beamThreatIndex:index},5,1),reference(ships[0],world,5,1),'first matching source ID and beam duplicate order');
 // Source allegiance/life are live, not cached in the geometry index.
 ships[1].teamId=0;ships[2].isDead=true;
 eq(candidate(ships[0],{...world,beamThreatIndex:index},5,1),reference(ships[0],world,5,1),'live allegiance and death');
 ships[1].teamId=1;ships[2].isDead=false;
}
for(const field of ['sourceShipId','duration','damageActive','startPos']){
 const b=beam(1);let reads=0;const value=b[field];Object.defineProperty(b,field,{get(){reads++;return value;}});
 eq(BeamThreatIndex.create(ships,[b]),undefined,'unknown beam reader falls back: '+field);eq(reads,0,'qualification does not invoke getter');
}
{
 const b=beam(1);let reads=0;Object.defineProperty(b.startPos,'x',{get(){reads++;return 0;}});
 eq(BeamThreatIndex.create(ships,[b]),undefined,'unknown coordinate reader');eq(reads,0,'no coordinate getter invoked');
 const source=ships[1],original=Object.getOwnPropertyDescriptor(source,'id');Object.defineProperty(source,'id',{get(){reads++;return 'enemy';},configurable:true});
 eq(BeamThreatIndex.create(ships,[beam(0)]),undefined,'unknown ship ID reader');eq(reads,0,'no source getter invoked');Object.defineProperty(source,'id',original);
}
for(const field of ['sourceShipId','slotId','duration','damagePerSec','damageType']) {
 const b=beam(1);let reads=0;b[field]={valueOf(){reads++;return 1;},toString(){reads++;return 'enemy';}};
 eq(BeamThreatIndex.create(ships,[b]),undefined,'custom scalar conversion falls back: '+field);
 eq(reads,0,'qualification cannot invoke scalar conversion');
}
{
 const beams=[beam(1)],index=BeamThreatIndex.create(ships,beams),shield=ships[0].shield;
 assert.ok(index);checks++;
 const original=Object.getOwnPropertyDescriptor(shield,'efficiency');let reads=0;
 Object.defineProperty(shield,'efficiency',{get(){reads++;return 1;},configurable:true});
 eq(index.query(beams,ships,ships[0],new Vector2(),300),null,'unknown target shield reader falls back');
 eq(reads,0,'no shield getter during qualification');Object.defineProperty(shield,'efficiency',original);
 shield.damageTakenModifiers.set('unknown',{valueOf(){reads++;return 1;}});
 eq(index.query(beams,ships,ships[0],new Vector2(),300),null,'unknown shield multiplier conversion falls back');
 eq(reads,0,'no modifier coercion during qualification');shield.damageTakenModifiers.delete('unknown');
 Object.defineProperty(shield.damageTakenModifiers,'values',{get(){reads++;return Map.prototype.values;},configurable:true});
 eq(index.query(beams,ships,ships[0],new Vector2(),300),null,'unknown map reader falls back');
 eq(reads,0,'no map getter during qualification');delete shield.damageTakenModifiers.values;
}
assert.ok(retained<scanned*.25,'fixture must eliminate real far-beam work');checks++;
let integration;
if (process.env.BEAM_INTEGRATION === '1') {
 const originalCreate=BeamThreatIndex.create;let built=0,calls=0,candidates=0,full=0;
 BeamThreatIndex.create=function(...args){const index=originalCreate.apply(this,args);if(index){built++;const query=index.query;index.query=function(...args){const result=query.apply(this,args);calls++;full+=args[0].length;candidates+=(result??args[0]).length;return result;};}return index;};
 try {
  const engine=new CombatEngine('odyssey','paragon',3534);
  for(let i=2;i<100;i++){const side=i%2;engine.addShip(side?'paragon':'odyssey',!side,new Vector2(Math.floor(i/2)%5*1000+side*500,Math.floor(i/10)*650),side?Math.PI:0);}
  for(let step=0;step<90;step++)engine.fixedUpdate(1/60);
  integration={built,calls,candidates,full,ships:engine.ships.length,beams:engine.beams.length};
  assert.ok(built>0 && calls>0 && candidates<full,'real native engine must use the index and remove far beams');checks++;
 } finally {BeamThreatIndex.create=originalCreate;}
}
const report={checks,queries,scanned,retained,integration};fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(report);
