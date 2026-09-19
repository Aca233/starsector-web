import { NetworkDiagnosticBuffer } from '../../desktop/network-diagnostic-record.mjs';
import { LAN_BUILD } from './protocol';
const buffer = new NetworkDiagnosticBuffer({ sink: (line: string) => console.info(line) });
let battle = 0;
export function nextDiagnosticBattle(): number { return ++battle; }
export function recordNetworkDiagnostic(value: Record<string, unknown>): void {
  try { buffer.write({ ...value, version: 1, build: LAN_BUILD, wallTimeMs: Date.now(), monotonicMs: performance.now() }); }
  catch { /* Diagnostics may never interrupt input, rendering or reconnect. */ }
}
export function downloadNetworkDiagnostics(): void {
  const blob = new Blob([buffer.text()], { type: 'application/x-ndjson;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'network-performance-' + new Date().toISOString().replace(/[:.]/g, '-') + '.jsonl';
  document.body.append(link); link.click(); link.remove();
  // Allow Chromium/Electron time to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
