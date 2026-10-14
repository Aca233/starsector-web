import { Ship } from '../../src/engine/simulation/Ship';
import { ArmorGrid } from '../../src/engine/simulation/ArmorGrid';
import { ShipDamageState } from '../../src/engine/simulation/ShipDamageState';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { Shield } from '../../src/engine/simulation/Shield';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../../src/engine/math/Vector2';
import { CombatFXSystem } from '../../src/engine/simulation/systems/CombatFXSystem';
import { advanceGravityTerrain } from '../../src/engine/simulation/systems/GravityTerrain';
import { damageWeaponComponent } from '../../src/engine/simulation/systems/weapon/WeaponComponentHealth';
import { voidShieldContact } from '../../src/engine/simulation/VoidShield';
import type { WeaponMount } from '../../src/engine/simulation/Weapon';
import type { HulkFragment } from '../../src/engine/simulation/CombatTypes';
import type { AsteroidFXCallbacks } from '../../src/engine/simulation/systems/AsteroidSystem';
type Exports=WebAssembly.Exports&{memory:WebAssembly.Memory;test_input(n:number):number;test_reset():number;test_step():number;test_contracts():number;test_output_words():number};
const rect=(x:number,y:number):[number,number][]=>[[-x,-y],[x,-y],[x,y],[-x,y]];
export async function checkRustGravityTerrain(bytes:BufferSource){
 const {instance}=await WebAssembly.instantiate(bytes,{}),e=instance.exports as Exports;let strict=0,geometry=0,maxDifference=0,comparisons=0,scenes=0,orderedEvents=0,recoveries=0,coverage=0;let ships:Ship[]=[],hulks:HulkFragment[]=[],random:SimulationRandom,visual:SimulationRandom,fx:CombatFXSystem,rows:number[][]=[],callbacks:AsteroidFXCallbacks;
 const write=(row:number[])=>{const p=e.test_input(row.length);new Float64Array(e.memory.buffer,p,row.length).set(row);};
 const snapshot=()=>{const out=[...random.checkpointWitness().slice(1),...visual.checkpointWitness().slice(1)],geo=new Set<number>();const put=(a:number[],g:number[]=[])=>a.forEach((n,i)=>{if(g.includes(i))geo.add(out.length);out.push(n);});
  for(const s of ships){const a=s.armor,sh=s.shield,inner=sh as unknown as {closeTimeRemaining:number;pendingRaise:boolean},h=s.weapons[0],tracker=h.healthTracker;put([s.pos.x,s.pos.y,s.vel.x,s.vel.y,s.facingRad,s.angularVelRad],[0,1,2,3,4,5]);put([s.hullHp,16*+s.isDead+64*+s.isDocked+32*+s.isRetreated,s.flux.hardFlux,s.flux.softFlux,+s.flux.isOverloaded,s.flux.overloadTimer,+sh.isActive,sh.currentArcDeg,sh.sinceLastDamageTaken,inner.closeTimeRemaining,+inner.pendingRaise]);put(Array.from(a.copyCells()));
   put([1,0,0,h.relativePos.x,h.relativePos.y,h.health,h.maxHealth,+h.isDisabled,+h.isPermanentlyDisabled,h.disabledDuration,h.disabledTimer,+!!tracker,tracker?.repairDuration??0,tracker?.hitAgo??0,tracker?.interval??0,tracker?.elapsed??0,+!!tracker?.intervalElapsed,1,1,0]);
   const v=sh.voidShield;put(v?[v.layers,v.integrityPerLayer,v.rechargePerSecond,v.hitDelay,v.restartDelay,v.integrity,v.rebuild,v.quietRemaining,v.restartRemaining,+v.armed,+v.suppressed,v.breaks,v.visualHitRemaining,v.visualHitAngle,v.visualHitStrength,v.visualBreakRemaining,v.visualRestartRemaining,v.visualShutdownRemaining,+v.visualCollapse]:Array(19).fill(0),v?[13]:[]);
   put([a.dirtyVersion,s.damageDecals.revision,s.scorchMarks.length]);for(const m of s.scorchMarks)put([m.cellIndex,m.localPos.x,m.localPos.y,m.opacity,0,m.heat,+m.justHit,m.flash,m.flashElapsed,m.phase,m.pulsePeriod,m.size,m.rotationRad,['cracks','burns','holes'].indexOf(m.kind),m.variant],[1,2,12]);
  }
  put([hulks.length]);for(const h of hulks)put([h.id,3,1,h.pos.x,h.pos.y,h.vel.x,h.vel.y,h.facingRad,h.angularVel,h.age,+!!h.gravityFixed,+!!h.gravityManaged],[3,4,5,6,7,8]);
  put([rows.length]);for(const row of rows){put(row,row[0]===0?[1,2]:row[0]===2?[2,3,4,5]:[]);if(row[0]===1){const count=row[1];for(let i=0;i<count;i++){const start=2+5*i;for(let j=0;j<4;j++)geo.add(out.length-row.length+start+j);}}}
  put([fx.floatingTexts.length]);for(const f of fx.floatingTexts)put([f.id,f.pos.x,f.pos.y,f.vel.x,f.vel.y,Number(f.text),f.size,f.life,f.maxLife],[1,2,3,4]);put([fx.particles.length]);return {out,geo};
 };
 const compare=(p:number,label:string)=>{const actual=Array.from(new Float64Array(e.memory.buffer,p,e.test_output_words())),{out,geo}=snapshot();if(actual.length!==out.length)throw Error(`${label} width ${actual.length}/${out.length}`);actual.forEach((a,i)=>{const b=out[i];if(geo.has(i)){geometry++;const d=Math.abs(a-b);if(!Object.is(a,b)&&(!Number.isFinite(a)||!Number.isFinite(b)||d>Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)))))throw Error(`${label} geometry ${i}: ${a}/${b}`);maxDifference=Math.max(maxDifference,d||0);}else{strict++;if(!Object.is(a,b))throw Error(`${label} strict ${i}: ${a}/${b}`);}});comparisons++;};
 const reset=(scene:number,native=true)=>{scenes++;random=new SimulationRandom(8127);visual=new SimulationRandom(15181);fx=new CombatFXSystem(visual);ships=[];rows=[];
  for(let row=0;row<3;row++){const s=Object.create(Ship.prototype) as Ship,armor=new ArmorGrid(9,7,10,10,27,-45,-35),decals=new ShipDamageState(armor,visual),flux=new FluxTracker(scene===4?100:100000,0,'FRIGATE'),shield=new Shield(scene===5?'FRONT':'OMNI',[5,6].includes(scene)?60:360,40,.83);const mount={slotId:'1',mountType:'TURRET',relativePos:new Vector2(23,-4),spec:{mountSize:'SMALL'},health:250,maxHealth:250,isDisabled:false,isPermanentlyDisabled:false,disabledDuration:0,disabledTimer:0}as WeaponMount;
   const bounds=row===2?rect(60,40):scene===7?rect(50,2):scene===8?[[-30,-20],[30,-20],[30,20],[5,20],[5,0],[-5,0],[-5,20],[-30,20]]as[number,number][]:rect(30,20);if(scene===9){bounds.reverse();bounds.splice(1,0,bounds[0]);}if(scene===30&&row===2)bounds.length=0;
   Object.assign(shield,{isActive:[2,3,4,5,6].includes(scene),currentArcDeg:[5,6].includes(scene)?60:360,facingAngleRad:scene===6?Math.PI:0});if(scene===3)shield.configureVoidShield({layers:2,integrityPerLayer:50,rechargePerSecond:0,hitDelay:.4,restartDelay:1});
   Object.assign(s,{id:`gravity-${row}`,teamId:row,isPlayer:row===0,pos:new Vector2(row===0?0:1000+row*100,0),vel:new Vector2(row===0?scene===13?-40:scene===14?8:scene===22?900:75:0,row===0&&scene===21?41:0),facingRad:scene===21?.27:0,angularVelRad:scene===11?.17:0,
    spec:{hullSize:'FRIGATE',collisionRadius:30,bounds,mass:row===0?500:row===1?200:300,engineSlots:[],spriteHeight:250,moduleAnchor:[0,0],sourceHullTraits:[23,27].includes(scene)&&row===0?['STATION']:scene===11&&row===1?['INDEPENDENT_ROTATION']:[],captainSkills:{},shieldCenterX:4,shieldCenterY:2},
    hullHp:10000,hullStats:{hitpoints:10000},armor,damageDecals:decals,flux,shield,isDead:row===2||scene===12&&row===1||scene===15&&row===0,isDocked:scene===17&&row===0,isRetreated:scene===16&&row===0,hullDamageSuppressed:false,hullDamageInterceptors:new Set(),parentShip:null,moduleMount:null,childModules:[],encounterEffects:{emergencyPhaseDiveUsed:false},fighterRecall:false,
    weaponDamageTakenMultiplier:1.13,engineDamageTakenMultiplier:1.19,weaponControl:{weapons:[mount],damageComponent:(m:WeaponMount,d:number)=>damageWeaponComponent(m,d,random)}});
   Object.defineProperties(s,{crDamageTakenMultiplier:{value:scene===20?1:1.13},effectiveEmpDamageTakenMultiplier:{value:1.23},isCollisionless:{get:()=>s.isDocked||s.isRetreated||scene===18&&row===0},hasVastBulk:{value:false}});
   armor.onCellDamage=(c,r,d)=>{if(d>0)voidShieldContact(s.assemblyRoot.shield.voidShield);decals.onCellDamage(c,r,d);};if(scene===19)decals.suppressed=true;flux.onOverloadStarted=()=>{if(shield.voidShield){shield.voidShield.suppressed=true;shield.isActive=false;shield.currentArcDeg=0;}else shield.setActive(false);};ships.push(s);
  }
  if(scene>=10&&scene<=12||scene===28){ships[1].parentShip=ships[0];ships[1].moduleMount={x:50,y:12,angleDeg:.4*180/Math.PI,spec:ships[1].spec}as Ship['moduleMount'];ships[0].childModules.push(ships[1]);if(scene===28){ships[2].parentShip=ships[1];ships[2].moduleMount={x:10,y:4,angleDeg:.2*180/Math.PI,spec:ships[2].spec}as Ship['moduleMount'];ships[1].childModules.push(ships[2]);}ships[0].syncModuleTree();}
  const bounds=scene===7?rect(2,50):scene===6?rect(15,10):scene===29?rect(4,4):rect(15,40);if(scene===9){bounds.reverse();bounds.splice(1,0,bounds[0]);}
  const h={id:.731,sourceShip:ships[2],pos:new Vector2(scene===7?0:(scene>=10&&scene<=12||scene===28)?80:30,(scene>=10&&scene<=12||scene===28)?12:0),vel:new Vector2(scene===24?140:-12,0),facingRad:scene===21?.11:0,angularVel:scene===21?.08:0,age:3,bounds:bounds.map(p=>new Vector2(...p)),localOffset:new Vector2(scene===25?7:0,scene===25?-4:0),collisionRadius:70,mountSlotIds:[],gravityFixed:[1,23].includes(scene),gravityManaged:scene!==0}as HulkFragment;hulks=[h];if(scene===26)hulks.push({...h,id:.732,pos:h.pos.clone(),vel:h.vel.clone()});
  callbacks={spawnShieldRipple:(p,r,c)=>{fx.spawnShieldRipple(p,r,c);rows.push([0,p.x,p.y,r!,...c!]);},spawnArmorDamageSparks:(s,p,d)=>{const before=fx.particles.length;fx.spawnArmorDamageSparks(s,p,d);if(!s.damageDecals.suppressed){const added=fx.particles.slice(before);rows.push([1,added.length,...added.flatMap(q=>[q.pos.x,q.pos.y,q.vel.x,q.vel.y,q.size])]);}},addFloatingDamage:(p,d,c)=>{fx.addFloatingDamage(p,d,c);if(d>=1){const f=fx.floatingTexts.find(f=>f.color.every((n,i)=>n===c[i])&&f.pos.distanceTo(p)<75)!;rows.push([2,f.id,f.pos.x,f.pos.y,f.vel.x,f.vel.y,Number(f.text),f.size,f.life,f.maxLife,...f.color]);}}}as AsteroidFXCallbacks;
  if(native){write([scene]);compare(e.test_reset(),`reset ${scene}`);}
 };
 const step=(dt:number,label:string)=>{advanceGravityTerrain(dt,ships.slice(0,2),hulks,callbacks);write([0,dt]);compare(e.test_step(),label);};
 const require=(ok:boolean,label:string)=>{if(!ok)throw Error(`Unreached coverage: ${label}`);coverage++;};
 for(let scene=0;scene<31;scene++){reset(scene);const firstShip=ships[0].pos.clone(),firstHulk=hulks[0].pos.clone(),firstVelocity=hulks[0].vel.clone();for(const dt of[0,.01,.03,.1,0,.2])step(dt,`scene ${scene}/${dt}`);orderedEvents+=rows.length;
  if(scene===0)require(ships[0].pos.distanceTo(firstShip)===0&&hulks[0].pos.distanceTo(firstHulk)===0&&rows.length===0,'ordinary wreck unchanged');
  if(scene===1)require(hulks[0].pos.distanceTo(firstHulk)===0&&hulks[0].vel.distanceTo(firstVelocity)===0&&ships[0].hullHp<10000,'fixed wreck damages live hull');
  if(scene===2)require(ships[0].flux.hardFlux>0&&rows.some(r=>r[0]===0),'ordinary shield real hard flux/ripple');
  if(scene===3)require(ships[0].shield.voidShield!.integrity===0&&ships[0].hullHp<10000,'void break spills to hull');
  if(scene===4)require(ships[0].flux.isOverloaded&&!ships[0].shield.isActive,'shield overload');
  if(scene===6)require(ships[0].flux.hardFlux===0&&ships[0].hullHp<10000,'rear-facing narrow shield leaves hull exposed');
  if(scene===7)require(ships[0].pos.distanceTo(firstShip)>0&&hulks[0].pos.distanceTo(firstHulk)>0,'thin polygon crossings');
  if(scene===10)require(ships[0].pos.distanceTo(firstShip)>0&&ships[1].hullHp<10000,'module contact moves actual root/damages module');
  if(scene===12)require(ships[0].pos.distanceTo(firstShip)===0&&rows.length===0,'dead module ignored while mass is retained');
  if(scene>=15&&scene<=18)require(ships[0].pos.distanceTo(firstShip)===0&&rows.length===0,'dead/retreated/docked/collisionless skip');
  if(scene===19)require(rows.every(r=>r[0]!==1)&&fx.particles.length===0&&ships[0].hullHp<10000,'suppressed armor sparks');
  if(scene===23)require(ships[0].pos.distanceTo(firstShip)===0&&hulks[0].pos.distanceTo(firstHulk)===0&&rows.length===0,'station/fixed zero inverse mass');
  if(scene===27)require(ships[0].pos.distanceTo(firstShip)===0&&hulks[0].vel.distanceTo(firstVelocity)>0&&rows.length===0,'station impulse goes into movable wreck');
 }
 reset(21);write([1]);compare(e.test_step(),'Clone capture');const before=snapshot();for(let i=0;i<4;i++)step(.1,`restore future ${i}`);write([2]);const restored=e.test_step();reset(21,false);compare(restored,'whole Clone restore');if(before.out.length!==snapshot().out.length)throw Error('restore width');recoveries++;step(.03,'restored continued');
 const p=e.test_contracts(),contracts=Array.from(new Float64Array(e.memory.buffer,p,e.test_output_words()));if(contracts.length!==8||contracts.some(n=>n!==1))throw Error(`metadata contracts ${contracts}`);strict+=contracts.length;
 return {passed:true,scenes,comparisons,orderedEvents,strictFields:strict,geometryFields:geometry,maxGeometryDifference:maxDifference,recoveryChecks:recoveries,coverageAssertions:coverage,metadataContracts:contracts.length,actualGravityTerrain:true,actualResidentTerrainOwner:true,actualArmorComponentsHullAndVisualFactories:true,productionIntegrated:false,fullBattleReady:false};
}
