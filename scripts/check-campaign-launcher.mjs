import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, mkdir, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));

// Each child is our own short-lived CLI process. Never kill a discovered PID.
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
}
async function launch(args) {
  const child = spawn(process.execPath, ['scripts/serve-campaign.mjs', ...args], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const result = await new Promise((resolve, reject) => {
    let text = ''; const timer = setTimeout(() => reject(Error('CLI startup timed out')), 10000);
    child.stdout.on('data', chunk => { text += chunk.toString(); const match = text.match(/Campaign: (http:\/\/[^\s]+)\/campaign.html/); if (match) { clearTimeout(timer); resolve({ child, origin: match[1] }); } });
    child.stderr.resume(); child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); resolve({ child, code }); });
  }).catch(async error => { await stop(child); throw error; });
  return result;
}

test('campaign CLI initializes a private development save, runs, persists, reopens paused and refuses overwrite', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'campaign-cli-')), build = path.join(dir, 'build'), db = path.join(dir, 'world.sqlite'), access = path.join(dir, 'access.json');
  await mkdir(build); await writeFile(path.join(build, 'campaign.html'), '<!doctype html><title>CLI test</title>');
  const args = ['--db', db, '--access', access, '--static', build, '--port', '0']; const children = [];
  try {
    const first = await launch([...args, '--init-development', '--run']); children.push(first.child); assert.ok(first.origin);
    const beforeAccess = await readFile(access, 'utf8'), grants = JSON.parse(beforeAccess);
    const auth = { Authorization: 'Bearer ' + grants.grants[0].token };
    const read = async origin => { const response = await fetch(origin + '/campaign-api/session', { headers: auth }); assert.equal(response.status, 200); return response.json(); };
    let initial;
    for (let attempt = 0; attempt < 30; attempt++) { initial = await read(first.origin); if (initial.view.clock.tick > 0) break; await new Promise(r => setTimeout(r, 50)); }
    assert.equal(initial.simulation.status, 'running'); assert.equal(initial.development, true); assert.ok(initial.view.clock.tick > 0);
    assert.equal((await fetch(first.origin + '/access.json')).status, 404); assert.equal((await fetch(first.origin + '/world.sqlite')).status, 404);
    await stop(first.child);
    const reopened = await launch(args); children.push(reopened.child); assert.ok(reopened.origin); const saved = await read(reopened.origin);
    assert.equal(saved.simulation.status, 'stopped'); assert.ok(saved.view.clock.tick >= initial.view.clock.tick); assert.equal(saved.view.self.id, initial.view.self.id); await stop(reopened.child);
    const refused = await launch([...args, '--init-development']); children.push(refused.child); assert.equal(refused.code, 1); assert.equal(await readFile(access, 'utf8'), beforeAccess);
  } finally {
    for (const child of children) await stop(child);
    // Explicit known files only; no recursive/computed directory removal.
    for (const filename of ['world.sqlite-wal', 'world.sqlite-shm', 'world.sqlite', 'access.json']) await unlink(path.join(dir, filename)).catch(e => { if (e.code !== 'ENOENT') throw e; });
    await unlink(path.join(build, 'campaign.html')); await rmdir(build); await rmdir(dir);
  }
});

test('CLI exposes authored Corvus only as a separate paused scene and refuses a false runnable initialization', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'campaign-corvus-cli-')), build = path.join(dir, 'build'), db = path.join(dir, 'world.sqlite'), access = path.join(dir, 'access.json');
  await mkdir(build); await writeFile(path.join(build, 'campaign.html'), '<!doctype html><title>Corvus</title>');
  const args = ['--db', db, '--access', access, '--static', build, '--port', '0'], children = [];
  try {
    const refused = await launch([...args, '--init-corvus', '--run']); children.push(refused.child); assert.equal(refused.code, 1);
    await assert.rejects(readFile(db), { code: 'ENOENT' }); await assert.rejects(readFile(access), { code: 'ENOENT' });
    const first = await launch([...args, '--init-corvus']); children.push(first.child); assert.ok(first.origin);
    const grant = JSON.parse(await readFile(access, 'utf8')); const response = await fetch(first.origin + '/campaign-api/session', { headers: { Authorization: 'Bearer ' + grant.grants[0].token } });
    assert.equal(response.status, 200); const session = await response.json(); assert.equal(session.simulation.status, 'stopped'); assert.equal(session.view.worldId, 'development-corvus-authored');
    assert.equal(session.view.bodies.length, 14); assert.equal(session.view.points.length, 1); assert.equal(session.view.points[0].destinations.length, 0);
    assert.match(session.view.locations[0].navigationUnavailable, /地形/); assert.equal(session.view.locations[0].background, 'graphics/backgrounds/background2.jpg');
    assert.equal(session.view.clock.tick, 0); await stop(first.child);
    const resumed = await launch([...args, '--run']); children.push(resumed.child); assert.equal(resumed.code, 1);
  } finally {
    for (const child of children) await stop(child);
    for (const filename of ['world.sqlite-wal', 'world.sqlite-shm', 'world.sqlite', 'access.json']) await unlink(path.join(dir, filename)).catch(e => { if (e.code !== 'ENOENT') throw e; });
    await unlink(path.join(build, 'campaign.html')); await rmdir(build); await rmdir(dir);
  }
});
