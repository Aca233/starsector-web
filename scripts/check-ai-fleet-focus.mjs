import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--bundle')throw Error('Usage: node scripts/check-ai-fleet-focus.mjs --bundle candidate.mjs (explicit experimental bundle required)');
const l=await import(pathToFileURL(path.resolve(args[1])).href);
const {Ship,Vector2,modManager,planFleetTactics}=l;
let passed=0;function test(name,fn){fn();console.log(`ok ${++passed} - ${name}`);}
function make(id,team,x,y,dps=200){
 const s=new Ship(id,modManager.requireShip('hammerhead'),team===0,new Vector2(x,y),team?Math.PI:0);s.fireControlMode='AI';s.visibilityMask=3;
 const m=s.weapons.find(w=>w.spec.id==='railgun');assert.ok(m);s.weapons.splice(0,s.weapons.length,m);m.spec={...m.spec,damagePerSecond:dps,damagePerShot:dps,range:700};return s;
}
function fixture(){
 const own=make('own',0,0,0),ally=make('manual',0,0,50),a=make('a-target',1,650,30),b=make('b-target',1,650,-30);
 ally.currentTargetShip=a;const ships=[own,ally,a,b],manual=new Set([ally.id]);
 return {own,ally,a,b,ships,manual,plan:(orders=new Map())=>planFleetTactics(ships,orders,manual)};
}
test('sub-demand allied commitment does not divert an equal-distance free attacker',()=>{
 const f=fixture(),p=f.plan();assert.equal(p.get(f.own.id).targetId,f.a.id);assert.equal(p.has(f.ally.id),false);assert.equal(f.own.currentTargetShip,null);
});
test('excessive commitment still spreads attackers instead of stacking everyone',()=>{
 const f=fixture();f.ally.weapons[0].spec={...f.ally.weapons[0].spec,damagePerSecond:8000,damagePerShot:8000};assert.equal(f.plan().get(f.own.id).targetId,f.b.id);
});
test('explicit ENGAGE keeps user target despite focus scores',()=>{
 const f=fixture();const orders=new Map([[f.own.id,{type:'ENGAGE',targetShipId:f.b.id}]]);assert.equal(f.plan(orders).get(f.own.id).targetId,f.b.id);
});
test('manual actor is excluded; its current target and controls are untouched',()=>{
 const f=fixture();f.manual.add(f.own.id);f.own.currentTargetShip=f.b;f.own.throttle=.25;const p=f.plan();assert.ok(!p.has(f.own.id));assert.equal(f.own.currentTargetShip,f.b);assert.equal(f.own.throttle,.25);
});
test('hidden contacts cannot attract focus or contribute invisible pressure',()=>{
 const f=fixture();f.a.visibilityMask=0;const p=f.plan();assert.equal(p.get(f.own.id).targetId,f.b.id);const noHidden=planFleetTactics(f.ships.filter(s=>s!==f.a),new Map(),f.manual);assert.deepEqual(p.get(f.own.id),noHidden.get(f.own.id));
});
test('dead and retreated targets cannot retain allied commitments',()=>{
 for(const mode of ['dead','retreated']){const f=fixture();if(mode==='dead')f.a.hullHp=0;else f.a.isRetreated=true;assert.equal(f.plan().get(f.own.id).targetId,f.b.id);}
});
test('planner remains pure, repeated and roster-permuted assignments are deterministic',()=>{
 const f=fixture(),before=f.ships.map(s=>[s.hullHp,s.flux.totalFlux,s.pos.x,s.pos.y,s.currentTargetShip?.id,s.throttle]);
 const p=f.plan();assert.deepEqual(f.plan(),p);assert.deepEqual(planFleetTactics([...f.ships].reverse(),new Map(),f.manual),p);
 assert.deepEqual(f.ships.map(s=>[s.hullHp,s.flux.totalFlux,s.pos.x,s.pos.y,s.currentTargetShip?.id,s.throttle]),before);
 for(const a of p.values())assert.ok(Number.isFinite(a.score)&&Number.isFinite(a.pressureRatio));
});
test('single legal contact is never suppressed merely by overcommitment',()=>{
 const f=fixture();f.b.visibilityMask=0;f.ally.weapons[0].spec={...f.ally.weapons[0].spec,damagePerSecond:8000,damagePerShot:8000};assert.equal(f.plan().get(f.own.id).targetId,f.a.id);
});
console.log(`PASS ${passed} fleet-focus checks (not strength evidence)`);
