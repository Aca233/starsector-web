import {build} from 'vite';
import fs from 'node:fs';
import path from 'node:path';
// Isolated combat-only measurement build: these probes are NEVER in production.
const outDir=path.resolve(process.argv[2]??'artifacts/guest-hz-20260920/after/web');
// Independent baselines; never silently compare two optimizations at once.
const reuseAssets=process.argv.includes('--reuse-assets');
if(reuseAssets&&!fs.existsSync(path.join(outDir,'hz-probe-build.json')))throw Error('Reuse requires an existing isolated probe build');
const baseline=process.argv.includes('--baseline');
const codecBaseline=process.argv.includes('--codec-baseline');
if(baseline&&codecBaseline)throw Error('Choose one baseline dimension');
const codecPlugin=()=>({
 name:'shared-codec-baseline',enforce:'pre',
 transform(code,id){
  if(!codecBaseline)return;
  id=id.replaceAll('\\','/');
  if(id.endsWith('/src/network/host.worker.ts')){
   const anchor='encodeProjectedBinaryFrame(frame, true)';
   if(!code.includes(anchor))throw Error('Shared codec opt-in anchor changed');
   return code.replace(anchor,'encodeProjectedBinaryFrame(frame, authoritySummaryShips !== null)');
  }
  if(!id.endsWith('/src/network/BinarySnapshot.mjs'))return;
  // Restore the pre-change library array traversal and reader dispatch without
  // modifying source files, byte budgets, dictionary, number precision or rules.
  const start=code.indexOf('  encodeArray(value, depth) {',code.indexOf('class FastProjectedSnapshotEncoder'));
  const end=code.indexOf('  encodeNumber(value) {',start);
  if(start<0||end<0)throw Error('Fast array writer anchor changed');
  code=code.slice(0,start)+code.slice(end);
  const readStart=code.indexOf('  array(length) {',code.indexOf('class SnapshotReader'));
  const readEnd=code.indexOf('  map(length) {',readStart);
  if(readStart<0||readEnd<0)throw Error('Fast array reader anchor changed');
  return code.slice(0,readStart)+`  array(length) {
    const result = new Array(length);
    for (let i = 0; i < length; i++) result[i] = this.read();
    return result;
  }
`+code.slice(readEnd);
 }
});
await build({configFile:'vite.server.config.ts',build:{outDir,...(reuseAssets?{emptyOutDir:false,copyPublicDir:false}:{})},worker:{plugins:()=>[codecPlugin(),{
 name:'host-capture-baseline',enforce:'pre',
 transform(code,id){
  if(!baseline||!id.replaceAll('\\','/').endsWith('/src/network/HostSnapshot.ts'))return;
  const anchor='muzzleEvents, true, true, true);';
  if(!code.includes(anchor))throw Error('Native capture baseline anchor changed');
  return code.replace(anchor,'muzzleEvents, true, true, false);');
 }
}]},plugins:[codecPlugin(),{
 name:'host-guest-hz-test-probes',enforce:'pre',
 transform(code,id){
  if(!id.replaceAll('\\','/').endsWith('/src/network/LanBattle.tsx'))return;
  const ack='const ack = frame.acknowledged[seat];',render='const alpha = presentation.alpha;';
  if(!code.includes(ack)||!code.includes(render))throw Error('Probe anchors changed');
  return code.replace(ack,ack+'\n(globalThis as any).__guestAckProbe?.({at:now, ack, tick:frame.tick});')
   .replace(render,render+`\n(globalThis as any).__guestPoseProbe?.({at:now, keys, seq, synced, age:now-receivedAt,
    x:engine.playerShip.interpolatedPos(alpha).x,y:engine.playerShip.interpolatedPos(alpha).y,
    facing:engine.playerShip.interpolatedFacing(alpha),ax:engine.playerShip.pos.x,ay:engine.playerShip.pos.y,
    vx:engine.playerShip.vel.x,vy:engine.playerShip.vel.y,playback: presentation.delayMs});`);
 }
}]});
fs.writeFileSync(path.join(outDir,'hz-probe-build.json'),JSON.stringify({genericCapture:baseline,conservativeBrowserCodec:codecBaseline,scope:'Combat-only diagnostic build. Test relay runs the same current server code in both modes.'},null,2));
