// Browser-only adapter for benchmark-real-workers. No production host replacement.
export async function createHostWorld(version, arm, config) {
  // A distinct entry-module URL gives each independent world its own first epoch.
  const {LocalWorkerHost} = await import('/' + version + '/local-host.js?arm=' + arm);
  globalThis.benchmarkHostArm = arm;
  const started = performance.now(), host = new LocalWorkerHost(config);
  const worker = host.worker;
  const world = {host, worker, decoder: host.decoder, lastBatch: 0, latest: null};
  let response, receivedAt, audit;
  const productionHandler = worker.onmessage;
  const observe = event => {
    const data = event.data;
    if (data?.kind === 'benchmark-audit' || audit && data?.kind === 'failed') {
      // Only the read-only, out-of-band TEST oracle is hidden from receive().
      // All real ACKs/errors continue into the unchanged production handler.
      const pending = audit;audit = undefined;
      if (!pending) throw Error(arm + ': unsolicited benchmark audit');
      clearTimeout(pending.timer);
      if (data.kind === 'failed') pending.reject(Error(data.message));else pending.resolve({data});
      return;
    }
    if (data?.kind === 'ack') {response = data;receivedAt = performance.now();}
    return productionHandler.call(worker, event);
  };
  // A second Worker listener can run after promise continuations of the first.
  // Observe before forwarding into the original handler, preserving its receiver.
  worker.onmessage = observe;
  const settle = async (promise, start) => {
    const accepted = await promise, ended = performance.now();
    if (!response || accepted.sequence !== response.sequence || host.status !== 'ready') throw Error(arm + ': production Host did not accept the ACK');
    if (host.pendingTransactions) throw Error(arm + ': Host queue not drained');
    world.presentation = accepted.presentation;
    return {data: response, roundTripMs: receivedAt - start, hostDeliveryMs: ended - start,
      hostPresentationMs: accepted.decodeMs, hostStages: host.benchmarkHostStages, decoderStages: host.decoder.benchmarkDecoderStages};
  };
  world.call = (kind, fields = {}) => {
    if (kind === 'benchmark-audit') return new Promise((resolve, reject) => {
      if (audit || host.pendingTransactions) {reject(Error('Host audit requires an idle transaction boundary'));return;}
      const timer = setTimeout(() => {audit = undefined;reject(Error(arm + ': audit timed out'));}, 60000);
      audit = {resolve,reject,timer};worker.postMessage({kind});
    });
    const start = performance.now();
    if (kind !== 'step') throw Error('Unsupported host benchmark operation: ' + kind);
    return settle(host.step(fields.sample), start);
  };
  world.dispose = () => {
    if (audit) {clearTimeout(audit.timer);audit.reject(Error('Host benchmark disposed'));audit = undefined;}
    worker.onmessage = productionHandler;host.dispose();
  };
  try {
    const init = await settle(host.ready, started);
    if (host.epoch !== 1) throw Error('Independent benchmark Host did not start at epoch 1');
    return {world,init};
  } catch (error) {world.dispose();throw error;}
}
