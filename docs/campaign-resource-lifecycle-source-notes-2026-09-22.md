# 资源设施生命周期源码对照（2026-09-22）

## 范围 / 修改前对照

已重读当前 `AGENTS.md`。本轮仅创建 `OriginalResourceLifecycle.mjs/.d.mts`、本文，并为 Mining 历史视觉字段定向扩充 `scripts/lib/campaign-native-save.mjs/.d.mts`。不修改其它代理所有的 ResourceIndustries，不修改 Runtime、测试、总进度；不运行 tsc/lint/test，不操作桌面或启动可见窗口，不提交/推送/发布。

版本仍为本机日志标记的 **Starsector 0.98a-RC8**。以下 Java 路径以 `../decompiled/` 为根。参考已落地 OriginalCivicLifecycle / OriginalProductionLifecycle 的同图实例和完整 Memory 绑定契约，但不复制其未连接的功能为“已完成”。

| 原版证据 | 预期行为 | 现状差异 / 本轮实现方向 | 主代理集中验收建议 |
| --- | --- | --- | --- |
| `starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/BaseIndustry.java:60-85,137-174`; `starfarer_obf/com/fs/starfarer/loading/specs/H.java:101-108`; `.../campaign/econ/Market.java:273-311` | 新插件默认字段→init/readResolve；instantiate 不挂市场、不 apply；add 挂同一实例后 apply；remove 先 notify/unapply 再从活跃名单移除 | 资源产业已有经济 callback，尚无资源生命周期行；新增真实默认值、同图 entry/finances 和保留退役行 | 构造调用次数/共享引用；add 重复 ID 不重复 apply；退役实例不被替换 |
| `BaseIndustry.java:391-413,496-555,598-610` | 默认 advance：当前故障与历史 wasDisrupted 比较，恢复钩子为空；非故障建设进度加 float days；普通完成先重置字段→通知→接队列→unapply/apply | Farming/Mining 没有 advance、notifyDisrupted、disruptionFinished 覆盖，不应加额外计时器 | 共享故障、过期、调试 x100、完成队列顺序；不调用虚构恢复 apply |
| `BaseIndustry.java:1578-1610`; `Farming/Mining` 类定义 | 故障 key 按运行类；farming/aquaculture 共用 `$core_disrupted_Farming`，mining 使用 `$core_disrupted_Mining` | 用完整同一份 OriginalCampaignMemory，不用快照 bool 当运行时真相；旧捕获先按 data/expire 对照绑定 | 冲突捕获、缺字段/错别名、不同 Memory 实例必须拒绝；同类多个实例同步 |
| `BaseIndustry.isAvailableToBuild:821-826`; `Farming.java:52-69`; `Mining.java:67-79` | 先检查 market_no_industries_allowed tag / population 存在，再检查 water 行星+映射至 farming 的条件，或映射至 mining 的条件 | 提供单独当前准入 getter，不在低层 add 强塞用户建造命令规则 | 无 population/禁用tag；water/null/其它行星；food/lobster 条件；不按 surveyed/suppressed 筛掉原版没有过滤的条件 |
| `../starsector-core/data/campaign/industries.csv:3-5`; 既有 reference-military-bases.json industrySpecs | 三个资源产业建设时长 60，upgrade/downgrade 均为空 | 普通完成支持，非空资源 upgrade 捕获/启动明确不支持，不制造农业↔水产升级 | 60 天完成，buildTime clamp；拒绝非原版升级 |
| `Mining.java:24,119-149`; `CoreLifecyclePluginImpl.java:1991` | shownPlasmaNetVisuals 为非 transient boolean，默认 false；设置物品先 base 撤旧经济效果/存新对象，然后按历史 flag 与新物品调用实际行星视觉 | 新捕获显式输出该字段；原始 Java 字段缺省 false，与“旧 JSON 捕获没有该字段”严格区分；后者不能猜 false | 原始缺字段=false；显式 true；旧捕获缺字段拒绝；无行星时保持历史 flag；缺真实服务在副作用之前拒绝 |
| `Mining.java:119-149`; `BaseIndustry.notifyBeingRemoved:614-630` | applyVisuals 设置 shieldTexture2、0.15、白色并 applySpecChanges，unapplyVisuals 清除并 applySpecChanges；无 planet 直接 return（不改 flag）；remove 不自动调用 setSpecialItem/清视觉 | 视觉必须通过实际服务完成，不只写 shown flag；本地/远程回收物品与核心须真实 cargo 服务或明确拒绝 | 重复安装 plasma 仍 apply；旧 flag=true 且改为非 plasma 执行 unapply；无 planet 保留 flag |

## 源码约束

- Farming/Mining 默认 Base.advance，未发现普通矿床枯竭推进。TechMining 的衰减仍是另一插件，不在本生命周期内。
- BaseIndustry.unapply 在物品撤销之前注销 transient immigration。资源经济 unapply 本身不负责注销；生命周期必须要求真实注销服务，不能把监听注册状态静默忽略。
- 行星视觉回调只由 Mining.setSpecialItem 触发，不是每次 apply、失能或普通 remove 都清掉。不能依据当前 specialItem 推导 shownPlasmaNetVisuals；无行星时该历史 flag 可保留 true。
- 原始字段省略时恢复 Java primitive false 的依据：Mining 明确声明 false，字段非 transient，没有 Mining readResolve 覆盖；CoreLifecycle 仅注册 Mining 类别名，未见该字段改名或 omit。新 capture 有字段而值=false，与老版本 capture 无字段不是同一种信息。
- 本轮未得到对应原版 UI 截图，原版实机及 Web 交互均待验收；不调整 UI。

## 实现契约与验收记录

已按上述先证据→本文最小对照→代码的顺序落地，仅修改授权的五个文件。

### Runtime 导出契约

生命周期放在 `market.resourceLifecycle`，行对象包含 `objectRef/active/entry/finances/buildProgress/buildTime/buildCostOverride/wasDisrupted/special/shownPlasmaNetVisuals`。完整签名在同名 `.d.mts`；核心导出如下：

| 导出 | 作用 |
| --- | --- |
| `hasOriginalResourceFrame(id)` | 仅 farming/aquaculture/mining，不含 techmining |
| `restoreOriginalResourceLifecycle(saved, market, shareSpecial?)` | 返回新生命周期但不自动赋给 market；保留 market 内 entry/finances 的引用，按可选 interner 保留 SpecialItemData 共用对象 |
| `validateOriginalResourceLifecycle(market)` | 校验类/字段、当前与退役实例、对象身份、特殊物品、Mining 历史 flag；未知资源升级明确拒绝 |
| `bindOriginalResourceMemory(market, memory)` | 对照捕获 data+有序 expire 后绑定同一完整 Memory，删去临时 disruptions 投影；禁止替换已绑定 Memory |
| `syncOriginalResourceDisruption(market, memoryServices?)` | 当前与保留行均从同一完整 Memory 读取；不推进时间、不复制 Memory |
| `setOriginalResourceDisrupted(market, id, days, useMax?, memoryServices?)` | 原生 duration/useMax/set/unset；Farming 与 aquaculture 共用运行类 key；空恢复钩子不触发虚构经济重应用 |
| `instantiateOriginalResourceIndustry(market, id)` | 创建脱离名单的默认实例，不 apply；队列候选和后续 add 是两个真实实例，不复用候选 |
| `addOriginalResourceIndustry(market, id, runtime)` | 已有 ID 则返回原行；否则先挂 lifecycle/market/finance，再同步故障并执行实际 apply |
| `startBuildingOriginalResourceIndustry(market, row, runtime)` | building=true，progress=0，upgrade=null，time=60，然后实际 unregister+经济 unapply |
| `unapplyOriginalResourceRow(market, row, runtime)` | 先注销此实例 transient immigration，再调用已有资源经济 unapply；不清空旧供需，不清视觉 |
| `advanceOriginalResourceIndustryFrame(market, row, days, runtime, {colonyDebug?}?)` | 调用已有 Base.advance；days 必须是实际 clock-converted float days；返回当前旧实例 industryRef 与 finishedRef |
| `removeOriginalResourceIndustry(market, id, runtime, {mode?,forUpgrade?}?)` | 原版 notify（必要实际 cargo 回收）→unapply→移出活跃数组；原行保留 active=false，旧 entry/finances/special/history 不替换 |
| `setOriginalResourceSpecialItem(market, row, special, visualServices?)` | 原生 setter，不是安装许可/货舱交易；撤旧物品经济效果→保留新 SpID 对象→执行必要 Mining 视觉 |
| `isOriginalResourceIndustryAvailableToBuild(market, id, {readPlanetType?}?)` | 当前 tags/population/行星类型/资源条件判断；不声称实现命令权限、资金、已有同 ID 过滤或产业数量上限 |

准入使用当前 `market.tags / industries / conditions`。tags 为 null/缺失表示未恢复，不能当空数组。农业/水产通过基本准入后必须提供 `readPlanetType(): string | null`；null 只表示确无行星，不表示未知。Mining 不需要该 getter。water 必须精确匹配行星 typeId，不依据 gasGiant、水面条件或名字猜测。条件是 `ResourceDepositsCondition` 的商品→产业映射，包括 `volturnian_lobster_pens`，不是仅检查 farmland 前缀。所有条件判断不增加原版没有的调查/抑制筛选。

### 必需真实服务与普通完成顺序

```ts
interface Runtime {
  memoryServices?: OriginalCampaignMemoryServices;
  apply(row): unknown;                 // 同步完整资源 apply，含实际财务/lazy getter/移民登记
  unregisterImmigration(row): void;    // 移除当前实例的实际 transient 登记
  buildNextInQueue(): unknown;         // 共用实际队列，包括取消/退款/准入/数量检查
  timestamp(): string;                 // 玩家市场完成消息的当前时间
  notifyBeingRemoved?(row, mode, forUpgrade): void;
}
```

`apply` 不读取捕获数据构造伪结果，不应重复执行本模块已做的 unapply。普通完成严格为：building=false、progress=0、time=1 → 玩家完成消息记录 → `buildNextInQueue()` → 注销/经济 unapply → 实际 apply。完成消息使用现有生命周期的 messages 记录约定，不操作桌面 UI；实际消息展示仍由主线消费。队列的 started/cancelled/refund 由已有真实队列回调负责，本模块不维护第二队列、不另扣款。

移除 `mode:null` 或 `forUpgrade:true` 时，原版无需归还核心/物品，故不要求 cargo 服务。其余 LOCAL/REMOTE 移除且存在核心或物品时，必须提供 `notifyBeingRemoved`；该服务按原版选择玩家货舱/市场存储，执行实际转移或处理原版 null cargo 分支。缺服务拒绝，不假装回收成功。

### Mining 视觉及 capture

- `NativeSavedIndustry.shownPlasmaNetVisuals?: boolean | null`：新 capture 的 Mining 总是显式 boolean；其它类为 null；旧 JSON 捕获没有该属性。Mining 旧捕获缺属性时 restore 返回 null，显式无效值则校验失败，不能用“当前没装 plasma”猜 false。
- native XML 的该字段省略时按 Java primitive 默认 false 解码；本机 API 源码与反编译源码均确认字段 `protected boolean shownPlasmaNetVisuals = false`。CoreLifecycle 序列化注册未重命名/排除此字段。已把解码字段从 Mining.otherFields 移除，未动其他字段捕获。
- `setOriginalResourceSpecialItem` 的特殊视觉分支要求 `readPlanet(): object | null` 与 `setMiningPlasmaVisuals(planet, enabled, row): void`，两者函数必须在任何 setter 副作用前存在，否则拒绝。实际调用 getter/视觉仍在 Base setter 撤旧经济效果并存新 SpID 之后。
- 视觉服务必须作用于同图实际行星并执行 `applySpecChanges`：enabled=true 时 shieldTexture2=原版 `industry/plasma_net_texture` sprite、shieldThickness2=0.15、shieldColor2=白色 RGBA；false 时 texture/color=null、thickness=0。生命周期不会用改 boolean 代替实际视觉。
- getter 返回 null 时原版视觉函数直接 return，历史 flag 不变；返回实际 planet 且服务同步成功后才改 flag。重复设置 plasma 也调用 applyVisuals；历史 shown=true 时换为非 plasma 调 unapplyVisuals，即使旧 special 与视觉 flag 不一致。
- remove/unapply/失能不擅自调视觉清理：原版 Mining 仅覆盖 setSpecialItem，并无 remove/unapply 的视觉覆盖。本模块也不修改 PlanetSpec/视觉字段存档恢复，那属于真实行星服务和主线图恢复。
- getter/服务异常或返回 Promise 时明确失败。这里是共享事务内的可变内核，不提供独立原子回滚；调用中已产生的部分变更/外部回调副作用由 Runtime 事务负责人处理，不声称失败后自动复原。

### 静态复读与未覆盖

已逐项代码阅读复核：三种 CSV 建造时长/空升级、完整 Memory 对照绑定、同类故障 key、故障恢复空钩子、普通完成队列先后、退役对象留存、构造与 apply 区分、item setter 和 visual 历史独立、缺捕获/缺真实服务拒绝、API/声明导出对应。

**本任务未运行 tsc、lint、test、探针、原版实机或 Web 界面验收。** 静态复读不是测试通过报告；Runtime 自然帧调度与整合验收由主代理统一进行。

仍未覆盖或明确交由主线：Runtime 接线与自然帧调度；市场完整 Memory 的原始捕获/全局推进；实际经济 apply/行政 getter 更新；真实队列许可/退款、安装物品命令与货舱事务；实际行星视觉服务和保存后的行星 spec 恢复；完成消息 UI；玩家可操作生命周期全流程。非原版升级目标、未知资源插件、TechMining 遗迹衰减/随机挖掘均不支持。不以本模块存在声称完整生涯或所有资源事件已经还原。
