import fs from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function fileSha512(file) {
  const hash = createHash('sha512');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('base64');
}

/** Bounded HTTP ranges; the original updater still owns signature verification and install. */
export async function downloadRanges(url, destination, options, { fetch, size, now = Date.now,
  chunkSize = 8 * 1024 ** 2, concurrency = 4, idleMs = 30_000 } = {}) {
  const token = options.cancellationToken;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  token?.onCancel(cancel);
  const counts = new Map();
  const started = now();
  let lastAt = started, lastBytes = 0, handle, next = 1, firstError;
  const initialSize = Math.min(size, chunkSize, 256 * 1024);
  const cancelled = () => {
    if (token?.cancelled) { const error = Error('cancelled'); error.code = 'ERR_UPDATE_CANCELLED'; throw error; }
  };
  const progress = (force = false) => {
    const transferred = [...counts.values()].reduce((a, b) => a + b, 0);
    const at = now();
    if (!force && at - lastAt < 500) return;
    options.onProgress?.({ total: size, transferred, delta: Math.max(0, transferred - lastBytes),
      percent: transferred / size * 100, bytesPerSecond: transferred / Math.max(0.001, (at - started) / 1000) });
    lastAt = at; lastBytes = transferred;
  };
  async function range(index) {
    const start = index === 0 ? 0 : initialSize + (index - 1) * chunkSize;
    const end = index === 0 ? initialSize - 1 : Math.min(size, start + chunkSize) - 1;
    for (let attempt = 0; attempt < 3; attempt++) {
      cancelled();
      if (controller.signal.aborted) throw Error('Range download aborted');
      const request = new AbortController();
      const abort = () => request.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      let timer, reader;
      const touch = () => { clearTimeout(timer); timer = setTimeout(abort, idleMs); };
      try {
        touch();
        const headers = new Headers(options.headers ?? {});
        headers.set('Range', `bytes=${start}-${end}`);
        headers.set('Accept-Encoding', 'identity');
        const response = await fetch(url, { headers, signal: request.signal, cache: 'no-store' });
        if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${start}-${end}/${size}`
          || !['identity', null].includes(response.headers.get('content-encoding'))) {
          await response.body?.cancel();
          const error = Error('服务器未提供有效的分段响应'); error.code = 'ERR_UPDATE_RANGE_UNSUPPORTED'; throw error;
        }
        // Probe range support before creating or truncating the destination.
        if (!handle) { handle = await open(destination, 'w'); await handle.truncate(size); }
        counts.set(index, 0);
        reader = response.body.getReader();
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          cancelled(); touch();
          if (received + value.length > end - start + 1) throw Error('分段响应长度超出范围');
          let offset = 0;
          while (offset < value.length) {
            const { bytesWritten } = await handle.write(value, offset, value.length - offset, start + received + offset);
            if (!bytesWritten) throw Error('无法写入更新文件');
            offset += bytesWritten;
          }
          received += value.length; counts.set(index, received); progress();
        }
        if (received !== end - start + 1) throw Error('分段响应被截断');
        return;
      } catch (error) {
        cancelled();
        if (controller.signal.aborted || error.code === 'ERR_UPDATE_RANGE_UNSUPPORTED' || attempt === 2) throw error;
        counts.set(index, 0);
      } finally {
        clearTimeout(timer); request.abort();
        controller.signal.removeEventListener('abort', abort);
        try { await reader?.cancel(); } catch { /* Already aborted or complete. */ }
      }
    }
  }
  try {
    if (!Number.isSafeInteger(size) || size <= 0 || !options.sha512 || Buffer.from(options.sha512, 'base64').length !== 64) {
      throw Error('缺少有效的更新大小或 SHA-512');
    }
    await range(0);
    const parts = 1 + Math.ceil((size - initialSize) / chunkSize);
    const workers = Array.from({ length: Math.min(concurrency, parts - 1) }, async () => {
      try { while (next < parts) { const index = next++; await range(index); } }
      catch (error) { firstError ??= error; controller.abort(); throw error; }
    });
    const results = await Promise.allSettled(workers);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw firstError ?? failure.reason;
    await handle.close(); handle = null;
    cancelled();
    if (await fileSha512(destination) !== options.sha512) {
      const error = Error('更新文件 SHA-512 校验失败，已丢弃，不会安装'); error.code = 'ERR_UPDATE_CHECKSUM'; throw error;
    }
    cancelled(); progress(true);
    return destination;
  } catch (error) {
    controller.abort();
    if (handle) { await handle.close(); handle = null; }
    await unlink(destination).catch(() => {});
    throw error;
  } finally { token?.removeListener('cancel', cancel); }
}
