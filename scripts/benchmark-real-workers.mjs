import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { instrumentDecoderStages } from './lib/benchmark-decoder-stages.mjs';
import { instrumentEncoderFieldAudit } from './lib/benchmark-encoder-fields.mjs';
import { createArmOrderCycle, countArmPositions } from './lib/benchmark-arm-order.mjs';

// Own, fresh headless browser only. Never connects to a user browser/profile.
const args = process.argv.slice(2), root = process.cwd();
const arg = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const out = path.resolve(arg('--out', 'artifacts/real-worker-benchmark'));
const count = Number(arg('--count', '100')), steps = Number(arg('--steps', '180')), warm = Number(arg('--warm', '120'));
const hull = arg('--hull', 'onslaught'), enemyHull = arg('--enemy-hull', hull);
const hostPipeline = args.includes('--host-pipeline'), hostStages = args.includes('--host-stages');
if (hostStages) assert.ok(hostPipeline, '--host-stages requires --host-pipeline');
const decoderStages = args.includes('--decoder-stages');
const graphFieldAudit = args.includes('--graph-field-audit');
const presentationCodecPair = args.includes('--presentation-codec-pair');
const nativeCloneScreen = args.includes('--native-clone-screen');
if (decoderStages) assert.ok(hostPipeline, '--decoder-stages requires --host-pipeline');
const baseline = arg('--baseline'), freeze = arg('--freeze'), reverse = args.includes('--reverse-order'), decode = args.includes('--decode') || hostPipeline;
assert.ok(Number.isInteger(count) && count >= 2 && count <= 200);
assert.ok(Number.isInteger(steps) && steps >= 1 && steps <= 1800 && Number.isInteger(warm) && warm >= 0 && warm <= 600);
if (freeze && fs.existsSync(freeze)) throw Error('Refusing to overwrite frozen graph');
fs.mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
const moduleRoots = [root, arg('--modules', 'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')];
const { chromium } = require(require.resolve('playwright', { paths: moduleRoots }));
const hash = text => createHash('sha256').update(text).digest('hex');
const frozen = {}, old = baseline ? JSON.parse(fs.readFileSync(baseline, 'utf8')) : null;
const arms = baseline ? ['serial', 'before', 'after'] : ['serial', 'parallel'];
const orderPolicy = arg('--order-policy', 'balanced');
const armOrderCycle = createArmOrderCycle(arms, { policy: orderPolicy, reverse });
const localEntry = 'src/engine/runtime/local/local-combat.worker.ts';
const ownerEntry = 'src/engine/ai/multicore/owner.worker.ts';
const versions = baseline ? ['before', 'after'] : ['current'];
const serialPair = args.includes('--serial-pair'), ownerPair = args.includes('--owner-pair');
if (ownerPair) assert.ok(baseline && !serialPair, '--owner-pair requires a baseline and cannot combine with --serial-pair');
if (serialPair) assert.ok(baseline, '--serial-pair requires frozen before/after sources');
if (presentationCodecPair) assert.ok(serialPair && hostPipeline && !graphFieldAudit && !decoderStages && !hostStages, '--presentation-codec-pair requires uninstrumented Host serial pair');
const candidate = arg('--candidate');
const candidateGraph = candidate ? JSON.parse(fs.readFileSync(candidate, 'utf8')) : null;
const fleetDistanceAudit = args.includes('--fleet-distance-audit');
const hostileAudit = args.includes('--hostile-query-audit');
const navigationAudit = args.includes('--navigation-audit'), preAimAudit = args.includes('--preaim-audit');
const stages = args.includes('--stages'), profileArm = arg('--profile'), queryAudit = args.includes('--fire-query-audit');
// Allocation diagnosis includes short-lived objects collected during the window.
// Sampling is approximate and intrusive; never use these timings as speed evidence.
if (nativeCloneScreen) assert.ok(hostPipeline && serialPair && !profileArm && !stages && !queryAudit && !hostStages && !decoderStages && !graphFieldAudit && !presentationCodecPair, '--native-clone-screen requires an otherwise uninstrumented Host serial pair');
const heapProfile = args.includes('--heap-profile');
const heapSampling = { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true };
if (heapProfile) assert.ok(profileArm, '--heap-profile requires --profile <arm>');
if (hostPipeline) assert.ok(!queryAudit, '--fire-query-audit restore probe currently uses the raw Worker driver; run separately from --host-pipeline');
if (profileArm) assert.ok(arms.includes(profileArm) || profileArm === 'main' && decode, 'Profile arm must exist (main requires --decode)');
const replaceOnce = (code, from, to) => { assert.ok(code.includes(from), 'Missing instrumentation anchor: ' + from); return code.replace(from, to); };
for (const version of versions) {
  // Freeze BOTH arms when unrelated workspace edits may continue during a run.
  const graph = version === 'before' ? old : candidateGraph;
  const directory = path.join(out, version);
  fs.mkdirSync(directory, { recursive: true });
  await build({ entryPoints: { 'local-combat.worker': localEntry, 'owner.worker': ownerEntry, 'local-protocol': 'src/engine/runtime/local/LocalCombatProtocol.ts', ...(nativeCloneScreen ? { 'native-clone-probe': 'scripts/lib/native-clone-graph-probe.mjs' } : {}), ...(presentationCodecPair ? { 'packet-oracle': 'scripts/lib/presentation-packet-oracle.mjs' } : {}), ...(hostPipeline ? { 'local-host': 'src/engine/runtime/local/LocalWorkerHost.ts', 'benchmark-local-host': 'scripts/lib/benchmark-local-host.mjs' } : {}), ...(decode ? { 'presentation-decoder': 'src/engine/runtime/local/CombatPresentationDecoder.ts' } : {}) }, outdir: directory,
    bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022', metafile: true,
    define: { '__LAN_BUILD_ID__': '"real-worker-benchmark"', 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false }) },
    logLevel: 'warning', plugins: [{ name: 'frozen-real-worker', setup(b) {
      if (graph) b.onResolve({ filter: /^\./ }, info => {
        const base = path.resolve(info.resolveDir, info.path);
        for (const file of [base, base + '.ts', base + '.tsx', base + '.js', base + '.mts', path.join(base, 'index.ts')]) {
          const key = path.relative(root, file).replaceAll('\\', '/');
          if (Object.hasOwn(graph, key)) return { path: file };
        }
      });
      b.onLoad({ filter: /\.[cm]?[jt]sx?$|\.json$/ }, info => {
        const key = path.relative(root, info.path).replaceAll('\\', '/');
        if (!key.startsWith('src/')) return;
        assert.ok(!key.includes('/campaign/'), 'Combat benchmark must not bundle campaign');
        const row = graph?.[key];
        if (graph && !row) throw Error('Missing frozen module: ' + key);
        let code = row?.code ?? fs.readFileSync(info.path, 'utf8');
        if (row) assert.equal(hash(code), row.sha256, key);
        if (freeze) frozen[key] = { code, sha256: hash(code) };
        if (graphFieldAudit && key === 'src/engine/runtime/local/CombatPresentationEncoder.ts') code = instrumentEncoderFieldAudit(code);
        if (decoderStages && key === 'src/engine/runtime/local/CombatPresentationDecoder.ts') code = instrumentDecoderStages(code);
        if (hostPipeline && key === 'src/engine/runtime/local/LocalWorkerHost.ts') {
          code = replaceOnce(code, "new URL('./local-combat.worker.ts', import.meta.url)", "new URL('./local-combat.worker.js?arm=' + globalThis.benchmarkHostArm, import.meta.url)");
          if (hostStages) {
            code = replaceOnce(code, 'private receive(message: LocalCombatResponse): void {', 'private receive(message: LocalCombatResponse): void { const benchmarkReceiveStart = performance.now();');
            code = replaceOnce(code, 'const presentation = this.decoder.apply(message.frame);', 'const presentation = this.decoder.apply(message.frame); const benchmarkDecoded = performance.now();');
            code = replaceOnce(code, 'this.mapSnapshot = copyTacticalMapSnapshot(presentation.hud.map, this.mapSnapshot);', 'this.mapSnapshot = copyTacticalMapSnapshot(presentation.hud.map, this.mapSnapshot); const benchmarkMapped = performance.now();');
            code = replaceOnce(code, 'this.deploymentSnapshot = copyDeploymentView(presentation.hud.deployment, this.deploymentSnapshot);', 'this.deploymentSnapshot = copyDeploymentView(presentation.hud.deployment, this.deploymentSnapshot); const benchmarkDeployed = performance.now();');
            code = replaceOnce(code, 'const { frame, ...metadata } = message;', 'const benchmarkStrings = performance.now(); const { frame, ...metadata } = message;');
            code = replaceOnce(code, "if (operation.kind === 'init') this.journal.initialize", "const benchmarkFrame = performance.now(); if (operation.kind === 'init') this.journal.initialize");
            code = replaceOnce(code, 'clearTimeout(this.timer); this.inFlight = undefined;', 'const benchmarkJournal = performance.now(); clearTimeout(this.timer); this.inFlight = undefined; this.benchmarkHostStages = { validationMs: start - benchmarkReceiveStart, decodeApplyMs: benchmarkDecoded - start, mapCopyMs: benchmarkMapped - benchmarkDecoded, deploymentCopyMs: benchmarkDeployed - benchmarkMapped, stringsMs: benchmarkStrings - benchmarkDeployed, frameMs: benchmarkFrame - benchmarkStrings, journalMs: benchmarkJournal - benchmarkFrame, receiveMs: performance.now() - benchmarkReceiveStart };');
          }
        }
        if (ownerPair && key === 'src/engine/ai/multicore/CombatMulticore.ts') {
          // Attribution-only: keep real owners active in BOTH frozen builds.
          // Eligibility, deadlines, full state validation and fallback stay intact;
          // only cost-based scheduling/retirement is bypassed, never production.
          code = replaceOnce(code, 'allowOwners: this.budget.allow(engine.capitalShips.length, performance.now())', 'allowOwners: true');
          code = replaceOnce(code, 'if (this.budget.record(ms, usedOwners, performance.now())) this.owners.reset();', 'this.budget.record(ms, usedOwners, performance.now());');
        }
        if (key === 'src/engine/ai/multicore/OwnershipPool.ts') {
          assert.ok(code.includes("new URL('./owner.worker.ts', import.meta.url)"));
          code = code.replace("new URL('./owner.worker.ts', import.meta.url)", "new URL('./owner.worker.js', import.meta.url)");
          // A monotonically increasing test-only completion marker prevents stale metrics
          // from serial probe ticks being mistaken for new owner results.
          assert.ok(code.includes('this.metrics = metrics;'));
          code = 'let benchmarkCompletedBatches = 0;\n' + code.replace('this.metrics = metrics;',
            'Object.assign(metrics, { benchmarkBatch: ++benchmarkCompletedBatches }); this.metrics = metrics;');
        }
        if (stages && key === 'src/engine/runtime/local/LocalCombatKernel.ts') {
          code = replaceOnce(code, 'applyCombatControlSample(this.engine, this.playerAI, 1 / 60, accepted);\n        return this.multicore.prepare', 'const inputStart = performance.now(); applyCombatControlSample(this.engine, this.playerAI, 1 / 60, accepted); globalThis.benchmarkStages.inputControlMs = performance.now() - inputStart;\n        return this.multicore.prepare');
        }
        if (stages && key === 'src/engine/simulation/CombatEngine.ts') {
          code = replaceOnce(code, "trace?.mark('fleetAI');", "trace?.mark('fleetAI'); const benchmarkAiStart = performance.now();");
          code = replaceOnce(code, 'const fleetPlan = this.planFleetAI();', 'const benchmarkPlanStart = performance.now(); const fleetPlan = this.planFleetAI(); globalThis.benchmarkStages.fleetPlanMs = performance.now() - benchmarkPlanStart;');
          code = replaceOnce(code, 'try {\n      for (const ai of ais)', 'const benchmarkAiLoopStart = performance.now(); globalThis.benchmarkStages.aiSetupMs = benchmarkAiLoopStart - benchmarkAiStart - globalThis.benchmarkStages.fleetPlanMs; try {\n      for (const ai of ais)');
          code = replaceOnce(code, "trace?.mark('shipsWeapons');", "globalThis.benchmarkStages.aiLoopMs = performance.now() - benchmarkAiLoopStart; globalThis.benchmarkStages.fleetAiTotalMs = performance.now() - benchmarkAiStart; trace?.mark('shipsWeapons'); const benchmarkWeaponsStart = performance.now();");
          code = replaceOnce(code, "trace?.mark('wingsDrones');", "globalThis.benchmarkStages.shipsWeaponsMs = performance.now() - benchmarkWeaponsStart; trace?.mark('wingsDrones');");
        }
        if (stages && key === 'src/engine/ai/multicore/Protocol.ts') {
          const stamp = name => `globalThis.benchmarkStages[${JSON.stringify(name)}] = performance.now() - benchmarkStart; benchmarkStart = performance.now();`;
          code = replaceOnce(code, 'for (const group of this.ownGroups) group.codec.encode', 'let benchmarkStart = performance.now();\n        for (const group of this.ownGroups) group.codec.encode');
          code = replaceOnce(code, 'let q = 0;\n        const muzzle', stamp('ownEncodeMs') + '\n        let q = 0;\n        const muzzle');
          code = replaceOnce(code, 'const worldCount = q;', stamp('worldEncodeMs') + '\n        const worldCount = q;');
          const targets = code.includes('private queryTargets(') ? 'this.queryTargets(engine)' : 'this.ships.map(s => this.indices.get(engine.findHostile(s) ?? this.aiByShip.get(s)!.targetShip)!)';
          let targetIndex = 0; code = code.replaceAll(targets, () => { const metric = ['publishTargetsMs', 'validateTargetsMs'][targetIndex++]; if (!metric) throw Error('Unexpected extra target pass'); return `(() => { const t = performance.now(); const targets = ${targets}; globalThis.benchmarkStages.${metric} = performance.now() - t; return targets; })()`; });
          assert.equal(targetIndex, 2, 'Both publish and validation target passes must be timed');

          code = replaceOnce(code, 'sequence: this.sequence, dt, control:', 'benchmarkProjectileMs: (() => { ' + stamp('projectileEncodeMs') + ' return 0; })(), sequence: this.sequence, dt, control:');
          code = replaceOnce(code, 'const f = this.encode(engine, ais, dt);', 'const f = this.encode(engine, ais, dt); let benchmarkStart = performance.now();');
          code = replaceOnce(code, 'this.lastMetadata = this.metadata(f);', stamp('localValidationCaptureMs') + '\n        this.lastMetadata = this.metadata(f); ' + stamp('metadataCaptureMs'));
        }
        if (stages && key === 'src/engine/ai/multicore/OwnershipPool.ts') {
          code = replaceOnce(code, 'this.busy = true;', 'globalThis.benchmarkStages.supportsMs = performance.now() - start; this.busy = true;');
          code = replaceOnce(code, 'const current = this.lanGate ?', 'globalThis.benchmarkStages.supportsValidateMs = performance.now() - t; const current = this.lanGate ?');
        }
        if (queryAudit && key === 'src/engine/runtime/local/CombatPresentationEncoder.ts' && code.includes('const nativeScalars =')) {
          code = replaceOnce(code, 'const nativeScalars = ownedScalars && this.channel !== \'ui\' && nativeScalarSurface();', 'const nativeScalars = ownedScalars && this.channel !== \'ui\' && nativeScalarSurface(); const scalarAudit = globalThis.benchmarkOwnedScalars ??= { fastFrames: 0, genericFrames: 0 }; if (nativeScalars) scalarAudit.fastFrames++; else scalarAudit.genericFrames++;');
        }
        if (queryAudit && key === 'src/engine/ai/AutofireController.ts' && code.includes('if (!qualification?.active) {')) {
          code = 'globalThis.benchmarkQualifiedFireTargets = { skipped: 0, fallback: 0 };\n' + code;
          code = replaceOnce(code, 'if (!qualification?.active) {', 'const qualified = qualification?.active; if (qualified) globalThis.benchmarkQualifiedFireTargets.skipped++; else globalThis.benchmarkQualifiedFireTargets.fallback++; if (!qualified) {');
        }
        if (queryAudit && key === 'src/engine/runtime/CombatHudView.ts') {
          code = 'globalThis.benchmarkOwnedHud = { readonlyFrames: 0, genericFrames: 0, contacts: 0 };\n' + code;
          code = replaceOnce(code, 'private captureView(engine: CombatHudSource, readonlyCapture: boolean): CombatHudView {', 'private captureView(engine: CombatHudSource, readonlyCapture: boolean): CombatHudView { globalThis.benchmarkOwnedHud[readonlyCapture ? "readonlyFrames" : "genericFrames"]++;');
          code = replaceOnce(code, 'private contact(ship: CombatDisplayShip, detail: boolean, engine: CombatHudSource): HudContact {', 'private contact(ship: CombatDisplayShip, detail: boolean, engine: CombatHudSource): HudContact { globalThis.benchmarkOwnedHud.contacts++;');
        }
        if (queryAudit && key === 'src/engine/simulation/Ship.ts' && code.includes('let workerOwnedPhaseReads = false;')) {
          code = 'globalThis.benchmarkOwnedPhaseReads = { registrations: 0, fastReads: 0 };\n' + code;
          code = replaceOnce(code, 'workerOwnedPhaseReads = true;', 'globalThis.benchmarkOwnedPhaseReads.registrations++; workerOwnedPhaseReads = true;');
          code = replaceOnce(code, 'const system = this.system, defense = this.defenseSystem;', 'globalThis.benchmarkOwnedPhaseReads.fastReads++; const system = this.system, defense = this.defenseSystem;');
        }
        if (queryAudit && key === 'src/engine/ai/FireControlQueryBatch.ts') {
          code = 'globalThis.benchmarkFireQueries = { registrations: 0, rosters: 0, maxRoster: 0, rejectedBatches: 0, batches: 0, targetLists: 0, targetReads: 0, targetHits: 0 };\n' + code;
          if (code.includes('workerOwnedEngines.add(engine);')) code = replaceOnce(code, 'workerOwnedEngines.add(engine);', 'globalThis.benchmarkFireQueries.registrations++; workerOwnedEngines.add(engine);');
          if (code.includes('return new FireControlQueryRoster(ships, true);')) {
            code = replaceOnce(code, 'return new FireControlQueryRoster(ships, true);', '{ globalThis.benchmarkFireQueries.rosters++; globalThis.benchmarkFireQueries.maxRoster = Math.max(globalThis.benchmarkFireQueries.maxRoster, ships.length); return new FireControlQueryRoster(ships, true); }');
            const rejection = code.includes('if (!guard.allows()) return;') ? 'if (!guard.allows())' : 'if (!hasOwnedFireControlReadHooks(other))';
            code = replaceOnce(code, rejection + ' return;', rejection + ' { globalThis.benchmarkFireQueries.rejectedBatches++; return; }');
          }
          const constructor = code.includes('return new FireControlQueryBatch(ship, ships, workerOwned);') ? 'return new FireControlQueryBatch(ship, ships, workerOwned);' : 'return new FireControlQueryBatch(ship, ships);';
          code = replaceOnce(code, constructor, 'globalThis.benchmarkFireQueries.batches++; ' + constructor);
          code = replaceOnce(code, 'this.targetList = [];', 'globalThis.benchmarkFireQueries.targetLists++; this.targetList = [];');
          code = replaceOnce(code, 'if (cached !== undefined) return cached;', 'if (cached !== undefined) { globalThis.benchmarkFireQueries.targetHits++; return cached; } globalThis.benchmarkFireQueries.targetReads++;');
        }
        if (preAimAudit && key === 'src/engine/ai/FireControlQueryBatch.ts' && code.includes('public preAimTargets(')) {
          code = replaceOnce(code, 'const targets = this.targets();', 'const targets = this.targets(); const audit = globalThis.benchmarkPreAim; audit.calls++; audit.ownedCalls += Number(this.workerOwned); audit.maxTargets = Math.max(audit.maxTargets, targets.length); audit.sizes[targets.length === 0 ? 0 : targets.length < 8 ? 1 : targets.length < 16 ? 2 : targets.length < 32 ? 3 : targets.length < 64 ? 4 : 5]++;');
        }
        if (preAimAudit && key === 'src/engine/ai/PreAimRangeIndex.ts') {
          code = 'const preAimAudit = globalThis.benchmarkPreAim = { built:0, queries:0, candidatesIn:0, candidatesOut:0, calls:0, ownedCalls:0, maxTargets:0, sizes:[0,0,0,0,0,0] };\n' + code;
          code = replaceOnce(code, 'this.length = ships.length;', 'preAimAudit.built++; this.length = ships.length;');
          code = replaceOnce(code, 'if (!this.valid ||', 'preAimAudit.queries++; preAimAudit.candidatesIn += this.ships.length; const finish = (items: readonly Ship[]) => { preAimAudit.candidatesOut += items.length; return items; }; if (!this.valid ||');
          code = code.replaceAll('return this.ships;', 'return finish(this.ships);');
          code = replaceOnce(code, 'return orders.map(order => this.ships[order]);', 'return finish(orders.map(order => this.ships[order]));');
        }
        if (navigationAudit && key === 'src/engine/ai/NavigationObstacleIndex.ts') {
          code = 'const navAudit = globalThis.benchmarkNavigation = { created:0, built:0, queries:0, fastQueries:0, fullCandidatesInFast:0, candidatesInFast:0, invalidations:0, closed:0 };\n' + code;
          code = replaceOnce(code, 'this.length = ships.length;', 'navAudit.created++; this.length = ships.length;');
          code = replaceOnce(code, 'this.entries = [];', 'navAudit.built++; this.entries = [];');
          code = replaceOnce(code, 'if (!this.active || ships !== this.ships', 'navAudit.queries++; if (!this.active || ships !== this.ships');
          code = replaceOnce(code, 'return nearby.map(row => row.ship);', 'navAudit.fastQueries++; navAudit.fullCandidatesInFast += ships.length; navAudit.candidatesInFast += nearby.length; return nearby.map(row => row.ship);');
          code = replaceOnce(code, 'invalidate(ship: Ship): void {', 'invalidate(ship: Ship): void { navAudit.invalidations++;');
          code = replaceOnce(code, 'close(): void { this.active', 'close(): void { navAudit.closed++; this.active');
        }
        if (fleetDistanceAudit && key === 'src/engine/ai/FleetTactics.ts' && code.includes('function borrowDistances(')) {
          code = 'const distanceAudit = globalThis.benchmarkFleetDistances = { plans:0, owned:0, borrowed:0, returned:0, hits:0, misses:0, maxCells:0, capacity:0 };\n' + code;
          code = replaceOnce(code, 'const units = ships.filter', 'distanceAudit.plans++; distanceAudit.owned += Number(owned); const units = ships.filter');
          code = replaceOnce(code, 'distanceWorkspaceBusy = true;', 'distanceAudit.borrowed++; distanceAudit.maxCells = Math.max(distanceAudit.maxCells, size); distanceAudit.capacity = distanceWorkspace.length; distanceWorkspaceBusy = true;');
          code = replaceOnce(code, 'if (!Number.isNaN(cached)) return cached;', 'if (!Number.isNaN(cached)) { distanceAudit.hits++; return cached; } distanceAudit.misses++;');
          code = replaceOnce(code, 'if (distances) distanceWorkspaceBusy = false;', 'if (distances) { distanceAudit.returned++; distanceWorkspaceBusy = false; }');
        }
        if (hostileAudit && key === 'src/engine/ai/HostileQueryBatch.ts') {
          code = 'const hostileAudit = globalThis.benchmarkHostileQueries = { batches:0, queries:0, lists:0, candidatesRead:0, closed:0 };\n' + code;
          code = replaceOnce(code, 'this.ships = ships;', 'hostileAudit.batches++; this.ships = ships;');
          code = replaceOnce(code, 'let team = this.teams.get(ship.teamId);', 'hostileAudit.queries++; let team = this.teams.get(ship.teamId);');
          code = replaceOnce(code, 'const hostiles = ships.filter', 'hostileAudit.lists++; hostileAudit.candidatesRead += ships.length; const hostiles = ships.filter');
          code = replaceOnce(code, 'public close(): void {', 'public close(): void { if (this.ships) hostileAudit.closed++;');
        }
        if (key === localEntry) {
          if (graphFieldAudit) code = replaceOnce(code, 'self.postMessage(response,', 'Object.assign(response, { benchmarkGraphFields: globalThis.benchmarkGraphFields }); self.postMessage(response,');
          if (hostileAudit) code = replaceOnce(code, 'self.postMessage(response,', 'Object.assign(response, { benchmarkHostileQueries: { ...globalThis.benchmarkHostileQueries } }); self.postMessage(response,');
          if (fleetDistanceAudit) code = replaceOnce(code, 'self.postMessage(response,', 'Object.assign(response, { benchmarkFleetDistances: { ...globalThis.benchmarkFleetDistances } }); self.postMessage(response,');
          if (preAimAudit) code = replaceOnce(code, 'self.postMessage(response,', 'Object.assign(response, { benchmarkPreAim: { ...globalThis.benchmarkPreAim } }); self.postMessage(response,');
          if (navigationAudit) code = replaceOnce(code, 'self.postMessage(response,', 'Object.assign(response, { benchmarkNavigation: { ...globalThis.benchmarkNavigation } }); self.postMessage(response,');
          if (queryAudit) {
            code = 'import { localCombatContentSignature as benchmarkContentSignature } from "./LocalCombatContent";\n' + code;
            code = replaceOnce(code, 'self.postMessage(response,', 'Object.assign(response, { benchmarkFireQueries: { ...globalThis.benchmarkFireQueries }, benchmarkContentSignature: benchmarkContentSignature(), benchmarkOwnedScalars: globalThis.benchmarkOwnedScalars, benchmarkOwnedPhaseReads: globalThis.benchmarkOwnedPhaseReads, benchmarkOwnedHud: globalThis.benchmarkOwnedHud, benchmarkQualifiedFireTargets: globalThis.benchmarkQualifiedFireTargets }); self.postMessage(response,');
          }
          if (stages) {
            code = replaceOnce(code, 'const start = performance.now();', 'globalThis.benchmarkStages = {}; const start = performance.now();');
            code = replaceOnce(code, 'self.postMessage(response,', 'Object.assign(response, { benchmarkStages: globalThis.benchmarkStages }); self.postMessage(response,');
          }
          const auditPath = path.join(root, 'scripts/lib/real-worker-audit.mts').replaceAll('\\', '/');
          code += `\nimport { workerAudit } from ${JSON.stringify(auditPath)};
const productionHandler = self.onmessage;
self.onmessage = event => {
  if (event.data.kind === 'benchmark-audit') {
    try { self.postMessage({ kind: 'benchmark-audit', ...workerAudit(kernel!) }); }
    catch (error) { self.postMessage({ kind: 'failed', message: String(error) }); }
    return;
  }
  return productionHandler!.call(self, event);
};`;
        }
        return { contents: code, loader: info.path.endsWith('.json') ? 'json' : /\.m?ts$/.test(info.path) ? 'ts' : 'js' };
      });
    } }] });
}
if (freeze) fs.writeFileSync(freeze, JSON.stringify(frozen));
// Freeze the exact pre-change graph without running an extra performance pass.
if (args.includes('--build-only')) { console.log(JSON.stringify({builtOnly:true,out,sourceGraph:freeze??candidate??baseline??null,modules:Object.keys(frozen).length})); process.exit(0); }
const server = http.createServer((req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Headless combat worker benchmark</title>'); return; }
  const file = path.resolve(out, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(out + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', 'text/javascript'); fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true,
    executablePath: arg('--browser', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') });
  const page = await browser.newPage();
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  page.on('pageerror', error => console.error(error));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  if (profileArm) {
    const cdp = await page.context().newCDPSession(page), sessions = new Map(), pending = new Map();
    let nextId = 0;
    cdp.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
      if (targetInfo.type === 'worker') sessions.set(new URL(targetInfo.url).searchParams.get('arm'), sessionId);
    });
    cdp.on('Target.receivedMessageFromTarget', ({ message }) => {
      const data = JSON.parse(message), call = pending.get(data.id);
      if (call) { pending.delete(data.id); clearTimeout(call.timer); if (data.error) call.reject(Error(JSON.stringify(data.error))); else call.resolve(data.result); }
    });
    const send = (method, params = {}) => profileArm === 'main' ? cdp.send(method, params) : new Promise((resolve, reject) => {
      const sessionId = sessions.get(profileArm), id = ++nextId;
      if (!sessionId) { reject(Error('Profile worker not attached: ' + profileArm)); return; }
      const timer = setTimeout(() => { pending.delete(id); reject(Error('Profiler timeout: ' + method)); }, 10000);
      pending.set(id, { resolve, reject, timer });
      void cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) })
        .catch(error => { pending.delete(id); clearTimeout(timer); reject(error); });
    });
    if (profileArm !== 'main') await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
    await page.exposeFunction('__benchmarkProfile', async action => {
      if (action === 'start') {
        await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 1000 });
        if (heapProfile) { await send('HeapProfiler.enable'); await send('HeapProfiler.startSampling', heapSampling); }
        await send('Profiler.start');
      } else {
        const { profile } = await send('Profiler.stop');
        fs.writeFileSync(path.join(out, profileArm + '.cpuprofile'), JSON.stringify(profile));
        if (heapProfile) {
          const { profile: allocations } = await send('HeapProfiler.stopSampling');
          assert.ok(allocations.head && allocations.samples.length > 0, 'No allocation samples captured');
          fs.writeFileSync(path.join(out, profileArm + '.heapprofile'), JSON.stringify(allocations));
        }
      }
    });
  }
  const result = await page.evaluate(async ({ arms, armOrderCycle, count, steps, warm, hull, enemyHull, baseline, profileArm, decode, queryAudit, navigationAudit, preAimAudit, fleetDistanceAudit, hostileAudit, serialPair, hostPipeline, hostStages, decoderStages, graphFieldAudit, presentationCodecPair, nativeCloneScreen }) => {
    const same = (a, b, where) => {
      if (Object.is(a, b)) return;
      if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) { same(new Uint8Array(a), new Uint8Array(b), where); return; }
      if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
        if (a.constructor !== b.constructor || a.length !== b.length) throw Error(where + ': typed shape differs');
        for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) throw Error(`${where}[${i}]: ${a[i]} != ${b[i]}`);
        return;
      }
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object') throw Error(`${where}: ${a} != ${b}`);
      const keys = Object.keys(a), other = Object.keys(b);
      if (keys.length !== other.length || keys.some(k => !Object.hasOwn(b, k))) throw Error(where + ': keys differ');
      for (const key of keys) same(a[key], b[key], where + '.' + key);
    };
    // Full display graph comparison, including Map/Set contents and aliasing.
    // Module-local prototypes differ between frozen/current bundles, so compare
    // their names/nullness, not their constructor object identity. Outside timings.
    const sameGraph = (left, right, label) => {
      const forward = new WeakMap(), backward = new WeakMap(); let nodes = 0;
      const visit = (a, b, where) => {
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
          if (!Object.is(a, b)) throw Error(where + ': display scalar differs'); return;
        }
        if (forward.has(a) || backward.has(b)) { if (forward.get(a) !== b || backward.get(b) !== a) throw Error(where + ': display alias differs'); return; }
        forward.set(a, b); backward.set(b, a); nodes++;
        const ap = Object.getPrototypeOf(a), bp = Object.getPrototypeOf(b);
        if ((ap === null) !== (bp === null) || ap?.constructor?.name !== bp?.constructor?.name) throw Error(where + ': display prototype differs');
        if (ArrayBuffer.isView(a)) {
          if (!ArrayBuffer.isView(b) || a.length !== b.length) throw Error(where + ': display typed shape differs');
          for (let i = 0; i < a.length; i++) visit(a[i], b[i], where + '[' + i + ']'); return;
        }
        if (a instanceof ArrayBuffer) { visit(new Uint8Array(a), new Uint8Array(b), where + '.bytes'); return; }
        if (a instanceof Map || a instanceof Set) {
          if (a.size !== b.size) throw Error(where + ': display collection size differs');
          const ai = a.entries(), bi = b.entries(); let index = 0;
          for (let item = ai.next(); !item.done; item = ai.next()) { const other = bi.next(); if (other.done) throw Error(where + ': display collection ended'); visit(item.value[0], other.value[0], where + '.key' + index); visit(item.value[1], other.value[1], where + '.value' + index++); }
          return;
        }
        const keys = Object.keys(a), other = Object.keys(b);
        if (keys.length !== other.length || keys.some((k, i) => k !== other[i])) throw Error(where + ': display keys differ');
        for (const key of keys) visit(a[key], b[key], where + '.' + key);
      };
      visit(left, right, label); return nodes;
    };
    const worlds = {}, samples = {}, statuses = {}, checkpoints = [];
    const nativeCloneSamples = [];
    let nativeCloneChecks = 0;
    const screenNative = nativeCloneScreen ? (await import('/before/native-clone-probe.js')).screenNativeCloneGraph : null;
    let decodedComparisons = 0, decodedNodes = 0;
    const packetOracles = {};
    if (presentationCodecPair) {
      const {createPresentationPacketOracle} = await import('/before/packet-oracle.js');
      for (const arm of arms) packetOracles[arm] = createPresentationPacketOracle();
    }
    const sample = { autopilot: true, blocked: false, keys: {}, aim: [0, 0], firing: false, mouseSteering: false, pointerActive: false };
    const config = { playerHull: hull, enemyHull, seed: 917,
      additionalShips: Array.from({ length: count - 2 }, (_, i) => ({ hull: i % 2 === 0 ? hull : enemyHull, isPlayer: i % 2 === 0,
        position: [((i >> 1) % 8 - 3.5) * 700, (i % 2 ? 1 : -1) * (1300 + Math.floor(i / 16) * 650)],
        facing: i % 2 ? -Math.PI / 2 : Math.PI / 2 })) };
    try {
      for (const arm of arms) {
        const version = baseline ? arm === 'after' ? 'after' : 'before' : 'current';
        let world, init;
        if (hostPipeline) {
          const {createHostWorld} = await import('/' + version + '/benchmark-local-host.js');
          ({world,init} = await createHostWorld(version, arm, { ...config, multicore: !serialPair && arm !== 'serial' }));
          worlds[arm] = world;
        } else {
        const worker = new Worker(`/${version}/local-combat.worker.js?arm=${arm}`, { type: 'module' });
        const {LOCAL_COMBAT_PROTOCOL: protocol} = await import('/' + version + '/local-protocol.js');
        world = worlds[arm] = { worker, sequence: 0, lastBatch: 0, latest: null };
        world.call = (kind, fields = {}) => new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error(arm + ': timed out')), 60000), start = performance.now();
          worker.onerror = error => { clearTimeout(timer); reject(Error(error.message)); };
          worker.onmessageerror = () => { clearTimeout(timer); reject(Error(arm + ': messageerror')); };
          worker.onmessage = ({ data }) => { clearTimeout(timer); if (data.kind === 'failed') reject(Error(data.message)); else resolve({ data, roundTripMs: performance.now() - start }); };
          const recycled = kind !== 'benchmark-audit' && world.latest ? { recycle: world.latest.frame.buffer, recycleVisuals: world.latest.frame.visuals.buffer } : {};
          const message = kind === 'benchmark-audit' ? { kind } : { protocol, epoch: 1, sequence: ++world.sequence, kind, ...fields, ...recycled };
          worker.postMessage(message, Object.values(recycled));
        });
        if (decode) { const { CombatPresentationDecoder } = await import('/' + version + '/presentation-decoder.js'); world.decoder = new CombatPresentationDecoder(1, 'render'); }
        init = await world.call('init', { config: { ...config, multicore: !serialPair && arm !== 'serial' } });
        if (decode) world.presentation = world.decoder.apply(init.data.frame);
        }
        world.latest = init.data;
        world.initMs = init.roundTripMs;
        samples[arm] = []; statuses[arm] = [];
      }
      let compared = 0;
      if (presentationCodecPair) {
        const initial = Object.fromEntries(arms.map(arm => [arm, packetOracles[arm](worlds[arm].latest.frame)]));
        for (const arm of arms.slice(1)) same(initial[arms[0]], initial[arm], 'init/canonical-packet/' + arm);
      }
      if (decode) for (const arm of arms.slice(1)) { decodedNodes += sameGraph(worlds[arms[0]].presentation, worlds[arm].presentation, "init/" + arm); decodedComparisons++; }
      for (let tick = 1; tick <= warm + steps; tick++) {
        if (profileArm && tick === warm + 1) await window.__benchmarkProfile('start');
        const order = armOrderCycle[(tick - 1) % armOrderCycle.length];
        for (let executionPosition = 0; executionPosition < order.length; executionPosition++) {
          const arm = order[executionPosition];
          const world = worlds[arm], response = await world.call('step', { sample }), { data, roundTripMs } = response;
          world.latest = data;
          let decodeMs;
          if (decode && !hostPipeline) {
            const started = performance.now(); world.presentation = world.decoder.apply(data.frame); decodeMs = performance.now() - started;

          }
          if (decode && world.decoder.retainedObjects !== data.frame.liveNodeCount) throw Error(arm + ': retained display count differs');
          const metrics = data.ai.metrics, fresh = !!metrics && metrics.benchmarkBatch !== world.lastBatch;
          if (metrics) world.lastBatch = metrics.benchmarkBatch;
          const row = { ...(presentationCodecPair ? {wireUnits: data.frame.length, visualUnits: data.frame.visuals.length, graphCapacity: data.frame.buffer.byteLength} : {}), ...(graphFieldAudit ? {graphFields: {...data.benchmarkGraphFields, visualUnits: data.frame.visuals.length}} : {}), benchmarkStages: data.benchmarkStages, tick, executionPosition, roundTripMs, simulationMs: data.simulationMs, encodeMs: data.encodeMs, ...(hostPipeline ? { hostPresentationMs: response.hostPresentationMs, deliveredMs: response.hostDeliveryMs, ...(hostStages ? { hostStages: response.hostStages } : {}), ...(decoderStages ? {decoderStages: response.decoderStages} : {}) } : decode ? { decodeMs, deliveredMs: roundTripMs + decodeMs } : {}),
            reason: data.ai.reason, mode: data.ai.mode, workers: data.ai.workers, tier: data.ai.tier, metrics: fresh ? metrics : null };
          if (decoderStages && (!row.decoderStages || Object.values(row.decoderStages.timings).some(n => !Number.isFinite(n) || n < 0))) throw Error(arm + ': missing/invalid decoder stages');
          if (graphFieldAudit && (!row.graphFields || row.graphFields.graphUnits !== data.frame.length || Object.values(row.graphFields).some(n => !Number.isSafeInteger(n) || n < 0))) throw Error(arm + ': invalid field counters');
          if (tick > warm) samples[arm].push(row);
          const status = statuses[arm];
          if (!status.length || status.at(-1).reason !== row.reason) status.push({ tick, reason: row.reason, workers: row.workers, budget: data.ai.budget ? { ...data.ai.budget } : null });
        }
        const reference = worlds[arms[0]].latest;
        const canonical = presentationCodecPair ? Object.fromEntries(arms.map(arm => [arm, packetOracles[arm](worlds[arm].latest.frame)])) : null;
        for (const arm of arms.slice(1)) {
          const data = worlds[arm].latest;
          for (const key of ['witness', 'audio', 'results', 'outcome']) same(reference[key], data[key], `${tick}/${arm}/${key}`);
          // Ignore unused recycled buffer capacity, never ignore valid payload values.
          const frame = f => ({ ...f, buffer: new Float64Array(f.buffer, 0, f.length),
            visuals: { ...f.visuals, buffer: new Float64Array(f.visuals.buffer, 0, f.visuals.length) } });
          if (canonical) same(canonical[arms[0]], canonical[arm], `${tick}/${arm}/canonical-frame`);
          else same(frame(reference.frame), frame(data.frame), `${tick}/${arm}/frame`);
          compared++;
          if (decode) { decodedNodes += sameGraph(worlds[arms[0]].presentation, worlds[arm].presentation, tick + "/" + arm + "/display"); decodedComparisons++; }
        }
        if (hostPipeline) for (const arm of arms.slice(1)) {
          sameGraph(worlds[arms[0]].host.tacticalMapView.read(), worlds[arm].host.tacticalMapView.read(), tick + '/' + arm + '/host-map');
          sameGraph(worlds[arms[0]].host.deploymentView.read(), worlds[arm].host.deploymentView.read(), tick + '/' + arm + '/host-deployment');
        }
        if (screenNative) {
          const cloned = screenNative(worlds.serial.presentation);
          sameGraph(worlds.serial.presentation, cloned.root, tick + '/native-clone-display');
          nativeCloneChecks++;
          if (tick > warm) nativeCloneSamples.push({tick,...cloned.timing,...cloned.stats});
        }
        if (tick % 30 === 0 || tick === warm + steps) {
          const audits = {};
          for (const arm of arms) audits[arm] = (await worlds[arm].call('benchmark-audit')).data;
          for (const arm of arms.slice(1)) same(audits[arms[0]], audits[arm], `${tick}/${arm}/authority+hidden`);
          checkpoints.push(tick);
        }
      }
      if (profileArm) await window.__benchmarkProfile('stop');
      let fireQueryAudit, fleetDistanceRestore, hostileRestore;
      if (queryAudit) {
        // Correctness-only probe: a fresh real Worker must register the same
        // domain on replay restore. Never include these timings in a speed claim.
        const source = worlds[arms[0]], sourceAudit = (await source.call('benchmark-audit')).data;
        const version = baseline ? 'before' : 'current';
        const {LOCAL_COMBAT_PROTOCOL: protocol} = await import('/' + version + '/local-protocol.js');
        const worker = new Worker('/' + version + '/local-combat.worker.js?arm=restore-audit', { type: 'module' });
        worlds.restoreAudit = { worker };
        const call = message => new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error('restore audit timed out')), 60000);
          worker.onerror = e => { clearTimeout(timer); reject(Error(e.message)); };
          worker.onmessageerror = () => { clearTimeout(timer); reject(Error('restore audit messageerror')); };
          worker.onmessage = ({ data }) => {
            if (data.kind === 'replay-progress') return;
            clearTimeout(timer); if (data.kind === 'failed') reject(Error(data.message)); else resolve(data);
          };
          worker.postMessage(message);
        });
        const restored = await call({ protocol, epoch: 1, sequence: 1, kind: 'restore', checkpoint: {
          format: 2, build: 'in-memory-only', protocol, tick: warm + steps,
          config: { ...config, multicore: false, expectedContent: source.latest.benchmarkContentSignature },
          entries: [{ kind: 'step', count: warm + steps, sample }], witness: source.latest.witness
        } });
        same(source.latest.witness, restored.witness, 'restore/witness');
        same(sourceAudit, await call({ kind: 'benchmark-audit' }), 'restore/authority+hidden');
        if (decode) {
          const { CombatPresentationDecoder } = await import('/' + version + '/presentation-decoder.js');
          sameGraph(source.presentation, new CombatPresentationDecoder(1, 'render').apply(restored.frame), 'restore/display');
        }
        if (fleetDistanceAudit) fleetDistanceRestore = restored.benchmarkFleetDistances;
        if (hostileAudit) hostileRestore = restored.benchmarkHostileQueries;
        fireQueryAudit = { initialized: source.latest.benchmarkFireQueries, restored: restored.benchmarkFireQueries,
          compared: ['witness', 'authority+hidden', ...(decode ? ['display'] : [])],
          ...(source.latest.benchmarkOwnedHud ? { ownedHud: { initialized: source.latest.benchmarkOwnedHud, restored: restored.benchmarkOwnedHud } } : {}),
          ...(source.latest.benchmarkOwnedPhaseReads ? { phaseReads: { initialized: source.latest.benchmarkOwnedPhaseReads, restored: restored.benchmarkOwnedPhaseReads } } : {}),
          ...(source.latest.benchmarkQualifiedFireTargets ? { qualifiedTargets: { initialized: source.latest.benchmarkQualifiedFireTargets, restored: restored.benchmarkQualifiedFireTargets } } : {}),
          ...(source.latest.benchmarkOwnedScalars ? { ownedScalars: { initialized: source.latest.benchmarkOwnedScalars, restored: restored.benchmarkOwnedScalars } } : {}) };
        if (fireQueryAudit.phaseReads) for (const counters of Object.values(fireQueryAudit.phaseReads)) {
          if (counters?.registrations !== 1 || !(counters.fastReads > 0)) throw Error('Owned phase reads were not active on initialization/restore');
        }
        for (const counters of [fireQueryAudit.initialized, fireQueryAudit.restored]) {
          if (counters?.registrations !== 1 || (count >= 100 && !(counters.batches > 0 && counters.targetLists > 0 && counters.targetHits > 0)))
            throw Error('Owned fire queries were not actually active');
        }
      }
      const stats = values => {
        if (!values.length) return null;
        values.sort((a, b) => a - b);
        return { n: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
          p50: values[Math.floor((values.length - 1) * .5)], p95: values[Math.floor((values.length - 1) * .95)] };
      };
      const summary = {};
      for (const arm of arms) {
        const rows = samples[arm], batches = rows.flatMap(r => r.metrics ? [r.metrics] : []);
        summary[arm] = { initMs: worlds[arm].initMs, finalStatus: worlds[arm].latest.ai, statuses: statuses[arm],
          ...Object.fromEntries(['roundTripMs', 'simulationMs', 'encodeMs', ...(hostPipeline ? ['hostPresentationMs','deliveredMs'] : decode ? ['decodeMs', 'deliveredMs'] : [])].map(k => [k, stats(rows.map(r => r[k]))])),
          freshBatches: batches.length, stages: Object.fromEntries(['packMs', 'waitMs', 'validateMs', 'mergeMs', 'recomputeMs', 'syncMaxMs', 'kernelMaxMs', 'commits', 'fallbacks', 'authority'].map(k => [k, stats(batches.map(m => m[k]))])),
          diagnostic: Object.fromEntries([...new Set(rows.flatMap(r => Object.keys(r.benchmarkStages ?? {})))].map(k => [k, stats(rows.flatMap(r => r.benchmarkStages?.[k] === undefined ? [] : [r.benchmarkStages[k]]))])),
          ...(hostStages ? {hostStages: Object.fromEntries([...new Set(rows.flatMap(r => Object.keys(r.hostStages ?? {})))].map(k => [k, stats(rows.map(r => r.hostStages[k]))]))} : {}),
          ...(decoderStages ? {decoderStages: Object.fromEntries(['timings','counts'].map(group => [group, Object.fromEntries(Object.keys(rows[0].decoderStages[group]).map(k => [k, stats(rows.map(r => r.decoderStages[group][k]))]))]))} : {}),
          ...(graphFieldAudit ? {graphFields: Object.fromEntries(Object.keys(rows[0].graphFields).map(k => [k, stats(rows.map(r => r.graphFields[k]))]))} : {}),
          invalidated: batches.filter(m => m.invalidated).length };
      }
      const hostAudit = {};
      if (hostPipeline) for (const arm of arms) {
        const world = worlds[arm], checkpoint = world.host.checkpoint();
        same(checkpoint.witness,world.latest.witness,arm+'/host-checkpoint-witness');
        if (checkpoint.tick !== warm + steps || checkpoint.entries.reduce((n, e) => n + (e.kind === 'step' ? e.count : 0), 0) !== warm + steps) throw Error('Host journal lost committed steps');
        if (world.decoder.retainedObjects !== world.latest.frame.liveNodeCount) throw Error('Host retained display count differs');
        hostAudit[arm] = {status:world.host.status,pendingTransactions:world.host.pendingTransactions,tick:checkpoint.tick,journalEntries:checkpoint.entries.length,epoch:world.host.epoch,sequence:world.latest.sequence};
      }
      return { ...(nativeCloneScreen ? {nativeCloneScreen: {checks:nativeCloneChecks,samples:nativeCloneSamples,scope:'Optimistic same-realm full display clone, starting after production projection/decoding. Includes source table, native copy, whole graph validation and audited prototype/freeze revival. Excludes IPC, source projection, cross-frame identity and immutable registry branding. Diagnostic, not a production alternative or A/B speedup.'}} : {}), ...(hostPipeline ? {hostAudit} : {}), environment: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, crossOriginIsolated, sharedArrayBuffer: typeof SharedArrayBuffer },
        count, hull, enemyHull, warm, steps, compared, checkpoints, summary, samples, ...(hostileAudit ? { hostileQueryAudit: { ...Object.fromEntries(arms.map(arm => [arm,worlds[arm].latest.benchmarkHostileQueries])), ...(hostileRestore ? { restore: hostileRestore } : {}) } } : {}), ...(fleetDistanceAudit ? { fleetDistanceAudit: { ...Object.fromEntries(arms.map(arm => [arm,worlds[arm].latest.benchmarkFleetDistances])), ...(fleetDistanceRestore ? { restore: fleetDistanceRestore } : {}) } } : {}), ...(preAimAudit ? { preAimAudit: Object.fromEntries(arms.map(arm => [arm,worlds[arm].latest.benchmarkPreAim])) } : {}), ...(navigationAudit ? { navigationAudit: Object.fromEntries(arms.map(arm => [arm,worlds[arm].latest.benchmarkNavigation])) } : {}), ...(queryAudit ? { fireQueryAudit } : {}), ...(decode ? { decodedComparisons, decodedNodes } : {}) };
    } finally { for (const world of Object.values(worlds)) { if (world.dispose) world.dispose(); else world.worker.terminate(); } }
  }, { arms, armOrderCycle, count, steps, warm, hull, enemyHull, baseline: !!baseline, profileArm, decode, queryAudit, navigationAudit, preAimAudit, fleetDistanceAudit, hostileAudit, serialPair, hostPipeline, hostStages, decoderStages, graphFieldAudit, presentationCodecPair, nativeCloneScreen });
  // Verify recorded execution positions, not just the intended schedule. An
  // incomplete six-tick window is allowed, and its exact imbalance is reported.
  const measuredPositions = Object.fromEntries(arms.map(arm => [arm, Array(arms.length).fill(0)]));
  for (const arm of arms) for (const sample of result.samples[arm]) {
    assert.equal(armOrderCycle[(sample.tick - 1) % armOrderCycle.length][sample.executionPosition], arm, 'Arm execution position differs');
    measuredPositions[arm][sample.executionPosition]++;
  }
  const expectedPositions = countArmPositions(armOrderCycle, warm, steps);
  assert.deepEqual(measuredPositions, expectedPositions, 'Measured order window differs');
  const executionOrder = { methodVersion: 2, policy: orderPolicy, cycle: armOrderCycle, measuredPositions,
    initialization: [...arms], versions: Object.fromEntries(arms.map(arm => [arm, baseline ? arm === 'after' ? 'after' : 'before' : 'current'])),
    scope: orderPolicy === 'balanced' && arms.length === 3
      ? 'Balances per-tick positions and within-tick predecessors for complete three-arm cycles; initialization/module sharing/Worker instance variance are not counterbalanced.'
      : arms.length === 2 ? 'Historical two-arm alternation; equal positions for complete cycles.'
      : 'Historical three-arm forward/reverse alternation; the before arm always occupies the middle position.' };
  const report = { executionOrder, scope: 'Real production local Worker + nested owner Workers in a fresh headless browser. Fixed dt; explicit sequential arm-order cycle (see executionOrder); includes transfer/encode/ACK, no renderer/network/pacing/input-to-photon claim. Audits are test-build-only and outside timings. wait includes sync+kernel; merge includes recompute; do not add them twice.',
    sourceGraph: freeze ?? candidate ?? baseline ?? null, candidateGraph: candidate ?? null, reverse, serialPair, ownerPair, presentationCodecPair, profileArm: profileArm ?? null, ...(heapProfile ? { heapSampling, allocationScope: 'Approximate V8 sampled allocation stacks, including objects collected by minor/major GC; not retained heap, native/GPU memory, or timing evidence. Worker audit allocations remain in the raw profile and must be classified separately.' } : {}), decode, hostPipeline, hostStages, ...(graphFieldAudit ? {graphFieldAudit: true, graphFieldScope: 'Diagnostic-only Object.is change counters. Hypothetical id/kind/count + index/tag/payload sparse rows, only if smaller. Instrumentation changes no production packet. fullRowGraphUnits includes any savings already applied by the codec; hypotheticalGraphUnits applies only the remaining potential. Numeric-unit estimate excludes side tables and buffer capacity. Not timing or memory evidence.'} : {}), ...(decoderStages ? {decoderStages: true, decoderStageScope: 'Test-build insert-only timings/counts; stage timers perturb execution. Graph sub-stages are disjoint, graphTotalMs is inclusive. visualsMs is outside applyGraph. Counts are operations, not allocation/GC bytes or speed evidence.'} : {}), ...(decode ? { decodeScope: hostPipeline ? 'Production LocalWorkerHost.step through accepted ACK/presentation copies/replay journal and promise delivery. hostPresentationMs is Host decodeMs including map/deployment/string work, not decoder.apply alone. deliveredMs includes Host input copy/queue/ACK handling, excludes rendering/network/pacing/input-to-photon. hostStages, when enabled, is instrumented diagnosis only.' : 'Production decoder.apply on the browser main thread, not rendering. deliveredMs = worker round trip plus apply, not input-to-photon. Full display graph/value/alias audits are outside timing.' } : {}), ...result };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, samples: undefined }, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
