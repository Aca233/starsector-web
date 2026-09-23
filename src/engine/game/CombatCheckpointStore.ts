import { randomId } from '../../shared/RandomId';
import type { CombatReplayCheckpoint } from '../runtime/local/CombatReplayCheckpoint';

export interface SavedCombatCheckpoint {
  format: 1;
  binding: string;
  savedAt: number;
  replay: CombatReplayCheckpoint;
}
interface Slot { revision: string; record: SavedCombatCheckpoint | null }

/** One slot per game-save key. Structured clone preserves Infinity/-0/typed arrays.
 * Serial readwrite transactions + revision CAS prevent stale tabs overwriting a newer point.
 * Tombstones retain revisions, including after settlement, to avoid an ABA/null-slot race. */
export class CombatCheckpointStore {
  private db?: Promise<IDBDatabase>;
  private tail: Promise<unknown> = Promise.resolve();
  private loaded?: Promise<SavedCombatCheckpoint | null>;
  private revision: string | null = null;
  private disposed = false;
  constructor(private readonly key: string, private readonly factory: () => IDBFactory = () => indexedDB) {}
  private open(): Promise<IDBDatabase> {
    return this.db ??= new Promise((resolve, reject) => {
      const request = this.factory().open('starsector-web-combat-checkpoints', 1);
      let failed = false;
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('slots')) request.result.createObjectStore('slots'); };
      request.onerror = () => { failed = true; reject(request.error ?? new Error('中场数据库不可用。')); };
      request.onblocked = () => { failed = true; reject(new Error('其他页面阻止中场数据库升级，请关闭旧页面后重试。')); };
      request.onsuccess = () => {
        const db = request.result;
        if (failed || this.disposed) { db.close(); reject(new Error('中场数据库已关闭。')); return; }
        db.onversionchange = () => db.close(); resolve(db);
      };
    });
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.tail.then(operation);
    this.tail = pending.catch(() => {});
    return pending;
  }
  private async transaction(write: boolean, action: (slot: Slot | undefined) => Slot | undefined): Promise<Slot | undefined> {
    const db = await this.open();
    if (this.disposed) throw new Error('中场存储已关闭。');
    return new Promise((resolve, reject) => {
      const tx = db.transaction('slots', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('slots');
      let result: Slot | undefined, problem: unknown;
      const request = store.get(this.key);
      request.onsuccess = () => {
        try {
          if (this.disposed) throw new Error('中场操作已取消。');
          const current = request.result as Slot | undefined;
          if (current && (typeof current.revision !== 'string' || !Object.hasOwn(current, 'record')))
            throw new Error('中场存储格式损坏，未覆盖原记录。');
          result = action(current);
          if (write && result) store.put(result, this.key);
        } catch (error) { problem = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(problem ?? tx.error ?? new Error('中场存储事务失败。'));
    });
  }
  load(): Promise<SavedCombatCheckpoint | null> {
    return this.loaded ??= this.serial(async () => {
      const slot = await this.transaction(false, current => current);
      this.revision = slot?.revision ?? null;
      return structuredClone(slot?.record ?? null);
    });
  }
  async verify(): Promise<void> {
    await this.load();
    await this.serial(async () => { await this.transaction(false, current => { this.checkRevision(current); return current; }); });
  }
  private checkRevision(slot: Slot | undefined): void {
    if ((slot?.revision ?? null) !== this.revision) throw new Error('中场保存点已被其他页面修改，请刷新后重试。');
  }
  async write(record: SavedCombatCheckpoint | null, valid: () => boolean): Promise<void> {
    await this.load();
    const copy = structuredClone(record);
    await this.serial(async () => {
      const slot = await this.transaction(true, current => {
        this.checkRevision(current);
        if (!valid()) throw new Error('战斗或存档已改变，中场操作已取消。');
        return {revision:randomId(), record:copy};
      });
      this.revision = slot!.revision;
    });
  }
  dispose(): void { this.disposed = true; void this.db?.then(db => db.close(), () => {}); }
}
