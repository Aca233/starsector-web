// Offline real client/producer harness; opening any network is a hard test failure.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'esbuild';
export async function createRealtimeFixtures({battleSource=null,protocolSource=null}={}) {
const source = battleSource ?? fs.readFileSync('src/network/LanBattle.tsx', 'utf8');
const hasRetry = source.includes('    let inputRetryPending = false;');
const begin = hasRetry ? '    let inputRetryPending = false;' : '    const sendInput = () => {', end = '    const down = (event: KeyboardEvent) => {';
assert.equal(source.split(begin).length, 2); assert.equal(source.split(end).length, 2);
const inputHandler = source.slice(source.indexOf(begin), source.indexOf(end));
const code = (await build({ stdin: { contents: `
import { LanConnection } from './src/network/protocol';
import { submitRealtimeInput } from './src/network/RealtimeSendPolicy.mjs';
import { InputSendBudget } from './src/network/InputSendBudget';
import { LanPresentationControls } from './src/network/LanPresentationControls';
import { Vector2 } from './src/engine/math/Vector2';
export { LanConnection };
export function producer(connection) {
 let engine={playerShip:{aimTargetWorld:{x:0,y:0}}}, launched=true, synced=true;
 let seq=0, keys=0, firing=false, actions=[];
 const remote=null, controls=new LanPresentationControls(new Vector2(1,1));controls.zoom=1;controls.samplePointer(0,0);
 let canvas={}, focused=true;
 const readCombatViewport=()=>({width:2,height:2,rect:{left:0,top:0,width:2,height:2}});
 let inputBudget=new InputSendBudget(), sentInputs=new Map(), records=[], fireRecords=[], turretRecords=[];
 const hasControlPermission=()=>focused, active=()=>focused, resetInput=()=>{keys=0;firing=false;controls.pointerActive=false;actions=[];};
 const prediction={record:(input,now)=>records.push({input,now})};
 const turretPrediction={record:(input,now)=>turretRecords.push({input,now})};
 const firePrediction={record:(_engine,input,now,enabled)=>fireRecords.push({input,now,enabled})};
 // Recorders observe the real sender's completion hook; they are not a fake
 // authority simulation. Coordinate projection uses the production controls.
 const presentation={recordAcceptedInput:(input,now,enabled)=>{prediction.record(input,now);turretPrediction.record(input,now);firePrediction.record(engine,input,now,enabled);}};
 const send=message=>connection.send({...message,matchId:'test',syncId:'current'});
 ${inputHandler}
 return {tick:()=>sendInput(false),edge:()=>sendInput(true), set:(patch)=>{if('keys' in patch)keys=patch.keys;if('x' in patch)controls.samplePointer(patch.x,0);if('focused' in patch)focused=patch.focused;if('firing' in patch)firing=patch.firing;if('launched' in patch)launched=patch.launched;if('synced' in patch)synced=patch.synced;},
  dispose:${hasRetry ? "releaseInputRetry" : "()=>{}"},get retryPending(){return ${hasRetry ? "inputRetryPending" : "false"};},
  action:(id)=>{if(actions.length<16)actions.push({id,kind:'shield'});},
  get actions(){return actions;},get seq(){return seq;},get records(){return records;},get fireRecords(){return fireRecords;},get turretRecords(){return turretRecords;}};
}
`, loader: 'ts', resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'cjs', write: false, logLevel: 'silent', define: { __LAN_BUILD_ID__: '"offline"' }, plugins: protocolSource ? [{name:'offline-baseline',setup(b){b.onLoad({filter:/[\\/]protocol\.ts$/},args=>({contents:protocolSource,loader:'ts',resolveDir:path.dirname(args.path)}));}}] : [] })).outputFiles[0].text;
return function fixture(transport) {
  let now = 0;
  class NoNetwork { static OPEN = 1; constructor() { throw Error('test must not open networking'); } }
  const sandbox = { module: { exports: {} }, exports: {}, WebSocket: NoNetwork, EventTarget, TextEncoder, TextDecoder, ArrayBuffer, Uint8Array,
    document: new EventTarget(), clearTimeout, clearInterval,
    crypto: { getRandomValues: a => a.fill(7) }, sessionStorage: { getItem: () => null }, performance: { now: () => now } };
  sandbox.exports = sandbox.module.exports; vm.runInNewContext(code, sandbox);
  const { LanConnection, producer } = sandbox.module.exports, connection = new LanConnection(transport);
  const sent = [], socket = { readyState: 1, bufferedAmount: 0, send: raw => { sent.push(raw); }, close() { this.readyState = 3; } };
  connection.socket = socket; connection.ready = true;
  return { connection, socket, sent, producer: producer(connection), at: n => { now = n; } };
}
}
