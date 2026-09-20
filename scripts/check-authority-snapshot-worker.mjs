import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createAuthorityFactory} from '../server/ServerBattleAuthority.mjs';
import {prepareAuthoritySnapshot} from '../server/authority-snapshot.mjs';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {summarizeCombatFrame} from '../server/lan-state.mjs';

const base=path.resolve('artifacts/server-authority-20260920');
const factory=createAuthorityFactory({workerFile:path.join(base,'runtime/authority-worker.mjs'),assets:path.resolve('public'),maxBattles:1});
const match={id:'summary-differential',hostId:'a',authority:'server',seed:1511506142,snapshotHz:60,
  players:[{id:'a',name:'a',seat:0,team:0,hull:'onslaught'},{id:'b',name:'b',seat:1,team:1,hull:'onslaught'}],
  options:{assignment:'teams',battleSize:3200,aiHulls:[Array(7).fill('hammerhead'),Array(7).fill('hammerhead')]}};
let handle,timer,checked=0,lastTick=-1,muzzleFrames=0;
try{
  await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('snapshot differential timed out')),90000);
    handle=factory(match,m=>{try{
      if(m.type==='error')throw Error(m.message);
      if(m.type==='ready')handle.postMessage({type:'start'});
      if(m.type==='finished')throw Error('battle ended before differential coverage');
      if(m.type!=='snapshot')return;
      assert.ok(m.summary,'dedicated metadata required');
      const fast=prepareAuthoritySnapshot(m,match.id,checked,16,lastTick);
      assert.equal(fast.frame,undefined);
      const frame=decodeBinaryState(fast.bytes).frame;
      assert.deepEqual(fast.summary,summarizeCombatFrame(frame,16,lastTick));
      if(frame.muzzleEvents?.events.length)muzzleFrames++;
      checked++;lastTick=m.tick;
      handle.postMessage({type:'snapshot-consumed',tick:m.tick});
      if(m.tick>=1200){assert.ok(checked>200);assert.ok(muzzleFrames>0,'AI weapon event windows must be covered');resolve();}
    }catch(error){reject(error);}});
  });
  const result={passed:true,ships:16,checked,lastTick,muzzleFrames,scope:'Real authority Worker differential validation; not a performance benchmark.'};
  await fs.writeFile(path.join(base,'summary-worker-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{clearTimeout(timer);await factory.close();assert.equal(factory.activeCount(),0);}
