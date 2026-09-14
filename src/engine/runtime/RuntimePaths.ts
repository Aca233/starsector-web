const rawBase = (import.meta.env.BASE_URL || './').trim();

function normalizeBase(base: string): string {
  if (!base || base === '.' || base === './') return './';
  const leading = base.startsWith('/') ? base : `/${base}`;
  return leading.endsWith('/') ? leading : `${leading}/`;
}

/** Vite deployment base used by every public runtime resource. */
export const runtimeBaseUrl = normalizeBase(rawBase);

export function runtimeUrl(path: string): string {
  const value = path.trim();
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
  const clean = value.replace(/^\.\//, '').replace(/^\/+/, '');
  return `${runtimeBaseUrl}${clean}`;
}

export function runtimeAssetUrl(resource: string): string {
  const value = resource.trim().replace(/\\/g, '/');
  const resolvedRoot = runtimeUrl('game-assets/');
  if (value.startsWith(resolvedRoot)) return value;

  let clean = value.replace(/^\.\//, '').replace(/^\/+/, '');
  if (clean.startsWith('game-assets/')) clean = clean.slice('game-assets/'.length);
  return runtimeUrl(`game-assets/${clean}`);
}

