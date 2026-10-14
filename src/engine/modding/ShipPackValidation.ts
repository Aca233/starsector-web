import { ContentRegistry } from '../content/ContentRegistry';
import { validateShipSpec, validateStrings } from './ContentValidation';
import { hullModOPCost, effectiveWeaponOP, hullModLoadoutErrors } from '../extensions/HullMods';
import { shipPackAssetPaths } from './ShipPackDependencies';
import { emptyPackHull, type ShipPack, type PackFit } from './ShipPack';
import { bundledShipPacks } from './BundledShipPacks';
import { validateShipPackCapabilities, shipPackDependencyClosure } from './ShipPackCapabilities';
import refitRules from '../../studio/refit-data.json';
import type { ShipSpec } from '../content/ShipSpec';
export { SHIP_PACK_ABI } from './ShipPackCapabilities';
const safeId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/.test(id) && !['constructor','prototype','__proto__'].includes(id);
export function safePackPath(path: unknown): path is string {
  return typeof path === 'string' && /^(graphics|sounds)\/[A-Za-z0-9_./ -]+$/.test(path)
    && !path.includes('..') && !path.includes('//') && !path.endsWith('/');
}
export function validateShipPack(pack: ShipPack, requireAssets = true, available: readonly ShipPack[] = bundledShipPacks): {paths: string[]; compiled: ShipSpec[]} {
  validateShipPackCapabilities(pack);
  if (!safeId(pack.id) || !safeId(pack.mainHull)
    || !/^\d+\.\d+\.\d+$/.test(pack.version) || [pack.name, pack.author, pack.description].some(value => typeof value !== 'string' || !value.trim()))
    throw new Error('单舰包身份、格式或宿主版本不兼容。');
  const trusted = bundledShipPacks.find(source => source.id === pack.id);
  if (!Array.isArray(pack.ships) || !pack.ships.length || pack.ships.length > 256 || !Array.isArray(pack.weapons) || pack.weapons.length > 512
    || !Array.isArray(pack.assetRoots) || !pack.assetRoots.length || !Array.isArray(pack.sources) || !pack.sources.length
    || pack.sources.some(value => typeof value !== 'string' || !value.trim()) || !pack.baselines || !pack.refit || !pack.refit.ships || !pack.refit.weapons || !pack.refit.shipStatus)
    throw new Error('单舰包清单不完整或超出容量限制。');
  for (const root of pack.assetRoots) if (typeof root !== 'string' || !root.endsWith('/') || !safePackPath(root + 'asset.png')
    || !root.startsWith(`graphics/packs/${pack.id}/`) && !trusted?.assetRoots.includes(root)) throw new Error('包不能接管宿主或其他包的素材目录：' + root);
  validateStrings(pack.i18n);
  const registry = new ContentRegistry();
  for (const ship of pack.ships) { if (!safeId(ship.id)) throw new Error('非法舰体 ID'); validateStrings(ship.i18n); }
  for (const weapon of pack.weapons) if (!safeId(weapon.id)) throw new Error('非法武器 ID');
  // Only explicitly declared enabled packages may satisfy a dependency.
  const dependencies = shipPackDependencyClosure(pack, available);
  for (const dependency of dependencies) validateShipPackCapabilities(dependency);
  registry.registerPack(dependencies.flatMap(dependency => dependency.ships), dependencies.flatMap(dependency => dependency.weapons), requireAssets);
  registry.registerPack(pack.ships, pack.weapons, requireAssets);
  const dependencyWeapons = Object.assign({}, ...dependencies.map(dependency => dependency.refit.weapons)) as ShipPack['refit']['weapons'];
  const main = registry.getShip(pack.mainHull);
  if (!main || main.hullSize === 'FIGHTER' || main.isModuleHull) throw new Error('包缺少可部署的整舰。');
  if (pack.ships.some(ship => ship.id !== pack.mainHull && ship.hullSize !== 'FIGHTER' && !ship.isModuleHull)) throw new Error('单舰包包含另一艘独立整舰。');
  for (const table of [pack.baselines, pack.refit.ships, pack.refit.weapons, pack.refit.wings ?? {}, pack.refit.shipStatus, pack.refit.weaponStatus ?? {}])
    if (typeof table !== 'object' || Array.isArray(table) || Object.keys(table).some(id => !safeId(id))) throw new Error('非法目录键。');
  for (const [id, baseline] of Object.entries(pack.baselines)) if (baseline.id !== id || !pack.ships.some(ship => ship.id === id)) throw new Error('舰体基线引用了包外实体。');
  for (const [id, info] of Object.entries(pack.refit.ships)) if (!pack.ships.some(ship => ship.id === id) || !Number.isFinite(info.op) || info.op < 0) throw new Error('改装目录引用了包外舰体。');
  for (const table of [pack.refit.shipStatus, pack.refit.weaponStatus ?? {}]) for (const info of Object.values(table))
    if (!['supported','approximate','unsupported'].includes(info.level) || !Array.isArray(info.reasons) || info.reasons.some(reason => typeof reason !== 'string')) throw new Error('非法内容支持状态。');
  for (const ship of pack.ships.filter(ship => ship.hullSize !== 'FIGHTER')) {
    const baseline = pack.baselines[ship.id], info = pack.refit.ships[ship.id];
    if (!baseline || baseline.id !== ship.id || !info || !Number.isFinite(info.op) || info.op < 0 || !info.name?.trim()
      || !info.manufacturer?.trim() || !info.designation?.trim()) throw new Error('缺少舰体基线或改装元数据：' + ship.id);
    validateShipSpec(baseline, {registry, allowExistingId: true, requireBundledAssets: requireAssets});
    if (baseline.weaponSlots.length !== ship.weaponSlots.length || baseline.maxFlux !== ship.maxFlux || baseline.fluxDissipation !== ship.fluxDissipation
      || baseline.weaponSlots.some(slot => {
        const authored = ship.weaponSlots.find(other => other.slotId === slot.slotId);
        return !authored || authored.slotSize !== slot.slotSize || authored.weaponType !== slot.weaponType || authored.mountType !== slot.mountType
          || !!authored.builtIn !== !!slot.builtIn || slot.defaultWeaponId !== undefined && (!slot.builtIn || authored.defaultWeaponId !== slot.defaultWeaponId);
      })) throw new Error('基础舰体与运行舰体的槽位、内置装备或幅能基线不一致：' + ship.id);
  }
  for (const [id, info] of Object.entries(pack.refit.weapons)) if (!registry.getWeapon(id) || !Number.isFinite(info.op) || info.op < 0 || !info.name?.trim()) throw new Error('武器改装元数据无效：' + id);
  for (const [id, wing] of Object.entries(pack.refit.wings ?? {})) if (!safeId(id) || registry.getShip(wing.specId)?.hullSize !== 'FIGHTER'
    || !['FIGHTER','BOMBER'].includes(wing.role) || !Number.isInteger(wing.count) || wing.count < 1 || !Number.isFinite(wing.op) || wing.op < 0
    || !Number.isFinite(wing.rebuildSeconds) || wing.rebuildSeconds <= 0 || !wing.name?.trim()) throw new Error('航空目录无效：' + id);
  const variantIds = new Set<string>(), compiled: ShipSpec[] = [];
  if (!Array.isArray(pack.variants) || !pack.variants.length) throw new Error('可安装包必须提供至少一套明确的默认配装。');
  for (const variant of pack.variants) {
    if (!safeId(variant.id) || variantIds.has(variant.id) || !variant.name?.trim() || variant.fit?.hullId !== pack.mainHull
      || variant.preserveWings !== undefined && typeof variant.preserveWings !== 'boolean'
      || variant.warnings !== undefined && (!Array.isArray(variant.warnings) || variant.warnings.some(text => typeof text !== 'string')))
      throw new Error('配装目录无效。');
    variantIds.add(variant.id);
    const compile = (fit: PackFit, depth: number): ShipSpec => {
      const baseline = pack.baselines[fit?.hullId];
      if (!baseline || depth > 8 || !fit.weapons || !Array.isArray(fit.hullMods) || !Array.isArray(fit.sMods) || !Array.isArray(fit.groups)
        || !Array.isArray(fit.wings)) throw new Error('配装引用了包外舰体或配置无效。');
      const fields = new Set(['hullId','weapons','hullMods','sMods','wings','capacitors','vents','groups','modules','sourceVariantId','systemTypes','rightClickSystemType']);
      if (Object.keys(fit).some(key => !fields.has(key))) throw new Error('配装包含宿主尚未支持的字段。');
      const limit = refitRules.limits[baseline.hullSize as keyof typeof refitRules.limits] ?? 0;
      for (const investment of [fit.vents,fit.capacitors]) if (!Number.isInteger(investment) || investment < 0 || investment > limit) throw new Error('配装幅能投资超出限制。');
      let used = fit.vents + fit.capacitors;
      const spec = emptyPackHull(registry.getShip(fit.hullId)!);
      if (fit.sourceVariantId !== undefined) { if (!safeId(fit.sourceVariantId)) throw new Error('非法来源配装 ID。'); spec.sourceVariantId = fit.sourceVariantId; }
      if (fit.systemTypes !== undefined) spec.systemTypes = structuredClone(fit.systemTypes);
      if (fit.rightClickSystemType !== undefined) spec.rightClickSystemType = fit.rightClickSystemType;
      spec.maxFlux = baseline.maxFlux; spec.fluxDissipation = baseline.fluxDissipation;
      spec.hullMods = [...fit.hullMods]; spec.sMods = [...fit.sMods];
      for (const slot of spec.weaponSlots) {
        if (!Object.hasOwn(fit.weapons, slot.slotId)) throw new Error('配装缺少槽位：' + slot.slotId);
        const id = fit.weapons[slot.slotId];
        if (slot.builtIn && id !== slot.defaultWeaponId) throw new Error('配装改变了内置装备。');
        if (id !== null && typeof id !== 'string') throw new Error('配装武器引用无效。');
        slot.defaultWeaponId = id ?? undefined;
        if (id && !slot.builtIn) {
          const weapon = registry.getWeapon(id), op = pack.refit.weapons[id]?.op ?? dependencyWeapons[id]?.op;
          if (!weapon || op === undefined) throw new Error('配装武器缺少改装成本：' + id);
          used += effectiveWeaponOP(spec, weapon, op);
        }
      }
      if (Object.keys(fit.weapons).some(id => !spec.weaponSlots.some(slot => slot.slotId === id))) throw new Error('配装包含未知槽位。');
      spec.hullMods = [...fit.hullMods]; spec.sMods = [...fit.sMods]; spec.defaultWeaponGroups = structuredClone(fit.groups);
      spec.maxFlux += fit.capacitors * refitRules.fluxPerCapacitor; spec.fluxDissipation += fit.vents * refitRules.dissipationPerVent;
      spec.fighterWings = fit.wings.flatMap(id => {
        if (id === null) return [];
        const wing = pack.refit.wings?.[id]; if (!wing) throw new Error('配装缺少航空依赖：' + id);
        used += wing.op; return [{specId: wing.specId, count: wing.count, role: wing.role, rebuildSeconds: wing.rebuildSeconds, range: wing.range ?? undefined, tags: wing.tags}];
      });
      for (const id of fit.hullMods) used += hullModOPCost(spec, id);
      const errors = hullModLoadoutErrors(spec);
      if (errors.length || used > pack.refit.ships[fit.hullId].op) throw new Error(`非法配装 ${variant.id}/${fit.hullId}：${errors.join('；') || `${used} OP 超预算`}`);
      if (spec.modules?.length) {
        if (Object.keys(fit.modules ?? {}).length !== spec.modules.length) throw new Error('配装没有完整包含模块。');
        spec.modules = spec.modules.map(module => {
          const next = fit.modules?.[module.slotId]; if (next?.hullId !== module.spec.id) throw new Error('配装模块身份不符。');
          return {...module, spec: compile(next, depth + 1)};
        });
      } else if (Object.keys(fit.modules ?? {}).length) throw new Error('配装增加了未声明的模块。');
      validateShipSpec(spec, {registry, allowExistingId: true, requireBundledAssets: requireAssets});
      return spec;
    };
    compiled.push(compile(variant.fit, 0));
  }
  const paths = shipPackAssetPaths(pack);
  if (paths.some(path => !safePackPath(path))) throw new Error('包包含非法素材路径。');
  return {paths, compiled};
}
