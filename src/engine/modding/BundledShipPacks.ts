import { zhuYuanShips, zhuYuanHulls, zhuYuanRefit, starNeedle, ZHUYUAN_HULL_ID } from '../content/ZhuYuanPack';
import { hyperionShips, hyperionHulls, hyperionRefit, hyperionYamatoProjectile, HYPERION_HULL_ID } from '../content/HyperionPack';
import { hyperionWeapons, hyperionArmoryRefit, hyperionArmoryStrings } from '../content/HyperionArmory';
import { adunArkPack, arkHulls, arkRefit } from '../content/AdunArkPack';
import { arkArmoryRefit } from '../content/AdunArkArmory';
import { arkWings } from '../content/AdunArkAviation';
import { ADUN_ARK_ID } from '../content/AdunArkIds';
import { zhefengShips, zhefengHulls, zhefengRefit } from '../content/ZhefengPack';
import { zhefengWeapons, zhefengArmoryRefit } from '../content/ZhefengArmory';
import { ZHEFENG_ID } from '../content/ZhefengIds';
import { gravityShips, gravityHulls, gravityRefit } from '../content/GravityPack';
import { gravityWeapons, gravityArmoryRefit } from '../content/GravityArmory';
import { GRAVITY_HULL_ID } from '../content/GravityIds';
import { glorianaShipPack } from './packs/GlorianaShipPack';
import { rocinanteShipPack } from './packs/RocinanteShipPack';
import type { ShipPack } from './ShipPack';
import { zhuYuanVariants, hyperionVariants, adunArkVariants, zhefengVariants, gravityVariants } from './packs/AuthoredPackVariants';
// The only list of bundled ship packages. Adding a package requires one entry here.
const identity = {schema: 1, version: '1.0.0', author: 'Aca233', hostABI: 'ship-pack-host-1', sources: ['Repository-authored integration; see the corresponding ship source notes.']} as const;
export const bundledShipPacks: readonly ShipPack[] = [
  {...identity, id: 'foundry.zhuyuan', name: '烛渊', mainHull: ZHUYUAN_HULL_ID, description: '烛渊巡洋舰', behavior: 'zhuyuan-1',
    ships: zhuYuanShips(), weapons: [starNeedle], baselines: zhuYuanHulls, refit: zhuYuanRefit,
    variants: zhuYuanVariants(zhuYuanShips()[0]), dependencies: [{id: 'foundry.hyperion', minVersion: '1.0.0'}],
    assetRoots: ['graphics/ships/web_zhuyuan/', 'graphics/weapons/web_zhuyuan/']},
  glorianaShipPack,
  {...identity, id: 'foundry.hyperion', name: '休伯利安', mainHull: HYPERION_HULL_ID, description: '休伯利安战列巡航旗舰', behavior: 'hyperion-1',
    ships: hyperionShips(), weapons: [...hyperionWeapons, hyperionYamatoProjectile], baselines: hyperionHulls,
    refit: {...hyperionRefit, weapons: hyperionArmoryRefit.weapons, weaponStatus: hyperionArmoryRefit.weaponStatus}, i18n: hyperionArmoryStrings,
    variants: hyperionVariants(hyperionShips()[0]),
    assetRoots: ['graphics/ships/web_sc2_hyperion/', 'graphics/weapons/web_sc2_hyperion/']},
  {...identity, id: 'foundry.adun-ark', name: '亚顿之矛', mainHull: ADUN_ARK_ID, description: '亚顿之矛模块方舟', behavior: 'adun-ark-1',
    ships: adunArkPack.ships, weapons: adunArkPack.weapons, baselines: arkHulls,
    refit: {...arkRefit, weapons: arkArmoryRefit.weapons, weaponStatus: arkArmoryRefit.weaponStatus, wings: arkWings}, i18n: adunArkPack.i18n,
    variants: adunArkVariants(adunArkPack.ships.find(ship => ship.id === ADUN_ARK_ID)!, arkWings),
    assetRoots: ['graphics/ships/web_adun_ark/', 'graphics/weapons/web_adun_ark/']},
  rocinanteShipPack,
  {...identity, id: 'foundry.zhefeng', name: '折锋', mainHull: ZHEFENG_ID, description: '折锋巡洋舰', behavior: 'zhefeng-1',
    ships: zhefengShips(), weapons: zhefengWeapons, baselines: zhefengHulls,
    variants: zhefengVariants(zhefengShips()[0]),
    refit: {...zhefengRefit, weapons: zhefengArmoryRefit.weapons, weaponStatus: zhefengArmoryRefit.weaponStatus}, assetRoots: ['graphics/ships/web_zhefeng/']},
  {...identity, id: 'foundry.gravity', name: '万有引力', mainHull: GRAVITY_HULL_ID, description: '万有引力实验舰', behavior: 'gravity-1',
    ships: gravityShips(), weapons: gravityWeapons(), baselines: gravityHulls,
    variants: gravityVariants(gravityShips()[0]),
    refit: {...gravityRefit, weapons: gravityArmoryRefit.weapons, weaponStatus: gravityArmoryRefit.weaponStatus}, assetRoots: ['graphics/gravity/']},
] as readonly ShipPack[];
