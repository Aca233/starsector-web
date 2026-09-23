# 原版市场经济输入：源码核实、纯计算实现与接线边界（2026-09-19）

## 交付状态

本轮只新增独占写集文件，没有修改既有 market/pricing、Kernel、Repository、RuleRegistry、client 或其他进度文档；没有提交、推送、打包或发布。

交付的是**已执行原生源码对照测试的经济输入计算模块**，不是完整原版经济模拟，不是已启用的 provider。主线程可审查后接线。市场快照原有 same-tick 保护必须保留，不能把本模块的 `sourceRevision` 字符串当作 freshness 证明。

文件：

- `src/campaign/rules/OriginalMarketEconomy.mjs` / `.d.mts`：产业有效量聚合、运输/出口输入、可用量、交易等级、图标量、一次真实定价阶段的 demand/greed/stockpile/阈值/玩家修正。
- `src/campaign/rules/OriginalMarketEconomyLedger.mjs` / `.d.mts`：带幂等凭证的交易影响账本，显式帧序列推进、到期删除、只读校验。
- `src/campaign/rules/OriginalMarketEconomySchedule.mjs` / `.d.mts`：经济任务的原版调度决策；不执行/假装完成任务。
- `src/campaign/data/reference-market-economy.json`：设置、商品经济单位/分类、17 个源码/数据文件 SHA-256。
- `scripts/import-campaign-market-economy.mjs`：确定性导入与 `--check`；商品目录依赖已有 reference-market 与相同原版 CSV 的哈希一致。
- `scripts/check-campaign-market-economy.mjs`：17 项测试，包括提取原版 Java 编译执行的 oracle。
- 本文档。

## 源证据

源码根是 `../decompiled`，数据根是 `../starsector-core`。参考 JSON 保存完整相对路径与 SHA-256；这里列出审查入口，而不是将反编译内容视为指令。

| 源文件/入口 | 本轮核实的规则 |
| --- | --- |
| `starfarer_obf/.../econ/reach/MainWorkTask2.java:doNextBatch` | 先重施市场条件和产业，再逐商品/经济组计算；只有 withStockpileUpdate 才执行库存/定价阶段；随后通知监听器。 |
| 同文件 `updateStockpileAndPriceV2`（约133行） | Java 月度 Random、demand/greed、无供需的玩家折扣、主商品库存、供需阈值。 |
| 同文件 `getStockpileQuantity`；API `BaseIndustry.getSizeMult/getCommodityEconUnitMult` | 正等级库存单位线性；交易等级的每级经济单位目前是常量，非正等级为0。 |
| `CommodityOnMarket.java:updateMaxSupplyAndDemand`（约403行） | 取实际产业 `getModifiedInt()` 的最大值，不求和；严格大于才更新合法性，0时保留先前合法性。 |
| 同文件 `getCombinedTradeModQuantity/getModValueForQuantity/reapplyEventMod`（约305行） | both + max(plus,0) + min(minus,0)；循环转换等级；具名 eMod 替换。 |
| `CommodityMarketData.java:getShippingCapacity`（约98行） | 流通性先 Java float 运算四舍五入到百分位，势力内加0.5，再除0.1、截断并下限0。 |
| 同文件构造函数（约138行起） | 出口第一遍使用旧 availability 和更新流通性前 shipping；之后再更新流通性。第二遍用新 shipping 选择本地/势力内/全球输入、shortage、lowaccess。 |
| 同文件约247行 early continue | 清除 core 可用量修正后可能直接 continue，**不执行 reapplyEventMod**，必须保留进入此阶段前实际 eMod。 |
| API `CommodityIconCounts.java` | 生产、可用量、需求、额外供给、缺口、进出口图标数量。 |
| `MarketDemand.java:getDemandValue/getStockpileUtility` | demand 是共享需求类 MutableStat 的有效值；可报价库存效用还含实际交易残量，并非零售库存。后者继续使用已有 pricing 模块。 |
| `Market.java:advance`（约449行）、`updatePrices`（约786行） | 每帧推进临时修正后重新应用 eMod；updatePrices 只是 updateCalc，不重新计算月度库存与阈值。 |
| API `MutableStat.java`、`StatBonus.java` | 按具名修正插入次序累加 flat/percent、连乘 mult，每步使用 Java float。 |
| API `MutableStatWithTempMods.java:advance`（约87行） | 每帧 `timeRemaining -= days`；<=0删除，不逐渐衰减影响幅度。 |
| API `BaseSubmarketPlugin.java`（约180行） | 原版交易影响天数120；PLAYER_SELL_ONLY 模式的卖出和买入都写 plus（分别正/负）。 |
| `CampaignClock.java` | 10秒/游戏日；月字段是 Calendar.MONTH+1，不是累计月份。 |
| `Economy.java:advance`（约121行） | stepper.nextFrame(convertToDays(amount)) 在各 market.advance(amount) **之前**。另有显式 force-stockpile 更新入口。 |
| `ReachEconomyStepper.java` | WAITING/DOING_TASKS，真实月历间隔、10次迭代、末次库存更新、每帧推进一个当前任务、月末报告时序。 |

## 已实现的关键公式

所有相关中间浮点运算显式 `Math.fround`，随机数实现 Java 48-bit LCG 和 UTF-16 String.hashCode；先执行 Java int 溢出再扩展 seed。

- seed = int32(hash(marketId) + hash(triggerCommodityId) + month * 170000)。当前只支持主商品自身作为触发商品。
- industry supply/demand = max(0, 各实际产业有效量按 Java Math.round 取整)，不是产业数值之和。
- demandUnits = max(1, production - inFactionOnlyExport - canNotExport, maxDemand)。
- rawDemand = (econUnit * demandUnits + minStockpileForPricing * 2) * (0.95f + 0.1f * firstRandomFloat)。
- demandStat 的 `core` flat = rawDemand * (1 - greedFraction)；greedStat 的 `core` flat = rawDemand * greedFraction。再应用原有具名修正和 base。
- 无产业 supply 且无产业 demand 时，玩家 demand 修正的 `core` mult = 0.5；恢复供需时仅移除该具名 mult，不移除其他技能/mod。
- factor = 5f / max(3, maxExportGlobal)。
- stockpile = [econUnit * (available + (noDemand ? 1 : 0)) + econUnit * min(min(available,maxSupply) * factor, factor * 10)] * (0.95f + 0.1f * secondRandomFloat)。
- 缺口：supply/demand highThreshold = stockpile + deficit * econUnit；highMult = min(1.25,1 + max(1,deficit)*0.25)。
- 无缺口、tradeLevel>0 且 both+plus>0：**仅 supply** highThreshold = max(0,stockpile-extra*econUnit)，highMult=1.25。
- 额外供给：lowThreshold=max(0,stockpile-extra*econUnit)，lowMult=max(0.85,1-max(1,extra)*0.15)。无对应条件则 threshold=-1、mult=1。

以上常数来自已导入的安装版本设置/源码，不是拟合或随意调参。

## 选定 API / 输入合同

### 一次有效经济定价阶段

```ts
resolveOriginalMarketEconomyPass({
  marketId, commodityId, month, sourceRevision,
  phase: 'native-final-iteration' | 'native-force-stockpile-update',
  industry: {
    industries: [{ id, supply, demand, supplyLegal, demandLegal }],
    previousSupplyLegal, previousDemandLegal
  },
  network: {
    shippingGlobal, shippingFaction, maxExportGlobal, maxExportFaction, hidden
  },
  otherAvailableFlat,
  eventModBeforePass,
  tradeMod: { both, plus, minus },
  demandStat: { base, modifiers: { flat: [{id,value}], percent: [], mult: [] } },
  greedStat:  { base, modifiers: { flat: [], percent: [], mult: [] } },
  playerModifiers: { [playerId]: { supply: orderedBonus, demand: orderedBonus } },
  marketModifiers: { supply: orderedBonus, demand: orderedBonus }
})
```

- 所有字段必需、拒绝未知字段。没有 source 状态的地方不能默认为零/合法/开放。
- `industries` 必须是**本商品的完整、真实、按原版次序排列的产业有效输出**。有效量已包含产业规则、条件、短缺、稳定度、AI核心、特殊物品、技能、扰乱、建设/停工等实际影响；本模块不执行这些插件。不接受“产业类型→手填一个数量”来伪称真实经济。
- `previousSupplyLegal/previousDemandLegal` 是进入此次聚合前持久值，处理原版0产出时不重置布尔值的行为。
- `network` 是与此次供需阶段一致的真实经济组数据。`originalEconomyShipping(accessibility)` 只计算 shipping，不计算距离/势力敌对关系/市场质心的流通性。
- `resolveOriginalEconomyExports({coverage:'complete-econ-group',econGroup,rows})` 的每行须含 `marketId,factionId,maxSupply,availableBeforePass,shippingGlobalBeforePass,shippingFactionBeforePass`。它计算数值最大值；coverage 字符串本身**无法证明**名单完整。主线程必须提供并验证真实经济组完整 roster。
- 出口用 **before-pass** availability/shipping；当前市场的 imports 选择用 **after-accessibility-update** shipping。不能把这两阶段混成同一组便捷值。
- `otherAvailableFlat` 只支持排除四个原版 core flat 和 eMod 后的平坦有效量：base=0、无 percent/mult、其他 flat 先按源插入序求和，再按原版次序追加 core。本轮不支持任意可用量乘法修正/非零 base/未知临时可用量计时；外层采集器必须检测并拒绝，不能丢弃这些来源。纯数值输入无法自行发现被调用方遗漏的原始修正。
- `eventModBeforePass` 是真实、整数的先前 eMod，不是从当前 tradeMod 猜测的。early-continue 情况保留它，常规情况按交易总量重算。输出诊断同时含 `tradeLevel`（当前重新计算值）与 `appliedEventMod`（实际保留/应用值），二者在该边界可不同。
- demand/greed/player/market 修正使用具名、顺序数组；覆盖 `core` 不改变它的原插入位置。玩家修正单独传入，不能把一个玩家技能传播到其他人。
- `sourceRevision` 是调用方给定标识，不做实际版本验证；`phase` 是调用方对真实调度阶段的断言，不会证明任务已执行。
- 结果包含 `.commodity`（与既有 `OriginalCommodityMarketState` 字段兼容）、`.marketSupplyMod/.marketDemandMod`、`.nativeStats`（持久具名修正），以及诊断值。
- **没有** `asOfTick`、市场实体、账户、零售库存、关税、准入或停靠权限。负 demand/greed/可用量、超出已有报价数值域、负价格乘数等输出不发布，直接抛 CampaignError。调用方仍须验证完整市场快照及需求类成员。

### 交易影响账本

```ts
createOriginalMarketTradeLedger({ atTick, ticksPerSecond, entries })
ingestOriginalMarketTrade(ledger, actualSettlementFact)
advanceOriginalMarketTradeLedger(ledger, frames) // -> {ledger, expired, daysPerFrame}
originalMarketTradeQuantities(ledger, commodityId) // -> {both,plus,minus}
validateOriginalMarketTradeLedger(unknown) // 同步、只读；不合法抛 CampaignError
```

持久数据：

```ts
{
  schemaVersion: 1,
  semantics: 'java-float-fixed-frame-v1',
  atTick, ticksPerSecond,
  entries: [{key, commodityId, channel:'both'|'plus'|'minus', quantity, remainingDays}],
  receipts: { [JSON.stringify([playerId,requestId])]: canonicalSettlementFactJSON }
}
```

- 初始 entries 必须实际捕获：`remainingDays` 是真实 native float 剩余天数；`null` **只代表已知永久修正**，不是未知时限 baseline。不得把旧 `tradeMod` 总和直接塞成“永久 baseline”。
- 当前 ingest 匹配已实现 open-market 的 plus-channel settlement fact（含 requestId/playerId/submarketId/commodityId/quantity/createdTick/expiresAtGameSeconds）。它不替代 buy/sell 权限、距离、版本和库存/账户原子事务；只有权威事务成功后同一提交内才能 ingest。
- ingest 必须发生在 createdTick 对应账本位置。迟到事件拒绝并要求回放；不能根据名义截止时间逆算 native float 剩余时间。相同凭证重复无效，内容变更拒绝；到期后凭证仍保留，不能重复注入。
- 当前固定帧合同假定游戏秒=`tick/ticksPerSecond`、10秒/日、固定 rate。校验旧 fact 名义截止时间为 `createdTick/rate+1200` 仅用于验证来源；**不以它决定删除**。非零时钟偏移、倍速映射、可变帧历史都不自动接受，需另行版本化适配。
- 每个权威模拟帧执行 days=fround(fround(1/rate)/10)，随后每个修正 remaining=fround(remaining-days)。暂停不要调用；离线恢复只能重放确定的游戏帧，不按墙钟时间扣减。分批和逐帧结果一致。
- 原生 oracle 实测从120天开始：rate=1在tick1201删除；20在24006；60在72063；1000在1208432。尤其60Hz**不是72000**。这是所选固定帧策略与原版 float 倒计时一致，不是宣称原版渲染帧也固定60Hz。
- 影响幅度到期前不衰减；到期只删除对应具名来源。上限4096条活跃修正、16384个凭证，超限拒绝，没有静默丢弃/重置；后续需有显式幂等历史归档策略。

### 调度器

```ts
initialOriginalEconomySchedule()
advanceOriginalEconomySchedule(state, {
  amountDays, month, day, daysInMonth, completedTask: null | taskName
}) // -> {state, events}
```

状态：`schemaVersion,phase,elapsed,untilNext,iterLeft,prevMonth,taskIndex`。
任务顺序：MainWorkTask2 → UpdateMarketsAgainTask → ImmigrationTask → FinishEconomyUpdateTask。
事件：begin-economy-pass（含 withStockpileUpdate）、advance-task、economy-tick、economy-month-end。

日期必须来自真实持久 calendar；不按30天取模。原版在 WAITING 检测新月时重置间隔=(当月实际天数-当前日)/10，并先报告 tick9、month-end；DOING_TASKS 时延后该检测。推进任务需调用方报告真实完成；本模块不能验证外部任务到底做了什么，也不允许以空任务自动完成全部经济。

## 主线程最小接线建议（本轮未写共享文件）

1. 先决定并注册可替换 economy provider/锁版本；本轮三个模块仅是可替换纯内核，没有偷偷加入现有 `.8` 锁。让 provider 的 `validateWorld` 检查持久账本、调度游标、产业/网络证据版本、commodity roster 与世界实体的引用完整性。
2. 可以在新模块自有 extension 中保存 per-market ledger、具名 stats、先前 eMod、来源 revision；全局调度游标另存。上述是**建议**，本轮没有新增/强制任何 world extension key 或 schema migration。
3. settlement 与 ledger ingest、inventory/cargo/account 仍需同一权威事务；保留当前 actor/request/version/地点/接触距离/遭遇/过渡检查。UI或HTTP不能自行提交“已解析供需值”。
4. simulation 重放每个有证据的固定帧，遵守先 stepper/tasks、再 market临时修正推进与 eMod 的原版次序。普通帧/中间迭代不会重置月度 stockpile/demand/greed/阈值。只有真实末次迭代或明确 force-stockpile 入口调用定价 pass。
5. 活跃交易计时到期后重算对应 tradeMod 与 eMod，并保留上次真实月度 stockpile/阈值；这不等于本轮自动提供了完整跨tick市场状态。可用量其他临时修正、产业.advance、准入、关税、库存插件也可能使快照失效。
6. 只有当完整需求类、真实产业/网络、具名修正、时间推进、零售库存/准入等相关输入都在同一权威世界版本中得到证明后，才能更新 `reference.market` 的报价快照。否则保持拒绝 stale 状态，不能只更新 `asOfTick`。
7. 旧基于绝对截止时间的 tradeImpacts 不能当作精确 native ledger迁移；有真实剩余计时则导入，否则从可证明的命令日志+固定帧起点回放，资料不足就拒绝 native 动态续算。

## 明确未交付/拒绝范围

- 未执行 BaseIndustry/各产业条件、供需短缺反馈、移民、收入/维护费、监听器和整个多帧任务；调度器只给出决策。
- 未计算全星域质心、流通性距离项、敌对关系损失、经济组归属、市场份额或黑市/公开市场库存再生成；不得把样例 Corvus 市场当真实完整宇宙。
- 只支持主经济商品自身触发的一次定价阶段；拒绝 nonecon/meta/exotic/custom plugin/替代品输入。**支持 luxury_goods 主商品单次公式，不代表其带 volturnian_lobster 的完整需求类经济已完成**。原版全局遍历可能以替代商品ID再次触发同类更新，随机种子不同；本模块不猜测该全序列，也不自动补零替代品库存。
- 既有报价层要求完整需求类 roster，这层限制不得放松。单商品测试选 supplies，不是用残缺 luxury_goods 证明生产可报价。
- 其他可用量输入仅支持明确的 flat-only 形态；未知乘数、未知临时修正、不完整产业/网络、缺失先前 eMod 都不得冒充支持。
- 未给 Kernel/simulation 添加跨tick有效性证明；主线程审查前不能移除 same-tick 锁。`phase`、`sourceRevision`、`coverage` 均不是不可信输入可自行授予的权限。
- native oracle 是**源码方法级**对照，使用最小环境桩隔离真实公式，不是启动原版整局游戏的端到端认证。

## 已执行验证

```powershell
node scripts/import-campaign-market-economy.mjs --check
node scripts/check-campaign-market-economy.mjs
npx oxlint src/campaign/rules/OriginalMarketEconomy.mjs src/campaign/rules/OriginalMarketEconomyLedger.mjs src/campaign/rules/OriginalMarketEconomySchedule.mjs scripts/import-campaign-market-economy.mjs scripts/check-campaign-market-economy.mjs
npx tsc --noEmit --strict --skipLibCheck false --module NodeNext --target ES2023 --types node src/campaign/rules/OriginalMarketEconomy.d.mts src/campaign/rules/OriginalMarketEconomyLedger.d.mts src/campaign/rules/OriginalMarketEconomySchedule.d.mts
```

最终定向测试：**17通过、0失败、0跳过**。包含可复现导入、产业max/tie/legal、输入拒绝、需求/库存/阈值、玩家隔离、early-continue保留eMod、实际计算结果→既有库存效用→实际报价、账本幂等/到期/暂停/分帧一致性、月历与任务时序。

原生 oracle 必须有 javac/java，不可用时测试失败而非默默跳过。实际提取并编译 MainWorkTask2库存定价方法、CommodityIconCounts、MutableStat/StatBonus/MutableStatWithTempMods 原类、CommodityOnMarket交易转换方法、CommodityMarketData可用量分支及运输能力方法；比较 Float.floatToIntBits：**160组定价/可用量、4个帧率计时、201组shipping、100个RNG种子**一致。完整经济任务执行、产业插件执行和来源完整性不在这些 oracle 的证明范围。

## 2026-09-20 后续：混合市场篮子权威结算

见 `campaign-market-basket-progress-2026-09-20.md`：同子市场多商品净买卖统一税额、一次原子结算，已接真实Worker/认证HTTP；逐行账本幂等与故障回滚验证。旧“未接网关/只有单商品”描述保留为当时历史。经济刷新/市场UI依然未完成，same-tick保护保留；未发布。默认规则0.14.0、market provider0.2.0，不迁移用户存档。

## 2026-09-20 后续：开放市场资源补货与计时

见 `campaign-open-retail-progress-2026-09-20.md`：原版资源上限/刷新/衰减、同一权威时钟下的零售计时、system原子刷新和显式所有者授权已接线；320组库存Java方法与4组帧率对照通过。旧阶段测试数字保留。当前完整campaign为515项/510通过/5可选跳过；真实上游经济/进港UI仍未接齐，same-tick保护保留，不使用测试库存填正式世界。规则锁0.15.0，未迁移用户存档。

### 2026-09-20：补上资源产业的实际供需来源（部分上游）

新增 `OriginalResourceIndustries.mjs` 和24种原版资源条件的数据导入，按原版分开的 condition/industry 方法保留具名状态、机械短缺、AI/改善、停工/恢复。14项专项与1296个原版Java状态快照/有效量对照通过。详见 `campaign-resource-industries-progress-2026-09-20.md`。这只补了农业/水产/采矿的commodity来源，不是人口/太空港等全行业实现，也没有启动全经济任务、发布新库存/价格或设置市场当前时间。

### 2026-09-20 常规产业与有序commodity组合

新增人口、太空港/特大型港口、巡逻/军事/最高指挥、地面防御/重炮和空间站的commodity方法，共18种原版spec；与资源产业按真实顺序组合并聚合primary商品（含ships/meta），价格入口仍不开放meta交易。792个Java状态/float/合法性快照及3960组原版聚合结果对照通过；资源1296快照回归通过。详见 `campaign-civic-industries-progress-2026-09-20.md`。仅commodity部分，稳定度、流通性、非commodity副作用和完整经济任务仍未完成，不生成当前市场库存/价格。

### 2026-09-20 流通性/网络来源接入

新增本地人口/港口/自由港accessibility与完整给定组的质心/有向敌对惩罚，按native before-core出口、after-core进口顺序接入供需/可用量核。180组Java网络对照和288个连续本地状态快照通过；详见`campaign-market-accessibility-progress-2026-09-20.md`。未执行完整经济任务、未生成当前交易快照/库存；稳定度、收入、市场份额和权威调度/完整sector仍待实现。
