/** Test-only content. Imported by isolated Node/headless checks, never the game entrypoint. */
import { modManager } from '../../src/engine/modding/ModManager';
import { hyperionHull, hyperionHulls } from '../../src/engine/content/HyperionPack';
import { data, nativeRefit, hulls, weapons } from '../../src/studio/DesignModel';
export const XL_TEST_HULL = 'test_four_tier_hull';
export const XL_TEST_WEAPON = 'test_extra_large_weapon';
export function installFourTierFixture() {
  if (modManager.getShip(XL_TEST_HULL)) return;
  const weapon = structuredClone(modManager.getWeapon('web_sc2_hyperion_ata')!);
  weapon.id = XL_TEST_WEAPON; weapon.mountSize = 'EXTRA_LARGE'; weapon.ordnancePointCost = 72;
  weapon.nameKey = 'weapon.test_extra_large_weapon.name';
  modManager.registerWeapon(weapon);
  const ship = structuredClone(hyperionHull);
  ship.id=XL_TEST_HULL; ship.nameKey='ship.test_four_tier_hull.name';
  ship.descKey='ship.test_four_tier_hull.desc'; ship.designationKey='ship.test_four_tier_hull.designation';
  ship.designation='四档验收样本（非正式内容）'; ship.systemType='NONE'; ship.systemTypes=[]; ship.systemWeaponSlots=[];
  ship.weaponSlots[0]={...ship.weaponSlots[0],slotId:'XL01',slotSize:'EXTRA_LARGE'};
  ship.i18n={zh_CN:{[ship.nameKey]:'四档验收舰',[ship.descKey]:'只用于自动验收，不是正式舰船。',[ship.designationKey]:ship.designation,[weapon.nameKey]:'超大型验收炮'},en_US:{[ship.nameKey]:'Four-tier test hull',[ship.descKey]:'Test only',[ship.designationKey]:'Test fixture',[weapon.nameKey]:'Extra-large test gun'}};
  modManager.registerShip(ship);
  // This existing studio requires a source-hull template and catalogue metadata; test aliases stay local.
  hyperionHulls[ship.id]=ship;
  data.ships[ship.id]={op:400,name:'四档验收舰',manufacturer:'隔离验收',designation:ship.designation};
  nativeRefit.ships[ship.id]=data.ships[ship.id];
  data.weapons[weapon.id]={op:72,name:'超大型验收炮'};
  nativeRefit.weapons[weapon.id]={...data.weapons[weapon.id],description:'四档尺寸通路验收，不是新发布武器。'};
  nativeRefit.shipStatus[ship.id]={level:'supported',reasons:['test-only']};
  nativeRefit.weaponStatus[weapon.id]={level:'supported',reasons:['test-only']};
  hulls.push(modManager.requireShip(ship.id)); weapons.push(modManager.getWeapon(weapon.id)!);
}
