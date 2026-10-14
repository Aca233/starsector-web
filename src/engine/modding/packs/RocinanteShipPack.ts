import { rocinanteShips, rocinanteHulls, rocinanteRefit, rocinanteHull } from '../../content/RocinantePack';
import { rocinanteWeapons, rocinanteArmoryRefit, ROCINANTE_WEAPONS as W } from '../../content/RocinanteArmory';
import { ROCINANTE_HULL_ID, ROCINANTE_MODS as M } from '../../content/RocinanteIds';
import type { ShipPack } from '../ShipPack';
import { templateFit } from './PackFits';
const ships = rocinanteShips();
const fit = (heavy: boolean) => {
  const d = templateFit(ships.find(ship => ship.id === ROCINANTE_HULL_ID)!);
  d.weapons.TORP_1 = d.weapons.TORP_2 = heavy ? W.torpedo_heavy : W.torpedo_agile;
  d.hullMods = heavy ? [M.magazine, 'heavyarmor', 'fluxdistributor'] : [M.compensator, 'reinforcedhull', 'hardened_subsystems'];
  d.vents = 10; d.capacitors = heavy ? 8 : 10;
  for (const group of rocinanteHull.defaultWeaponGroups ?? []) d.groups[group.index] = structuredClone(group);
  return d;
};
export const rocinanteShipPack: ShipPack = {
  schema: 1, id: 'foundry.rocinante', name: '罗西南特', version: '1.0.0', author: 'Aca233', description: '第二份独立单舰包；复用相同目录、安装和配装接口。',
  mainHull: ROCINANTE_HULL_ID, hostABI: 'ship-pack-host-1', behavior: 'rocinante-1', ships, weapons: rocinanteWeapons(), baselines: rocinanteHulls,
  refit: {...rocinanteRefit, weapons: rocinanteArmoryRefit.weapons, weaponStatus: rocinanteArmoryRefit.weaponStatus} as ShipPack['refit'],
  variants: [{id: 'rocinante-skirmish', name: '罗西南特 · 轨炮拉扯', fit: fit(false)}, {id: 'rocinante-hunter', name: '罗西南特 · 鱼雷猎手', fit: fit(true)}],
  assetRoots: ['graphics/ships/web_rocinante/', 'graphics/weapons/web_rocinante/'],
  sources: ['docs/rocinante-source-notes-2026-09-29.md', 'The Expanse themed Web adaptation; distribution rights not asserted.'],
};
