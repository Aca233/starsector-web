import { isGameUrl } from './policy.mjs';
import fs from 'node:fs/promises';
import { parseNetworkConsole, MAX_RECORD_BYTES } from './network-diagnostic-record.mjs';
/** Bounded async writes, no per-sample synchronous filesystem operations. */
export class DesktopNetworkLog {
  constructor(file, { maxBytes = 4 * 1024 * 1024, maxPending = 32, now = () => performance.now(), io = fs } = {}) {
    this.file = file; this.maxBytes = maxBytes; this.maxPending = maxPending; this.now = now; this.io = io;
    this.pending = 0; this.dropped = 0; this.tail = Promise.resolve(); this.size = null;
    this.windowAt = -Infinity; this.windowCount = 0;
  }
  accept(message, trusted) {
    if (!trusted || this.pending >= this.maxPending) { if (trusted) this.dropped++; return false; }
    const now = this.now();
    if (now - this.windowAt >= 1000 || now < this.windowAt) { this.windowAt = now; this.windowCount = 0; }
    if (this.windowCount >= 12) { this.dropped++; return false; }
    const record = parseNetworkConsole(message);
    if (!record) return false;
    const line = JSON.stringify({ ...record, desktopReceivedAtMs: Date.now(), desktopDropped: this.dropped }) + '\n';
    const bytes = Buffer.byteLength(line);
    if (bytes > MAX_RECORD_BYTES + 256) return false;
    this.windowCount++; this.pending++;
    this.tail = this.tail.then(async () => {
      if (this.size === null) {
        try { this.size = (await this.io.stat(this.file)).size; }
        catch (error) { if (error.code !== 'ENOENT') throw error; this.size = 0; }
      }
      if (this.size + bytes > this.maxBytes) {
        await this.io.rename(this.file, this.file + '.previous').catch(error => { if (error.code !== 'ENOENT') throw error; });
        this.size = 0;
      }
      await this.io.appendFile(this.file, line); this.size += bytes;
    }).catch(() => { this.size = null; this.dropped++; }).finally(() => { this.pending--; });
    return true;
  }
  flush() { return this.tail; }
}

/** Only the app's own main frame can feed the local performance log. */
export function attachDesktopNetworkLog(contents, origin, log) {
  const receive = details => {
    let localSource = false;
    try { localSource = new URL(details.sourceId).origin === origin; } catch { /* no anonymous/eval/extension logs */ }
    // Electron can attribute a srcdoc console event to the main frame. Require
    // a local script source as well; the game's Vite bundle has such a URL.
    log.accept(details.message, localSource && details.frame === contents.mainFrame && isGameUrl(contents.getURL(), origin));
  };
  contents.on('console-message', receive);
  return () => contents.off('console-message', receive);
}
