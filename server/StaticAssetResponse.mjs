import { open, stat } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const compressibleExtensions = new Set([
  ".html", ".htm", ".js", ".mjs", ".css", ".json", ".map", ".svg",
  ".txt", ".xml", ".csv", ".fnt", ".webmanifest", ".wasm", ".ttf", ".otf",
]);

/** The shared runtime/build-report policy; excludes precompressed media and .bin. */
export function isCompressibleStaticAsset(file) {
  return compressibleExtensions.has(path.extname(file).toLowerCase());
}

function compressAsset(body, encoding) {
  return encoding === "br"
    ? brotliAsync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })
    : gzipAsync(body, { level: 6 });
}

function encodings(header, compressible) {
  const qualities = new Map();
  for (const part of String(header ?? "").split(",")) {
    const [name, ...parameters] = part.trim().toLowerCase().split(";");
    if (!name.trim()) continue;
    let quality = 1;
    let foundQuality = false;
    for (const parameter of parameters) {
      const match = /^\s*q\s*=\s*(.*?)\s*$/.exec(parameter);
      if (!match || foundQuality || !/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(match[1])) {
        quality = 0;
        break;
      }
      foundQuality = true;
      quality = Number(match[1]);
    }
    const coding = name.trim();
    // Conflicting duplicates must not accidentally undo an explicit exclusion.
    qualities.set(coding, Math.min(qualities.get(coding) ?? 1, quality));
  }
  const identity = qualities.get("identity") ?? (qualities.get("*") === 0 ? 0 : 1);
  const choices = compressible ? ["br", "gzip"].map(encoding => ({
    encoding,
    quality: qualities.get(encoding) ?? qualities.get("*") ?? 0,
  })).filter(choice => choice.quality > 0) : [];
  if (identity > 0) {
    // Unspecified identity is a fallback, not a reason to ignore gzip;q=0.5.
    choices.push({ encoding: "identity", quality: qualities.get("identity") ?? 0 });
  }
  // Stable ties prefer Brotli, then gzip, then identity.
  choices.sort((a, b) => b.quality - a.quality);
  return { choices, identityAllowed: identity > 0 };
}

function varyEncoding(res) {
  const current = res.getHeader("Vary");
  const fields = (Array.isArray(current) ? current.join(", ") : String(current ?? ""))
    .split(",").map(field => field.trim()).filter(Boolean);
  if (!fields.some(field => field === "*" || field.toLowerCase() === "accept-encoding")) {
    fields.push("Accept-Encoding");
  }
  res.setHeader("Vary", fields.join(", "));
}

function version(info) {
  return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
}

async function fileInfo(file) {
  const info = await stat(file, { bigint: true });
  if (!info.isFile()) throw new Error("Not a static file");
  return info;
}

async function readVersion(file, info) {
  const handle = await open(file, "r");
  try {
    const expected = version(info);
    if (version(await handle.stat({ bigint: true })) !== expected) throw new Error("Asset changed");
    // Read no more than the admitted size, even if the file grows while reading.
    const body = Buffer.allocUnsafe(Number(info.size));
    let offset = 0;
    while (offset < body.length) {
      const { bytesRead } = await handle.read(body, offset, body.length - offset, offset);
      if (!bytesRead) throw new Error("Asset changed");
      offset += bytesRead;
    }
    if (version(await handle.stat({ bigint: true })) !== expected) throw new Error("Asset changed");
    return body;
  } finally {
    await handle.close();
  }
}

async function sendIdentity(req, res, file) {
  const handle = await open(file, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error("Not a static file");
    if (res.destroyed) return;
    res.removeHeader("Content-Encoding");
    res.setHeader("Content-Length", info.size);
    if (req.method === "HEAD" || info.size === 0) {
      res.end();
      return;
    }
    // pipeline propagates backpressure and closes the file on client disconnect.
    // Bound the stream to the advertised length if an asset grows mid-response.
    let remaining = info.size;
    const exactLength = new Transform({
      transform(chunk, _encoding, callback) {
        remaining -= chunk.length;
        callback(null, chunk);
      },
      flush(callback) {
        callback(remaining === 0 ? undefined : new Error("Asset truncated during streaming"));
      },
    });
    await pipeline(handle.createReadStream({ end: info.size - 1 }), exactLength, res);
  } finally {
    await handle.close();
  }
}

/**
 * Serve an already canonicalized/authorized path. The caller owns path security,
 * MIME, isolation and Cache-Control headers; this helper owns representations.
 * Only compressed bytes are retained. Source buffers and concurrent zlib jobs
 * are also bounded, with no unbounded work queue or on-disk sidecars.
 */
export function createStaticAssetResponse({
  maxCacheBytes = 32 * 1024 * 1024,
  maxCacheEntries = 128,
  maxSourceBytes = 16 * 1024 * 1024,
  maxConcurrentCompressions = 2,
  // Dependency injection permits deterministic failure/coalescing tests.
  compress = compressAsset,
} = {}) {
  const cache = new Map();
  const pending = new Map();
  let cacheBytes = 0;

  function remember(key, body) {
    if (body.length > maxCacheBytes || maxCacheEntries < 1) return;
    while (cache.size && (cacheBytes + body.length > maxCacheBytes || cache.size >= maxCacheEntries)) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).length;
      cache.delete(oldest);
    }
    cache.set(key, body);
    cacheBytes += body.length;
  }

  async function encoded(file, info, encoding) {
    const stamp = version(info);
    const key = `${file}\0${stamp}\0${encoding}`;
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    if (pending.has(key)) return pending.get(key);
    if (info.size > BigInt(maxSourceBytes) || pending.size >= maxConcurrentCompressions) return null;
    const job = (async () => {
      const source = await readVersion(file, info);
      const body = await compress(source, encoding);
      // Never cache/serve old bytes as the current file after a concurrent edit.
      if (version(await fileInfo(file)) !== stamp) throw new Error("Asset changed");
      remember(key, body);
      return body;
    })();
    pending.set(key, job);
    try {
      return await job;
    } finally {
      pending.delete(key);
    }
  }

  return async function respond(req, res, file) {
    try {
      varyEncoding(res);
      const info = await fileInfo(file);
      if (res.destroyed) return;
      const { choices, identityAllowed } = encodings(
        req.headers["accept-encoding"], isCompressibleStaticAsset(file),
      );
      for (const { encoding } of choices) {
        if (encoding === "identity") {
          await sendIdentity(req, res, file);
          return;
        }
        let body;
        try {
          body = await encoded(file, info, encoding);
        } catch {
          // A failed codec/read or a concurrently edited file can still use
          // another acceptable encoding, or a freshly opened identity stream.
          continue;
        }
        if (res.destroyed) return;
        if (!body) continue;
        if (identityAllowed && body.length >= Number(info.size)) {
          await sendIdentity(req, res, file);
          return;
        }
        res.setHeader("Content-Encoding", encoding);
        res.setHeader("Content-Length", body.length);
        res.end(req.method === "HEAD" ? undefined : body);
        return;
      }
      // 406 means nothing is acceptable; 503 means an acceptable codec was
      // temporarily unavailable (bounded work budget or compression failure).
      res.statusCode = choices.length ? 503 : 406;
      res.setHeader("Cache-Control", "no-store");
      if (res.statusCode === 503) res.setHeader("Retry-After", "1");
      res.removeHeader("Content-Encoding");
      res.setHeader("Content-Length", 0);
      res.end();
    } catch {
      // An open/stat error is a normal missing asset, not an unhandled rejected
      // request. Once streaming starts, destroy instead of writing a second head.
      if (res.destroyed) return;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.removeHeader("Content-Encoding");
      res.removeHeader("Content-Length");
      res.statusCode = 404;
      res.setHeader("Cache-Control", "no-store");
      res.end(req.method === "HEAD" ? undefined : "Not found");
    }
  };
}
