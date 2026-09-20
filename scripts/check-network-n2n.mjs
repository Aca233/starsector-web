import assert from 'node:assert/strict';
import { test } from 'node:test';
import dgram from 'node:dgram';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { queryN2n, discoverN2nPorts, N2nDiagnostics } from '../desktop/n2n-diagnostics.mjs';
import { DesktopNetworkLog } from '../desktop/network-log.mjs';

async function server(t, handler) {
  const socket = dgram.createSocket('udp4');
  await new Promise(resolve => socket.bind(0, '127.0.0.1', resolve));
  t.after(() => socket.close());
  socket.on('message', (bytes, remote) => {
    const [access, tag, command] = bytes.toString().split(' ');
    assert.equal(access, 'r'); assert.ok(['info', 'edges', 'packetstats', 'timestamps'].includes(command));
    handler({ command, tag, send: row => socket.send(JSON.stringify({ _tag: tag, ...row }), remote.port, remote.address) });
  });
  return socket.address().port;
}
const reply = (send, command, rows) => {
  send({ _type: 'begin', cmd: command });
  for (const row of rows) send({ _type: 'row', ...row });
  send({ _type: 'end', cmd: command });
};

test('n2n only permits bounded localhost read methods, never writes or subscriptions', async () => {
  for (const port of [0, -1, 65536, NaN, '6308']) await assert.rejects(queryN2n(port, 'info'));
  for (const method of ['stop', 'verbose', 'communities', 'supernodes', 'post.test', 'r x info', 'help.events']) await assert.rejects(queryN2n(6308, method));
});
test('real UDP read discards identities at ingress and retains only allowlisted counters', async t => {
  const port = await server(t, ({ command, send }) => reply(send, command, command === 'edges'
    ? [{ mode: 'pSp', community: 'secret-key', ip4addr: 'secret-ip', macaddr: 'secret-mac' }, { mode: 'p2p' }]
    : command === 'info' ? [{ version: 'iris', community: 'secret-key' }]
    : command === 'timestamps' ? [{ start_time: 10, desc: 'secret-name' }]
    : [{ type: 'p2p', tx_pkt: 1, rx_pkt: 2, sockaddr: 'secret-ip' }]));
  assert.deepEqual(await queryN2n(port, 'edges'), [{ mode: 'relay' }, { mode: 'p2p' }]);
  assert.deepEqual(await queryN2n(port, 'packetstats'), [{ type: 'p2p', tx: 1, rx: 2 }]);
  assert.deepEqual(await queryN2n(port, 'info'), [{ supported: true }]);
  assert.deepEqual(await queryN2n(port, 'timestamps'), [{ startedAt: 10 }]);
});
test('partial/malformed/wrong-tag/missing-begin replies are unavailable, not zero counters', async t => {
  const port = await server(t, ({ command, send }) => {
    if (command === 'info') send({ _type: 'row', version: 'iris' });
    if (command === 'edges') send({ _type: 'begin', cmd: command });
    if (command === 'timestamps') send({ _tag: 'other', _type: 'end' });
    if (command === 'packetstats') send({ _type: 'error', error: 'badauth' });
  });
  for (const command of ['info', 'edges', 'packetstats', 'timestamps']) assert.equal(await queryN2n(port, command, { timeoutMs: 50 }), null);
});
test('oversized or >128-row replies fail closed with bounded retention', async t => {
  const port = await server(t, ({ command, send }) => {
    send({ _type: 'begin', cmd: command });
    if (command === 'info') for (let i = 0; i < 3; i++) send({ _type: 'row', value: 'x'.repeat(30000) });
    else for (let i = 0; i < 129; i++) send({ _type: 'row', mode: 'p2p' });
    send({ _type: 'end' });
  });
  assert.equal(await queryN2n(port, 'info'), null);
  assert.equal(await queryN2n(port, 'edges'), null);
});
test('abort cancels an outstanding query; aborted calls send nothing', async t => {
  let calls = 0; const port = await server(t, () => { calls++; });
  const controller = new AbortController();
  const pending = queryN2n(port, 'info', { signal: controller.signal });
  await new Promise(resolve => setTimeout(resolve, 20)); controller.abort();
  assert.equal(await pending, null); assert.equal(calls, 1);
  assert.equal(await queryN2n(port, 'info', { signal: controller.signal }), null); assert.equal(calls, 1);
});
test('Windows discovery is hidden, bounded, process-owned loopback only; no command lines or credentials', async () => {
  const execute = (file, args, options, callback) => {
    assert.equal(file, 'powershell.exe'); assert.equal(options.windowsHide, true);
    assert.equal(options.timeout, 3000); assert.equal(options.maxBuffer, 8192);
    const source = args.join(' '); assert.match(source, /Get-Process -Name edge/); assert.match(source, /OwningProcess/);
    assert.match(source, /127\.0\.0\.1/); assert.doesNotMatch(source, /CommandLine|Start-Process|Remove-|Set-Net|Invoke-Expression/);
    callback(null, '[6308,6308,0,65536,"secret",6309,6310,6311]');
  };
  assert.deepEqual(await discoverN2nPorts({ platform: 'win32', execute }), [6308, 6309, 6310]);
  assert.deepEqual(await discoverN2nPorts({ platform: 'linux', execute: () => assert.fail() }), []);
  assert.equal(await discoverN2nPorts({ platform: 'win32', execute: (_f, _a, _o, cb) => cb(Error('denied')) }), null);
});
function fixture() {
  let now = 0, discoveries = 0, start = 100, p2p = 0, relay = 100, failed = false, peerMode = 'relay';
  const sampler = new N2nDiagnostics({ now: () => now, discover: async () => { discoveries++; return [6308]; },
    query: async (_port, command) => failed ? null : command === 'info' ? [{ supported: true }]
      : command === 'edges' ? [{ mode: peerMode }]
      : command === 'timestamps' ? [{ startedAt: start }]
      : [{ type: 'p2p', tx: p2p, rx: p2p }, { type: 'super', tx: relay, rx: relay }] });
  return { sampler, advance: ms => now += ms, counts: (p, r) => { p2p = p; relay = r; },
    restart: () => start++, fail: value => failed = value, mode: value => peerMode = value, discoveries: () => discoveries };
}
test('observed interval route is distinct from peer status and lifetime counters', async () => {
  const f = fixture(); let row = (await f.sampler.sample()).tunnels[0];
  assert.equal(row.trafficRoute, 'unknown'); assert.equal(row.delta, null); assert.equal(row.peerRelay, 1);
  f.advance(10000); f.counts(0, 150); row = (await f.sampler.sample()).tunnels[0];
  assert.equal(row.trafficRoute, 'relay'); assert.equal(row.intervalMs, 10000); assert.equal(row.delta.relayTx, 50);
  f.advance(10000); f.counts(10, 150); row = (await f.sampler.sample()).tunnels[0]; assert.equal(row.trafficRoute, 'p2p');
  f.advance(10000); f.counts(20, 180); row = (await f.sampler.sample()).tunnels[0]; assert.equal(row.trafficRoute, 'mixed');
  f.advance(10000); row = (await f.sampler.sample()).tunnels[0]; assert.equal(row.trafficRoute, 'idle');
  assert.equal(row.peerRelay, 1, 'do not infer per-game route from whole-tunnel counters');
  assert.equal(f.discoveries(), 1); f.advance(21000); await f.sampler.sample(); assert.equal(f.discoveries(), 2);
});
test('restart, wrap, stale, rollback, or failed read cannot manufacture a traffic rate', async () => {
  const f = fixture(); await f.sampler.sample();
  for (const prepare of [() => f.restart(), () => f.counts(0, 0), () => f.advance(40000), () => f.advance(-20000)]) {
    f.advance(10000); prepare(); const row = (await f.sampler.sample()).tunnels[0]; assert.equal(row.delta, null); assert.equal(row.trafficRoute, 'unknown');
  }
  f.fail(true); f.advance(10000); assert.equal((await f.sampler.sample()).status, 'unavailable');
  f.fail(false); f.advance(10000); assert.equal((await f.sampler.sample()).tunnels[0].delta, null);
  f.sampler.close(); assert.equal(await f.sampler.sample(), null);
});
test('unknown/non-n2n/empty ports fail gracefully; no secret-shaped error is returned', async () => {
  for (const [ports, status] of [[[], 'not-detected'], [null, 'unavailable'], [[6308], 'unavailable']]) {
    const sampler = new N2nDiagnostics({ discover: async () => ports, query: async () => null });
    assert.deepEqual(await sampler.sample(), { status, tunnels: [] }); sampler.close();
  }
  const sampler = new N2nDiagnostics({ discover: async () => { throw Error('secret'); } });
  assert.deepEqual(await sampler.sample(), { status: 'unavailable', tunnels: [] });
});
test('concurrent polling and shutdown do not overlap or leak stale data', async () => {
  let finish; const sampler = new N2nDiagnostics({ discover: () => new Promise(resolve => { finish = resolve; }) });
  const pending = sampler.sample(); assert.equal(await sampler.sample(), null);
  sampler.close(); finish([6308]); assert.equal(await pending, null);
});
test('duplicate/missing/negative counters do not create a successful sample', async () => {
  for (const counters of [[], [{ type: 'p2p', tx: -1, rx: 0 }], [{ type: 'p2p', tx: 0, rx: 0 }, { type: 'p2p', tx: 0, rx: 0 }, { type: 'super', tx: 0, rx: 0 }]]) {
    const sampler = new N2nDiagnostics({ discover: async () => [1], query: async (_port, cmd) => cmd === 'info' ? [{ supported: true }]
      : cmd === 'edges' ? [] : cmd === 'timestamps' ? [{ startedAt: 1 }] : counters });
    assert.equal((await sampler.sample()).status, 'unavailable'); sampler.close();
  }
});
test('session log retains tunnel evidence but strips arbitrary fields and all identities', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'network-n2n-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('network-n2n-'));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const log = new DesktopNetworkLog(path.join(dir, 'session.jsonl')); log.start();
  assert.equal(log.event('n2n-sample', { mode: 'lan', status: 'available', community: 'secret',
    tunnels: [{ trafficRoute: 'relay', peerRelay: 1, intervalMs: 10000, ip: 'secret',
      totals: { p2pTx: 0, p2pRx: 0, relayTx: 120, relayRx: 123, name: 'secret' }, delta: { p2pTx: 0, p2pRx: 0, relayTx: 10, relayRx: 12 } }] }), true);
  await log.close('test'); const text = await fs.readFile(log.file, 'utf8'); assert.doesNotMatch(text, /secret|community|"ip"/);
  const row = text.trim().split('\n').map(JSON.parse).find(row => row.event === 'n2n-sample');
  assert.equal(row.tunnels[0].trafficRoute, 'relay'); assert.equal(row.tunnels[0].delta.relayTx, 10);
});
