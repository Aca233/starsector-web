import '../../src/engine/simulation/CombatEngine';
import { bundledShipPacks } from '../../src/engine/modding/BundledShipPacks';
import { validateShipPack } from '../../src/engine/modding/ShipPackValidation';
import { RustCombatKernel } from '../../src/engine/runtime/rust/RustCombatKernel';
import { LocalCombatKernel } from '../../src/engine/runtime/local/LocalCombatKernel';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import { contentRegistry } from '../../src/engine/content/ContentRegistry';
import type { LocalCombatConfig } from '../../src/engine/runtime/local/LocalCombatContracts';
import type { CombatControlSample } from '../../src/engine/runtime/CombatControl';
export interface KernelCanonicalJournal {pack:string;epoch:number;ticks:number;digests:string[];cold?:string;firstFrames?:string[];}
export function canonicalPublication(kernel:RustCombatKernel, hot:ReturnType<RustCombatKernel['capturePresentation']>,trails=Array.from(hot.presentation.view.trailStrips)):string {
  const view=hot.presentation.view,hud=hot.presentation.hud;
  const fields=['particles','contrails','debris','explosions','hitGlows','empArcs','muzzleFlashes','muzzleParticles','shieldRipples','movingRayFades']as const;
  const encode=(value:unknown):unknown=>{
    if(typeof value==='number'){if(Object.is(value,-0))return{$number:'-0'};if(!Number.isFinite(value))return{$number:String(value)};return value;}
    if(value===undefined)return{$undefined:true};
    if(Array.isArray(value)||ArrayBuffer.isView(value))return Array.from(value as ArrayLike<unknown>,encode);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,encode((value as Record<string,unknown>)[k])]));
    return value;
  };
  return JSON.stringify(encode({witness:kernel.replayWitness(),projectiles:view.projectiles,beams:view.beams,audio:hot.audio,radio:hud.radio,
    visual:Object.fromEntries(fields.map(k=>[k,view[k]])),trails,floating:hud.floatingTexts,shake:view.cameraShakeIntensity,result:hud.battleResult,resultReady:hud.isBattleResultReady}));
}
async function digestBlock(previous:string,frames:string[]):Promise<string>{
  const bytes=new TextEncoder().encode(previous+'\n'+frames.join('\n')),hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function replayBrowserKernelCanonical(wasm:BufferSource,sha256:string,journals:KernelCanonicalJournal[]){
  const module=await WebAssembly.compile(wasm),specs=contentRegistry.getAllShips(),failures:unknown[]=[];let publications=0,blocks=0;
  for(const journal of journals){const pack=bundledShipPacks.find(p=>p.id===journal.pack)!;let native:RustCombatKernel|undefined;
    try{const hull=validateShipPack(pack,false,bundledShipPacks).compiled[0].id;
      native=await RustCombatKernel.create({playerHull:hull,enemyHull:hull,seed:733,multicore:false,backend:'rust-wasm',content:{ships:specs,weapons:contentRegistry.getAllWeapons()}},journal.epoch,{module,sha256});
      let chain='',batch:string[]=[],block=0,packPublications=0;
      const collect=async()=>{const hot=native!.capturePresentation(),frame=canonicalPublication(native!,hot),expected=journal.firstFrames?.[packPublications]??(packPublications===0?journal.cold:undefined);if(expected!==undefined&&frame!==expected){
          const diff=(a:unknown,b:unknown,p:string):string|undefined=>{if(Object.is(a,b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'){const ak=Object.keys(a),bk=Object.keys(b);if(ak.length!==bk.length||ak.some(k=>!bk.includes(k)))return p+': keys';for(const k of ak){const d=diff((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k],p+'.'+k);if(d)return d;}}else return p+': '+String(a)+' / '+String(b);};
          throw Error(`${journal.pack}: canonical publication ${packPublications} ${diff(JSON.parse(frame),JSON.parse(expected),'frame')}`);}
        batch.push(frame);publications++;packPublications++;native!.acknowledgePublication();
        if(batch.length===32){chain=await digestBlock(chain,batch);batch=[];if(chain!==journal.digests[block])throw Error(`${journal.pack}: canonical block ${block} differs`);block++;blocks++;}};
      await collect();for(let tick=0;tick<journal.ticks;tick++){native.stepScheduled({autopilot:false,blocked:false,keys:tick>=4?{KeyW:true}:{},aim:[0,-500],firing:tick>=4,mouseSteering:false,pointerActive:true});await collect();}
      if(batch.length){chain=await digestBlock(chain,batch);if(chain!==journal.digests[block])throw Error(`${journal.pack}: canonical final block ${block} differs`);block++;blocks++;}
      if(block!==journal.digests.length)throw Error(`${journal.pack}: canonical block count differs`);
    }catch(error){failures.push({pack:journal.pack,error:String(error)});}finally{native?.dispose();}}
  return{passed:failures.length===0,failures,publications,blocks,wasmSHA256:sha256,reference:'actual browser source-validated production publications',sourceMathPatched:false};
}
export async function checkRustKernelStartup(wasm: BufferSource, sha256: string, onlyPack?: string, ticks = 12) {
  const module = await WebAssembly.compile(wasm), cases: unknown[] = [], failures: unknown[] = [];
  const canonicalJournals:KernelCanonicalJournal[]=[];
  const selectedPacks = onlyPack ? new Set(onlyPack.split(',')) : undefined;
  // Actual imported source registry is the startup snapshot, including native
  // wing crafts and base weapons referenced across authored pack dependencies.
  const specs = contentRegistry.getAllShips();
  let strict = 0, geometry = 0, maximumDifference = 0, publications = 0;
  let aftermathProjectilePrefix:string|undefined;
  const compareWitness = (a: number[], b: number[], path: string) => {
    if (a.length !== b.length) throw Error(path + ': witness length');
    const geometries = new Set([8, 9, 10, 11, 12, 16, 17]);
    for (let i = 0; i < a.length; i++) { if (geometries.has(i)) { geometry++; const d = Math.abs(a[i] - b[i]); maximumDifference = Math.max(maximumDifference, d); if (d > Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a[i]), Math.abs(b[i])))) throw Error(`${path}[${i}]: geometry ${a[i]} / ${b[i]}`); } else { strict++; if (!Object.is(a[i], b[i])) throw Error(`${path}[${i}]: ${a[i]} / ${b[i]}`); } }
  };
  const compareFact = (a: unknown, b: unknown, path: string): void => {
    if (typeof a === 'number' && typeof b === 'number') {
      const aftermathDistance=aftermathProjectilePrefix!==undefined&&path.startsWith(aftermathProjectilePrefix+'[')&&path.endsWith('.rangeRemaining');
      const cameraOffset=path.endsWith('.cameraShakeIntensity');
      if(aftermathDistance){strict++;if((a<=0)!==(b<=0))throw Error(`${path}: retirement threshold differs`);}
      if(cameraOffset){strict++;if((a>.01)!==(b>.01))throw Error(`${path}: shake threshold differs`);}
      if (aftermathDistance||cameraOffset||/\.(x|y|facingRad|angleRad|currentAngleRad|sourceMoveSpeed|movingRayMoveSpeed|moveSpeed|turnVelocityRad|rotation|angularVel|diameter|radius|maxRadius|shockwaveRadius|maxShockwaveRadius|width|height|coreDiameter|startSize|endSize|size|thickness|baseWidth|currentWidth|minSeg|accumU|u)$|\.(position|listener)\[\d+\]$/.test(path)) {
        geometry++; const difference = Math.abs(a - b); maximumDifference = Math.max(maximumDifference, difference);
        if (difference > Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)))) throw Error(`${path}: geometry ${a} / ${b}`);
      } else { strict++; if (!Object.is(a, b)) throw Error(`${path}: ${a} / ${b}`); } return;
    }
    if (Array.isArray(a) || ArrayBuffer.isView(a)) { if (!Array.isArray(b) && !ArrayBuffer.isView(b)) throw Error(path + ': array type'); const aa = Array.from(a as ArrayLike<unknown>), bb = Array.from(b as ArrayLike<unknown>); compareFact(aa.length, bb.length, path + '.count'); aa.forEach((v, i) => compareFact(v, bb[i], `${path}[${i}]`)); return; }
    if (a && b && typeof a === 'object' && typeof b === 'object') { const aa = Object.keys(a), bb = Object.keys(b); if (aa.length !== bb.length || aa.some(k => !bb.includes(k))) throw Error(`${path}: keys ${aa} / ${bb}`); strict++; for (const k of aa) compareFact((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path + '.' + k); return; }
    strict++; if (a !== b) throw Error(`${path}: ${String(a)} / ${String(b)}`);
  };
  const controls: CombatControlSample[] = [
    { autopilot: false, blocked: false, keys: {}, aim: [0, -500], firing: false, mouseSteering: false, pointerActive: true },
    { autopilot: false, blocked: false, keys: { KeyW: true }, aim: [0, -500], firing: true, mouseSteering: false, pointerActive: true },
  ];
  for (const [index, pack] of bundledShipPacks.entries()) {
    if (selectedPacks && !selectedPacks.has(pack.id)) continue;
    const hull = validateShipPack(pack, false, bundledShipPacks).compiled[0].id;
    const config: LocalCombatConfig = { playerHull: hull, enemyHull: hull, seed: 733, multicore: false,
      content: { ships: specs, weapons: contentRegistry.getAllWeapons() } };
    let source: LocalCombatKernel | undefined, native: RustCombatKernel | undefined, stage = 'cold-source', firstDamage: number | undefined, completedTick = 0;
    const audio: unknown[] = [], trace: unknown[] = [], stop = captureCombatAudio(e => audio.push(structuredClone(e)));
    let digestChain='',digestBatch:string[]=[],coldFrame:string|undefined;const digests:string[]=[],firstFrames:string[]=[];
    const record=async(frame:string)=>{if(firstFrames.length<32)firstFrames.push(frame);digestBatch.push(frame);if(digestBatch.length===32){digestChain=await digestBlock(digestChain,digestBatch);digests.push(digestChain);digestBatch=[];}};
    try {
      source = new LocalCombatKernel({ ...config, backend: 'typescript' }); stop();
      stage = 'RustCombatKernel.create'; native = await RustCombatKernel.create({ ...config, backend: 'rust-wasm' }, index + 1, { module, sha256 });
      stage = 'cold-capturePresentation'; const cold = native.capturePresentation(); publications++;
      compareWitness(native.replayWitness(), source.replayWitness(), pack.id + '.cold');
      const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, canonical(value)])) : v;
      if (JSON.stringify(canonical(cold.presentation.hud.radio)) !== JSON.stringify(canonical(source.engine.radioMessages))) throw Error(pack.id + ': opening radio differs ' + JSON.stringify(cold.presentation.hud.radio) + ' / ' + JSON.stringify(source.engine.radioMessages));
      if (JSON.stringify(cold.audio) !== JSON.stringify(audio)) throw Error(pack.id + ': opening audio differs');
      coldFrame=canonicalPublication(native,cold);await record(coldFrame);
      native.acknowledgePublication();
      for (let tick = 0; tick < ticks; tick++) {
        const sourceAlreadySettled=source.engine.battleResult!==null;
        stage = `step:${tick + 1}`; const sample = controls[Number(tick >= 4)], hotAudio: unknown[] = [], stopHot = captureCombatAudio(event => hotAudio.push(structuredClone(event)));
        try { source.step(sample); } finally { stopHot(); }
        if (source.engine.statsTracker.playerStats.totalDamageDealt + source.engine.statsTracker.enemyStats.totalDamageDealt > 0) firstDamage ??= tick + 1;
        native.stepScheduled(sample);
        stage = `capturePresentation:${tick + 1}`; const hot = native.capturePresentation(); publications++;
        const hotTrails=Array.from(hot.presentation.view.trailStrips),hotCanonical=canonicalPublication(native,hot,hotTrails);
        if (onlyPack) {
          const snapshot = (native as unknown as { snapshot: { bodies: { id: number; ship?: { fireMemories: Float64Array[]; weapons?: { controller: Float64Array; mounts: Float64Array[] } } }[] } }).snapshot;
          trace.push({ tick: tick + 1, native: snapshot.bodies.map(b => ({ id: b.id, memories: b.ship?.fireMemories.map(m => Array.from(m)), mounts: b.ship?.weapons?.mounts.map(m => ({ id: m[0], angle: m[15], burst: m[20], state: m[23], timer: m[24], trigger: m[25], cooldown: m[16] })) })),
            source: source.engine.ships.map(s => ({ id: s.id, mode: s.fireControlMode, target: s.currentTargetShip?.id, mounts: s.weapons.map(m => ({ id: m.slotId, angle: m.currentAngleRad, burst: m.burstRemaining, state: m.firingState, timer: m.firingStateTimer, trigger: m.triggerHeld, cooldown: m.cooldownTimer, decision: m.fireControl, autoCharge: m.spec.autoCharge })) })) });
          if (trace.length > 32) trace.shift();
        }
        compareWitness(native.replayWitness(), source.replayWitness(), `${pack.id}.tick${tick + 1}`);
        aftermathProjectilePrefix=sourceAlreadySettled?`${pack.id}.tick${tick + 1}.projectiles`:undefined;
        try{compareFact(hot.presentation.view.projectiles, source.engine.projectiles, `${pack.id}.tick${tick + 1}.projectiles`);}finally{aftermathProjectilePrefix=undefined;}
        compareFact(hot.presentation.view.beams, source.engine.beams, `${pack.id}.tick${tick + 1}.beams`);
        compareFact(hot.audio, hotAudio, `${pack.id}.tick${tick + 1}.audio`);
        compareFact(hot.presentation.hud.radio, source.engine.radioMessages, `${pack.id}.tick${tick + 1}.radio`);
        for (const field of ['particles', 'contrails', 'debris', 'explosions', 'hitGlows', 'empArcs', 'muzzleFlashes', 'muzzleParticles', 'shieldRipples'] as const)
          compareFact(hot.presentation.view[field], source.engine.fxSystem[field], `${pack.id}.tick${tick + 1}.visual.${field}`);
        compareFact(hot.presentation.view.movingRayFades, source.engine.fxSystem.movingRayFades, `${pack.id}.tick${tick + 1}.visual.movingRayFades`);
        compareFact(hotTrails, Array.from(source.engine.contrailEngine.getStrips()), `${pack.id}.tick${tick + 1}.visual.trailStrips`);
        compareFact(hot.presentation.hud.floatingTexts, source.engine.floatingTexts, `${pack.id}.tick${tick + 1}.visual.floatingTexts`);
        compareFact(hot.presentation.view.cameraShakeIntensity, source.engine.cameraShakeIntensity, `${pack.id}.tick${tick + 1}.cameraShakeIntensity`);
        compareFact(hot.presentation.hud.battleResult, source.engine.battleResult, `${pack.id}.tick${tick + 1}.battleResult`);
        compareFact(hot.presentation.hud.isBattleResultReady, source.engine.isBattleResultReady, `${pack.id}.tick${tick + 1}.resultReady`);
        await record(hotCanonical);
        native.acknowledgePublication();
        completedTick = tick + 1;
        if (source.engine.isBattleResultReady) break;
      }
      if(digestBatch.length){digestChain=await digestBlock(digestChain,digestBatch);digests.push(digestChain);digestBatch=[];}
      canonicalJournals.push({pack:pack.id,epoch:index+1,ticks:completedTick,digests,cold:coldFrame,firstFrames});
      cases.push({ pack: pack.id, cold: true, ticks: completedTick, firstDamage, result: source.engine.battleResult, resultReady: source.engine.isBattleResultReady });
    } catch (error) { const e = error as Error & { code?: number }; const snapshot = (native as unknown as { snapshot?: { projectiles: Float64Array[]; beams: Float64Array[]; bodies: { id: number; motion: Float64Array; ship?: { weapons?: { mounts: Float64Array[] } } }[] } } | undefined)?.snapshot;
      failures.push({ pack: pack.id, stage, error: String(e), code: e.code, stack: e.stack, trace, firstDamage, sourceStats: source?.engine.statsTracker, nativeWitness: native?.replayWitness(), sourceWitness: source?.replayWitness(),
        nativeOrdnance: snapshot && { projectiles: snapshot.projectiles.map(p => Array.from(p)), beams: snapshot.beams.map(b => Array.from(b)) },
        sourceOrdnance: source && { projectiles: source.engine.projectiles, beams: source.engine.beams },
        nativeMounts: snapshot?.bodies.map(b => ({ id: b.id, mounts: b.ship?.weapons?.mounts.map(m => Array.from(m)) })),
        sourceMounts: source?.engine.ships.map(s => ({ id: s.id, mounts: s.weapons.map(m => ({ id: m.slotId, spec: m.spec.id, state: m.firingState, timer: m.firingStateTimer, cycle: m.firingCycleId, cooldown: m.cooldownTimer, burst: m.burstRemaining, ammo: m.ammo })) })) }); }
    finally { stop(); source?.dispose(); native?.dispose(); }
  }
  return { passed: failures.length === 0, cases, failures, strict, geometry, maximumDifference, publications,
    canonicalJournals,
    actualProductionKernel: true, diagnosticAdmissionSupplementation: false, fullBattleReady: false };
}
