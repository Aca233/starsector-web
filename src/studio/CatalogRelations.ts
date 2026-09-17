/** Shared by the browser relationship walker and build-time index projection. */
export type CatalogKind = "ships" | "weapons" | "wings" | "hullmods" | "systems" | "variants" | "projectiles";
export const catalogRelationFields: Record<string, [CatalogKind, string]> = {
  hullid: ["ships", "所属舰体"], basehullid: ["ships", "基础舰体"], systemid: ["systems", "舰船系统"], defenseid: ["systems", "防御系统"],
  builtinweapons: ["weapons", "内置武器"], weapons: ["weapons", "装配武器"],
  builtinmods: ["hullmods", "内置插件"], builtinmodifications: ["hullmods", "内置插件"], hullmods: ["hullmods", "船体插件"],
  permamods: ["hullmods", "永久插件"], smods: ["hullmods", "S 插件"], suppressedmods: ["hullmods", "禁用插件"],
  wings: ["wings", "装配联队"], builtinwings: ["wings", "内置联队"], variant: ["variants", "战机方案"],
  codexvariantid: ["variants", "图鉴方案"], modules: ["variants", "模块方案"],
  projectilespec: ["projectiles", "子弹丸定义"], payloadweaponid: ["weapons", "载荷武器"], targetinglaserid: ["weapons", "瞄准激光"],
  projectilespecid: ["projectiles", "发射弹丸"], projectileid: ["projectiles", "弹丸"],
  spawnprojspecid: ["projectiles", "生成弹丸"], spawnprojectilespecid: ["projectiles", "生成弹丸"],
  submunitionspecid: ["projectiles", "子弹药"], splitprojectilespecid: ["projectiles", "分裂弹丸"],
};
