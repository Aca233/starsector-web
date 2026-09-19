// Offline real client/producer harness; opening any network is a hard test failure.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'esbuild';
export async function createRealtimeFixtures({battleSource=null,protocolSource=null}={}) {
const source = battleSource ?? fs.readFileSync('src/network/LanBattle.tsx', 'utf8');
const begin = '    const sendInput = () => {', end = '    const down = (event: KeyboardEvent) => {';
assert.equal(source.split(begin).length, 2); assert.equal(source.split(end).length, 2);
const inputHandler = source.slice(source.indexOf(begin), source.indexOf(end));
const code = (await build({ stdin: { contents: `
import { LanConnection } from './src/network/protocol';
import { submitRealtimeInput } from './src/network/RealtimeSendPolicy.mjs';
import { InputSendBudget } from './src/network/InputSendBudget';
export { LanConnection };
export function producer(connection) {
 let engine={playerShip:{aimTargetWorld:{x:0,y:0}}}, launched=true, synced=true;
 let seq=0, keys=0, firing=false, pointerActive=true, actions=[], pointer={x:0,y:0};
 let canvas={}, camera={}, zoom=1, focused=true;
 let inputBudget=new InputSendBudget(), sentInputs=new Map(), records=[];
 const active=()=>focused, resetInput=()=>{keys=0;firing=false;pointerActive=false;actions=[];};
 const clientToCombatWorld=(p)=>p;
 const prediction={record:(input,now)=>records.push({input,now})};
 const send=message=>connection.send({...message,matchId:'test',syncId:'current'});
 ${inputHandler}
 return {tick:sendInput, set:(patch)=>{if('keys' in patch)keys=patch.keys;if('x' in patch)pointer={x:patch.x,y:0};if('focused' in patch)focused=patch.focused;},
  action:(id)=>{if(actions.length<16)actions.push({id,kind:'shield'});},
  get actions(){return actions;},get seq(){return seq;},get records(){return records;}};
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
