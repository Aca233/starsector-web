/** Graphics preferences and presentation-only frame pacing; no user profile required. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
const code = (await build({entryPoints:['src/engine/runtime/GraphicsSettings.ts'],bundle:true,write:false,format:'iife',globalName:'Graphics'})).outputFiles[0].text;
const key = 'starsector-web:graphics-settings';
function create(stored = null, denied = false) {
  const storage = new Map(stored === null ? [] : [[key,stored]]), events = new Map();
  const context = vm.createContext({ localStorage: {
    getItem(k) { if (denied) throw Error('denied'); return storage.get(k) ?? null; },
    setItem(k,v) { if (denied) throw Error('quota'); storage.set(k,v); },
  }, window: { addEventListener: (type,fn) => events.set(type,fn) } });
  vm.runInContext(code,context); return {api:context.Graphics,storage,events};
}
test('defaults preserve native resolution, all visual detail and uncapped rendering',()=>{
  for(const stored of [null,'bad json','null','[]','{"renderScale":"0.5","maxFrameRate":1,"screenShake":null}']) {
    const {api}=create(stored), s=api.getGraphicsSettings();
    assert.equal(s.renderScale,1); assert.equal(s.maxFrameRate,0); assert.equal(s.screenShake,1);
    assert.equal(s.detailedParticles,true); assert.equal(s.background,true); assert.equal(Object.isFrozen(s),true);
  }
});
test('preset writes persist, custom changes clamp and reset leaves unrelated audio intact',()=>{
  const {api,storage}=create(); storage.set('starsector-web:audio-settings','{"masterVolume":0.3}');
  api.updateGraphicsSettings(api.GRAPHICS_PRESETS.performance);
  assert.equal(create(storage.get(key)).api.getGraphicsSettings().renderScale,.5);
  api.updateGraphicsSettings({screenShake:5}); assert.equal(api.getGraphicsSettings().screenShake,1);
  api.updateGraphicsSettings({screenShake:-1}); assert.equal(api.getGraphicsSettings().screenShake,0);
  api.updateGraphicsSettings({screenShake:NaN,renderScale:10,maxFrameRate:Infinity});
  assert.equal(api.getGraphicsSettings().screenShake,1); assert.equal(api.getGraphicsSettings().renderScale,1);
  api.resetGraphicsSettings(); assert.equal(api.getGraphicsSettings().detailedParticles,true);
  assert.equal(storage.get('starsector-web:audio-settings'),'{"masterVolume":0.3}');
});
test('stable snapshots, cross-tab updates and unavailable storage remain usable',()=>{
  const {api,storage,events}=create(); const before=api.getGraphicsSettings(); let calls=0;
  const unsubscribe=api.subscribeGraphicsSettings(()=>calls++);
  api.updateGraphicsSettings({renderScale:1}); assert.equal(api.getGraphicsSettings(),before); assert.equal(calls,0);
  storage.set(key,'{"renderScale":0.75}'); events.get('storage')({key});
  assert.equal(api.getGraphicsSettings().renderScale,.75); assert.equal(calls,1);
  unsubscribe(); api.resetGraphicsSettings(); assert.equal(calls,1);
  const denied=create(null,true); denied.api.updateGraphicsSettings({background:false});
  assert.equal(denied.api.getGraphicsSettings().background,false);
  const worker=vm.createContext({}); vm.runInContext(code,worker); assert.equal(worker.Graphics.getGraphicsSettings().renderScale,1);
});
test('frame limiter only gates drawing, maintains cadence at 60/144 Hz and resets without catch-up bursts',()=>{
  const {api}=create();
  for(const refresh of [60,144]) for(const cap of [30,60,120,0]) {
    const limiter=new api.RenderFrameLimiter(); let rendered=0, simulationUpdates=0;
    for(let i=0;i<refresh*2;i++) { simulationUpdates++; if(limiter.shouldRender(i*1000/refresh,cap)) rendered++; }
    const expected=Math.min(refresh,cap||refresh)*2;
    assert.ok(Math.abs(rendered-expected)<=1, `${refresh}Hz/${cap}: ${rendered} vs ${expected}`);
    assert.equal(simulationUpdates,refresh*2);
  }
  const limiter=new api.RenderFrameLimiter(); assert.equal(limiter.shouldRender(0,30),true);
  assert.equal(limiter.shouldRender(1,30),false); assert.equal(limiter.shouldRender(1,60),true);
  assert.equal(limiter.shouldRender(60000,30),true); assert.equal(limiter.shouldRender(60001,30),false);
  limiter.reset(); assert.equal(limiter.shouldRender(60001,30),true);
});
