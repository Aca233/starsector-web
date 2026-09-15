// 缓存 HTMLImage 元素避免每帧重新实例化与闪烁
import { assetResolver } from '../../engine/assets/AssetResolver';
import type { WeaponMount } from '../../engine/simulation/Weapon';

const hudImageCache = new Map<string, HTMLImageElement>();

export function getCachedImage(url: string): HTMLImageElement {
  let img = hudImageCache.get(url);
  if (!img) {
    img = new Image();
    img.src = assetResolver.url(url);
    hudImageCache.set(url, img);
  }
  return img;
}

export interface GroupAmmoSummary {
  /** 该组是否存在有限弹药挂点 (导弹/火箭/点防连发等)。 */
  limited: boolean;
  /** 有限弹药挂点剩余弹数合计。 */
  remaining: number;
  /** 有限弹药挂点的弹药上限合计。 */
  capacity: number;
  /** 组内最低剩余弹数 (见底的武器决定这组还能不能继续开火)。 */
  lowest: number;
  /** 所有有限弹药挂点都打空了。 */
  allEmpty: boolean;
}

const EMPTY_GROUP_AMMO: GroupAmmoSummary = {
  limited: false,
  remaining: 0,
  capacity: 0,
  lowest: 0,
  allEmpty: false
};

/**
 * 汇总一个武器组的弹药状况，供 HUD 显示"还剩多少发"。
 * 无限弹药 (实弹/能量武器) 的挂点不参与统计，因此纯实弹编组不会显示弹药。
 */
export function summarizeGroupAmmo(mounts: WeaponMount[]): GroupAmmoSummary {
  const limitedMounts = mounts.filter((mount) => Number.isFinite(mount.ammo));
  if (limitedMounts.length === 0) return EMPTY_GROUP_AMMO;

  let remaining = 0;
  let capacity = 0;
  let lowest = Number.POSITIVE_INFINITY;
  let allEmpty = true;

  for (const mount of limitedMounts) {
    const ammo = Math.max(0, mount.ammo);
    remaining += ammo;
    capacity += mount.spec.maxAmmo ?? ammo;
    lowest = Math.min(lowest, ammo);
    if (ammo >= 1) allEmpty = false;
  }

  return {
    limited: true,
    remaining,
    capacity,
    lowest: Number.isFinite(lowest) ? lowest : 0,
    allEmpty
  };
}
