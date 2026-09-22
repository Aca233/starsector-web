// Always headless. Real restored Web worlds and MotionReplica presentation
// geometry, not GPU pixel parity or native desktop verification.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {createRequire} from 'node:module';import {createServer} from 'vite';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {encodeMotionFrame,motionToText} from '../src/network/MotionFrame.mjs';
import {encodeMotionDisplayFrame} from '../src/network/MotionDisplay.mjs';
import {MotionWireSender,MotionWireReceiver,motionWireTarget,encodeMotionWireEnvelope,decodeMotionWireEnvelope} from '../server/MotionWire.mjs';
const {chromium}=createRequire(import.meta.url)('playwright'),folder='artifacts/network-stream-20260921/particle-paired-exact/recipe';
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8')),sender=new MotionWireSender(),receiver=new MotionWireReceiver();
const rows=manifest.rows.map(row=>{
 const world=fs.readFileSync(path.join(folder,row.name)),f=decodeBinaryState(world).frame;
 const motion={tick:f.tick,time:f.time??f.tick/60,acknowledged:{0:f.tick,1:f.tick},ships:f.ships.map(({id,state:s})=>[id,...s.pos.$vector,...s.vel.$vector,s.facingRad,s.angularVelRad,s.teleportSequence,(s.isDead?1:0)|(s.isRetreated?2:0)])};
 const raw=motionToText(encodeMotionFrame(motion)),message={type:'motion',matchId:'browser',syncId:'scope',data:motionToText(encodeMotionDisplayFrame(motion))},choice=sender.prepare(motionWireTarget(message.data),message);
 const delivered=receiver.decode(decodeMotionWireEnvelope(encodeMotionWireEnvelope(message,choice)));assert.deepEqual(delivered,message);assert.ok(sender.commit(choice));
 return {tick:f.tick,world:world.toString('base64'),raw,data:delivered.data};
});
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/__motion_display.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body>Headless motion display check</body>'}));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__motion_display.html`);
 const result=await page.evaluate(async({match,rows})=>{
  window.__LAN_BUILD_ID__='motion-display-check';
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');await assetManager.ensureManifestLoaded();
  const {createLanWorld}=await import('/src/network/LanWorld.ts'),{applyCombatSnapshot}=await import('/src/network/CombatSnapshot.ts');
  const {decodeBinaryState}=await import('/src/network/BinarySnapshot.mjs'),{motionFromText}=await import('/src/network/MotionFrame.mjs');
  const {MotionReplica}=await import('/src/network/MotionReplica.ts'),{shipPresentationPose}=await import('/src/engine/visual/ShipPresentation.ts');
  const {captureMotion}=await import('/src/network/CaptureMotion.ts'),{projectMotionDisplay,MOTION_DISPLAY_ERROR:E}=await import('/src/network/MotionDisplay.mjs');
  const a=createLanWorld(match).engine,b=createLanWorld(match).engine,raw=new MotionReplica(),small=new MotionReplica();
  const world=s=>decodeBinaryState(Uint8Array.from(atob(s),c=>c.charCodeAt(0))).frame;
  const simulation=e=>JSON.stringify(e.allCapitalShips.map(s=>[s.id,s.pos.x,s.pos.y,s.vel.x,s.vel.y,s.facingRad,s.angularVelRad,s.teleportSequence,s.health,s.isDead,s.isRetreated]));
  let checked=0,maxPosition=0,maxAngle=0,maxPixelNear=0,maxPixelFar=0,captures=0;
  for(const row of rows){
   const full=world(row.world);applyCombatSnapshot(a,full,false);applyCombatSnapshot(b,full,false);
   const f=motionFromText(row.raw),q=motionFromText(row.data),stamp=f.tick*1000/60;
   const capture=motionFromText(captureMotion(a,f.tick,f.acknowledged));
   if(JSON.stringify(capture.ships)!==JSON.stringify(q.ships))throw Error('Live browser capture != Node display projection '+f.tick);captures++;
   if(!raw.receive(f,stamp,f.tick)||!small.receive(q,stamp,f.tick))throw Error('Fresh motion rejected');
   const beforeA=simulation(a),beforeB=simulation(b);
   for(const ms of [0,8,17,50,100,249,251]){
    raw.render(a,stamp+ms,f.tick);small.render(b,stamp+ms,f.tick);
    for(let i=0;i<a.allCapitalShips.length;i++){
     const sa=a.allCapitalShips[i],sb=b.allCapitalShips[i],pa=shipPresentationPose(sa),pb=shipPresentationPose(sb);
     if(!!pa!==!!pb)throw Error('Pose visibility mismatch');if(!pa)continue;
     const distance=Math.hypot(pa.pos.x-pb.pos.x,pa.pos.y-pb.pos.y),angle=Math.abs(Math.atan2(Math.sin(pa.facing-pb.facing),Math.cos(pa.facing-pb.facing)));
     maxPosition=Math.max(maxPosition,distance);maxAngle=Math.max(maxAngle,angle);
     if(distance>Math.SQRT2*E.linear*1.1+1e-8||angle>E.angular*1.1+1e-8)throw Error('Real interpolation exceeded display precision budget');
     // Same local sprite corners/pivot used by WebGLShipPass's drawSprite.
     const spec=sa.spec,points=[[-spec.pivotX,-spec.pivotY],[spec.spriteWidth-spec.pivotX,-spec.pivotY],[-spec.pivotX,spec.spriteHeight-spec.pivotY],[spec.spriteWidth-spec.pivotX,spec.spriteHeight-spec.pivotY]];
     for(const [x,y]of points){const aa=pa.facing+Math.PI/2,ab=pb.facing+Math.PI/2,dx=pa.pos.x+x*Math.cos(aa)-y*Math.sin(aa)-(pb.pos.x+x*Math.cos(ab)-y*Math.sin(ab)),dy=pa.pos.y+x*Math.sin(aa)+y*Math.cos(aa)-(pb.pos.y+x*Math.sin(ab)+y*Math.cos(ab)),pixel=Math.hypot(dx,dy);maxPixelNear=Math.max(maxPixelNear,pixel*1.5);maxPixelFar=Math.max(maxPixelFar,pixel*.3);}
     checked++;
    }
   }
   if(simulation(a)!==beforeA||simulation(b)!==beforeB)throw Error('Motion modified simulation objects');
  }
  // Explicit teleport epoch must snap to its supplied endpoint, not interpolate.
  const last=motionFromText(rows.at(-1).raw),id=b.allCapitalShips.find(s=>!s.isDead&&!s.isRetreated).id,f={...last,tick:last.tick+1,ships:last.ships.map(r=>r[0]===id?[...r.slice(0,1),123.4567890123,-456.789012345,...r.slice(3,7),r[7]+1,r[8]]:r)};
  const projected=projectMotionDisplay(f),stamp=f.tick*1000/60;raw.receive(f,stamp,last.tick);small.receive(projected,stamp,last.tick);raw.render(a,stamp+100,last.tick);small.render(b,stamp+100,last.tick);
  const ship=b.allCapitalShips.find(s=>s.id===id),pose=shipPresentationPose(ship),target=projected.ships.find(r=>r[0]===id);if(pose.pos.x!==target[1]||pose.pos.y!==target[2])throw Error('Teleport did not snap');
  raw.clear();small.clear();if(b.allCapitalShips.some(s=>shipPresentationPose(s)))throw Error('Pose leaked after reset');
  return {frames:rows.length,captures,checked,maxPositionError:maxPosition,maxAngleError:maxAngle,maxPixelNear,maxPixelFar,teleportAndReset:true};
 },{match:manifest.match,rows});
 assert.deepEqual(errors,[]);assert.equal(result.frames,241);assert.ok(result.checked>20000);assert.ok(result.maxPixelNear<.01);
 const report={...result,pageErrors:errors,wire:sender.stats(),scope:'Node projected bytes -> exact wire roundtrip -> real Chromium full restore, capture and render-only pose geometry at zoom .3/1.5. Not GPU raster/native UI, physics equivalence, WAN, n2n, Steam or FPS.'};
 fs.writeFileSync('artifacts/network-stream-20260921/phase12/browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await server.close();}
