import { WebSocket, WebSocketServer } from 'ws';
import { lanClientCompression } from './lan-websocket.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };

const PATH = '/desktop/lan/ws';
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
/** Keep remote code out of Electron: only an explicitly selected game's WebSocket
 * crosses this loopback-only bridge. No remote HTML, files, cookies or general IPC. */
export class DesktopLanBridge {
  constructor(port) {
    this.origin = 'http://127.0.0.1:' + port;
    this.pairs = new Set(); this.closed = false;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: protocol.maxSnapshotBytes, perMessageDeflate: false });
    this.extension = {
      http: (req, res) => {
        if (req.url !== '/desktop/lan/info') return false;
        const allowed = this.localRequest(req) && req.method === 'GET';
        res.writeHead(allowed ? 200 : 403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(allowed ? { available: true, defaultPort: 32110 } : { error: '仅限本机桌面连接' }));
        return true;
      },
      isUpgrade: value => { try { return new URL(value, this.origin).pathname === PATH; } catch { return false; } },
      upgrade: (req, socket, head) => this.upgrade(req, socket, head),
    };
  }
  localRequest(req) {
    return loopback(req.socket.remoteAddress) && req.headers.host === new URL(this.origin).host;
  }
  upgrade(req, socket, head) {
    if (this.closed || !this.localRequest(req) || req.headers.origin !== this.origin || this.pairs.size >= 4) throw Error('本机连接不可用');
    const target = new URL(new URL(req.url, this.origin).searchParams.get('target'));
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password
      || target.pathname !== '/' || target.search || target.hash) throw Error('无效的房主地址');
    const remoteUrl = new URL('/lan/ws', target);
    remoteUrl.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
    this.wss.handleUpgrade(req, socket, head, local => {
      // A reconnect opens a new transport; the app's existing resume token and
      // protocol handshake still belong to the remote authority, not this proxy.
      const remote = new WebSocket(remoteUrl, { origin: target.origin, handshakeTimeout: 5000,
        followRedirects: false, ...lanClientCompression(), maxPayload: protocol.maxSnapshotBytes });
      const pair = { local, remote }; this.pairs.add(pair);
      let ended = false, pendingBytes = 0;
      const pending = [];
      const release = () => {
        if (local.readyState !== WebSocket.CLOSED || remote.readyState !== WebSocket.CLOSED) return;
        clearTimeout(pair.timer); this.pairs.delete(pair);
      };
      pair.terminate = () => {
        ended = true; pending.length = 0; pendingBytes = 0; clearTimeout(pair.timer);
        local.terminate(); remote.terminate(); release();
      };
      const close = (code = 1013, reason = '与房主连接中断，正在重连') => {
        if (ended) return;
        ended = true; pending.length = 0; pendingBytes = 0;
        // Closing is still a live allocation and counts against capacity. A peer
        // that stops reading must not retain sockets/buffers for ws's 30s timeout.
        pair.timer = setTimeout(pair.terminate, 1000); pair.timer.unref();
        for (const ws of [local, remote]) {
          if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
          else if (ws.readyState === WebSocket.OPEN) ws.close(code, reason);
        }
      };
      const forward = (ws, data, binary) => {
        if (ended) return;
        if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount + data.length > protocol.maxSnapshotBytes * 2) { close(); return; }
        ws.send(data, { binary }, error => { if (error) close(); });
      };
      local.on('message', (data, binary) => {
        if (remote.readyState === WebSocket.CONNECTING) {
          // Usually only hello. Never build an unbounded input queue during a dial.
          if (pendingBytes + data.length > 65536 || pending.length >= 8) { close(); return; }
          pending.push({ data, binary }); pendingBytes += data.length;
        } else forward(remote, data, binary);
      });
      remote.on('open', () => {
        if (ended) { remote.close(); return; }
        for (const item of pending) forward(remote, item.data, item.binary);
        pending.length = 0; pendingBytes = 0;
      });
      remote.on('message', (data, binary) => forward(local, data, binary));
      const onClose = (code, reason) => close(code === 1000 || (code >= 3000 && code <= 4999) || [1008, 1009, 1012, 1013].includes(code) ? code : 1013,
        reason.length <= 123 ? reason.toString() : '与房主连接中断');
      local.on('close', (code, reason) => { onClose(code, reason); release(); });
      remote.on('close', (code, reason) => { onClose(code, reason); release(); });
      local.on('error', () => close()); remote.on('error', () => close());
    });
  }
  close() {
    this.closed = true;
    for (const pair of this.pairs) pair.terminate();
    this.pairs.clear(); this.wss.close();
  }
}
