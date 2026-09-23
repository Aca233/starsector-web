import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {encodeMotionFrame,motionToText} from '../src/network/MotionFrame.mjs';
import {motionWireTarget,MotionWireSender,MotionWireReceiver} from '../server/MotionWire.mjs';
const [folder,output]=process.argv.slice(2),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
const sender=new MotionWireSender(),receiver=new MotionWireReceiver(),measure=[];let legacy=0,wire=0,doubleCompressed=0,binary=0;
for(const r of manifest.rows){
 const f=decodeBinaryState(fs.readFileSync(path.join(folder,r.name))).frame;
 const data=motionToText(encodeMotionFrame({tick:f.tick,time:f.tick/60,acknowledged:{0:f.tick,1:f.tick,2:f.tick,3:f.tick},ships:f.ships.map(({id,state:s})=>[id,...s.pos.$vector,...s.vel.$vector,s.facingRad,s.angularVelRad,s.teleportSequence,(s.isDead?1:0)|(s.isRetreated?2:0)])}));
 const m={type:'motion',matchId:'recording',syncId:'replay',data},at=performance.now(),target=motionWireTarget(data),choice=sender.prepare(target,m),encoded={...m,motionWire:1,data:choice.data};
 measure.push(performance.now()-at);assert.ok(sender.commit(choice));assert.deepEqual(receiver.decode(encoded),m);
 // Existing WS no-context-takeover threshold1024; new precompressed message
 // skips a second compression. Include JSON/base64 and WS header in both.
 const text=JSON.stringify(m),packed=JSON.stringify(encoded);
 legacy+=(Buffer.byteLength(text)>=1024?deflateRawSync(text,{level:1,memLevel:7}).length:Buffer.byteLength(text))+4;
 wire+=Buffer.byteLength(packed)+4;doubleCompressed+=deflateRawSync(packed,{level:1,memLevel:7}).length+4;binary+=choice.bytes+Buffer.byteLength(m.matchId)+Buffer.byteLength(m.syncId)+8;
}
const q=p=>measure.toSorted((a,b)=>a-b)[Math.floor((measure.length-1)*p)];
const result={scope:'Exact recorded motion round-trip and estimated WS message bytes, not full shared-link or renderer FPS',frames:measure.length,legacyBytes:legacy,motionWireBytes:wire,doubleCompressedBytes:doubleCompressed,binaryBytes:binary,ratio:wire/legacy,encodeMs:{p50:q(.5),p95:q(.95)},sender:sender.stats()};
fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
