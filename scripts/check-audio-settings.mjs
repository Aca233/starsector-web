/** Isolated audio regression: no browser, audio hardware, or user storage required. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundle = (await build({
  stdin: { contents: `export * from './src/engine/audio/AudioSettings'; export { sound } from './src/engine/audio/SoundManager';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'AudioTest', platform: 'browser',
  define: { 'import.meta.env.BASE_URL': '"./"' },
})).outputFiles[0].text;
const KEY = 'starsector-web:audio-settings';
const LEGACY = 'starsector-web:muted';
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function create({ stored = {}, unavailable = false, worker = false, failFetch = false, deferredFetch = false } = {}) {
  const storage = new Map(Object.entries(stored)), windows = new Map(), documents = new Map(), contexts = [], pending = [];
  let requests = 0;
  class Param {
    value = 1; targets = [];
    setTargetAtTime(value, time, duration) { this.value = value; this.targets.push({ value, time, duration }); }
  }
  class Node {
    connections = []; disconnected = false;
    connect(node) { this.connections.push(node); }
    disconnect() { this.disconnected = true; }
  }
  class Context {
    gains = []; sources = []; filters = []; destination = new Node(); state = 'running'; currentTime = 1;
    constructor() { contexts.push(this); }
    createGain() { const node = Object.assign(new Node(), { gain: new Param() }); this.gains.push(node); return node; }
    createBiquadFilter() { const node = Object.assign(new Node(), { frequency: new Param() }); this.filters.push(node); return node; }
    createStereoPanner() { return Object.assign(new Node(), { pan: new Param() }); }
    createBufferSource() {
      const node = Object.assign(new Node(), { playbackRate: new Param(), started: false, stopped: false,
        start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } });
      this.sources.push(node); return node;
    }
    async decodeAudioData() { return { duration: 1 }; }
    async resume() { this.state = 'running'; }
  }
  const document = { hidden: false, addEventListener: (name, fn) => documents.set(name, fn) };
  const context = vm.createContext({ console, performance, URL, structuredClone,
    ...(!worker ? { window: { AudioContext: Context, addEventListener: (name, fn) => windows.set(name, fn) }, document } : {}),
    localStorage: { getItem(key) { if (unavailable) throw Error('denied'); return storage.get(key) ?? null; },
      setItem(key, value) { if (unavailable) throw Error('quota'); storage.set(key, value); } },
    fetch: () => { requests++; const response = { ok: !failFetch, arrayBuffer: async () => new ArrayBuffer(8) };
      return deferredFetch ? new Promise(resolve => pending.push(() => resolve(response))) : Promise.resolve(response); },
  });
  vm.runInContext(bundle, context);
  return { api: context.AudioTest, contexts, storage, windows, document, documents, pending, requests: () => requests };
}

test('defaults preserve existing loudness; clamps values and rejects invalid stored types', () => {
  const { api } = create();
  assert.equal(api.getAudioSettings().masterVolume, 1);
  api.updateAudioSettings({ masterVolume: 2, effectsVolume: -1, interfaceVolume: NaN, muted: 'true' });
  assert.equal(api.getAudioSettings().masterVolume, 1);
  assert.equal(api.getAudioSettings().effectsVolume, 0);
  assert.equal(api.getAudioSettings().interfaceVolume, 1);
  assert.equal(api.getAudioSettings().muted, false);
  assert.equal(Object.isFrozen(api.getAudioSettings()), true);
});
test('legacy mute migrates, corrupt settings recover, valid settings take priority', () => {
  for (const broken of [undefined, '{broken', 'null', '[]']) {
    const stored = { [LEGACY]: 'true', ...(broken === undefined ? {} : { [KEY]: broken }) };
    const { api } = create({ stored }); assert.equal(api.getAudioSettings().muted, true);
  }
  const { api, storage } = create({ stored: { [LEGACY]: 'true', [KEY]: '{"muted":false,"masterVolume":0.35}' } });
  assert.equal(api.getAudioSettings().muted, false);
  api.updateAudioSettings({ effectsVolume: .4 });
  assert.equal(create({ stored: Object.fromEntries(storage) }).api.getAudioSettings().effectsVolume, .4);
  assert.equal(JSON.parse(storage.get(KEY)).masterVolume, .35);
});
test('blocked storage and worker runtime mute remain safe and do not overwrite preferences', () => {
  const { api } = create({ unavailable: true, worker: true });
  api.updateAudioSettings({ masterVolume: .3 }); api.sound.setMuted(true); api.sound.play('explosion');
  assert.equal(api.getAudioSettings().masterVolume, .3);
  assert.equal(api.getAudioSettings().muted, false);
  const worker = create({ worker: true }); worker.api.sound.setMuted(true);
  assert.equal(worker.storage.has(KEY), false);
});
test('stable snapshots, subscriptions, reset and cross-tab storage changes', () => {
  const { api, windows, storage } = create(); let notifications = 0;
  const unsubscribe = api.subscribeAudioSettings(() => notifications++), snapshot = api.getAudioSettings();
  api.updateAudioSettings({ masterVolume: 1 }); assert.equal(snapshot, api.getAudioSettings());
  api.updateAudioSettings({ masterVolume: .2, muted: true }); assert.equal(notifications, 1);
  storage.set(KEY, '{"masterVolume":0.65}'); windows.get('storage')({ key: KEY });
  assert.equal(api.getAudioSettings().masterVolume, .65); assert.equal(notifications, 2);
  api.resetAudioSettings(); assert.equal(api.getAudioSettings().muted, false);
  assert.equal(api.getAudioSettings().masterVolume, 1); unsubscribe();
  api.updateAudioSettings({ masterVolume: .5 }); assert.equal(notifications, 3);
});
test('real sample paths route UI and combat to independent buses; only effects are muffled', async () => {
  const { api, contexts } = create(); api.updateAudioSettings({ masterVolume: .5, effectsVolume: .3, interfaceVolume: .8 });
  api.sound.play('ui_button_press'); api.sound.playAtPos('explosion', { x: 1, y: 0 }, { x: 0, y: 0 }); await flush();
  const ctx = contexts[0], [master, effects, ui] = ctx.gains;
  assert.equal(master.gain.value, .5); assert.equal(effects.gain.value, .3); assert.equal(ui.gain.value, .8);
  assert.equal(ctx.sources[0].connections[0].connections[0], ui);
  assert.equal(ctx.sources[1].connections[0].connections[0].connections[0], effects);
  assert.equal(effects.connections[0], ctx.filters[0]); assert.equal(ui.connections[0], master);
  api.sound.setMuffled(true); assert.equal(ctx.filters[0].frequency.value, 750);
  api.updateAudioSettings({ masterVolume: .25, effectsVolume: .6 });
  assert.equal(master.gain.value, .25); assert.equal(effects.gain.value, .6); assert.equal(ui.gain.value, .8);
  assert.ok(master.gain.targets.at(-1).duration > 0);
  const source = ctx.sources[0], gain = source.connections[0]; source.onended(); assert.equal(gain.disconnected, true);
});
test('mute, zero volume and background silence preserve sustained loops and restore previous gains', async () => {
  const { api, contexts, document, documents } = create();
  api.sound.startLoop('burn_drive_loop'); await flush(); api.sound.startLoop('burn_drive_loop');
  const ctx = contexts[0], loop = ctx.sources[0]; assert.equal(loop.loop, true);
  api.updateAudioSettings({ muted: true, masterVolume: .42 }); assert.equal(ctx.gains[0].gain.value, 0);
  assert.equal(loop.stopped, false); api.sound.play('explosion'); assert.equal(ctx.sources.length, 1);
  api.sound.toggleMute(); assert.equal(ctx.gains[0].gain.value, .42);
  api.updateAudioSettings({ effectsVolume: 0 }); assert.equal(ctx.gains[1].gain.value, 0);
  api.sound.startLoop('burn_drive_loop'); assert.equal(ctx.sources.length, 1);
  api.updateAudioSettings({ muteInBackground: true }); document.hidden = true; documents.get('visibilitychange')();
  assert.equal(ctx.gains[0].gain.value, 0); document.hidden = false; documents.get('visibilitychange')();
  assert.equal(ctx.gains[0].gain.value, .42); assert.equal(loop.stopped, false);
  api.sound.setMuted(true); assert.equal(ctx.gains[0].gain.value, 0);
  api.sound.toggleMute(); assert.equal(ctx.gains[0].gain.value, .42);
  api.sound.stopLoop('burn_drive_loop'); assert.equal(loop.stopped, true);
});
test('async sample loads cannot escape a later mute; previews respect zero levels and load failures', async () => {
  const deferred = create({ deferredFetch: true }); deferred.api.sound.play('explosion');
  deferred.api.updateAudioSettings({ muted: true }); deferred.pending.forEach(resolve => resolve()); await flush();
  assert.equal(deferred.contexts[0].sources.length, 0);
  const { api, contexts, requests } = create();
  api.updateAudioSettings({ effectsVolume: 0 }); assert.equal(await api.sound.preview('effects'), false); assert.equal(requests(), 0);
  assert.equal(await api.sound.preview('interface'), true); assert.equal(contexts[0].sources.length, 1);
  const failed = create({ failFetch: true }); assert.equal(await failed.api.sound.preview('effects'), false);
});
