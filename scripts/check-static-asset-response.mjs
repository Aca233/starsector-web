import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import { mkdtemp, mkdir, open, readFile, readdir, rename, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { brotliCompress, brotliDecompress, constants, gzip, gunzip } from "node:zlib";
import { createStaticAssetResponse, isCompressibleStaticAsset } from "../server/StaticAssetResponse.mjs";

const br = promisify(brotliCompress);
const gz = promisify(gzip);
const unbr = promisify(brotliDecompress);
const ungz = promisify(gunzip);
const source = Buffer.from('/* unchanged UTF-8: 星域 */\nexport const asset = "repeated static payload";\n'.repeat(600));
const encode = (body, coding) => coding === "br"
  ? br(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }) : gz(body, { level: 6 });
const decode = response => response.headers["content-encoding"] === "br" ? unbr(response.body)
  : response.headers["content-encoding"] === "gzip" ? ungz(response.body) : response.body;

async function tempDirectory(t, beforeCleanup = async () => {}) {
  const parent = path.resolve(os.tmpdir());
  const directory = await mkdtemp(path.join(parent, "starsector-static-"));
  t.after(async () => {
    await beforeCleanup();
    // Delete only the exact test-created temporary directory, never a computed parent.
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.ok(path.basename(directory).startsWith("starsector-static-"));
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function request(server, name = "/asset.js", acceptEncoding, method = "GET", extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = { ...extraHeaders };
    if (acceptEncoding !== undefined) headers["Accept-Encoding"] = acceptEncoding;
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: name, method, headers, agent: false }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(5000, () => req.destroy(new Error("Static request timed out")));
    req.on("error", reject);
    req.end();
  });
}

async function fixture(t, options = {}, headers = {}) {
  let server;
  const directory = await tempDirectory(t, async () => {
    if (server?.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  });
  await writeFile(path.join(directory, "asset.js"), source);
  const respond = createStaticAssetResponse(options);
  server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/octet-stream");
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
    void respond(req, res, path.join(directory, req.url.slice(1)));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

  return { directory, server };
}

function assertLength(response) {
  assert.equal(Number(response.headers["content-length"]), response.body.length);
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("Brotli/gzip static text, font descriptors and WASM decode byte-for-byte", async t => {
  const { directory, server } = await fixture(t);
  for (const extension of ["html", "js", "css", "json", "svg", "fnt", "wasm", "ttf", "otf"]) {
    assert.equal(isCompressibleStaticAsset(`asset.${extension}`), true);
    await writeFile(path.join(directory, `asset.${extension}`), source);
    for (const coding of ["br", "gzip"]) {
      const response = await request(server, `/asset.${extension}`, coding);
      assert.equal(response.status, 200);
      assert.equal(response.headers["content-encoding"], coding);
      assert.equal(response.headers.vary, "Accept-Encoding");
      assertLength(response);
      assert.ok(response.body.length < source.length / 2);
      assert.deepEqual(await decode(response), source);
    }
  }
  assert.ok((await readdir(directory)).every(name => !/\.(br|gz)$/.test(name)), "no sidecars");
});

test("Accept-Encoding qualities, identity, wildcard, exclusions and malformed q values", async t => {
  const { server } = await fixture(t);
  const cases = [
    [undefined, undefined], ["", undefined], ["zstd", undefined],
    ["gzip, br", "br"], ["br;q=0.2, gzip;q=0.8", "gzip"],
    ["gzip;q=0.5", "gzip"], ["BR; Q=1.000, gzip;q=0.8", "br"],
    ["*;q=0.5", "br"], ["*;q=1, br;q=0", "gzip"],
    ["br;q=0, gzip;q=0", undefined], ["*;q=0, identity;q=1", undefined],
    ["gzip;q=0.5, identity;q=0.9", undefined], ["gzip;q=0.9, identity;q=0.5", "gzip"],
    ["br;q=oops, gzip;q=0.5", "gzip"], ["br;q=1.5, gzip;q=0.001", "gzip"],
    ["br;q=0.1234, gzip", "gzip"], ["br;q=-1, gzip", "gzip"],
    ["br;q=0, br;q=1, gzip;q=0.5", "gzip"],
    ["br;q=0;q=1, gzip", "gzip"], ["*;q=0, gzip;q=1", "gzip"],
  ];
  for (const [header, encoding] of cases) {
    const response = await request(server, "/asset.js", header);
    assert.equal(response.status, 200, String(header));
    assert.equal(response.headers["content-encoding"], encoding, String(header));
    assertLength(response);
    assert.deepEqual(await decode(response), source, String(header));
  }
  for (const header of ["*;q=0", "identity;q=0", "br;q=0,gzip;q=0,identity;q=0", "zstd,identity;q=0"]) {
    const response = await request(server, "/asset.js", header);
    assert.equal(response.status, 406, header);
    assert.equal(response.headers["content-encoding"], undefined);
    assert.equal(response.headers.vary, "Accept-Encoding");
    assertLength(response);
  }
});

test("already compressed media and music.bin are never recompressed", async t => {
  let calls = 0;
  const { directory, server } = await fixture(t, { compress() { calls++; throw new Error("must not run"); } });
  for (const name of ["asset.png", "asset.JPG", "asset.jpeg", "asset.webp", "asset.ogg", "asset.mp3", "asset.woff2", "music.bin"]) {
    assert.equal(isCompressibleStaticAsset(name), false);
    await writeFile(path.join(directory, name), source);
    const response = await request(server, `/${name}`, "br,gzip");
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-encoding"], undefined);
    assertLength(response);
    assert.deepEqual(response.body, source);
    assert.equal((await request(server, `/${name}`, "br,gzip,identity;q=0")).status, 406);
  }
  assert.equal(calls, 0);
});

test("HEAD shares cached representation and exact lengths with GET", async t => {
  let calls = 0;
  const { server } = await fixture(t, { compress(body, coding) { calls++; return encode(body, coding); } });
  for (const coding of ["br", "gzip", "identity"]) {
    const head = await request(server, "/asset.js", coding, "HEAD");
    const get = await request(server, "/asset.js", coding);
    const warmHead = await request(server, "/asset.js", coding, "HEAD");
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    for (const key of ["content-encoding", "content-length", "content-type", "vary"]) {
      assert.equal(head.headers[key], get.headers[key]);
      assert.equal(warmHead.headers[key], get.headers[key]);
    }
    assertLength(get);
  }
  assert.equal(calls, 2, "warm GET/HEAD do not spend any compression CPU");
});

test("unhelpful compression falls back unless identity is forbidden", async t => {
  const { directory, server } = await fixture(t);
  for (const bytes of [Buffer.from("x"), Buffer.alloc(0)]) {
    await writeFile(path.join(directory, "tiny.js"), bytes);
    const plain = await request(server, "/tiny.js", "br,gzip");
    assert.equal(plain.headers["content-encoding"], undefined);
    assertLength(plain);
    assert.deepEqual(plain.body, bytes);
    const forced = await request(server, "/tiny.js", "br,identity;q=0");
    assert.equal(forced.headers["content-encoding"], "br");
    assertLength(forced);
    assert.deepEqual(await decode(forced), bytes);
  }
});

test("Vary appends without erasing, duplicating, or narrowing existing fields", async t => {
  for (const [value, expected] of [["Origin", "Origin, Accept-Encoding"], ["Origin, accept-encoding", "Origin, accept-encoding"], ["*", "*"]]) {
    const { server } = await fixture(t, {}, { Vary: value, "Cache-Control": "no-cache" });
    const response = await request(server, "/asset.js", "gzip");
    assert.equal(response.headers.vary, expected);
    assert.equal(response.headers["cache-control"], "no-cache");
  }
});

test("same-size edits with restored mtime and file replacement invalidate cached encodings", async t => {
  let calls = 0;
  const { directory, server } = await fixture(t, { compress(body, coding) { calls++; return encode(body, coding); } });
  const file = path.join(directory, "asset.js");
  const previous = await stat(file);
  await request(server, "/asset.js", "br");
  const edited = Buffer.alloc(source.length, 65);
  await writeFile(file, edited);
  await utimes(file, previous.atime, previous.mtime);
  assert.deepEqual(await decode(await request(server, "/asset.js", "br")), edited);
  const replacement = Buffer.from("replacement file\n".repeat(1000));
  await writeFile(path.join(directory, "replacement"), replacement);
  await rename(path.join(directory, "replacement"), file);
  assert.deepEqual(await decode(await request(server, "/asset.js", "br")), replacement);
  assert.equal(calls, 3);
});

test("LRU is bounded independently by entry count and encoded byte size", async t => {
  const encodedSize = (await encode(source, "br")).length;
  for (const [options, sequence, expectedCalls] of [
    [{ maxCacheEntries: 2 }, ["a", "b", "a", "c", "b"], 4],
    [{ maxCacheBytes: encodedSize * 2 - 1 }, ["a", "b", "a"], 3],
    [{ maxCacheBytes: encodedSize - 1 }, ["a", "a"], 2],
  ]) {
    let calls = 0;
    const { directory, server } = await fixture(t, { ...options, compress(body, coding) { calls++; return encode(body, coding); } });
    for (const name of ["a", "b", "c"]) await writeFile(path.join(directory, `${name}.js`), source);
    for (const name of sequence) assert.deepEqual(await decode(await request(server, `/${name}.js`, "br")), source);
    assert.equal(calls, expectedCalls);
  }
});

test("coalesced GET/HEAD jobs and bounded pending concurrency fall back without queuing", async t => {
  const first = deferred(), second = deferred(), gate = deferred();
  let calls = 0;
  const { directory, server } = await fixture(t, {
    maxConcurrentCompressions: 2,
    async compress(body, coding) {
      calls++;
      (calls === 1 ? first : second).resolve();
      await gate.promise;
      return encode(body, coding);
    },
  });
  t.after(() => gate.resolve());
  for (const name of ["b.js", "c.js"]) await writeFile(path.join(directory, name), source);
  const firstRequest = request(server, "/asset.js", "br");
  await first.promise;
  const shared = Array.from({ length: 5 }, (_, i) => request(server, "/asset.js", "br", i === 0 ? "HEAD" : "GET"));
  const secondRequest = request(server, "/b.js", "gzip");
  await second.promise;
  const fallback = await request(server, "/c.js", "br,gzip");
  assert.equal(fallback.headers["content-encoding"], undefined);
  assert.deepEqual(fallback.body, source);
  const refused = await request(server, "/c.js", "br,gzip,identity;q=0");
  assert.equal(refused.status, 503);
  assert.equal(refused.headers["retry-after"], "1");
  assert.equal(calls, 2);
  gate.resolve();
  const responses = await Promise.all([firstRequest, ...shared, secondRequest]);
  assert.equal(calls, 2);
  assert.equal(responses[1].body.length, 0);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.ok(response.headers["content-encoding"]);
    if (response !== responses[1]) assert.deepEqual(await decode(response), source);
  }
});

test("over-threshold files stream identity with HEAD lengths and no zlib job", async t => {
  let calls = 0;
  const { server } = await fixture(t, { maxSourceBytes: 100, compress() { calls++; throw new Error("not admitted"); } });
  const response = await request(server, "/asset.js", "br,gzip");
  assert.equal(response.headers["content-encoding"], undefined);
  assertLength(response);
  assert.deepEqual(response.body, source);
  const head = await request(server, "/asset.js", "br,gzip", "HEAD");
  assert.equal(head.headers["content-length"], String(source.length));
  assert.equal(head.body.length, 0);
  assert.equal((await request(server, "/asset.js", "gzip,identity;q=0")).status, 503);
  assert.equal(calls, 0);
});

test("codec failures allow a lesser accepted codec or identity, never a forbidden body", async t => {
  let calls = 0;
  const { server } = await fixture(t, { compress(body, coding) {
    calls++;
    if (coding === "br") throw new Error("simulated codec failure");
    return encode(body, coding);
  } });
  const fallback = await request(server, "/asset.js", "br,gzip");
  assert.equal(fallback.headers["content-encoding"], "gzip");
  assert.deepEqual(await decode(fallback), source);
  const identity = await request(server, "/asset.js", "br");
  assert.equal(identity.headers["content-encoding"], undefined);
  assert.deepEqual(identity.body, source);
  assert.equal((await request(server, "/asset.js", "br,identity;q=0")).status, 503);
  assert.equal(calls, 4, "failed jobs are removed, not cached forever");
});

test("files edited during compression are not cached or returned under their old version", async t => {
  let directory, calls = 0;
  const changed = Buffer.from("new version\n".repeat(3000));
  const setup = await fixture(t, { async compress(body, coding) {
    if (++calls === 1) await writeFile(path.join(directory, "asset.js"), changed);
    return encode(body, coding);
  } });
  directory = setup.directory;
  const first = await request(setup.server, "/asset.js", "br");
  assert.equal(first.headers["content-encoding"], undefined);
  assert.deepEqual(first.body, changed);
  assert.deepEqual(await decode(await request(setup.server, "/asset.js", "br")), changed);
  assert.equal(calls, 2);
});

test("missing/non-file paths and stream errors complete safely; disconnect closes streams", async t => {
  const { directory, server } = await fixture(t);
  await mkdir(path.join(directory, "folder"));
  for (const name of ["missing.js", "folder"]) {
    assert.equal((await request(server, `/${name}`, "br")).status, 404);
    const head = await request(server, `/${name}`, "br", "HEAD");
    assert.equal(head.status, 404);
    assert.equal(head.body.length, 0);
  }
  const handle = await open(path.join(directory, "asset.js"), "r");
  const prototype = Object.getPrototypeOf(handle);
  await handle.close();
  const streamMock = t.mock.method(prototype, "createReadStream", () => new Readable({
    read() { this.destroy(new Error("simulated stream read error")); },
  }));
  await assert.rejects(request(server, "/asset.js", "identity"));
  streamMock.mock.restore();
  const shortMock = t.mock.method(prototype, "createReadStream", () => Readable.from([Buffer.from("short")]));
  await assert.rejects(request(server, "/asset.js", "identity"));
  shortMock.mock.restore();
  await writeFile(path.join(directory, "large.bin"), Buffer.alloc(4 * 1024 * 1024, 42));
  await new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port: server.address().port, path: "/large.bin", agent: false }, res => {
      res.once("data", () => res.destroy());
      res.once("close", resolve);
      res.on("error", () => {});
    });
    req.on("error", reject);
  });
  const healthy = await request(server, "/asset.js", "gzip");
  assert.equal(healthy.status, 200);
  assert.deepEqual(await decode(healthy), source);
});

test("LAN integration preserves canonical security, isolation/cache headers and /lan/info", async t => {
  const { createLanServer } = await import("../server/lan-server.mjs");
  let app;
  const directory = await tempDirectory(t, async () => { if (app) await app.close(); });
  const dist = path.join(directory, "dist");
  await mkdir(path.join(dist, "assets"), { recursive: true });
  await mkdir(path.join(directory, "outside"));
  await writeFile(path.join(directory, "outside", "secret.js"), source);
  await writeFile(path.join(dist, "index.html"), source);
  await writeFile(path.join(dist, "assets", "app.js"), source);
  await writeFile(path.join(dist, ".private"), source);
  await writeFile(path.join(dist, "lan-build.json"), JSON.stringify({ build: "static-response-fixture" }));
  await symlink(path.join(directory, "outside"), path.join(dist, "escape"), process.platform === "win32" ? "junction" : "dir");
  app = await createLanServer({ host: "127.0.0.1", port: 0, dist });
  for (const [name, cache, contentType] of [["/", "no-cache", "text/html; charset=utf-8"], ["/assets/app.js", "public, max-age=31536000, immutable", "text/javascript; charset=utf-8"]]) {
    const response = await request(app.server, name, "br,gzip");
    assert.equal(response.status, 200);
    assert.deepEqual(await decode(response), source);
    assert.equal(response.headers["content-encoding"], "br");
    assert.equal(response.headers["cross-origin-opener-policy"], "same-origin");
    assert.equal(response.headers["cross-origin-embedder-policy"], "require-corp");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["referrer-policy"], "same-origin");
    assert.equal(response.headers["cache-control"], cache);
    assert.equal(response.headers["content-type"], contentType);
    assert.equal(response.headers.vary, "Accept-Encoding");
    assertLength(response);
    const head = await request(app.server, name, "br,gzip", "HEAD");
    assert.equal(head.headers["content-length"], response.headers["content-length"]);
    assert.equal(head.headers["content-encoding"], "br");
    assert.equal(head.body.length, 0);
  }
  const info = await request(app.server, "/lan/info");
  const acceptingCompression = await request(app.server, "/lan/info", "br,gzip,identity;q=0");
  assert.equal(info.status, 200);
  assert.deepEqual(acceptingCompression.body, info.body);
  assert.equal(acceptingCompression.headers["content-encoding"], undefined);
  assert.equal(acceptingCompression.headers.vary, undefined);
  assert.equal(acceptingCompression.headers["cache-control"], "no-store");
  assert.equal(acceptingCompression.headers["content-type"], "application/json");
  assert.equal(JSON.parse(info.body).build, "static-response-fixture");
  for (const name of ["/%2eprivate", "/..%5csecret.js", "/%00", "/escape/secret.js", "/missing.js"]) {
    assert.equal((await request(app.server, name, "br")).status, 404, name);
  }
  assert.equal((await request(app.server, "/", "br", "POST")).status, 405);
  assert.equal((await request(app.server, "/", "br", "GET", { Host: "untrusted.invalid" })).status, 403);
  assert.deepEqual(await readFile(path.join(dist, "assets", "app.js")), source);
});

test("error responses never inherit immutable asset caching", async t => {
  const { server } = await fixture(t, { compress() { throw new Error("codec unavailable"); } }, {
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  for (const [name, coding, expectedStatus] of [
    ["/asset.js", "br,identity;q=0", 503],
    ["/asset.js", "*;q=0", 406],
    ["/missing.js", "br", 404],
  ]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await request(server, name, coding, method);
      assert.equal(response.status, expectedStatus);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(response.headers["content-encoding"], undefined);
      if (method === "HEAD") assert.equal(response.body.length, 0);
    }
  }
  const successfulFallback = await request(server, "/asset.js", "br");
  assert.equal(successfulFallback.status, 200);
  assert.equal(successfulFallback.headers["cache-control"], "public, max-age=31536000, immutable");
});