import { CONTENT_REPOSITORY } from './content-manifest.mjs';

const HOSTS = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com']);
export const CONTENT_LATEST = `https://github.com/${CONTENT_REPOSITORY}/releases/latest/download/desktop-content.json`;
export const contentUrl = manifest => `https://github.com/${CONTENT_REPOSITORY}/releases/download/v${manifest.version}/${manifest.asset}`;
function trusted(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname) || url.username || url.password || url.port) throw Error('拒绝非 GitHub HTTPS 更新地址');
  return url.href;
}
/** Bound redirects, wall time and response bytes; never accept a whole bundle as a Range response. */
export async function fetchContentBytes(url, { fetchImpl = fetch, limit, range, total, signal, onBytes = () => {}, timeout = 30000 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, timeout);
  let response;
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      response = await fetchImpl(trusted(url), { redirect: 'manual', signal: controller.signal, cache: 'no-store',
        headers: { 'Accept-Encoding': 'identity', ...(range ? { Range: `bytes=${range[0]}-${range[1]}` } : {}) } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 5) throw Error('游戏更新重定向无效');
      url = new URL(location, url).href;
    }
    if (response.status === 404 && !range) { await response.body?.cancel(); return null; }
    if (range ? response.status !== 206 || response.headers.get('content-range') !== `bytes ${range[0]}-${range[1]}/${total}`
      || ![null, 'identity'].includes(response.headers.get('content-encoding')) : !response.ok) throw Error(`游戏更新响应无效（HTTP ${response.status}）`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) throw Error('游戏更新响应超出大小限制');
      chunks.push(Buffer.from(chunk)); onBytes(size);
    }
    if (range && size !== range[1] - range[0] + 1) throw Error('游戏更新分段被截断');
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer); controller.abort(); signal?.removeEventListener('abort', abort);
    try { await response?.body?.cancel(); } catch { /* Reader already completed/aborted. */ }
  }
}
