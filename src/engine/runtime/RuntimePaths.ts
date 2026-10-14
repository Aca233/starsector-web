declare const __WEBP_ASSET_MAP__: Readonly<Record<string, string>>;
const optimizedAssets: Readonly<Record<string, string>> = typeof __WEBP_ASSET_MAP__ === 'undefined' ? {} : __WEBP_ASSET_MAP__;
const mountedAssets = new Map<string, string>();
/** Called only during startup or a reversible installation preflight. */
export function mountRuntimeAssets(entries: readonly [string, string][]): () => void {
  const previous = entries.map(([path]) => [path, mountedAssets.get(path)] as const);
  for (const [path, url] of entries) mountedAssets.set(path, url);
  return () => { for (const [path, url] of previous) if (url === undefined) mountedAssets.delete(path); else mountedAssets.set(path, url); };
}

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
  const mounted = mountedAssets.get(clean);
  if (mounted) return mounted;
  return runtimeUrl(`game-assets/${runtimeAssetPath(clean)}`);
}

const workerAssetParameter = 'starsector-runtime-assets';
function sameOriginAssetBase(value: string): URL {
  const base = new URL(value);
  if (!/^https?:$/.test(base.protocol) || base.origin !== location.origin || base.username || base.password
    || base.search || base.hash || !base.pathname.endsWith('/')) throw Error('Invalid combat Worker asset base');
  return base;
}

/** Keep the static Worker URL recognizable to Vite; dev already adds its own query. */
export const runtimeWorkerAssetQuery = typeof document === 'undefined' ? ''
  : `${import.meta.env.DEV ? '&' : '?'}${workerAssetParameter}=${encodeURIComponent(
    sameOriginAssetBase(new URL(runtimeAssetUrl(''), document.baseURI).href).href)}`;

/** Deployment location is transport metadata, never combat or replay state. */
export function runtimeWorkerAssetUrl(resource: string): string {
  let base: URL | undefined;
  if (typeof document !== 'undefined') base = sameOriginAssetBase(new URL(runtimeAssetUrl(''), document.baseURI).href);
  else if (typeof location !== 'undefined') {
    const value = new URL(location.href).searchParams.get(workerAssetParameter);
    if (value !== null) base = sameOriginAssetBase(value);
  }
  // Node's local fetch shim and legacy direct Workers retain their root paths.
  return base ? new URL(runtimeAssetPath(resource), base).href : `/game-assets/${runtimeAssetPath(resource)}`;
}
