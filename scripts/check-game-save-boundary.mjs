import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';

// Bundle only this existing save boundary; no browser globals, full engine or user storage.
const bundled=await build({stdin:{contents:"export {GameSaveStore} from './src/engine/game/GameSaveStore'; export {decodeGameState} from './src/engine/game/GameStateCodec';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const {GameSaveStore,decodeGameState}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const state=()=>({schemaVersion:1,gameId:'fixture',revision:0,nextEncounter:1,fleet:[{id:'flagship',hullId:'fixture-hull',status:'ready',hullFraction:1,combatReadiness:1,armor:null,weapons:[]}],inventory:{credits:0,supplies:0,fuel:0,cargo:{}},sandboxHullId:'fixture-hull',pendingCombat:null,outcomes:[]});
function memory(value=null){let raw=value;return {getItem:()=>raw,setItem:(_key,value)=>{raw=value;},read:()=>raw};}

test('current schema is detached and future schema never replaces source bytes',()=>{
  const source=state(), result=decodeGameState(source);result.fleet[0].hullFraction=.5;
  assert.equal(source.fleet[0].hullFraction,1);
  const bytes=JSON.stringify({...source,schemaVersion:2}),storage=memory(bytes),save=new GameSaveStore(()=>storage,'save');
  assert.equal(save.load(),null);assert.equal(save.status.state,'blocked');assert.equal(save.save(source),false);assert.equal(storage.read(),bytes);
});
test('stale tab CAS blocks autosave and checkpoint binding without changing a newer save',()=>{
  const source=state(),storage=memory(JSON.stringify(source)),first=new GameSaveStore(()=>storage,'save'),second=new GameSaveStore(()=>storage,'save');
  first.load();second.load();const next={...source,revision:1};assert.equal(first.save(next),true);
  const newer=storage.read();assert.throws(()=>second.checkpointBinding(source),/其他页面修改/);
  assert.equal(second.save(source),false);assert.equal(second.status.state,'blocked');assert.equal(storage.read(),newer);
  assert.equal(first.checkpointBinding(next),JSON.stringify(decodeGameState(next)));
});
test('quota failure retains exact old bytes; only explicit replace leaves corrupt-save protection',()=>{
  const bytes=JSON.stringify(state()),storage=memory(bytes),save=new GameSaveStore(()=>({...storage,setItem(){throw Error('quota');}}),'save');
  save.load();assert.equal(save.save({...state(),revision:1}),false);assert.equal(save.status.state,'memory-only');assert.equal(storage.read(),bytes);
  const corrupt=memory('{invalid'),protectedSave=new GameSaveStore(()=>corrupt,'save');
  assert.equal(protectedSave.load(),null);assert.equal(protectedSave.save(state()),false);assert.equal(corrupt.read(),'{invalid');
  assert.equal(protectedSave.replace(state()),true);assert.deepEqual(JSON.parse(corrupt.read()),state());
});
