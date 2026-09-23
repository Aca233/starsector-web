// Diagnostics only: target this isolated browser's authority Worker, never a user browser.
import assert from 'node:assert/strict';
export async function startHostWorkerProfile(browser) {
  const cdp = await browser.newBrowserCDPSession();
  const pending = new Map();
  let sessionId, id = 0, stopped = false;
  const close = async () => {
    if (sessionId) await cdp.send('Target.detachFromTarget', {sessionId}).catch(() => {});
    await cdp.detach().catch(() => {});
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('Profiler closed')); }
    pending.clear();
  };
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error('Profiler command timed out: ' + method)); }, 10000);
    pending.set(n, {resolve, reject, timer});
    cdp.send('Target.sendMessageToTarget', {sessionId, message: JSON.stringify({id:n, method, params})})
      .catch(error => { pending.delete(n); clearTimeout(timer); reject(error); });
  });
  try {
    const {targetInfos} = await cdp.send('Target.getTargets');
    const targets = targetInfos.filter(t => t.type === 'worker' && /host\.worker/.test(t.url));
    assert.equal(targets.length, 1, 'exactly one authority Worker in the isolated browser');
    ({sessionId} = await cdp.send('Target.attachToTarget', {targetId:targets[0].targetId, flatten:false}));
    cdp.on('Target.receivedMessageFromTarget', event => {
      if (event.sessionId !== sessionId) return;
      const message = JSON.parse(event.message), p = pending.get(message.id);
      if (!p) return;
      pending.delete(message.id); clearTimeout(p.timer);
      if (message.error) p.reject(Error(JSON.stringify(message.error))); else p.resolve(message.result);
    });
    await command('Profiler.enable');
    await command('Profiler.start');
  } catch (error) { await close(); throw error; }
  return {async stop() {
    if (stopped) return null;
    stopped = true;
    try { const {profile} = await command('Profiler.stop'); return profile; }
    finally { await close(); }
  }};
}
