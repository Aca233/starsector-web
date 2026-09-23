// Opt-in headless-test transforms ONLY. Never imported by production source.
import assert from 'node:assert/strict';
export const STEADY_START_TICK = 121;
export const STEADY_END_TICK = 1021;
export function steadyInputTuple(seat, state) {
 const actions = [...new Map(state.queued.map(a => [a.id, a])).values()].map(({kind,value,aim}) => ({kind,value,aim}));
 return {seat,keys:state.input.keys,aim:state.input.aim,firing:state.input.firing,pointerActive:state.input.pointerActive,actions};
}
export function primedSteadyControls(rows, now, preparing = false, commandHeld = false) {
 return rows.length > 0 && rows.every(([,s]) => s.connected && s.online && now-s.received >= 0 && now-s.received < 500 &&
  s.input.keys === (preparing && !commandHeld ? 0 : 1) && s.input.firing === (!preparing || commandHeld) && s.input.pointerActive === true && s.input.aim[0] === 0 && s.input.aim[1] === 0 &&
  (preparing ? s.queued.some(a => a.kind === 'group' && a.value === 3) : s.queued.length === 0 && s.input.actions.length === 0));
}
const workerFixture = `
// Injected by the isolated headless harness, never in a shipping build.
let steadyReleased = false, steadyPrepared = false;
const steadyEffectiveInputs = new Map();
function steadyObserveInput(seat, state, fresh) {
 if (tick > ${STEADY_END_TICK}) return;
 const input = {...steadyInputTuple(seat, state), connected:state.connected, online:state.online, fresh};
 const signature = JSON.stringify(input);
 if (steadyEffectiveInputs.get(seat) === signature) return;
 steadyEffectiveInputs.set(seat,signature);
 send({type:'test-fixture',phase:'input-transition',tick:tick+1,input});
}
const steadyInputTuple = ${steadyInputTuple.toString()};
const primedSteadyControls = ${primedSteadyControls.toString()};
function steadyStatus() {
 const rows = [...controls];
 return {type:'test-fixture', phase:'status', tick, released:steadyReleased,
  primed:((tick===1 && !steadyPrepared) || tick===61) && primedSteadyControls(rows,performance.now(),tick===1,steadyCommandHeld),
  inputs:rows.map(([seat,s])=>({...steadyInputTuple(seat,s),online:s.online,connected:s.connected,ageMs:performance.now()-s.received}))};
}
function steadyCheckpoint() {
 if (![1,61,${STEADY_START_TICK},421,721,${STEADY_END_TICK}].includes(tick)) return;
 const wallTimeMs=Date.now(), started=performance.now();
 const bytes=encodeProjectedBinaryFrame(captureSteadyCombat(engine!,tick,{},0,true,true,true,true,compactParticles),true);
 send({type:'test-fixture',phase:'checkpoint',tick,wallTimeMs,diagnosticMs:performance.now()-started,bytes},[bytes.buffer]);
}
`;
function replaceExactly(code, needle, replacement, count=1) {
 assert.equal(code.split(needle).length-1,count,'Steady fixture source anchor changed: '+needle);
 return code.split(needle).join(replacement);
}
export function transformSteadyFixture(code, id, commandHeld = false) {
 const file=id.replaceAll('\\','/').split('?')[0];
 if(file.endsWith('/src/network/LanBattle.tsx'))return replaceExactly(code,'clientToCombatWorld(pointer, canvas, camera, zoom)','((globalThis as any).__steadyAim ?? clientToCombatWorld(pointer, canvas, camera, zoom))',3);
 if(!file.endsWith('/src/network/host.worker.ts'))return null;
 code="import {captureCombat as captureSteadyCombat} from './AuthorityCombatSnapshot';\n"+code+`
const steadyCommandHeld = ${commandHeld};
`+workerFixture;
 code=replaceExactly(code,'function handleMessage(m: any) {',`function handleMessage(m: any) {
  if (m.type === 'test-fixture-status') { send(steadyStatus()); return; }
  if (m.type === 'test-fixture-prepare') {
    const status=steadyStatus();
    if(tick!==1 || steadyPrepared || !status.primed){send({...status,phase:'prepare-rejected'});return;}
    steadyPrepared=true;send({type:'test-fixture',phase:'prepared',tick,inputs:[...controls].map(([seat,s])=>steadyInputTuple(seat,s))});return;
  }
  if (m.type === 'test-fixture-release') {
    const status=steadyStatus();
    if (steadyReleased || tick!==(steadyCommandHeld ? 1 : 61) || !status.primed) { send({...status,phase:'release-rejected'}); return; }
    steadyReleased=true;
    send({type:'test-fixture',phase:'released',tick,wallTimeMs:Date.now(),inputs:[...controls].map(([seat,s])=>steadyInputTuple(seat,s))});
    return;
  }`);
 code=replaceExactly(code,'  try { flushSnapshotEncoding(); } catch (error) { fail(error); return; }',`  if (!steadyReleased && (tick === 61 || tick === 1 && !steadyPrepared)) {
    // Startup barrier only: keep transport/credits alive, do not bank paused time.
    last=lastCallbackFinishedAt=performance.now(); accumulator=0;
    clockAt=last; clockTick=tick; clockCombat=engine.combatTime;
    try { flushSnapshotEncoding(); motionSnapshot(); combatSnapshot(); snapshot(); visualSnapshot(); }
    catch(error) { fail(error); }
    return;
  }
  try { flushSnapshotEncoding(); } catch (error) { fail(error); return; }`);
 code=replaceExactly(code,'        const keys: Record<string, boolean> = {};','        steadyObserveInput(seat, state, fresh);\n        const keys: Record<string, boolean> = {};');
 code=replaceExactly(code,'      samples++;','      samples++;\n      steadyCheckpoint();\n      if (!steadyReleased && (tick === 61 || tick === 1 && !steadyPrepared)) break;');
 return code;
}
export function steadyFixturePlugin(enabled, commandHeld = false) {
 return {name:'test-only-steady-fixture',enforce:'pre',transform(code,id){return enabled?transformSteadyFixture(code,id,commandHeld):null;}};
}
