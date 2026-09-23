# 默认 *_Hull 模块注册表：来源与接线（0.98a-RC8）

## 原版证据 → 预期行为 → 当前差异
- SpecStore.java:171–184：船体、ship_data CSV、skins，随后硬编码 oo0o 变体，最后普通 variants；不能只对 reference-storage JSON 的键排序。
- LoadingUtils.java:47–58,192–287,409–411 / fs.common 的 C.java:174–297：使用原版资源根、File.listFiles 顺序、LinkedHashSet 去重，CSV 合并也由本机真实 LoadingUtils 完成。
- ShipHullSpreadsheetLoader.java:43–49,185–194：CSV 行顺序注册基础 *_Hull；ShipHullSpecLoader.java:78–95,150–173,420–431：原版 skins 枚举及 first-wins 注册。
- B.java:34–53：真实 HashMap 注册、keySet 快照；SpecStore.java:1849–1914 的默认模块 pass 使用此顺序，先跳过 empty/tagged/已填目标，再按 D-parent/restore-to-base 映射模块，并修改共享模块显示名。
- CFR 的 SpecStore 循环结构有异常，上块已按本机 jar 的 javap 字节码交叉核实。此次用公开规格的必要字段建立 native spec 输入，直接执行本机 B/oo0o/SpecStore 作为顺序和默认模块 oracle；绝不启动世界、游戏窗口或读取存档。
- 当前原成员工厂仍因 defaultHullModulesPending 拒绝 14 个模块船体。此次只接有原版 oracle 证据的新工厂初始化；旧 checkpoint 不补造历史、不覆盖已有 stock 对象。

## UI 与验证边界
无 UI 修改。原版实机/最终制造仍未验证；仅后台公开资源导入、native 规则 oracle 与定向静态检查。不改 Runtime、公共场景、OriginalEmptyVariants 或总进度。readyForAuthority/unavailable 原样。


## Oracle 实际范围与结果
新增 scripts/lib/NativeDefaultHullRegistry.java + scripts/import-campaign-default-hull-registry.mjs。
- 资源根显式只绑定本机 starsector-core；路径枚举调用真实 C，基础 HULL 注册按真实 LoadingUtils CSV merge 的行序，skins 按真实 C 的 root/subfolder 枚举序。
- native spec 输入仅包含这条规则读取的公开 hull/slot/built-in、weapon ID、wing ID 和 restoration 字段；不是完整游戏资源加载或原版实机。位置/尺寸来自现有公开-spec 导入，未调用的渲染字段不用于 oracle。JSON 枚举只用于无关的 spec 查找表输入，不决定 variant 注册顺序。
- 调用安装 jar 的 oo0o.ÔÓ0000() 实际插入硬编码 variants，而非漏掉它们后模拟 HashMap。随后真实 HullVariantSpec(JSONObject) 注册普通文件变体，从真实 B.o00000() 获取最终 keySet。
- 原版 SpecStore.oO0000() 重新扫描已存在的普通 variants（跳过重复构造），执行真实默认模块 pass。导入器逐 HULL 将独立规则重放结果与 native 输出比较。其前后 registry keySet 必须完全相同，禁止 mission/external variants 混入。
- pass 前检查所有 HULL/module 查找存在，避免缺项触发 CampaignEngine 的 saved-variant fallback。不加载世界、NewGame、私人存档或游戏窗口。
- 当前安装结果：761 个 registry IDs = 266 个 HULL + 444 个文件 STOCK + 51 个硬编码 variants；填充 13 个 HULL，修改 22 个共享 HULL 的显示名。14 个原 pending 中 remnant_station1_Hull 没有模板，native 输出确实为空；remnant_station2_Hull 使用 Standard 而非带 skip tag 的 Damaged。
- 数据 referenceId：e2db5dfb4da77950996040d379ecc2c91da20c8d2732add245bf1584ab8be57f。每个 hullVariants 条目记录 initialDisplayName/displayName、stationModules、templateId、registryIndex；完整 registryOrder、registrationEvents、legacyIds、jar/JRE/公开资源 sha256 一并保存。

## 新工厂初始化和旧 checkpoint
OriginalFleetMembers → OriginalDefaultHullModules → data/Values；不依赖 OriginalEmptyVariants，避免循环。
- createOriginalFleetMemberFactory(mathRandom) 已直接接通，无需 Runtime 新调用。按 oracle 的 registryOrder 创建全部 266 个真实 HULL 缓存对象，按原版结果填 stationModules/显示名，全部完成后才设置 defaultHullRegistry 初始化依据。没有消耗随机数或 Sector UID。
- 仍沿用 restoreOriginalStorageVariant 与原 stock-construction-variant:<id> 身份；moduleVariants 保持 null，多个父模块通过同一个 originalFleetStockVariant 缓存共享子 HULL，不深造副本。
- 原 defaultHullModulesPending 数据没有删掉。读取 pending/受 pass 改名的 HULL 必须有准确 referenceId 的初始化依据；新工厂若丢失已初始化的缓存对象也拒绝，不能静默重建。
- 原 cache 的对象不被读路径覆盖。恢复的当前对象即使改名/改装，也不被原静态 recipe 重置。validator 检查依据与缓存身份，而不是强求变体永远等于出厂值。
- 旧 checkpoint 缺 defaultHullRegistry 时不补字段、不调用新工厂去迁移；有受影响库存的旧 checkpoint validation 拒绝。未受影响的原有 STOCK / 基础 HULL 读取可继续保留原状态。

## DModManager 复用
从 src/campaign/rules/OriginalDefaultHullModules.mjs 命名导入 originalHullRestoration，或读取 ORIGINAL_DEFAULT_HULL_MODULES.hullRestoration。
~~~ts
originalHullRestoration(hullId): Readonly<{
  hullId: string;
  isDefaultDHull: boolean;
  isRestoreToBase: boolean;
  dParentHullId: string | null;
  baseHullId: string | null;
  defaultModuleHullId: string; // native SpecStore.o00000(hull) 的额外 oracle 值
}>
~~~
- 覆盖 532 个已加载 spec，包含真实生成 D hull。hermes_default_D: {isDefaultDHull:true,isRestoreToBase:false,dParentHullId:'hermes',baseHullId:null,defaultModuleHullId:'hermes'}。
- hermes_d 为 restoreToBase=true、dParentHullId=null、baseHullId='hermes'；hermes_d_default_D 继承 restoreToBase=true，但有 dParentHullId='hermes_d'，native 默认模块映射因此返回 hermes_d，不应擅自直接跳到 hermes。
- fleet-members importer 现在遍历全部 storage.hulls，补齐此前少掉的 266 个 D spec 的 slots/name/noAutoPenalty；D 名称沿原生成规则为父名称 + ' (D)'。variants 仍只有原 710 项，没有生成不存在的 *_default_D_Hull。OriginalEmptyVariantHull 因此能直接解析 hermes_default_D；无需修改该文件。
- 本表只供应恢复元数据，不实现或宣称 DModManager 的候选、权重、CR、NPC 上下文已经完成。

## 可加入既有短场景的最少断言
沿用现有 createOriginalJavaRandom / createOriginalFleetMemberFactory / originalFleetStockVariant / originalEmptyVariantFactoryServices 导入；另导入 originalHullRestoration 和 originalEmptyVariantHull。
~~~js
const factory = createOriginalFleetMemberFactory(createOriginalJavaRandom('23'));
let ref = 0;
const variants = originalEmptyVariantFactoryServices(factory, () => 'default-hull-test:' + (++ref));
const parent = originalFleetStockVariant(factory, 'onslaught_mk1_Hull');
assert.deepEqual(parent.effects.stationModules, [
  ['WS 026', 'module_onslaught_armor_left_Hull'], ['WS 027', 'module_onslaught_armor_right_Hull'],
]);
const child = originalFleetStockVariant(factory, 'module_onslaught_armor_left_Hull');
assert.equal(child.displayName, '标准');
assert.equal(variants.readModuleVariant(parent, 'WS 026'), child);
assert.equal(variants.readModuleVariant(variants.cloneVariant(parent), 'WS 026'), child);
assert.deepEqual(originalFleetStockVariant(factory, 'remnant_station1_Hull').effects.stationModules, []);
assert.equal(originalFleetStockVariant(factory, 'remnant_station2_Hull').effects.stationModules.length, 15);
assert.equal(originalEmptyVariantHull('hermes_default_D').hullId, 'hermes_default_D');
assert.equal(originalHullRestoration('hermes_default_D').dParentHullId, 'hermes');
assert.throws(() => originalFleetStockVariant(factory, 'hermes_default_D_Hull'), /Unloaded stock/);
const old = {...factory, stockVariants: {...factory.stockVariants}};
delete old.defaultHullRegistry;
assert.throws(() => originalFleetStockVariant(old, 'onslaught_mk1_Hull'), /initialization history/);
assert.equal(old.stockVariants.onslaught_mk1_Hull, parent); // no replacement or migration
~~~

## 本次验收
- native importer 生成及 --check 通过：真实注册顺序 / 13 个填充结果 / 22 个改名结果一致。
- fleet-members importer 生成及 --check 通过：710 variants，532 hull specs。
- 4 个改动 mjs 的 node --check、两个规则声明文件的 strict tsc、改动文件定向 oxlint 均通过（退出0）。
- 一次内存内定向工厂 probe 通过：逐个核对全部 266 个 native HULL 输出、共享模块、保留当前改名、remnant 空/完整结果、hermes D spec、旧 checkpoint 拒绝及当前 checkpoint structuredClone 后不重新构造。
- 未运行公共场景、全套、长场景、UI 或游戏。制造/战役总体、原版实机仍未验证；readyForAuthority=false 和 unavailable 未改。
