declare const __WEBP_ASSET_MAP__: Readonly<Record<string, string>>;
const optimizedAssets: Readonly<Record<string, string>> = typeof __WEBP_ASSET_MAP__ === 'undefined' ? {} : __WEBP_ASSET_MAP__;

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

/** Physical path mapping only; gameplay/catalog IDs keep their original paths. */
export function runtimeAssetPath(resource: string): string {
  const suffixAt = resource.search(/[?#]/);
  const file = suffixAt < 0 ? resource : resource.slice(0, suffixAt);
  const suffix = suffixAt < 0 ? '' : resource.slice(suffixAt);
  return (optimizedAssets[file] ?? file) + suffix;
}

export function runtimeAssetUrl(resource: string): string {
  const value = resource.trim().replace(/\\/g, '/');
  if (/^(?:https?:|data:|blob:)/i.test(value) || value.startsWith('//')) return value;
  const resolvedRoot = runtimeUrl('game-assets/');
  let clean = value.startsWith(resolvedRoot) ? value.slice(resolvedRoot.length)
    : value.replace(/^\.\//, '').replace(/^\/+/, '');
  if (clean.startsWith('game-assets/')) clean = clean.slice('game-assets/'.length);
  return runtimeUrl(`game-assets/${runtimeAssetPath(clean)}`);
}
