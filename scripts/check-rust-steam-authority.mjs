import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Production relay/framing and real preparation Workers with injected SDK I/O.
// No Steam client initialization, account activity, desktop or remote session.
const files = ['src/network/LanBattle.tsx', 'src/network/host.worker.ts', 'server/lan-server.mjs',
  'server/steam/gateway.mjs', 'server/steam/snapshot-prepare-broker.mjs',
  'server/steam/snapshot-prepare-state.mjs', 'server/steam/packet-codec.mjs',
  'server/steam/binary-snapshot.mjs', 'server/steam/state-consumption.mjs',
  'scripts/check-steam-binary-host.mjs', 'scripts/check-steam-binary-gateway.mjs',
  'scripts/check-steam-snapshot-prepare.mjs'];
const hash = data => createHash('sha256').update(data).digest('hex');
const fingerprints = Object.fromEntries(await Promise.all(files.map(async file => [file, hash(await fs.readFile(file))])));
const output = path.resolve('artifacts/rust-combat-core-20261008/verification-steam-authority');
await fs.mkdir(output, { recursive: true });
const tests = spawnSync(process.execPath, ['--test', ...files.filter(file => file.startsWith('scripts/check-steam-'))],
  { encoding: 'utf8', windowsHide: true, timeout: 30000 });
await fs.writeFile(path.join(output, 'contracts.log'), tests.stdout + tests.stderr);
const changed = [];
for (const [file, sha] of Object.entries(fingerprints)) if (hash(await fs.readFile(file)) !== sha) changed.push(file);
const result = { passed: tests.status === 0 && !changed.length && !tests.error,
  actualProductionRelay: true, actualPreparationWorkers: true, injectedSteamSdkIO: true,
  steamSdkInitialized: false, actualRemoteSteamSession: false, gameplaySolverExecuted: false,
  sourceFingerprints: fingerprints, changed, exitCode: tests.status, error: tests.error?.message,
  scope: 'Existing binary/full/delta/credit/ACK/nonce/reconnect contracts plus actual relay backend binding and admitted terminal state FIFO; no claim of remote Steam or final Rust gameplay qualification' };
await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, sourceFingerprints: undefined }, null, 2));
if (!result.passed) process.exitCode = 1;
