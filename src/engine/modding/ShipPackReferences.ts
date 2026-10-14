import type { ShipPack } from './ShipPack';
/** Check exact serialized IDs, including drafts, baselines, fleets and backup libraries. */
export async function assertShipPackUnused(pack: ShipPack): Promise<void> {
  const ids = new Set([...pack.ships.map(ship => ship.id), ...pack.weapons.map(weapon => weapon.id), ...Object.keys(pack.refit.wings ?? {})]);
  const references = (value: unknown): boolean => {
    if (typeof value === 'string') return ids.has(value);
    if (Array.isArray(value)) return value.some(references);
    return !!value && typeof value === 'object' && Object.values(value).some(references);
  };
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (!key.startsWith('starsector-web:design-studio:') && !key.startsWith('starsector-web:game:')) continue;
    let value: unknown;
    try { value = JSON.parse(localStorage.getItem(key)!); } catch { throw new Error('现有方案或舰队存档无法读取，暂不能安全停用。'); }
    if (references(value)) throw new Error('方案、草稿、舰队或备份仍引用此包。请先更换相关舰船与装备。');
  }
  // A checkpoint can contain hidden/undeployed references not present in the current fleet.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('starsector-web-combat-checkpoints', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('slots');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('其他页面阻止检查中场存档。'));
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('slots'), read = transaction.objectStore('slots').getAll();
      read.onsuccess = () => { if (read.result.some(references)) reject(new Error('中场存档仍引用此包，请先结束战斗或处理存档。')); else resolve(); };
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = transaction.onabort = () => db.close();
    };
  });
}
