import { inputsFrom, runCodecBenchmark } from './lan-float-planes-probe.mjs';
import { shuffleLanFrame } from '../../src/network/experimental/LanFloatPlanes.mjs';
self.onmessage = ({ data }) => {
  try {
    const inputs = inputsFrom(data.buffers), result = runCodecBenchmark(inputs);
    result.environment = { userAgent: navigator.userAgent, scope: 'DedicatedWorker', crossOriginIsolated: self.crossOriginIsolated };
    const bytes = shuffleLanFrame(inputs[0].baseline);
    self.postMessage({ type: 'transfer', bytes }, [bytes.buffer]);
    if (bytes.buffer.byteLength !== 0) throw Error('real Worker transfer did not detach');
    self.postMessage({ type: 'result', result: { ...result, actualPostMessageDetached: true } });
  } catch (error) { self.postMessage({ type: 'error', error: String(error.stack || error) }); }
};
