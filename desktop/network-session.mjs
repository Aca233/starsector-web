import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isGameUrl } from './policy.mjs';

export function networkSessionPath(directory, date = new Date(), id = randomUUID()) {
  return path.join(directory, 'network-logs', 'network-session-' + date.toISOString().replace(/[:.]/g, '-') + '-' + id + '.jsonl');
}

// Only our generated basename can survive the mandatory Steam overlay relaunch.
// Never accept an arbitrary path from a page, URL or command-line handoff.
export function resumeNetworkSessionPath(directory, args) {
  const name = args.find(arg => arg.startsWith('--network-log-session='))?.slice('--network-log-session='.length);
  return typeof name === 'string' && /^network-session-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jsonl$/.test(name)
    ? path.join(directory, 'network-logs', name) : null;
}

/** Reuse the existing renderer download button without exposing filesystem IPC. */
export function attachNetworkSessionDownloads(contents, gameSession, origin, exportLog) {
  const receive = (event, item, source) => {
    if (source !== contents || !isGameUrl(contents.getURL(), origin)) return;
    if (!item.getURL().startsWith('blob:' + origin + '/')
      || !/^network-performance-[0-9TZ.-]+\.jsonl$/.test(item.getFilename())) return;
    event.preventDefault();
    void exportLog();
  };
  gameSession.on('will-download', receive);
  return () => gameSession.off('will-download', receive);
}

const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
/** No PID, process names, URLs or user paths are persisted. Electron memory units are KiB. */
export function desktopProcessMetrics(metrics, { mainPid, rendererPid, backendPid, cpuSampledPids }) {
  const pick = item => item ? {
    cpuPercent: cpuSampledPids && !cpuSampledPids.has(item.pid) ? null : finite(item.cpu?.percentCPUUsage),
    workingSetBytes: finite(item.memory?.workingSetSize) === null ? null : item.memory.workingSetSize * 1024,
    privateBytes: finite(item.memory?.privateBytes) === null ? null : item.memory.privateBytes * 1024,
  } : null;
  const byPid = pid => Number.isInteger(pid) && pid > 0 ? metrics.find(item => item.pid === pid) : null;
  return { main: pick(byPid(mainPid)), renderer: pick(byPid(rendererPid)), backend: pick(byPid(backendPid)),
    gpu: pick(metrics.find(item => item.type === 'GPU')) };
}
