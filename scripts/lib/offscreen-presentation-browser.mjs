import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer } from 'vite';
import { WebSocketServer } from 'ws';
import { componentBase64BeforePlugin } from './component-base64-before.mjs';
import { frozenBrowserPlugin } from './frozen-vite-sources.mjs';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const quantile = (values, fraction) => values.toSorted((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
function summary(rows) {
  return Object.fromEntries(['decodeMs', 'applyMs', 'drawMs', 'totalMs'].map(key => [key, {
    mean: rows.reduce((sum, row) => sum + row[key], 0) / rows.length,
    p50: quantile(rows.map(row => row[key]), .5), p95: quantile(rows.map(row => row[key]), .95)
  }]));
}
export async function runOffscreenPresentation({ out, chromium }) {
  const frozen = path.resolve(process.env.OFFSCREEN_BASELINE ?? 'artifacts/offscreen-presentation-20260925/before-browser.json');
  const servers = [], pages = [], errors = [], report = {
    scope: 'Actual binary LAN restoration + unchanged WebGL renderer in headless DOM and Worker. Not full LanBattle integration, RAF FPS, WAN latency, input-to-photon, or GPU compute.',
    baselineSha256: sha(await fs.readFile(frozen)), cases: [], samples: { before: [], dom: [], worker: [] }
  };
  let browser, ingressServer;
  try {
    const png = await fs.readFile('public/game-assets/graphics/fx/glow64.png');
    browser = await chromium.launch({ headless: true, args: ['--use-angle=' + (process.env.MULTIPLAYER_ANGLE ?? 'd3d11'), '--enable-unsafe-swiftshader'] });
    for (const baseline of [true, false]) {
      const server = await createServer({ configFile: false, plugins: [frozenBrowserPlugin(baseline ? frozen : process.env.OFFSCREEN_CURRENT ?? null), ...(process.env.OFFSCREEN_BASE64_CHECK === 'true' ? [componentBase64BeforePlugin(frozen)] : []), {
        name: 'offscreen-test-endpoints', configureServer(server) {
          server.middlewares.use((req, res, next) => {
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
            if (req.url === '/__offscreen_check.html') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><canvas width="640" height="360"></canvas>'); }
            else if (req.url?.startsWith('/game-assets/__offscreen-test/')) {
              if (req.url.endsWith('missing.png')) { res.statusCode = 404; res.end('intentional missing texture'); }
              else setTimeout(() => { res.setHeader('Content-Type', 'image/png'); res.end(png); }, 75);
            } else next();
          });
        }
      }], optimizeDeps: { noDiscovery: true, entries: [] }, server: { host: '127.0.0.1', port: 0, open: false, watch: null,
        headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
        define: { __LAN_BUILD_ID__: '"offscreen-check"' }, logLevel: 'error' });
      servers.push(server); await server.listen();
      const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); pages.push(page);
      page.on('pageerror', error => errors.push(String(error)));
      await page.addInitScript(() => { window.__LAN_BUILD_ID__ = 'offscreen-check'; });
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__offscreen_check.html`);
      await page.evaluate(async () => { window.check = await import('/scripts/lib/offscreen-presentation-page.mts'); });
    }
    const data = await pages[0].evaluate(components => window.check.fixture({components}), process.env.OFFSCREEN_BASE64_CHECK === 'true' || process.env.OFFSCREEN_TRANSPORT_CHECK === 'true');
    data.pipeline = process.env.OFFSCREEN_PIPELINE_CHECK === 'true';
    report.pipeline = data.pipeline;
    if (process.env.OFFSCREEN_BASE64_CHECK === 'true') {
      report.scope = 'Frozen paired component byte decoding on headless Chromium, actual 22-ship capture and restored-world geometry. Not a Worker/relay, GPU pixel, simulation-rate, RAF FPS or network-latency benchmark.';
      report.base64 = await pages[1].evaluate(async data => {
        await window.check.assets();
        const module = await import('/scripts/lib/component-base64-check.mjs');
        return {validation:module.checkComponentBase64(data.components), geometry:await module.checkComponentGeometry(data),
          performance:module.benchmarkComponentBase64(data.components),fixture:data.components.sizes};
      },data);
      const fixtureJson=JSON.stringify(data.components);
      await fs.writeFile(path.join(out,'component-fixtures.json'),fixtureJson);
      report.base64.fixtureSha256=sha(Buffer.from(fixtureJson));
      const {decodeBase64Bytes}=await import('../../src/network/Base64Bytes.mjs');
      const encoded=[...data.components.motion,...data.components.combatCore,...data.components.combatWeapons,...data.components.visualPackets.map(p=>p.data)];
      for(const text of encoded)assert.deepEqual(Buffer.from(decodeBase64Bytes(text)),Buffer.from(text,'base64'));
      report.base64.nodeByteParity={node:process.version,nativeAvailable:typeof Uint8Array.fromBase64==='function',checked:encoded.length};
      report.passed = true; report.targetedBase64 = true; assert.deepEqual(errors,[]);return;
    }
    const ownerCheck = process.env.OFFSCREEN_OWNER_CHECK === 'true';
    if (ownerCheck) {
      assert.ok(data.pipeline, 'Owner parity requires the existing pipeline scenario');
      report.owner = await pages[1].evaluate(async data => {
        const { checkLanPresentationOwner } = await import('/scripts/lib/lan-presentation-owner-check.mts');
        return checkLanPresentationOwner(data);
      }, data);
    }
    if (process.env.OFFSCREEN_VIEWS_CHECK === 'true') {
      report.views = await pages[1].evaluate(async data => {
        const { checkLanPresentationViews } = await import('/scripts/lib/lan-presentation-views-check.mts');
        return checkLanPresentationViews(data);
      }, data);
    }
    if (process.env.OFFSCREEN_UI_CHECK === 'true') {
      report.uiCodec = await pages[1].evaluate(async data => {
        const { checkUiCodec } = await import('/scripts/lib/lan-presentation-ui-check.mts'); return checkUiCodec(data);
      }, data);
      const traces = [];
      for (const page of pages) traces.push(await page.evaluate(async data => {
        const { renderCodecTrace } = await import('/scripts/lib/lan-presentation-ui-check.mts'); return renderCodecTrace(data);
      }, data));
      assert.deepEqual(traces[1],traces[0],'Shared render graph codec changed packet/decoded semantics');
      report.renderCodecParity = {exact:true,frames:traces[1]};
      if (process.env.OFFSCREEN_UI_ONLY === 'true') { report.passed = true; return; }
    }
    if (process.env.OFFSCREEN_COMMAND_CHECK === 'true') report.commands = await pages[1].evaluate(async data => {
      const {checkPresentationCommands} = await import('/scripts/lib/lan-presentation-commands-check.mts');return checkPresentationCommands(data);
    },data);
    report.fixture = { match: data.match, cases: data.cases.map(({ wire, ...c }) => ({ ...c, bytes: Buffer.from(wire, 'base64').length, sha256: sha(Buffer.from(wire, 'base64')) })) };
    for (const [index, page] of pages.entries()) await page.evaluate(async ({ data, trace }) => { window.dom = await window.check.createDomLane(data, document.querySelector('canvas'), trace); }, { data: { ...data, owner: ownerCheck && index === 1 }, trace: process.env.OFFSCREEN_DEBUG === 'true' });
    report.gpus = { before: await pages[0].evaluate(() => window.dom.gpu), dom: await pages[1].evaluate(() => window.dom.gpu) };
    report.worker = await pages[1].evaluate(async ({ data, trace }) => {
      if (!crossOriginIsolated) throw Error('Main-block probe requires actual cross-origin isolation');
      const worker = new Worker('/scripts/lib/offscreen-presentation.worker.mts', { type: 'module' }), pending = new Map();
      let nextId = 0;
      worker.onmessage = event => { const entry = pending.get(event.data.id); if (!entry) throw Error('Unexpected worker reply'); pending.delete(event.data.id); clearTimeout(entry.timer); if (event.data.error) entry.reject(Error(event.data.error)); else entry.resolve(event.data.result); };
      worker.onerror = error => { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(Error(error.message)); } pending.clear(); };
      const request = (message, transfer = []) => new Promise((resolve, reject) => {
        const id = ++nextId, timer = setTimeout(() => { pending.delete(id); reject(Error('Worker command timeout: ' + message.type)); }, 90000);
        pending.set(id, { resolve, reject, timer }); worker.postMessage({ ...message, id }, transfer);
      });
      const host = document.createElement('canvas'); host.width = 640; host.height = 360; host.id = 'worker-view'; document.body.append(host);
      const progress = new Int32Array(new SharedArrayBuffer(4)), canvas = host.transferControlToOffscreen(), wires = data.cases.map(c => window.check.bytes(c.wire));
      const initial = wires[0].slice().buffer;
      const ready = await request({ type: 'init', trace, pipeline: data.pipeline, canvas, progress: progress.buffer, wire: initial, match: data.match }, [canvas, initial]);
      if (initial.byteLength) throw Error('Initial packet not transferred');
      const draw = async index => {
        const wire = wires[index].slice().buffer, { camera, zoom, visualTime, dt } = data.cases[index], start = performance.now();
        const result = await request({ type: 'draw', wire, reset: index === 0, view: { camera, zoom, visualTime, dt } }, [wire]);
        if (wire.byteLength) throw Error('Packet not transferred');
        return { ...result, deliveredMs: performance.now() - start };
      };
      window.workerCheck = { worker, request, draw, progress, count: wires.length };
      return { ...ready, transferredCanvas: true };
    }, { data, trace: process.env.OFFSCREEN_DEBUG === 'true' });
    report.gpus.worker = report.worker.gpu;
    if (process.env.OFFSCREEN_LOOP_CHECK === 'true') {
      report.scope = 'Autonomous owner-side RAF lifecycle, unchanged renderer pixel parity and actual Worker progress under main-thread blocking. Not complete default LAN Worker integration or FPS/input-latency measurement.';
      report.loop = await pages[1].evaluate(async data => {
        const {checkPresentationFrameLoop}=await import('/scripts/lib/lan-presentation-loop-check.mts');return checkPresentationFrameLoop(data);
      },data);
      report.autonomous = await pages[1].evaluate(async wire => {
        const check=window.workerCheck, packet=window.check.bytes(wire).buffer;
        await check.request({type:'frame-loop-open',wire:packet},[packet]);
        if(packet.byteLength)throw Error('Autonomous initial wire not transferred');
        const waitProgress=async prior=>{const deadline=performance.now()+3000;while(Atomics.load(check.progress,0)<=prior){if(performance.now()>deadline)throw Error('Native Worker RAF made no progress');await new Promise(resolve=>setTimeout(resolve,20));}};
        await waitProgress(0);
        // No draw commands in this window; only the WORKER's native RAF can advance.
        const before=Atomics.load(check.progress,0),started=performance.now();while(performance.now()-started<250){}
        const during=Atomics.load(check.progress,0)-before;if(during<=0)throw Error('Autonomous Worker stalled with main');
        const hidden=await check.request({type:'frame-loop-visible',visible:false}),hiddenAt=Atomics.load(check.progress,0);
        await new Promise(resolve=>setTimeout(resolve,100));if(Atomics.load(check.progress,0)!==hiddenAt||hidden.pendingFrames)throw Error('Hidden owner rendered');
        await check.request({type:'frame-loop-visible',visible:true});await waitProgress(hiddenAt);
        const cycle=await check.request({type:'context-cycle'}),afterRestore=Atomics.load(check.progress,0);await waitProgress(afterRestore);
        const reset=await check.request({type:'frame-loop-reset'});if(reset.tick!==-1||reset.stats.pendingFrames)throw Error('Reset kept sync evidence');
        const resetAt=Atomics.load(check.progress,0);await new Promise(resolve=>setTimeout(resolve,60));if(Atomics.load(check.progress,0)!==resetAt)throw Error('Reset kept rendering');
        const fresh=window.check.bytes(wire).buffer;await check.request({type:'frame-loop-restart',wire:fresh},[fresh]);await waitProgress(resetAt);
        const state=await check.request({type:'frame-loop-state'});if(state.failures.length||state.tick!==600||state.stats.pendingFrames!==1)throw Error('Bad autonomous owner state');
        return {completedDuringBlock:during,blockedMs:250,hidden,cycle,reset,state};
      },data.cases[0].wire);
      report.disposal=await pages[1].evaluate(()=>window.workerCheck.request({type:'dispose'}));
      assert.deepEqual(errors,[]);report.passed=true;return;
    }

    if (process.env.OFFSCREEN_INGRESS_CHECK === 'true' || process.env.OFFSCREEN_COMPONENT_CHECK === 'true' || process.env.OFFSCREEN_TRANSPORT_CHECK === 'true') {
      // Fixture peer, not an authority/relay benchmark. Actual production client
      // + socket I/O Worker + presentation Worker receive these raw packets.
      ingressServer = new WebSocketServer({ host:'127.0.0.1', port:0, maxPayload:20*1024*1024 });
      await new Promise(resolve => ingressServer.once('listening', resolve));
      ingressServer.on('connection', socket => socket.on('message', bytes => {
        const m = JSON.parse(bytes.toString());
        if (m.type === 'hello') socket.send(JSON.stringify({type:'welcome',resumeToken:'a'.repeat(64),stateCredits:1,binaryDelta:1,motionReference:1,motionState:1,combatState:1,visualState:1}));
        if (m.type === 'ping') socket.send(JSON.stringify({type:'pong',sent:m.sent}));
        if (m.type === 'test-wire') socket.send(Buffer.from(m.data,'base64'));
        if (m.type === 'test-control') socket.send(JSON.stringify(m.message));
        if (m.type === 'motion-consumed' || m.type === 'combat-consumed') socket.send(JSON.stringify({type:'test-component-ack',kind:m.type,tick:m.tick,syncId:m.syncId,status:m.status}));
        if (m.type === 'state-consumed') socket.send(JSON.stringify({type:'test-ack',seq:m.seq}));
        if (m.type === 'visual-consumed') socket.send(JSON.stringify({...m,type:'test-visual-ack'}));
      }));
      if (process.env.OFFSCREEN_TRANSPORT_CHECK === 'true') {
        report.scope='Actual production presentation Worker entry/client, autonomous RAF, UI commands and bounded receipt transport with real LanConnection/socket I/O and a fixture peer. Not default LanBattle, direct socket-to-render routing, or a performance claim.';
        report.productionWorker=await pages[1].evaluate(async ({data,url})=>{
          const {checkProductionPresentationWorker}=await import('/scripts/lib/lan-presentation-worker-check.mts');return checkProductionPresentationWorker(data,url);
        },{data,url:'ws://127.0.0.1:'+ingressServer.address().port});
        report.disposal=await pages[1].evaluate(()=>window.workerCheck.request({type:'dispose'}));
        assert.deepEqual(errors,[]);report.passed=true;return;
      }
      if (process.env.OFFSCREEN_COMPONENT_CHECK === 'true') {
        report.components = await pages[1].evaluate(async ({data,url}) => {
          const {checkPresentationComponents} = await import('/scripts/lib/lan-presentation-components-check.mts');
          return checkPresentationComponents(data, window.workerCheck.request, url);
        }, {data, url:'ws://127.0.0.1:'+ingressServer.address().port});
        report.disposal = await pages[1].evaluate(() => window.workerCheck.request({type:'dispose'}));
        assert.deepEqual(errors,[]); report.passed = true; report.targetedComponents = true; return;
      }
      report.ingress = await pages[1].evaluate(async ({data,url}) => {
        const {checkBinaryIngress} = await import('/scripts/lib/lan-presentation-ingress-check.mts');
        return checkBinaryIngress(data, window.workerCheck.request, url);
      }, {data, url:'ws://127.0.0.1:'+ingressServer.address().port});
      report.disposal = await pages[1].evaluate(() => window.workerCheck.request({type:'dispose'}));
      assert.deepEqual(errors,[]); report.passed = true; report.targetedIngress = true; return;
    }
    if (process.env.OFFSCREEN_COMMAND_CHECK === 'true') report.commandWorker = await pages[1].evaluate(async () => {
      const {checkPresentationCommandWorker} = await import('/scripts/lib/lan-presentation-commands-check.mts');return checkPresentationCommandWorker(window.workerCheck.request);
    });
    if (process.env.OFFSCREEN_UI_WORKER_ONLY === 'true') {
      report.uiWorker = await pages[1].evaluate(async () => {
        const { checkUiWorker } = await import('/scripts/lib/lan-presentation-ui-check.mts'); return checkUiWorker(window.workerCheck.request);
      });
      report.disposal = await pages[1].evaluate(() => window.workerCheck.request({type:'dispose'}));
      assert.deepEqual(errors,[]); report.passed = true; report.targetedUiRecheck = true; return;
    }
    if (process.env.OFFSCREEN_CONTROLS_CHECK === 'true') {
      const read = (page, mode) => page.evaluate(async ({data,mode}) => {
        const {controlTrace} = await import('/scripts/lib/lan-presentation-controls-check.mts');
        return controlTrace(data, mode);
      }, {data,mode});
      const before = await read(pages[0], 'legacy'), legacy = await read(pages[1], 'legacy'), numeric = await read(pages[1], 'numeric');
      const worker = await pages[1].evaluate(({data,rows}) => window.workerCheck.request({type:'control-trace',data,rows}), {data,rows:before});
      const values = rows => rows.map(({layoutReads: _layoutReads, ...row}) => row);
      assert.deepEqual(values(legacy), values(before), 'Legacy DOM camera/aim changed');
      assert.deepEqual(values(numeric), values(before), 'Numeric DOM camera/aim changed');
      assert.deepEqual(values(worker), values(before), 'Worker numeric camera/aim changed');
      assert.equal(before[0].layoutReads, 3); assert.equal(numeric[0].layoutReads, 1); assert.equal(worker[0].layoutReads, 0);
      const contracts = await pages[1].evaluate(async data => {
        const {controlContracts} = await import('/scripts/lib/lan-presentation-controls-check.mts'); return controlContracts(data);
      }, data);
      report.controls = {cases:before.length,exactLegacy:true,exactNumeric:true,exactWorker:true,
        firstActiveLayoutReads:{before:before[0].layoutReads,after:numeric[0].layoutReads,worker:worker[0].layoutReads},contracts};
      // Full values use JSON numeric serialization (NaN becomes null); equality
      // above runs on structured-clone values and checks NaN/signed zeros too.
      await fs.writeFile(path.join(out,'control-traces.json'),JSON.stringify({before,legacy,numeric,worker},null,2));
    }
    // Identical authoritative bytes, fixed visual timestamps, alternating lane order.
    // No readback inside timed draws except gl.finish (explicit work timing, not FPS).
    for (let round = 0; round < 6; round++) {
      for (let i = 0; i < data.cases.length; i++) {
        const values = {};
        for (const lane of round % 2 ? ['worker', 'dom', 'before'] : ['before', 'dom', 'worker']) {
          const page = pages[lane === 'before' ? 0 : 1];
          values[lane] = await page.evaluate(async ({ lane, i, pixels }) => {
            if (lane !== 'worker') return window.dom.draw(i, pixels);
            const result = await window.workerCheck.draw(i);
            if (pixels) result.pixels = window.check.base64(await window.workerCheck.request({ type: 'pixels' }));
            return result;
          }, { lane, i, pixels: round === 0 });
          if (round >= 2) { const { pixels: _pixels, ...row } = values[lane]; report.samples[lane].push({ case: i, round, ...row }); }
        }
        if (round === 0) {
          const reference = Buffer.from(values.before.pixels, 'base64');
          const comparisons = {};
          for (const lane of ['dom', 'worker']) {
            const candidate = Buffer.from(values[lane].pixels, 'base64');
            let different = 0, maxDifference = 0;
            for (let n = 0; n < reference.length; n++) { const delta = Math.abs(reference[n] - candidate[n]); if (delta) different++; maxDifference = Math.max(maxDifference, delta); }
            comparisons[lane] = { different, maxDifference, sha256: sha(candidate) };
            if (different) { await fs.writeFile(path.join(out, `mismatch-${i}-${lane}.rgba`), candidate); await fs.writeFile(path.join(out, `mismatch-${i}-before.rgba`), reference); }
          }
          report.cases.push({ name: data.cases[i].name, sha256: sha(reference), ...comparisons });
          console.log('pixel', i, comparisons);
          if (process.env.OFFSCREEN_DEBUG === 'true' && comparisons.worker.different) {
            const before = await pages[0].evaluate(() => window.dom.canvases());
            const after = await pages[1].evaluate(async () => (await window.workerCheck.request({type:'canvases'})).map(c => ({...c, data:window.check.base64(c.data)})));
            const diffs = before.map(row => {
              const candidate = after.find(r => r.id === row.id); if (!candidate) return {id:row.id, missing:true};
              const a=Buffer.from(row.data,'base64'), b=Buffer.from(candidate.data,'base64'); let different=0,max=0;
              for(let k=0;k<a.length;k++){const d=Math.abs(a[k]-b[k]);if(d)different++;max=Math.max(max,d);}
              return {id:row.id,width:row.width,height:row.height,different,max};
            });
            await fs.writeFile(path.join(out,'canvas-diagnostics.json'),JSON.stringify({diffs},null,2));
            console.log('canvas diagnostics', diffs);
            throw Error('Diagnostic stop after first pixel mismatch');
          }
        }
      }
    }
    report.independentProgress = await pages[1].evaluate(async () => {
      const probe = window.workerCheck;
      const requests = Array.from({ length: probe.count }, (_, i) => probe.draw(i));
      const startCount = Atomics.load(probe.progress, 0), start = performance.now();
      let observed = startCount;
      while (performance.now() - start < 200) observed = Math.max(observed, Atomics.load(probe.progress, 0));
      const blockedMs = performance.now() - start;
      await Promise.all(requests);
      return { blockedMs, completedDuringBlock: observed - startCount, completedTotal: Atomics.load(probe.progress, 0) - startCount };
    });
    report.lifecycle = await pages[1].evaluate(() => window.workerCheck.request({ type: 'lifecycle' }));
    report.domLifecycle = await pages[1].evaluate(() => window.dom.lifecycle());
    const damagedBefore = await pages[1].evaluate(async () => {
      await window.workerCheck.request({type:'redraw'});
      return window.check.base64(await window.workerCheck.request({type:'pixels'}));
    });
    report.contextCycle = await pages[1].evaluate(() => window.workerCheck.request({ type: 'context-cycle' }));
    const damagedAfter = await pages[1].evaluate(async () => {
      await window.workerCheck.request({type:'redraw'});
      return window.check.base64(await window.workerCheck.request({type:'pixels'}));
    });
    report.contextCycle.damageSha256 = [damagedBefore, damagedAfter].map(text => sha(Buffer.from(text, 'base64')));
    assert.equal(report.contextCycle.damageSha256[0], report.contextCycle.damageSha256[1], 'Damaged canvas changed after native restoration');
    // Recompare after restoration using identical new draws in all three lanes.
    const restored = [];
    for (const lane of ['before', 'dom', 'worker']) {
      restored.push(await pages[lane === 'before' ? 0 : 1].evaluate(async lane => {
        if (lane !== 'worker') return window.dom.draw(0, true).pixels;
        await window.workerCheck.draw(0); return window.check.base64(await window.workerCheck.request({type:'pixels'}));
      }, lane));
    }
    report.contextCycle.pixelSha256 = restored.map(text => sha(Buffer.from(text,'base64')));
    assert.equal(new Set(report.contextCycle.pixelSha256).size, 1, 'Restored canvas pixel mismatch');
    await pages[1].locator('#worker-view').screenshot({ path: path.join(out, 'worker-canvas.png') });
    if (process.env.OFFSCREEN_VIEWS_CHECK === 'true') report.workerViews = await pages[1].evaluate(() => window.workerCheck.request({ type: 'views' }));
    if (process.env.OFFSCREEN_UI_CHECK === 'true') report.uiWorker = await pages[1].evaluate(async () => {
      const { checkUiWorker } = await import('/scripts/lib/lan-presentation-ui-check.mts'); return checkUiWorker(window.workerCheck.request);
    });
    report.invalidFrame = await pages[1].evaluate(async wire => {
      const bytes = window.check.bytes(wire).buffer;
      return window.workerCheck.request({ type: 'invalid-frame', wire: bytes }, [bytes]);
    }, data.cases[0].wire);
    report.disposal = await pages[1].evaluate(() => window.workerCheck.request({ type: 'dispose' }));
    report.timings = Object.fromEntries(Object.entries(report.samples).map(([lane, rows]) => [lane, summary(rows)]));
    report.deliveredMs = { p50: quantile(report.samples.worker.map(r => r.deliveredMs), .5), p95: quantile(report.samples.worker.map(r => r.deliveredMs), .95) };
    assert.deepEqual(errors, []);
    assert.equal(data.cases[0].ships, 22);
    for (const row of report.cases) { assert.equal(row.dom.different, 0, row.name + ' DOM'); assert.equal(row.worker.different, 0, row.name + ' Worker'); }
    assert.ok(report.independentProgress.completedDuringBlock > 0, 'Worker did not progress while main was blocked');
    report.passed = true;
    console.log(JSON.stringify({ ...report, samples: undefined, fixture: undefined }, null, 2));
  } catch (error) { report.failure = String(error?.stack ?? error); throw error; }
  finally {
    report.errors = errors;
    await fs.writeFile(path.join(out, 'offscreen-result.json'), JSON.stringify(report, null, 2));
    for (const page of pages) await page.evaluate(() => { window.dom?.dispose(); window.workerCheck?.worker.terminate(); }).catch(() => {});
    await browser?.close(); if (ingressServer) { for (const socket of ingressServer.clients) socket.terminate(); await new Promise(resolve => ingressServer.close(resolve)); } for (const server of servers) await server.close();
  }
}


