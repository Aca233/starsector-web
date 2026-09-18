/** Reproducible small-fleet regression/metrics; no assertion that a short run proves higher win rate. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
const current = await loadCombatLab();
const args=process.argv.slice(2);
if(args.length && (args.length!==2 || args[0]!=='--baseline')) throw Error('Usage: node scripts/benchmark-combat-tactics.mjs [--baseline bundle.mjs]');
const baseline=args.length ? await import(pathToFileURL(path.resolve(args[1])).href) : null;
function run(lab,seed,count=6,seconds=30) {
  const env=new lab.CombatLab(seed,2,0,seconds), e=env.engine;
  const positions=[[0,650],[0,-650],[0,300],[0,-300],[-420,480],[420,-480]];
  for(let i=2;i<count;i++) e.addShip(e.playerShip.spec,i%2===0,new lab.Vector2(),i%2===0?-Math.PI/2:Math.PI/2);
  e.capitalShips.forEach((s,i)=>{
    const [x,y]=positions[i] ?? [((i%5)-2)*400,i%2===0?900+Math.floor(i/10)*450:-900-Math.floor(i/10)*450];
    s.pos.set(x,y); s.prevPos.copy(s.pos); s.fireControlMode='AI';
    // A damaged, exposed front rank exercises target saturation without inventing damage rules.
    if(i===2||i===3){s.hullHp*=.3;s.armor.cells.fill(s.armor.maxCellArmor*.15);}
    lab.setTrainingAction(s,'BALANCED');
  });
  const initialAmmo=e.ships.reduce((n,s)=>n+s.weapons.reduce((m,w)=>m+(Number.isFinite(w.ammo)?w.ammo:0),0),0);
  let blocked=0,firing=0,adjusted=0,ticks=0,changed=0;
  const previous=new Map(), shots=new Set();
  const start=performance.now();
  while(ticks<seconds*60&&!e.battleResult){
    e.updateShipAI(env.playerAI,1/60); e.fixedUpdate(1/60);ticks++;
    for(const p of e.projectiles) shots.add(p.id);
    for(const s of e.ships){
      if(s.isDead)continue;
      if(s.tacticalAI?.positioning && s.tacticalAI.positioning!=='BASELINE')adjusted+=1/60;
      for(const m of s.weapons){
        if(m.fireControl?.reason==='FRIENDLY_BLOCKED')blocked+=1/60;
        if(m.fireControl?.reason==='FIRE')firing+=1/60;
        const key=s.id+'/'+m.slotId, id=m.fireControlTargetShipId;
        if(id && previous.has(key) && previous.get(key)!==id) changed++;
        if(id)previous.set(key,id);
      }
    }
  }
  const elapsed=performance.now()-start;
  const finalAmmo=e.ships.reduce((n,s)=>n+s.weapons.reduce((m,w)=>m+(Number.isFinite(w.ammo)?w.ammo:0),0),0);
  const checksum=e.capitalShips.flatMap(s=>[s.hullHp,s.flux.totalFlux,s.pos.x,s.pos.y]);
  assert.ok(checksum.every(Number.isFinite),'Nonfinite authoritative state');
  return {seed,count,simulatedSeconds:ticks/60,blockedWeaponSeconds:blocked,firePermittedWeaponSeconds:firing,
    repositionShipSeconds:adjusted,targetChanges:changed,observedProjectiles:shots.size,finiteAmmoSpent:initialAmmo-finalAmmo,
    destroyed:e.capitalShips.filter(s=>s.isDead).length,checksum,msPerTick:elapsed/ticks};
}
const results=[];
// Warm up each independently; performance is informational, not a flaky timing assertion.
run(current,11,6,2); if(baseline)run(baseline,11,6,2);
for(const seed of [31,47,89]) {
  const before=baseline?run(baseline,seed):null, after=run(current,seed);
  const repeat=run(current,seed);
  for(const key of Object.keys(after).filter(k=>k!=='msPerTick')) assert.deepEqual(after[key],repeat[key],`seed ${seed}: ${key}`);
  results.push({baseline:before,current:after});
}
// Bounded crowded-scene timing smoke, not a 100-ship performance certification.
const crowded={baseline:baseline?run(baseline,101,24,4):null,current:run(current,101,24,4)};
const report={schemaVersion:1,engineBundleSha256:current.engineBundleSha256,baselineBundle:args[1]??null,
  note:'All ships use the same policy in each run; this measures behavior/cost, not head-to-head win rate. Short timeouts are not victories.',results,crowded};
await writeFile('artifacts/ai/tactics-benchmark.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,results:results.map(r=>({baseline:r.baseline&&{...r.baseline,checksum:undefined},current:{...r.current,checksum:undefined}})),crowded:{baseline:crowded.baseline&&{...crowded.baseline,checksum:undefined},current:{...crowded.current,checksum:undefined}}},null,2));
