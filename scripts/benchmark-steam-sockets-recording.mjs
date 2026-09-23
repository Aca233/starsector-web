/** Real recorded complete worlds through the experimental Sockets room stack.
 * Virtual time/SDK/FIFO only: NOT actual Steam routing, physics or render FPS. */
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {SteamSocketRoom} from '../server/steam/sockets-room.mjs';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {simulateSocketLink} from './steam-sockets-link-model.mjs';
const [directory,output]=process.argv.slice(2);if(!directory||!output)throw Error('recording-dir output.json required');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
const frames=manifest.rows.map(row=>decodeBinaryState(fs.readFileSync(path.join(directory,row.name))).frame);
const durationMs=Number(process.env.SOCKET_REPLAY_DURATION_MS??15000),guests=Number(process.env.SOCKET_REPLAY_GUESTS??4),rate=Number(process.env.SOCKET_REPLAY_BYTES_PER_SECOND??500000),rtt=Number(process.env.SOCKET_REPLAY_RTT_MS??60);
// Optional offline-only old budget injection for a same-controller paired replay.
const budgetPath=process.env.SOCKET_REPLAY_FLIGHT_BUDGET;
const Budget=budgetPath?(await import(pathToFileURL(path.resolve(budgetPath)).href)).SteamSocketFlightBudget:null;
const roomFactory=options=>{const room=new SteamSocketRoom(options);if(Budget)room.flightBudget=new Budget({inputOnly:!room.host});return room;};
const report=simulateSocketLink({roomFactory,guests,durationMs,upBytesPerSecond:rate,rttMs:rtt,observedAckFloor:process.env.SOCKET_REPLAY_ACK_FLOOR!=='false',compensateAckDelay:process.env.SOCKET_REPLAY_ACK_DELAY!=='false',frameFactory:seq=>frames[(seq-1)%frames.length],trace:true});
report.flightBudget=budgetPath?path.resolve(budgetPath):'current';report.recording=path.resolve(directory);report.scope+='; complete native 22-ship recording with retimed envelope only, every received JSON state checked against producer SHA-256; NOT game execution/input-to-photon, network apply or renderer';
fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({scope:report.scope,config:report.config,closed:report.closed,flight:report.hostFlight,peak:report.peakExternalHostBytes,peers:report.peers.map(({windows:_windows,...p})=>p)},null,2));
