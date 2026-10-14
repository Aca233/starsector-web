import { Ship } from '../../src/engine/simulation/Ship';
import { Shield } from '../../src/engine/simulation/Shield';
import { ArmorGrid } from '../../src/engine/simulation/ArmorGrid';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { ShipDamageState } from '../../src/engine/simulation/ShipDamageState';
import { Vector2 } from '../../src/engine/math/Vector2';
import { RuntimeCombatModifiers } from '../../src/engine/extensions/RuntimeCombatModifiers';
import { shipSegmentEntry } from '../../src/engine/ai/FireControlGeometry';
import { segmentCircleEntry, isPointInPolygon } from '../../src/engine/math/Geometry';
import { segmentHullHit } from '../../src/engine/visual/HulkGeometry';
import { resolveGravityBody, gravityPointerDistance, gravityLineClear, updateGravityTractorInput } from '../../src/engine/simulation/systems/GravityTractor';
import { projectileSource } from '../../src/engine/simulation/systems/weapon/OutgoingDamage';
import { gravityWeapons } from '../../src/engine/content/GravityArmory';
import { applyGravityTidalHit } from '../../src/engine/simulation/systems/GravityDamage';
import { damageWeaponComponent } from '../../src/engine/simulation/systems/weapon/WeaponComponentHealth';
import { EngineController } from '../../src/engine/simulation/systems/EngineController';
import { GravitonBeamDamageTakenMod } from '../../src/engine/simulation/systems/weapon/GravitonBeamEffect';
import { voidShieldContact } from '../../src/engine/simulation/VoidShield';
import { CombatFXSystem } from '../../src/engine/simulation/systems/CombatFXSystem';
import { moduleOffset } from '../../src/engine/content/ModuleGeometry';
import type { WeaponMount, Projectile } from '../../src/engine/simulation/Weapon';
import type { Asteroid, HulkFragment } from '../../src/engine/simulation/CombatTypes';
interface Exports extends WebAssembly.Exports{memory:WebAssembly.Memory;test_input(n:number):number;test_reset():number;test_query():number;test_damage():number;test_module_setup():void;test_sync():number;test_nested():number;test_compare():number;test_capture():number;test_contract():number;test_number():number;test_output_words():number}
export async function checkRustGravityOwner(bytes:BufferSource){const {instance}=await WebAssembly.instantiate(bytes,{}),e=instance.exports as Exports;let strict=0,geometry=0,maxDifference=0,queries=0,hits=0,moduleHits=0,nestedPoses=0;
  const write=(row:number[])=>{const p=e.test_input(row.length);new Float64Array(e.memory.buffer,p,row.length).set(row);};
  const read=(p:number)=>Array.from(new Float64Array(e.memory.buffer,p,e.test_output_words()));
  const cmp=(a:number,b:number,label:string,geo=false)=>{if(!geo){strict++;if(!Object.is(a,b))throw Error(`${label}: ${a} differs from ${b}`);}else{geometry++;const d=Math.abs(a-b);if(!Object.is(a,b)&&(!Number.isFinite(a)||!Number.isFinite(b)||d>Math.max(2e-9,64*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)))))throw Error(`${label}: ${a} differs from ${b}`);maxDifference=Math.max(maxDifference,d||0);}};
  const names=['ship-2','Ship_10','ship.1'],keys=names.map(s=>`SHIP:${s}`),sorted=keys.toSorted((a,b)=>a.localeCompare(b)),ranks=keys.map(s=>sorted.indexOf(s));
  const prefixes=['ASTEROID','HULK','PROJECTILE','SHIP'],prefixSorted=prefixes.toSorted((a,b)=>a.localeCompare(b)),alphabet=Array.from('-.0123456789+e'),alphaSorted=alphabet.toSorted((a,b)=>a.localeCompare(b));
  const extraKeys=['PROJECTILE:0.1','PROJECTILE:0.12','PROJECTILE:0.2','PROJECTILE:0.0001','PROJECTILE:1e-7','PROJECTILE:12','PROJECTILE:2','PROJECTILE:1.2e+21','PROJECTILE:1.2e-8','ASTEROID:50','HULK:51'];
  for(let scene=0;scene<8;scene++){write([scene,3,...ranks,...prefixes.map(s=>prefixSorted.indexOf(s)),...alphabet.map(s=>alphaSorted.indexOf(s))]);e.test_reset();const random=new SimulationRandom(821),visual=new SimulationRandom(1757);
    const ships=names.map((name,i)=>{const s=Object.create(Ship.prototype) as Ship,armor=new ArmorGrid(9,7,10,10,90,-45,-35),damage=new ShipDamageState(armor,visual);armor.onCellDamage=(c,r,n)=>damage.onCellDamage(c,r,n);
      const shield=new Shield(scene%4===3&&i===1?'PHASE':'OMNI',360,70,.8);shield.isActive=i===1&&(scene%4===1||scene%4===2);shield.currentArcDeg=i===1?(scene%4===1?75:360):0;shield.facingAngleRad=Math.PI;
      if(i===1&&scene%4===2)shield.configureVoidShield({layers:4,integrityPerLayer:80,rechargePerSecond:20,hitDelay:5,restartDelay:3});
      if(scene>=4&&i===1){shield.damageTakenModifiers.set('test',1.19);shield.energyDamageTakenMultiplier=1.17;shield.externalDamageTakenMultiplier=()=>1.07;}
      if(scene>=4&&i!==0)armor.damageTakenModifiers=()=>({armor:.7,hull:.8});
      const mounts=[[3,-4],[-7,6],[21,9]].map(([x,y],j)=>({slotId:String(j+1),relativePos:new Vector2(x,y),mountType:j===1?'HIDDEN':'TURRET',spec:{mountSize:'SMALL'},health:250,maxHealth:250,isDisabled:false,isPermanentlyDisabled:false,disabledDuration:0,disabledTimer:0} as WeaponMount));
      Object.defineProperty(s,'allSystems',{value:[]});Object.assign(s,{id:name,damageDecals:damage,spec:{id:'gravity-host',bounds:[[-45,-35],[45,-35],[45,-5],[5,-5],[5,35],[-45,35]],collisionRadius:45,mass:i===2?700:3000,maxSpeed:100,shieldCenterX:i===1?13:0,shieldCenterY:i===1?-9:0,engineSlots:[],hullMods:[],builtInHullMods:[],hullSize:'CAPITAL_SHIP',sourceHullTraits:[]},
        pos:new Vector2(i===0?0:200+(i-1)*70,i===0?0:50),prevPos:new Vector2(i===0?0:200+(i-1)*70,i===0?0:50),vel:new Vector2(12,-7),facingRad:i===0?.17:0,angularVelRad:.23,parentShip:null,childModules:[],moduleMount:undefined,
        hullStats:{hitpoints:5000,damageToFightersPercent:0,damageToFightersMultiplier:1,damageToFrigatesPercent:0,damageToDestroyersPercent:0,damageToCruisersPercent:0},hullHp:5000,isDead:false,isRetreated:false,isDocked:false,retreating:false,hullDamageSuppressed:false,hullDamageInterceptors:new Set(),externalPhaseEffects:new Map(),
        shield,flux:new FluxTracker(20000,0,'CAPITAL_SHIP'),armor,runtimeModifiers:new RuntimeCombatModifiers(),weaponControl:{weapons:mounts,damageComponent:(m:WeaponMount,n:number)=>damageWeaponComponent(m,n,random)},
        getWeaponDamageMultiplier:()=>1.2*(scene>=4&&i===0?1.11:1),weaponDamageTakenMultiplier:1.13,engineDamageTakenMultiplier:1.19,damageToTargetWeaponsMultiplier:1.17,damageToTargetEnginesMultiplier:1.09,isPlayer:i===0,teamId:i===0?0:1,fireControlMode:'MANUAL',fighterRecall:false});
      if(scene>=4&&i===0){s.flux.softFlux=7000;Object.assign(s.spec,{captainSkills:{point_defense:1,target_analysis:2,energy_weapon_mastery:1}});Object.assign(s.hullStats,{damageToFightersPercent:15,damageToFightersMultiplier:1.09,damageToFrigatesPercent:13,damageToDestroyersPercent:21,damageToCruisersPercent:7});}
      Object.defineProperties(s,{crDamageDealtMultiplier:{value:1.07},crDamageTakenMultiplier:{value:.93},effectiveEmpDamageTakenMultiplier:{value:1}});return s;});
    if(scene>=4){const graviton=new GravitonBeamDamageTakenMod();graviton.notifyHit(ships[0].weapons[0]);graviton.notifyHit(ships[0].weapons[1]);graviton.advance(ships[1],.07);}
    ships.forEach(s=>{s.flux.onOverloadStarted=()=>s.shield.setActive(false);});
    const engines=ships.map(s=>{s.spec.engineSlots=[{x:-11,y:-12,width:25,length:30},{x:16,y:8,width:25,length:30}] as Ship['spec']['engineSlots'];const c=new EngineController(s.spec,random);s.engineController=c;return c;});
    ships[2].parentShip=ships[1];ships[2].moduleMount={x:70,y:0,angleDeg:.2*180/Math.PI,spec:ships[2].spec} as Ship['moduleMount'];ships[1].childModules=[ships[2]];
    const asteroid={id:50,pos:new Vector2(95,-50),vel:new Vector2(1,2),radius:17,mass:400,hp:500} as Asteroid;
    const hulk={id:51,pos:new Vector2(300,180),vel:new Vector2(1,-2),collisionRadius:85,facingRad:.31,localOffset:new Vector2(60,50),bounds:[[0,0],[120,0],[120,100],[0,100],[0,0],[30,20],[30,70],[80,70],[80,20],[30,20],[0,0]].map(([x,y])=>new Vector2(x,y)),sourceShip:{spec:{mass:3000,bounds:[[-70,-55],[70,-55],[70,55],[-70,55]]}}} as HulkFragment;
    const world={ships,asteroids:[asteroid],hulkFragments:[hulk]};
    const fx=Object.assign(Object.create(CombatFXSystem.prototype) as CombatFXSystem,{random:visual,particles:[],floatingTexts:[],shieldRipples:[]});
    const gravityFX={spawnArmorDamageSparks:(ship:Ship,local:Vector2,damage:number)=>fx.spawnArmorDamageSparks(ship,local,damage),spawnShieldRipple:(pos:Vector2,size:number,color:[number,number,number])=>fx.spawnShieldRipple(pos,size,color),addFloatingDamage:()=>{}};
    const compareKeys=[...keys,...extraKeys];for(let a=0;a<compareKeys.length;a++)for(let b=0;b<compareKeys.length;b++){write([a,b]);cmp(e.test_compare(),Math.sign(compareKeys[a].localeCompare(compareKeys[b]))+1,'locale rank');}
    for(let n=0;n<64;n++){const kind=n%3,id=kind===0?2:kind===1?50:51,start=new Vector2(-70+(n%11)*37,-110+(n%9)*39),end=new Vector2(150+(n%7)*39,30+(n%5)*53),body=resolveGravityBody({kind:kind===0?'SHIP':kind===1?'ASTEROID':'HULK',id:kind===0?names[1]:id} as never,world)!;
      const entry=kind===0?shipSegmentEntry(ships[1],start,end):kind===1?segmentCircleEntry(start,end,asteroid.pos,asteroid.radius):segmentHullHit(start.clone().sub(hulk.pos).rotate(-hulk.facingRad).add(hulk.localOffset),end.clone().sub(hulk.pos).rotate(-hulk.facingRad).add(hulk.localOffset),hulk.bounds);
      write([kind,id,start.x,start.y,end.x,end.y]);const actual=read(e.test_query()),expect=[+(entry!==null),entry??0,gravityPointerDistance(body,start,world),+gravityLineClear(ships[0],body,start,world),+isPointInPolygon(start.clone().sub(ships[0].pos).rotate(-ships[0].facingRad),ships[0].spec.bounds),body.mass,body.radius];expect.forEach((x,j)=>cmp(actual[j],x,`query ${scene}/${n}/${j}`,j===1||j===2));queries++;}
    ships[1].syncModuleTree();const synced=read(e.test_sync());[ships[2].pos.x,ships[2].pos.y,ships[2].vel.x,ships[2].vel.y,ships[2].facingRad,ships[2].angularVelRad].forEach((x,j)=>cmp(synced[j],x,'module sync '+j,true));
    for(let tick=0;tick<24;tick++){const from=new Vector2(-100,50+tick%4*13),raw=tick===22?30000:80+(tick%3)*37,strength=120,continuous=tick%2===0;
      fx.particles.length=0;const point=applyGravityTidalHit(ships[0],ships[1],from,raw,strength,continuous,gravityFX);write([from.x,from.y,raw,strength,+continuous]);const actual=read(e.test_damage()),s=ships[1];
      const expected=[+!!point,point?.x??0,point?.y??0,s.hullHp,s.flux.softFlux,s.flux.hardFlux,random.checkpointWitness()[1],visual.checkpointWitness()[1],...Array.from(s.armor.cells),...s.weapons.flatMap(m=>[m.health,+!!m.healthTracker,m.healthTracker?.hitAgo??0,m.healthTracker?.interval??0]),+s.shield.isActive,s.shield.currentArcDeg,s.shield.voidShield?.integrity??-1,s.shield.sinceLastDamageTaken,s.shield.voidShield?.quietRemaining??-1,scene>=4?1.19:1,0,...engines[1].engines.flatMap(eng=>[eng.health,+eng.isDisabled,eng.healthTracker.hitAgo,eng.healthTracker.interval]),s.hullHp<5000?0:9,s.hullHp<5000?0:.5,+(s.hullHp===5000),ships[1].shield.voidShield?.quietRemaining??-1];
      const particleStart=expected.length+1;expected.push(fx.particles.length,...fx.particles.flatMap(p=>[p.pos.x,p.pos.y,p.vel.x,p.vel.y,p.size]));cmp(actual.length,expected.length,'damage width');expected.forEach((x,j)=>cmp(actual[j],x,`damage ${scene}/${tick}/${j}`,j===1||j===2||j>=particleStart&&(j-particleStart)%5<4));hits++;}
    const owner=ships[0],spec=gravityWeapons()[0],mount={spec,slotId:'tractor',relativePos:new Vector2(),mountType:'HARDPOINT',baseAngleDeg:0,arcDeg:360,currentAngleRad:0,barrelIndex:0,cooldownTimer:0,glowAlpha:0,triggerHeld:false,isDisabled:false} as WeaponMount;
    Object.assign(owner,{aimTargetWorld:new Vector2(25,0),isFiringMain:true,systems:[],ecmRangePenalty:0,system:{canFireWeapon:()=>true,getWeaponRangePercent:()=>0}});
    const projectile={id:123,pos:new Vector2(25,0),vel:new Vector2(-300,20),facingRad:Math.PI,radius:1.3,spawnType:'BALLISTIC',isRocket:true,sourceShipId:names[1],isPlayer:false,teamId:1,isGuided:true,inertialFlight:false,engineAcceleration:200,maxSpeed:700,targetShipId:names[1],targetProjectileId:21,damage:180,baseDamage:180,rangeRemaining:2000} as Projectile;
    updateGravityTractorInput(.1,owner,mount,{...world,projectiles:[projectile]} as never,true);if(!projectile.gravityCapturedBy)throw Error('real TS capture failed');
    const cached=projectileSource(projectile,{ships} as never);cmp(+!!(cached===owner),1,'actual source cache rebound');projectile.vel.set(50,60);projectile.facingRad=.37;
    write([]);const capture=read(e.test_capture()),expect=[1,1,projectile.teamId!,+projectile.isPlayer!,+!!projectile.isGuided,+!!projectile.inertialFlight,projectile.engineAcceleration!,+!!(projectile.maxSpeed!==undefined),+!!projectile.gravityDeflected,+!!projectile.targetShipId,+!!projectile.targetProjectileId,2,1,+!!projectile.gravityCoupling,1,0,0,0,0,0,projectile.damage,projectile.baseDamage!,projectile.rangeRemaining,projectile.vel.x,projectile.vel.y,projectile.facingRad,.1,.2];
    expect.forEach((x,j)=>cmp(capture[j],x,`capture ${scene}/${j}`,j>=23&&j<=25));cmp(e.test_contract(),31,'terrain/lifecycle/stale/rollback contracts');
    e.test_module_setup();ships[0].flux.softFlux=scene>=4?7000:0;ships[0].flux.hardFlux=0;ships[1].shield.configureVoidShield({layers:4,integrityPerLayer:80,rechargePerSecond:20,hitDelay:5,restartDelay:3});ships[1].shield.isActive=false;ships[1].shield.currentArcDeg=0;
    const child=ships[2];child.shield.configureVoidShield({layers:2,integrityPerLayer:40,rechargePerSecond:10,hitDelay:7,restartDelay:2});child.shield.isActive=false;child.shield.currentArcDeg=0;
    const decals=new ShipDamageState(child.armor,visual);child.damageDecals=decals;child.armor.onCellDamage=(c,r,n)=>{if(n>0)voidShieldContact(child.assemblyRoot.shield.voidShield);decals.onCellDamage(c,r,n);};
    for(const raw of [1,30000]){fx.particles.length=0;const from=new Vector2(-100,50),point=applyGravityTidalHit(ships[0],child,from,raw,120,false,gravityFX);write([from.x,from.y,raw,120,0,3]);const actual=read(e.test_damage());
      const expected=[+!!point,point?.x??0,point?.y??0,child.hullHp,child.flux.softFlux,child.flux.hardFlux,random.checkpointWitness()[1],visual.checkpointWitness()[1],...Array.from(child.armor.cells),...child.weapons.flatMap(m=>[m.health,+!!m.healthTracker,m.healthTracker?.hitAgo??0,m.healthTracker?.interval??0]),+child.shield.isActive,child.shield.currentArcDeg,child.shield.voidShield!.integrity,child.shield.sinceLastDamageTaken,child.shield.voidShield!.quietRemaining,1,0,...engines[2].engines.flatMap(eng=>[eng.health,+eng.isDisabled,eng.healthTracker.hitAgo,eng.healthTracker.interval]),child.hullHp<5000?0:9,child.hullHp<5000?0:.5,+(child.hullHp===5000),ships[1].shield.voidShield!.quietRemaining];
      const particleStart=expected.length+1;expected.push(fx.particles.length,...fx.particles.flatMap(p=>[p.pos.x,p.pos.y,p.vel.x,p.vel.y,p.size]));cmp(actual.length,expected.length,'module damage width');expected.forEach((x,j)=>cmp(actual[j],x,`module damage ${scene}/${raw}/${j}`,j===1||j===2||j>=particleStart&&(j-particleStart)%5<4));moduleHits++;}
    for(const independent of [false,true]){const leaf=Object.assign(Object.create(Ship.prototype) as Ship,{parentShip:child,childModules:[],isDead:false,spec:{...child.spec,moduleAnchor:[3,-5],sourceHullTraits:independent?['INDEPENDENT_ROTATION']:[]},pos:new Vector2(),vel:new Vector2(),facingRad:.77,angularVelRad:-.16,teamId:99,isPlayer:true});
      leaf.moduleMount={x:-23,y:34,angleDeg:.31*180/Math.PI,spec:leaf.spec} as Ship['moduleMount'];child.childModules=[leaf];ships[1].syncModuleTree();const offset=moduleOffset(leaf.moduleMount!);write([+independent,offset.x,offset.y,.31]);const actual=read(e.test_nested()),expected=[leaf.pos.x,leaf.pos.y,leaf.vel.x,leaf.vel.y,leaf.facingRad,leaf.angularVelRad,leaf.teamId,+leaf.isPlayer];expected.forEach((x,j)=>cmp(actual[j],x,'nested module '+j,j<6));nestedPoses++;}
  }
  const keyRandom=new SimulationRandom(13919),numbers=[0,-0,.12345678901234568,1e-7,1e-6,1e-5,.1,1,20,100,1e20,1e21,1e22,Number.MIN_VALUE,Number.MAX_VALUE,...Array.from({length:2048},()=>keyRandom.next())];
  for(const n of numbers){write([n]);const text=String.fromCharCode(...read(e.test_number()));cmp(+(text===String(n)),1,`numeric locale key ${n}`);}
  return {passed:true,queries,hits,moduleHits,nestedPoses,captures:8,authorityContracts:40,numericKeys:numbers.length,strictFields:strict,geometryFields:geometry,maxGeometryDifference:maxDifference,realResidentAdapter:true,productionIntegrated:false,fullBattleReady:false};
}

