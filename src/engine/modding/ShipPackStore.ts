import type { ShipPackProfile } from './ShipPack';
const DB = 'starship-foundry-ship-packs';
const KEY = 'profile:' + import.meta.env.BASE_URL;
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('profiles');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('旧页面阻止舰船包数据库升级。'));
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
}
export async function readShipPackProfile(): Promise<ShipPackProfile> {
  const db = await open();
  try { return await new Promise((resolve, reject) => {
    const transaction = db.transaction('profiles'), request = transaction.objectStore('profiles').get(KEY);
    request.onsuccess = () => resolve(request.result ?? {revision: 0, disabled: [], installed: []});
    transaction.onerror = () => reject(transaction.error);
  }); } finally { db.close(); }
}
/** Serialized IDB transaction and revision comparison prevent old tabs clobbering a newer installation. */
export async function writeShipPackProfile(next: ShipPackProfile, expected: number): Promise<void> {
  const db = await open();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('profiles', 'readwrite'), store = transaction.objectStore('profiles'), request = store.get(KEY);
    let conflict = false;
    request.onsuccess = () => {
      if ((request.result?.revision ?? 0) !== expected) { conflict = true; transaction.abort(); return; }
      store.put({...next, revision: expected + 1}, KEY);
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(conflict ? new Error('另一个页面修改了舰船包，请刷新后重试。') : transaction.error ?? new Error('舰船包未能保存。'));
  }); } finally { db.close(); }
}
