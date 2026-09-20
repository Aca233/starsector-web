/** Optional n2n diagnostics. Local read-only management requests only; no keys,
 * IP/MAC/community names or process command lines are read into session logs.
 * Counters cover ALL tunnel traffic, not game bytes, RTT, loss or bandwidth.
 */
import dgram from 'node:dgram';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const COMMANDS = new Set(['info', 'edges', 'packetstats', 'timestamps']);
const MAX_ROWS = 128, MAX_BYTES = 64 * 1024;
const uint = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const validPort = port => Number.isInteger(port) && port > 0 && port <= 65535;

/** The caller cannot select another host or send a write/subscription command.
 * begin/end + matching tag are mandatory: partial replies remain unavailable. */
export function queryN2n(port, command, { signal, timeoutMs = 600 } = {}) {
  if (!validPort(port) || !COMMANDS.has(command)) return Promise.reject(Error('Invalid n2n read query'));
  return new Promise(resolve => {
    const socket = dgram.createSocket('udp4'), tag = randomBytes(4).toString('hex');
    let done = false, began = false, bytes = 0;
    const rows = [];
    const finish = result => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      try { socket.close(); } catch { /* Not yet bound or already closed. */ }
      resolve(result);
    };
    const abort = () => finish(null);
    const timer = setTimeout(abort, Math.max(1, Math.min(2000, timeoutMs)));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    socket.on('error', abort);
    socket.on('message', (data, remote) => {
      if (done || remote.address !== '127.0.0.1' || remote.port !== port) return;
      bytes += data.length;
      if (bytes > MAX_BYTES) { abort(); return; }
      let row;
      try { row = JSON.parse(data.toString('utf8')); } catch { abort(); return; }
      if (!row || row._tag !== tag) return;
      if (row._type === 'error') { abort(); return; }
      if (row._type === 'begin' && row.cmd === command && !began) { began = true; return; }
      if (!began) { abort(); return; }
      if (row._type === 'end') { finish(rows); return; }
      if (row._type !== 'row' || rows.length >= MAX_ROWS) { abort(); return; }
      // Discard identity fields at ingress, before any retained sampler state.
      rows.push(command === 'edges' ? { mode: row.mode === 'p2p' ? 'p2p' : row.mode === 'pSp' ? 'relay' : 'unknown' }
        : command === 'packetstats' ? { type: ['p2p', 'super', 'transop', 'super_broadcast'].includes(row.type) ? row.type : null,
          tx: uint(row.tx_pkt), rx: uint(row.rx_pkt) }
        : command === 'timestamps' ? { startedAt: uint(row.start_time) }
        : { supported: typeof row.version === 'string' && row.version.length > 0 });
    });
    socket.bind(0, '127.0.0.1', () => {
      if (!done) socket.send(`r ${tag} ${command}`, port, '127.0.0.1', error => { if (error) abort(); });
    });
  });
}

/** Discover only loopback endpoints OWNED by running edge.exe processes.
 * No subnet/port scan, no elevation, no command-line credentials, no GUI. */
export function discoverN2nPorts({ signal, platform = process.platform, execute = execFile } = {}) {
  if (platform !== 'win32' || signal?.aborted) return Promise.resolve([]);
  const script = "$ErrorActionPreference='Stop'; $ids=@(Get-Process -Name edge -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id); if($ids.Count) { @(Get-NetUDPEndpoint -LocalAddress '127.0.0.1' -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.OwningProcess } | Select-Object -First 3 -ExpandProperty LocalPort) | ConvertTo-Json -Compress } else { '[]' }";
  return new Promise(resolve => {
    execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 3000, maxBuffer: 8192, encoding: 'utf8', signal }, (error, output) => {
        if (error) { resolve(null); return; }
        try {
          const value = JSON.parse(output.trim() || '[]'), ports = Array.isArray(value) ? value : [value];
          resolve([...new Set(ports.filter(validPort))].slice(0, 3));
        } catch { resolve(null); }
      });
  });
}

export class N2nDiagnostics {
  constructor({ discover = discoverN2nPorts, query = queryN2n, now = () => performance.now() } = {}) {
    this.discover = discover; this.query = query; this.now = now;
    this.controller = new AbortController(); this.closed = false; this.busy = false;
    this.ports = []; this.nextDiscoveryAt = -Infinity; this.previous = new Map();
  }
  close() { this.closed = true; this.controller.abort(); this.previous.clear(); }
  async sample() {
    if (this.closed || this.busy) return null;
    this.busy = true;
    const signal = this.controller.signal;
    try {
      const at = this.now();
      if (at >= this.nextDiscoveryAt) {
        const ports = await this.discover({ signal });
        if (this.closed) return null;
        this.ports = Array.isArray(ports) ? ports.filter(validPort).slice(0, 3) : [];
        this.discoveryFailed = ports === null; this.nextDiscoveryAt = at + 60000;
        for (const port of this.previous.keys()) if (!this.ports.includes(port)) this.previous.delete(port);
      }
      const tunnels = [];
      for (const port of this.ports) {
        const info = await this.query(port, 'info', { signal });
        if (this.closed) return null;
        if (!info?.some(row => row.supported === true)) { this.previous.delete(port); continue; }
        const [peers, counters, timestamps] = await Promise.all(['edges', 'packetstats', 'timestamps'].map(cmd => this.query(port, cmd, { signal })));
        if (this.closed) return null;
        if (!peers || !counters || timestamps?.length !== 1 || uint(timestamps[0].startedAt) === null) {
          this.previous.delete(port); continue;
        }
        const pick = type => {
          const rows = counters.filter(row => row.type === type);
          return rows.length === 1 && uint(rows[0].tx) !== null && uint(rows[0].rx) !== null ? { tx: rows[0].tx, rx: rows[0].rx } : null;
        };
        const p2p = pick('p2p'), relay = pick('super');
        if (!p2p || !relay) { this.previous.delete(port); continue; }
        const totals = { p2pTx: p2p.tx, p2pRx: p2p.rx, relayTx: relay.tx, relayRx: relay.rx };
        const startedAt = timestamps[0].startedAt, previous = this.previous.get(port), sampledAt = this.now();
        let delta = null, intervalMs = null;
        // Counter wrap/restart and stale observations cannot fabricate huge rates.
        if (previous?.startedAt === startedAt && sampledAt > previous.at && sampledAt - previous.at <= 30000
          && Object.keys(totals).every(key => totals[key] >= previous.totals[key])) {
          intervalMs = sampledAt - previous.at;
          delta = Object.fromEntries(Object.keys(totals).map(key => [key, totals[key] - previous.totals[key]]));
        }
        this.previous.set(port, { startedAt, at: sampledAt, totals });
        const direct = delta && delta.p2pTx + delta.p2pRx > 0, relayed = delta && delta.relayTx + delta.relayRx > 0;
        tunnels.push({ peerP2p: peers.filter(row => row.mode === 'p2p').length,
          peerRelay: peers.filter(row => row.mode === 'relay').length, peerUnknown: peers.filter(row => row.mode === 'unknown').length,
          trafficRoute: !delta ? 'unknown' : direct && relayed ? 'mixed' : direct ? 'p2p' : relayed ? 'relay' : 'idle',
          intervalMs, totals, delta });
      }
      return { status: tunnels.length ? (tunnels.length === this.ports.length ? 'available' : 'partial')
        : this.ports.length || this.discoveryFailed ? 'unavailable' : 'not-detected', tunnels };
    } catch {
      this.previous.clear(); return this.closed ? null : { status: 'unavailable', tunnels: [] };
    } finally { this.busy = false; }
  }
}
