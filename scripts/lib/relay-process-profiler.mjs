// Diagnostics only. Profiles this fixture process (relay + Playwright harness),
// not a desktop game or an external process; no listening inspector is opened.
import { Session } from 'node:inspector';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

export async function startRelayProcessProfile() {
  const session = new Session();
  const delay = monitorEventLoopDelay({ resolution: 10 });
  let timer, closed = false;
  const pending = new Map();
  const command = method => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(timeout);
      reject(Error('Relay profiler command timed out: ' + method));
    }, 10000);
    pending.set(timeout, reject);
    session.post(method, (error, result) => {
      if (!pending.delete(timeout)) return;
      clearTimeout(timeout);
      if (error) reject(error); else resolve(result);
    });
  });
  const close = () => {
    clearInterval(timer);
    delay.disable();
    for (const [timeout, reject] of pending) {
      clearTimeout(timeout);
      reject(Error('Relay profiler closed'));
    }
    pending.clear();
    session.disconnect();
  };
  let started, lastAt, lastCpu, lastLoop;
  const samples = [];
  const collect = () => {
    const at = Date.now(), cpu = process.cpuUsage(), loop = performance.eventLoopUtilization();
    const utilization = performance.eventLoopUtilization(loop, lastLoop);
    samples.push({ at, elapsedMs: at - lastAt,
      cpuUserMs: (cpu.user - lastCpu.user) / 1000,
      cpuSystemMs: (cpu.system - lastCpu.system) / 1000,
      eventLoop: utilization,
      // Histogram resolution is 10ms: these are scheduler-delay samples,
      // NOT request latency or per-packet service time.
      delay: { count: delay.count, meanMs: delay.count ? delay.mean / 1e6 : null,
        p95Ms: delay.count ? delay.percentile(95) / 1e6 : null,
        maxMs: delay.count ? delay.max / 1e6 : null },
    });
    lastAt = at; lastCpu = cpu; lastLoop = loop; delay.reset();
  };
  try {
    session.connect();
    await command('Profiler.enable');
    await command('Profiler.start');
    started = lastAt = Date.now();
    lastCpu = process.cpuUsage(); lastLoop = performance.eventLoopUtilization();
    delay.enable();
    timer = setInterval(collect, 1000); timer.unref();
  } catch (error) { close(); throw error; }
  return { async stop() {
    if (closed) return null;
    closed = true;
    clearInterval(timer); collect();
    const ended = Date.now();
    try {
      const { profile } = await command('Profiler.stop');
      return { profile, metrics: { started, ended, samples,
        scope: 'Same Node process: LAN relay plus Playwright harness. CPU profile overhead present; not a performance A/B or raw packet latency measurement.' } };
    } finally { close(); }
  } };
}
