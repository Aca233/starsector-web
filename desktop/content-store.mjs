import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CONTENT_MANIFEST, compareVersions, parseManifest, regularFile, sha256, verifyPayload } from './content-manifest.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function validRef(ref) {
  if (ref === null) return;
  if (!ref || !UUID.test(ref.folder) || !/^[a-f0-9]{64}$/.test(ref.digest)) throw Error('无效的游戏更新版本引用');
  compareVersions(ref.version, ref.version);
}
/** Small atomic pointer, isolated by installed shell/native-runtime fingerprint. */
export class ContentStore {
  constructor({ baseRoot, baseManifest, storage, log = () => {} }) {
    this.base = { root: baseRoot, manifest: baseManifest, reference: null };
    this.storage = path.join(storage, baseManifest.runtime);
    this.log = log;
    this.state = { schema: 1, active: null, previous: null, pending: null, trial: false, skipped: null };
    this.current = this.base;
    this.queue = Promise.resolve();
  }
  serial(action) {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }
  async save() {
    await fs.mkdir(this.storage, { recursive: true });
    const file = path.join(this.storage, `state-${randomUUID()}.tmp`);
    const handle = await fs.open(file, 'wx');
    try { await handle.writeFile(JSON.stringify(this.state)); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(file, path.join(this.storage, 'state.json'));
  }
  async resolve(reference, full = false) {
    validRef(reference);
    if (!reference || compareVersions(reference.version, this.base.manifest.version) <= 0) return this.base;
    const stage = path.join(this.storage, 'versions', reference.folder);
    const file = await regularFile(stage, CONTENT_MANIFEST);
    const bytes = await fs.readFile(file);
    if (sha256(bytes) !== reference.digest) throw Error('游戏版本清单校验失败');
    const manifest = parseManifest(bytes);
    if (manifest.runtime !== this.base.manifest.runtime || manifest.version !== reference.version) throw Error('游戏内容与桌面运行环境不匹配');
    const root = path.join(stage, 'backend');
    await verifyPayload(root, manifest, full);
    return { root, manifest, reference };
  }
  async begin() {
    return this.serial(async () => {
      try {
        this.state = JSON.parse(await fs.readFile(path.join(this.storage, 'state.json'), 'utf8'));
        if (this.state.schema !== 1 || typeof this.state.trial !== 'boolean') throw Error('无效的游戏更新状态');
        for (const key of ['active', 'previous', 'pending']) validRef(this.state[key]);
        if (this.state.skipped !== null) compareVersions(this.state.skipped, this.state.skipped);
      } catch (error) {
        if (error.code !== 'ENOENT') this.log('[content] 更新状态不可用，使用安装版：' + error.message);
        this.state = { schema: 1, active: null, previous: null, pending: null, trial: false, skipped: null };
      }
      if (this.state.trial) {
        this.log('[content] 上次新版启动未通过健康检查，回退上一版');
        this.state.skipped = this.state.active?.version ?? null;
        this.state.active = this.state.previous; this.state.previous = null; this.state.trial = false;
      }
      if (this.state.pending) {
        try {
          const selected = await this.resolve(this.state.pending, true);
          if (selected.reference) {
            this.state.previous = this.state.active;
            this.state.active = this.state.pending; this.state.trial = true;
          }
        } catch (error) { this.state.skipped = this.state.pending.version; this.log('[content] 待安装内容损坏，保留旧版：' + error.message); }
        this.state.pending = null;
      }
      try { this.current = await this.resolve(this.state.active); }
      catch (error) {
        this.log('[content] 当前游戏内容损坏，回退：' + error.message);
        this.state.skipped = this.state.active?.version ?? null;
        try { this.current = await this.resolve(this.state.previous); } catch { this.current = this.base; }
        this.state.active = this.current.reference; this.state.previous = null; this.state.trial = false;
      }
      if (!this.current.reference) { this.state.active = null; this.state.trial = false; }
      await this.save();
      return this.current;
    });
  }
  activate(reference) {
    return this.serial(async () => {
      const selected = await this.resolve(reference, true);
      if (!selected.reference || compareVersions(selected.manifest.version, this.current.manifest.version) <= 0) throw Error('拒绝激活旧的游戏更新');
      this.state.pending = reference;
      await this.save();
    });
  }
  healthy() {
    return this.serial(async () => {
      if (!this.state.trial) return;
      this.state.trial = false;
      await this.save();
      this.log('[content] 新版启动健康检查通过');
    });
  }
  rollback() {
    return this.serial(async () => {
      if (!this.state.trial) return false;
      this.state.skipped = this.state.active?.version ?? null;
      this.state.active = this.state.previous; this.state.previous = null; this.state.trial = false; this.state.pending = null;
      await this.save();
      this.log('[content] 新版启动失败，已切回上一版');
      return true;
    });
  }
}
export async function openContentStore({ baseRoot, storage, log }) {
  const bytes = await fs.readFile(path.join(path.dirname(baseRoot), CONTENT_MANIFEST));
  const baseManifest = parseManifest(bytes);
  await verifyPayload(baseRoot, baseManifest, false);
  const store = new ContentStore({ baseRoot, baseManifest, storage, log });
  await store.begin();
  return store;
}
