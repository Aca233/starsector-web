export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.floor(bytes)} B`;
  const divisor = bytes < 1024 ** 2 ? 1024 : 1024 ** 2;
  return `${(bytes / divisor).toFixed(1)} ${divisor === 1024 ? 'KiB' : 'MiB'}`;
}
export function progressText(progress) {
  const { total, transferred, bytesPerSecond } = progress;
  const percent = total > 0 ? Math.min(100, Math.max(0, Math.floor(transferred / total * 100))) : 0;
  const seconds = bytesPerSecond > 0 ? Math.ceil(Math.max(0, total - transferred) / bytesPerSecond) : null;
  const remaining = seconds === null ? '估算中' : seconds >= 60 ? `${Math.floor(seconds / 60)}分${seconds % 60}秒` : `${seconds}秒`;
  return `${percent}% · ${formatBytes(bytesPerSecond)}/s · 剩余${remaining}`;
}
