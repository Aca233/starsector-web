import * as oldMotion from 'component-before/MotionFrame.mjs';
import * as oldCombat from 'component-before/CriticalCombatState.mjs';
import * as oldVisual from 'component-before/ProjectileVisualPacket.mjs';
import * as oldAuthority from 'component-before/AuthorityComponents.mjs';
import * as motion from '../../src/network/MotionFrame.mjs';
import * as combat from '../../src/network/CriticalCombatState.mjs';
import * as visual from '../../src/network/ProjectileVisualPacket.mjs';
import * as authority from '../../src/network/AuthorityComponents.mjs';
import { decodeBase64Bytes } from '../../src/network/Base64Bytes.mjs';
import { AnchoredProjectileReceiver, ANCHORED_VISUAL_LIMITS } from '../../src/network/AnchoredProjectileVisual.mjs';
const old={motion:oldMotion,combat:oldCombat,visual:oldVisual,authority:oldAuthority},current={motion,combat,visual,authority};
const check=(ok,why)=>{if(!ok)throw Error(why);};
const text=bytes=>{let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);};
const legacyRead=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const sameBytes=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const number=n=>Object.is(n,-0)?'-0':Number.isNaN(n)?'NaN':n===Infinity?'+Infinity':n===-Infinity?'-Infinity':n;
const normalize=x=>{
  if(typeof x==='number')return number(x);
  if(x instanceof Uint8Array)return {bytes:text(x)};
  if(Array.isArray(x))return x.map(normalize);
  if(x&&typeof x==='object')return {prototype:Object.getPrototypeOf(x)===null?'null':'object',entries:Object.entries(x).map(([k,v])=>[k,normalize(v)])};
  return x;
};
const same=(a,b,why)=>check(JSON.stringify(normalize(a))===JSON.stringify(normalize(b)),why);
const outcome=fn=>{try{return {accepted:true,value:fn()};}catch{return {accepted:false};}};
const descriptor=Object.getOwnPropertyDescriptor(Uint8Array,'fromBase64');
const setNative=value=>{if(value)Object.defineProperty(Uint8Array,'fromBase64',value);else Object.defineProperty(Uint8Array,'fromBase64',{configurable:true,writable:true,value:undefined});};
const restore=()=>{if(descriptor)Object.defineProperty(Uint8Array,'fromBase64',descriptor);else delete Uint8Array.fromBase64;};
const withMode=(mode,fn)=>{try{if(mode==='fallback')setNative(null);else restore();return fn();}finally{restore();}};
const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function checkComponentBase64(fixtures) {
  check(typeof descriptor?.value==='function','This browser must exercise the actual native Uint8Array.fromBase64 branch');
  let comparisons=0;const cases=[];
  const compare=(a,b,why)=>{same(a,b,why);comparisons++;};
  const randomBytes=size=>Uint8Array.from({length:size},(_,i)=>(Math.imul(i+19,747796405)^i>>>5)&255);
  const valid=['','Zg==','Zm8=','Zm9v','Zm9vYg==','Zm9vYmE=','Zm9vYmFy'];
  for(let n=0;n<=128;n++)valid.push(text(randomBytes(n)));
  for(const n of [255,256,1023,4096,6144,11000,32768,131072])valid.push(text(randomBytes(n)));
  // atob tolerates these unused padding bits. A strict native mode would not.
  for(let i=0;i<64;i++){valid.push('Z'+chars[i]+'==');valid.push('Zm'+chars[i]+'=');}
  const malformed=['=','AA=','A===','====','A','AAA==','AA=A','*AAA','AAAA_','AAAA-','AAAA\u00a0','AAAA\v','AAAA\u2028'];
  const odd=motion.motionToText(motion.encodeMotionFrame({tick:Number.MAX_SAFE_INTEGER,time:1/3,acknowledged:{0:Number.MAX_SAFE_INTEGER},ships:[['舰🚀',-0,1/3,-1e-300,1e9,Math.PI,-Math.PI,4294967295,3]]}));
  const motions=[...fixtures.motion,odd],allCombat=[...fixtures.combatCore,...fixtures.combatWeapons];
  const base={type:'projectile-visual',matchId:fixtures.matchId,syncId:'base64',key:1,tick:1,kind:'baseline'};
  const limited=[['motion',motion.MOTION_MAX_BYTES],['combat',combat.COMBAT_STATE_MAX_BYTES],['visual',ANCHORED_VISUAL_LIMITS.baselineBytes]];
  for(const mode of ['native','fallback'])withMode(mode,()=>{
    for(const value of valid){check(sameBytes(decodeBase64Bytes(value),legacyRead(value)),mode+' byte/padding parity');comparisons++;}
    for(const value of malformed)compare(outcome(()=>decodeBase64Bytes(value)),outcome(()=>legacyRead(value)),mode+' invalid helper alphabet');
    const a=decodeBase64Bytes(valid.at(-1)),b=decodeBase64Bytes(valid.at(-1));check(a.buffer!==b.buffer&&a.byteOffset===0&&a.buffer.byteLength===a.length,'Buffer ownership/size changed');
    a.fill(0);check(sameBytes(b,legacyRead(valid.at(-1))),'Decode alias mutated another result');cases.push(mode+' binary bytes, padding, invalid alphabet and buffer ownership');
    for(const data of motions)compare(motion.motionFromText(data),oldMotion.motionFromText(data),'Full motion fields/prototype/float parity');
    for(const data of allCombat)compare(combat.combatStateFromText(data),oldCombat.combatStateFromText(data),'Full combat/weapon fields parity');
    for(const data of [null,undefined,1,{},new String(motions[0]),...malformed, motions[0]+'\n',' '+motions[0],motions[0].replace(/A/,'_')]) {
      compare(outcome(()=>motion.motionFromText(data)),outcome(()=>oldMotion.motionFromText(data)),'Motion rejection parity');
      compare(outcome(()=>combat.combatStateFromText(data)),outcome(()=>oldCombat.combatStateFromText(data)),'Combat rejection parity');
      compare(outcome(()=>visual.visualPacketBytes({...base,data})),outcome(()=>oldVisual.visualPacketBytes({...base,data})),'Visual rejection parity');
    }
    for(const [kind,size]of limited)for(const n of [size,size+1,size+2,size+3]) {
      const data=text(randomBytes(n)),read=kind==='motion'?m=>m.motion.motionFromText(data):kind==='combat'?m=>m.combat.combatStateFromText(data):m=>m.visual.visualPacketBytes({...base,data});
      compare(outcome(()=>read(current)),outcome(()=>read(old)),kind+' decoded/encoded bound '+n);
      if(n>size)check(!outcome(()=>read(current)).accepted,'Decoded maximum bypass '+kind);
    }
    for(const data of motions.slice(0,2)) {
      const raw=legacyRead(data),corrupt=raw.slice();corrupt[0]^=1;
      for(const bad of [text(corrupt),text(raw.subarray(0,raw.length-1))]){check(!outcome(()=>motion.motionFromText(bad)).accepted,'Malformed motion body accepted');compare(outcome(()=>motion.motionFromText(bad)),outcome(()=>oldMotion.motionFromText(bad)),'Motion body validation');}
    }
    const unicode=legacyRead(odd);unicode[33]=255;check(!outcome(()=>motion.motionFromText(text(unicode))).accepted,'Invalid UTF8 accepted');
    for(const data of allCombat.slice(0,2)){const raw=legacyRead(data);raw[4]=255;raw[5]=255;check(!outcome(()=>combat.combatStateFromText(text(raw))).accepted,'Invalid tick accepted');}
    cases.push(mode+' complete motion/SCC1/SCC2 values, malformed bodies and caller bounds');
    for(const packet of fixtures.visualPackets)compare(visual.visualPacketBytes(packet),oldVisual.visualPacketBytes(packet),'Visual packet bytes');
    const before=new oldAuthority.AuthorityComponentReceiver(fixtures.matchId),after=new authority.AuthorityComponentReceiver(fixtures.matchId);
    for(const message of fixtures.publications)compare(after.receive(message),before.receive(message),'Authority component retention');
    cases.push(mode+' actual authority visual/combat publications including CRC validation');
    const packet=fixtures.visualPackets.find(p=>p.kind==='baseline'),raw=legacyRead(packet.data),one=new visual.VisualPacketAssembler(),two=new oldVisual.VisualPacketAssembler();
    let completed=0;
    for(let offset=0;offset<raw.length;offset+=visual.VISUAL_FRAGMENT_BYTES) {
      const chunk={...packet,offset,total:raw.length,data:text(raw.subarray(offset,offset+visual.VISUAL_FRAGMENT_BYTES))};
      const a=one.take(chunk),b=two.take(chunk);compare(a,b,'Fragment reassembly');if(a){completed++;check(sameBytes(a,raw),'Reassembled data changed');}
      else check(one.pending&&one.pending.bytes.length===raw.length,'Unbounded/absent partial baseline');
    }
    check(completed===1&&one.pending===null&&two.pending===null,'Fragment completion bookkeeping');
    for(const change of [{offset:1,total:raw.length},{offset:0,total:0},{offset:0,total:raw.length+1},{encoding:'invalid'},{encoding:'deflate-raw',rawBytes:ANCHORED_VISUAL_LIMITS.baselineBytes+1}])compare(outcome(()=>one.take({...packet,...change})),outcome(()=>two.take({...packet,...change})),'Invalid fragment/compression envelope');
    one.reset();two.reset();check(one.pending===null&&two.pending===null,'Reset retained partial');
    cases.push(mode+' visual fragmentation, envelope rejection and reset');
    const corrupt=raw.slice();corrupt[corrupt.length-1]^=1;
    const invalidPacket={...packet,data:text(corrupt)},reader=new AnchoredProjectileReceiver(fixtures.matchId);
    check(!outcome(()=>reader.baseline(packet.key,visual.visualPacketBytes(invalidPacket))).accepted,'CRC guard bypass');
    const publication=fixtures.publications.find(p=>p.family==='visual'&&p.baseline);
    for(const module of [oldAuthority,authority]) {
      const receiver=new module.AuthorityComponentReceiver(fixtures.matchId);
      check(!outcome(()=>receiver.receive({...publication,baseline:text(corrupt)})).accepted,'Authority CRC guard bypass');
      check(outcome(()=>receiver.receive(publication)).accepted,'Failed decode poisoned good baseline');
    }
    cases.push(mode+' invalid CRC denied, valid baseline still recoverable');
  });
  let nativeCalls=0,atobCalls=0;const oldAtob=globalThis.atob;
  try {
    Object.defineProperty(Uint8Array,'fromBase64',{...descriptor,value:function(value){nativeCalls++;return descriptor.value.call(this,value);}});
    globalThis.atob=value=>{atobCalls++;return oldAtob(value);};
    motion.motionFromText(motions[0]);combat.combatStateFromText(allCombat[0]);visual.visualPacketBytes(fixtures.visualPackets[0]);
    new authority.AuthorityComponentReceiver(fixtures.matchId).receive(fixtures.publications.find(p=>p.family==='combat'));
    check(nativeCalls===4&&atobCalls===0,'Native branch used binary-string fallback');
  }finally{globalThis.atob=oldAtob;restore();}
  cases.push('all four production callers use native bytes without atob');
  return {passed:true,comparisons,cases,nativeCalls,atobCalls,nativeAvailable:typeof descriptor?.value==='function'};
}
const summary=rows=>{const values=rows.map(r=>r.msPerPass).toSorted((a,b)=>a-b);return {meanMs:values.reduce((a,b)=>a+b,0)/values.length,p50Ms:values[Math.floor((values.length-1)*.5)],p95Ms:values[Math.floor((values.length-1)*.95)],batches:rows.length};};
export function benchmarkComponentBase64(fixtures) {
  const workloads={
    motion:m=>{let n=0;for(const data of fixtures.motion){const f=m.motion.motionFromText(data);n+=f.tick+f.ships.length;}return n;},
    combatCore:m=>{let n=0;for(const data of fixtures.combatCore){const f=m.combat.combatStateFromText(data);n+=f.tick+f.ships.length;}return n;},
    combatWeapons:m=>{let n=0;for(const data of fixtures.combatWeapons){const f=m.combat.combatStateFromText(data);n+=f.tick+f.ships.length+(f.weapons?.length??0);}return n;},
    visualPackets:m=>{let n=0;for(const packet of fixtures.visualPackets)n+=m.visual.visualPacketBytes(packet).length;return n;},
    authorityReceive:m=>{let n=0;const r=new m.authority.AuthorityComponentReceiver(fixtures.matchId);for(const p of fixtures.publications){const result=r.receive(p);n+=result.family==='combat'?result.data.length:result.publication.baseline.length+(result.publication.update?.length??0);}return n;},
  };
  const report={scope:'One browser, alternating ABBA CPU batches of existing complete component receivers. No profiler/GC forcing; not simulation, RAF FPS, relay/WAN or input-to-photon latency.',iterations:24,rounds:6,modes:{}};
  for(const mode of ['native','fallback'])report.modes[mode]=withMode(mode,()=>{
    const result={};
    for(const [name,run]of Object.entries(workloads)) {
      const expected=run(old);check(expected===run(current),'Benchmark witness differs');
      for(let warm=0;warm<12;warm++){run(old);run(current);}
      const rows={before:[],after:[]};
      for(let round=0;round<report.rounds;round++)for(const arm of round%2?['after','before','before','after']:['before','after','after','before']) {
        const module=arm==='before'?old:current;let witness=0;
        const started=performance.now();for(let i=0;i<report.iterations;i++)witness+=run(module);const elapsed=performance.now()-started;
        check(witness===expected*report.iterations,'Timed witness differs');rows[arm].push({round,msPerPass:elapsed/report.iterations,witness});
      }
      const before=summary(rows.before),after=summary(rows.after);
      result[name]={before,after,changePercent:(after.meanMs/before.meanMs-1)*100,rows};
    }
    return result;
  });
  return report;
}

/** Restore actual display worlds and exercise the same component pose/apply
 * stages, with both decoder paths. No input events or simulation advance. */
export async function checkComponentGeometry(data) {
  const {decodeBinaryFrame}=await import('../../src/network/BinarySnapshot.mjs');
  const {createLanDisplayWorld}=await import('../../src/network/LanDisplayBootstrap.ts');
  const {MotionReplica}=await import('../../src/network/MotionReplica.ts');
  const {CriticalCombatReplica,captureCriticalCombat}=await import('../../src/network/CriticalCombatReplica.ts');
  const {shipPresentationPose}=await import('../../src/engine/visual/ShipPresentation.ts');
  let compared=0;
  for(const mode of ['native','fallback'])withMode(mode,()=>{
    const before=createLanDisplayWorld(data.match,0,decodeBinaryFrame(legacyRead(data.cases[0].wire))).world;
    const after=createLanDisplayWorld(data.match,0,decodeBinaryFrame(legacyRead(data.cases[0].wire))).world;
    const oldMotion=new MotionReplica(),newMotion=new MotionReplica(),oldCombat=new CriticalCombatReplica(),newCombat=new CriticalCombatReplica();
    const tick=data.cases[0].tick;
    const authority=w=>w.allCapitalShips.map(s=>[s.id,s.pos.x,s.pos.y,s.vel.x,s.vel.y,s.facingRad]);
    const beforePositions=authority(before),afterPositions=authority(after);
    for(let i=0;i<data.components.motion.length;i++) {
      const a=old.motion.motionFromText(data.components.motion[i]),b=motion.motionFromText(data.components.motion[i]),stamp=a.tick*1000/60;
      oldMotion.receive(a,stamp,tick);newMotion.receive(b,stamp,tick);
      oldCombat.receive(old.combat.combatStateFromText(data.components.combatWeapons[i]),stamp,tick);
      newCombat.receive(combat.combatStateFromText(data.components.combatWeapons[i]),stamp,tick);
      for(const offset of [0,8,50,249,251]) {
        oldCombat.apply(before,tick,true);newCombat.apply(after,tick,true);
        oldMotion.render(before,stamp+offset,tick);newMotion.render(after,stamp+offset,tick);
        same(before.allCapitalShips.map(s=>[s.id,shipPresentationPose(s)]),after.allCapitalShips.map(s=>[s.id,shipPresentationPose(s)]),'Restored-world motion geometry parity');
        same(captureCriticalCombat(before,a.tick,true),captureCriticalCombat(after,b.tick,true),'Restored-world combat/weapon parity');compared++;
      }
    }
    same(authority(before),beforePositions,'Old motion changed authority pose');same(authority(after),afterPositions,'New motion changed authority pose');
    oldMotion.clear();newMotion.clear();check(!before.allCapitalShips.some(shipPresentationPose)&&!after.allCapitalShips.some(shipPresentationPose),'Cleared pose leaked');
  });
  return {passed:true,compared,frames:data.cases.length,zoomIndependentGeometry:true,scope:'Exact render-only pose and combat values on restored worlds. No GPU pixels, native UI equivalence or network timing.'};
}
