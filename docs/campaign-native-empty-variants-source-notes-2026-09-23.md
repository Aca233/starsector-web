# 空变体与模块工厂（0.98a-RC8，2026-09-23）

## 原版证据 → 行为 → 当前缺口
- 本机 decompiled/starfarer_obf/com/fs/starfarer/loading/specs/HullVariantSpec.java:81–118,1020–1029,1226–1242：fresh 构造不是库存克隆；保留调用者 ID，默认 Strike/source=null、零 flux、内置武器/插件/联队、空模块表与 null override。Settings.createEmptyVariant 只调该构造器（settings/StarfarerSettings.java:1761–1763）。
- loading/ShipHullSpecLoader.java:424–431 / ShipHullSpreadsheetLoader.java:187–194：注册 *_Hull 的另一条路径设置 HULL 与 特装/标准；有武器槽即特装。fresh 空变体不能自动带上注册表默认模块。
- HullVariantSpec.java:856–890,1197–1216,1586–1650：clone 深拷贝显式 moduleVariants，而按 stationModules ID 查出的注册表模块继续共享；OP cache、hull spec、savedModuleVariants 是 Object.clone 保留的浅引用。setModuleVariant(null/STOCK) 只清 override，不能改写 stationModules；HULL 不等于 STOCK。
- loading/SpecStore.java:1849–1914：按 B.o00000() 的实际 HashMap keySet 顺序填空 *_Hull 的默认模块；跳过 empty/tag=skip_for_default_hull_modules，首个成功填入的模板获胜；模块按 D-parent/restoreToBase/base hull 规则映射 *_Hull，并原地把共享模块 displayName 改为 标准。该方法 CFR 有结构异常，已只读 javap -c -p 交叉核对安装 jar：字节码 273–520 与这段循环一致。
- 当前 OriginalStorage 已实现库存恢复和基础 clone，OriginalFleetDataFactory 已实现真实 FleetData/Cargo 构造，不重复。OriginalFleetMembers.originalFleetStockVariant 对 defaultHullModulesPending 明确拒绝；OriginalFleetInflater 缺 createInflaterEmptyVariant，CoreAutofit 缺默认模块读写/clone 绑定。

## 本块交付边界
新增独立工厂：fresh / 注册 HULL 构造、empty/stock 判定、原始 variant ID fallback、模块引用读写、复用现有 clone 并保持浅引用、显式原版顺序的默认模块初始化。沿用现有公开资源，不读私人存档，不猜注册表顺序，不自造 stock/module 占位。缺实际服务/规格/未知历史 map 容量时明确拒绝；服务可替换。
不接 NativeCampaignRuntime、不改公共检查/总进度；readyForAuthority=false 和 unavailable 原样保留。尚无实际有序 registry 的运行环境不能因有算法而自动放开制造。

## UI 与验证方法
纯后台规则，无 UI 修改；原版实机、Web 操作与最终制造链仍待核实，不操作桌面。仅定向 syntax/type/lint 静态检查；最后提供可加入既有短场景的具体断言，不新增或运行长场景。


## 最短 Runtime 接线（主代理集成，未改原文件）
文件：server/campaign/native/NativeCampaignRuntime.mjs。
1. import originalEmptyVariantFactoryServices from ../../../src/campaign/rules/OriginalEmptyVariants.mjs（命名导入）。
2. inflateNativeFleet 内、现有 bound 对象之前建下面的适配器。沿用 createProductionCargo 已使用的 fleetDataFactory.serial，这是 Web 对象身份序列；不调用 nextOriginalNativeUID、不更改原版随机/UID 消耗。

~~~js
const variants = originalEmptyVariantFactoryServices(this.fleetMemberFactoryState(), () => {
  const factory = this.fleetDataFactoryState();
  check(Number.isSafeInteger(factory.serial) && factory.serial >= 0 && factory.serial < Number.MAX_SAFE_INTEGER,
    'Current variant object allocator required');
  return 'created-variant:' + this.playerEconomyState().nativeUID.sectorRef + ':' + (++factory.serial);
});
~~~

3. bound 中现有 readInflaterStockVariant（本轮查看约1925行，紧邻 isInflaterPlayerFaction）可保留原实现；其下一行添加：
~~~js
createInflaterEmptyVariant: variants.createInflaterEmptyVariant,
~~~
4. fitInflaterVariant 内 executeOriginalCoreAutofit 的 services 对象、最后 ...services.autofitServices 之前添加：
~~~js
readModuleVariant: variants.readModuleVariant,
cloneVariant: variants.cloneVariant,
setModuleVariant: variants.setModuleVariant,
~~~
全部保留原来末尾服务覆盖优先级。模块 callback 默认调用同一 memberFactory 的 originalFleetStockVariant，返回同一缓存对象，不另建库存注册表。

适配器签名：
- originalEmptyVariantFactoryServices(memberFactory, allocateObjectRef:()=>string, services?)
- createInflaterEmptyVariant(id:string, hullId:string) → fresh variant（source 真的为 null）。
- readModuleVariant(parent, slotId) → 实际 override/共享库存 variant/null。
- cloneVariant(variant) → 独立可变副本；setModuleVariant(parent, slotId, variant|null) → void。
- 可选 services.readRegisteredVariant(id) 替换模块库存读取；readEmptyVariantHull / readEmptyVariantWeaponId / readEmptyVariantText 替换原版规格/文本；不得用 async 服务。

注意既有 OriginalAutofitEquipment.d.mts 的 variantSource:string 与 groupSpecs.type:string 比真实构造器窄；若主线给 services 显式 TS 类型，应允许 source=null、group type=null，而不是为了编译把实际 null 伪造成 REFIT。CoreAutofit 开始处理后自己设 REFIT。

## 可加到既有短场景的最小断言（此任务未运行）
使用场景现有真实 memberFactory；下面测试身份序列仅是 fixture 的 Web ref，不改 Sector UID。

~~~js
import {originalEmptyVariantFactoryServices, originalVariantIsEmptyHull,
  originalVariantIsStock, originalVariantModuleSlots} from '../src/campaign/rules/OriginalEmptyVariants.mjs';
// originalFleetStockVariant 沿用场景已有导入。
let variantRef = 0;
const variants = originalEmptyVariantFactoryServices(memberFactory, () => 'empty-factory-test:' + (++variantRef));
const hermes = variants.createInflaterEmptyVariant('test-fleet_0', 'hermes');
assert.deepEqual([hermes.hullVariantId, hermes.displayName, hermes.variantSource], ['test-fleet_0', 'Strike', null]);
assert.deepEqual(hermes.effects.hullMods, ['civgrade']);
assert.deepEqual([hermes.weapons, hermes.wings, hermes.effects.stationModules], [[], [], []]);
assert.equal(hermes.moduleVariants, null);
assert.equal(originalVariantIsEmptyHull(hermes), false); // fresh != registered HULL
const bare = originalFleetStockVariant(memberFactory, 'hermes_Hull');
assert.equal(originalVariantIsEmptyHull(bare), true);
assert.equal(originalVariantIsStock(bare), false);
const target = originalFleetStockVariant(memberFactory, 'onslaught_mk1_Ancient');
const modular = variants.createInflaterEmptyVariant('test-fleet_1', target.hullId);
assert.deepEqual(modular.effects.stationModules, []); // do NOT copy stock/default modules during construction
modular.effects.stationModules.push(...target.effects.stationModules.map(row => [...row])); // CoreAutofit first step
assert.deepEqual(originalVariantModuleSlots(modular), ['WS 026', 'WS 027']);
const stockModule = variants.readModuleVariant(modular, 'WS 026');
assert.equal(stockModule, originalFleetStockVariant(memberFactory, 'module_onslaught_armor_left_Standard'));
assert.equal(variants.readModuleVariant(variants.cloneVariant(modular), 'WS 026'), stockModule); // fallback shared
const module = variants.cloneVariant(stockModule); module.variantSource = 'REFIT';
variants.setModuleVariant(modular, 'WS 026', module);
assert.equal(variants.readModuleVariant(modular, 'WS 026'), module); // setter does not clone
const copy = variants.cloneVariant(modular);
assert.notEqual(variants.readModuleVariant(copy, 'WS 026'), module); // explicit override deep clone
assert.equal(copy.hullSpec, modular.hullSpec); // native Object.clone shallow spec
const rosterId = modular.effects.stationModules[0][1];
variants.setModuleVariant(modular, 'WS 026', stockModule);
assert.equal(modular.moduleVariants, null);
assert.equal(modular.effects.stationModules[0][1], rosterId); // STOCK must NOT replace roster ID
assert.equal(variants.readModuleVariant(modular, 'WS 026'), stockModule);
const hullModule = originalFleetStockVariant(memberFactory, 'module_onslaught_armor_left_Hull');
variants.setModuleVariant(modular, 'WS 026', hullModule);
assert.equal(modular.moduleVariants[0][1], hullModule); // HULL is NOT STOCK; keep override
variants.setModuleVariant(modular, 'WS 026', null);
assert.equal(modular.moduleVariants, null);
assert.throws(() => variants.createInflaterEmptyVariant('missing', 'not_an_installed_hull'), /Unloaded empty-variant hull/);
~~~

## 默认 *_Hull 模块初始化的明确边界
initializeOriginalDefaultHullModules(services) 已移植完整顺序循环，但不猜全局注册表历史。需要以下实际服务：
- readVariantRegistryOrder(): string[]，原版 B.keySet 快照（普通 variants 之后、mission variants 之前）；
- readRegisteredVariant(id): 实际同一对象 | null（不能用每次新造对象代替）；
- readModuleHullRestoration(id): {hullId,isDefaultDHull,isRestoreToBase,dParentHullId,baseHullId}。
createOriginalRegisteredHullVariant(ref,hullId) 是真实 loader 构造阶段，不等于默认模块 pass 已完成。不能直接在原 originalFleetStockVariant 删除 defaultHullModulesPending 拒绝门；应在有顺序证据的初始化事务内构造/注册实际 HULL 对象，再执行 pass。此处无新注册表导入脚本/数据、无初始化成功标志兜底。

本轮可直接填入 inflater 的 fresh/module 缺口；DMod、NPC 装配上下文、制造的其余服务和默认 registry 输入不足仍必须 unavailable。未改任何权限/readyForAuthority 标志。

## 表示与拒绝
- effects.tags 沿用现有 Storage 的 getTags() 空数组投影，不声称保留 Java 私有 tags null 的 lazy-allocation 状态；模块的 null override/缺失未知仍严格区分。
- 原版原始 ID 不重写；调用者负责每次全新 objectRef。stock registry 对象不会复制为假的私有 stock。
- 捕获的非空 override 若缺原 HashMap 容量，读取/clone 可做；需要插入时拒绝猜容量。未知 hull/weapon、异步服务、循环/过深 clone、树化 HashMap、无法表达的 null override value 明确拒绝。
- clone 复用 OriginalStorage 的集合逻辑，只补恢复原本应浅保留的 hullSpec / statsForOpCosts / savedModuleVariants；不存在 override 的库存模块不会被递归克隆。


## 本次静态验证
- node --check 新增 mjs：通过。
- tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck false --types node 新增 d.mts：通过（退出0）。
- 未运行任何场景、全套检查或游戏；主代理集中执行 Runtime 接线后的类型/lint/既有短场景。
- 三个文件均使用 flag=wx 首次新建；仅编辑本任务新文件，无数据/导入脚本需要新建。

## 主代理集成（2026-09-23）
- 已接 inflateNativeFleet 的默认 createInflaterEmptyVariant 与 CoreAutofit 的模块读/clone/set。适配器延迟构造，neutral/已inflated早退不新增未用工厂依赖。Web对象ID使用当前fleet.objectRef + FleetData.serial，不消耗原版Sector UID，也不强迫NPC读取玩家UID。
- 新增可替换 emptyVariantServices；保留原有最末服务覆盖。声明放宽原版确有的variantSource=null/group.type=null，没有伪造REFIT。
- 默认模块初始化的真实全局注册表顺序尚缺，defaultHullModulesPending 原拒绝保留，不能据此声称制造已闭环。
- Hermes、Onslaught模块身份/深浅克隆断言并入既有月结短场景；原Inflater场景也已换成真实fresh工厂，不再复制HULL模板。待统一验收。

## 主代理集成验收结果
- 完成上述Runtime接线并保留不可用边界。与特殊必需品同批：类型退出0、12个相关文件lint退出0；既有短月结场景1通过0失败，1175.3467ms/总1881.0061ms。
- 场景验证Hermes新建构造、Onslaught真实模块库存、HULL/STOCK区别、override深克隆及OP缓存/HullSpec/savedModules浅引用；Inflater场景使用本工厂创建fresh变体。
- 完整默认模块注册表初始化仍未实装到运行世界，未通过该拒绝门冒充完整制造；无界面、私人存档、全套测试、提交或发布。日志见 campaign-native-required-items-*-final.log。
