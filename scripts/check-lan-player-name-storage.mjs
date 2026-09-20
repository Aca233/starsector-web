import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const b = await build({entryPoints:['src/network/PlayerName.ts'], bundle:true, write:false, platform:'browser', format:'esm'});
const {playerNameKey:key, readLegacyPlayerName:legacy, validPlayerName:valid, readPlayerName:read, rememberPlayerName:save, resolvePlayerName:resolve} = await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const storage = () => {const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
test('nickname is independent of sessions, builds, captain profiles and ship saves',()=>{
  const local=storage();local.setItem('ship-save','unchanged');
  assert.equal(save('  入房名字  ',local),'');assert.equal(read(local),'入房名字');
  assert.deepEqual(JSON.parse(local.getItem(key)),{version:1,name:'入房名字'});
  assert.equal(local.getItem('ship-save'),'unchanged');assert.equal(local.data.size,2);
});
test('explicit nickname, local preference, legacy session, then default; explicit 玩家 stays custom',()=>{
  assert.deepEqual(resolve('链接名字','本机名字','旧会话'),{name:'链接名字',custom:true});
  assert.deepEqual(resolve(null,'本机名字','旧会话'),{name:'本机名字',custom:true});
  assert.deepEqual(resolve('   ',null,'旧会话'),{name:'旧会话',custom:true});
  assert.deepEqual(resolve(null,null,null),{name:'玩家',custom:false});
  assert.deepEqual(resolve(null,'玩家',null),{name:'玩家',custom:true});
});
test('invalid or partial input does not erase the last saved valid nickname',()=>{
  const local=storage();save('有效名字',local);
  for(const bad of ['', '   ', '名'.repeat(25), '坏\u0000名字', '坏\n名字']) {assert.equal(valid(bad),null);assert.equal(save(bad,local),'');assert.equal(read(local),'有效名字');}
  assert.equal(valid('名'.repeat(24)),'名'.repeat(24));assert.equal(valid(24),null);
});
test('corrupt, unsupported and inaccessible storage falls back without deleting data',()=>{
  const local=storage();
  for(const raw of ['broken','null','[]','{}','{"version":2,"name":"未来"}','{"version":1,"name":42}']) {local.setItem(key,raw);assert.equal(read(local),null);assert.equal(local.getItem(key),raw);}
  const blocked={getItem(){throw Error('SecurityError')},setItem(){throw Error('QuotaExceededError')}};
  assert.equal(read(blocked),null);assert.match(save('内存名字',blocked),/玩家名称未能保存到浏览器/);
});

test('legacy build migration reads only the name and leaves session credentials untouched',()=>{
  const session=storage();const raw=JSON.stringify({name:'旧版本名字',build:'expired',token:'do-not-migrate',url:'ws://old-room'});session.setItem('starsector.lan.session.v5',raw);
  assert.equal(legacy('lan',session),'旧版本名字');assert.equal(legacy('steam',session),null);assert.equal(session.getItem('starsector.lan.session.v5'),raw);
  const local=storage();save(legacy('lan',session),local);assert.deepEqual(JSON.parse(local.getItem(key)),{version:1,name:'旧版本名字'});
});
