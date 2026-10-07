import { forecastWeaponPartition, type WeaponThreatPacket } from './WeaponThreatKernel';

const scope = self as unknown as { postMessage(message: unknown, transfers?: ArrayBuffer[]): void;
  onmessage: (event: MessageEvent<{ id: number; packet?: WeaponThreatPacket; indices?: number[] }>) => void };
scope.onmessage = ({ data }) => {
  if (!data.packet) { scope.postMessage({ id: data.id, ready: true }); return; }
  try {
    const started = performance.now(), rows = forecastWeaponPartition(data.packet, data.indices!);
    scope.postMessage({ id: data.id, rows, kernelMs: performance.now() - started }, rows.map(([, values]) => values.buffer as ArrayBuffer));
  } catch (error) {
    scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
  }
};
