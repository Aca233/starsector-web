// Capture the existing 22-ship Offscreen fixture, before any rendering. These
// are real production component encoders; capture never advances simulation.
import { captureMotion } from '../../src/network/CaptureMotion';
import { captureCriticalCombat } from '../../src/network/CriticalCombatReplica';
import { combatStateFromText } from '../../src/network/CriticalCombatState.mjs';
import { captureProjectileState } from '../../src/network/CaptureProjectiles';
import { AnchoredProjectilePublisher } from '../../src/network/AnchoredProjectileVisual.mjs';
import { AuthorityComponentPublisher } from '../../src/network/AuthorityComponents.mjs';
const text=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
export function createComponentBase64Fixtures(matchId) {
  const publisher=new AnchoredProjectilePublisher(matchId),upload=new AuthorityComponentPublisher();
  let lastKey=null;
  const data={matchId,motion:[],combatCore:[],combatWeapons:[],visualPackets:[],publications:[],sizes:[]};
  return {data,capture(engine,tick) {
    const motion=captureMotion(engine,tick,{0:tick}),core=captureCriticalCombat(engine,tick);
    let weapons=captureCriticalCombat(engine,tick,true),weaponShips=engine.allCapitalShips.length;
    if(!weapons||!combatStateFromText(text(weapons)).weapons) {
      const subset={allCapitalShips:engine.allCapitalShips.slice(0,4),deployment:engine.deployment,combatTime:engine.combatTime};
      weapons=captureCriticalCombat(subset,tick,true);weaponShips=4;
    }
    if(!motion||!core||!weapons||!combatStateFromText(text(weapons)).weapons)throw Error('Real component capture missing');
    const frame=captureProjectileState(engine,tick);if(!frame)throw Error('Real projectile capture missing');
    const publication=publisher.publish(frame);
    data.motion.push(motion);data.combatCore.push(text(core));data.combatWeapons.push(text(weapons));
    if(lastKey!==publication.key)data.visualPackets.push({type:'projectile-visual',matchId,syncId:'base64',key:publication.key,tick:publication.baseTick,kind:'baseline',data:text(publication.baseline)});
    lastKey=publication.key;
    if(publication.update)data.visualPackets.push({type:'projectile-visual',matchId,syncId:'base64',key:publication.key,tick,kind:'update',data:text(publication.update)});
    const c=upload.prepare(matchId,{type:'combat-state',tick,data:weapons});data.publications.push(c.message);c.commit();
    const p=upload.prepare(matchId,{type:'projectile-visual',publication});data.publications.push(p.message);p.commit();
    data.sizes.push({tick,ships:engine.allCapitalShips.length,weaponShips,projectiles:frame.rows.length,motionBytes:atob(motion).length,coreBytes:core.length,weaponBytes:weapons.length,baselineBytes:publication.baseline.length,updateBytes:publication.update?.length??0});
  }};
}
