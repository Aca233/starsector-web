# 生涯市场交易底层：原版依据与集成合同（2026-09-19）

## 状态

实际代码已实现并通过定向测试，**尚未接入默认规则集 / Worker 报价 RPC / Gateway / 客户端 / 真实星区经济解析器**。未提交、未发布。没有修改共享核心、客户端、旅行/跳跃模块或已有进度文档。

这不是“完整原版经济”。当前交付是一条真实路径：

1. 权威系统发布已经解析的原版市场快照；
2. 有入港许可的玩家舰队在实体接触距离内得到原版公式报价；
3. 玩家提交单商品 buy/sell；
4. Repository 的同一个 SQLite 事务保存市场库存、舰队货物、星币账户、贸易影响、版本、幂等收据及 outbox。

## 文件

全部新增：

- `src/campaign/data/reference-market.json`
- `src/campaign/rules/OriginalMarketPricing.mjs` / `.d.mts`
- `src/campaign/rules/OriginalMarket.mjs` / `.d.mts`
- `scripts/import-campaign-market-reference.mjs`
- `scripts/check-campaign-market.mjs`
- 本文

`OriginalMarket` 只读复用 `OriginalTransitions.originalFleetRadius`，没有修改它。它也只读引用现有物流商品表，避免购买当前物流不支持的 Omega 核心后使下一次模拟报错。

## 原版证据

目标版本是本机已安装的 Starsector 0.98a-RC8；CSV 含本机中文名称，**不声称已排除本机数据修改**。导入器记录 18 个数据/源码文件的 SHA-256，`--check` 会重新核对完整导入结果，不以文件名或记忆代替证据。

| 来源（相对 `starsector-core` 或 `decompiled`） | 依据 |
| --- | --- |
| `data/campaign/commodities.csv` | 33 条商品规格；supplies=100、fuel=25 等基础价格、utility、variability、econUnit、标签 |
| `starfarer_obf/com/fs/starfarer/loading/SpecStore.java:1021-1082` | 空 cargo space 默认 0，utility 默认 1，econUnit 默认 500，空 variability 默认 V4；非 primary 价格覆盖为 demand-class 基础价 × utility 比例 |
| `starfarer.api/com/fs/starfarer/api/campaign/econ/PriceVariability.java` | V0 至 V10 指数映射，保留 Java float 表示 |
| `starfarer_obf/com/fs/starfarer/campaign/econ/PriceCalculator.java:36-103` | D 加最小需求量，stockpile 加最小库存量，区间积分，缺口/过剩阈值分段累加 |
| `starfarer_obf/com/fs/starfarer/campaign/econ/Market.java:816-896` | supply=玩家买、demand=玩家卖；V0 独立路径、玩家/市场修正、最小 1 星币/单位、向下取整；买入 stockpile 不足时用于计价的量先提升至 utilityQuantity |
| `starfarer.api/com/fs/starfarer/api/combat/StatBonus.java` | `(base + base*percent/100 + flat)*mult`，按 Java float 运算顺序取精度 |
| `starfarer_obf/com/fs/starfarer/campaign/ui/trade/F.java:715-757,1091-1130` | 每笔交易关税 `Math.round`，买卖均收税；货款向零取整后减税；资源使用市场价格而不是非经济物品加价倍率 |
| `starfarer_obf/com/fs/starfarer/campaign/econ/MarketDemand.java:61-72` | 同 demand-class 的 stockpile × utility 加贸易影响余量；不能把零售库存直接当定价 stockpile |
| `starfarer_obf/com/fs/starfarer/campaign/econ/CommodityOnMarket.java:155-166,282-384` | demand/greed；tradeMod / tradeModPlus / tradeModMinus，经济可用级别转换及定价余量 |
| `starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/BaseIndustry.java:780-785` | 当前 commodity econ-unit multiplier：size>0 时为 1，否则为 0 |
| `starfarer.api/com/fs/starfarer/api/impl/campaign/submarkets/BaseSubmarketPlugin.java:43,110-111,130-131,173-211` | 有效市场关税；OPEN/SNEAK 开放条件；买卖临时贸易影响，120 游戏日 |
| `starfarer.api/com/fs/starfarer/api/impl/campaign/submarkets/OpenMarketPlugin.java` | PLAYER_SELL_ONLY：买卖均进入 plus 通道，买入为负、卖出为正；库存生成另依赖生产/进口/稳定度/随机种子，不伪造 |
| `starfarer.api/com/fs/starfarer/api/impl/campaign/submarkets/BlackMarketPlugin.java:181-200` | 黑市不禁止商品、关税为 0；完整交易后果未移植，因此仅报价 |
| `starfarer.api/com/fs/starfarer/api/combat/MutableStatWithTempMods.java` | 临时修正到期移除，不在本模块里凭空线性衰减 |
| `starfarer_obf/com/fs/starfarer/campaign/BaseLocation.java:761-772` | 接触条件严格 `< fleet.getSelectionSize() + entity.getRadius()` |
| `starfarer_obf/com/fs/starfarer/campaign/econ/reach/MainWorkTask2.java` | 需求/greed、经济 stockpile、阈值还依赖真实产业供需与经济更新；本模块只消费已解析状态 |

特别保留了 `Market.java` 的不对称行为：供给价在应用玩家修正时使用**市场级修正前**的每单位价格，而需求价重新计算市场修正后的单位值。不能为了“看起来合理”改成对称公式。Java 对照测试包含此分支。

## Provider 与 API

`originalMarketProvider`：

- id `reference.market`，version `0.1.0`，service `market`，apiVersion 1。
- `methods.quote(world, principal, request)` → 只读私有报价。
- `methods.validateState(world, marketId)` → 校验一份市场扩展。
- **`methods.validateWorld(world)` → 同步只读保存校验钩子**，非法抛 CampaignError。校验所有 `reference.market:*` 扩展。尚无扩展的市场允许存在；过期快照可保存/读取，但不可交易。
- `commands['market.buy']` / `commands['market.sell']` → 玩家权威命令。
- `commands['market.publish-snapshot']` → **system-only** 的解析器发布命令，不是经济生成器，更不是客户端改价接口。

### 玩家命令

```ts
payload = { marketId, submarketId, fleetId, accountId, commodityId, quantity }
```

报价 request 为上述字段加 `side: 'buy' | 'sell'`。所有字段精确检查；不得把 `side` 放入 buy/sell 的 payload，也不得传 price、tariff、inventory 或 position。

报价返回：

```ts
{
  marketId, submarketId, fleetId, accountId,
  commodityId, side, quantity,
  gross, tariffRate, tariff, creditsDelta, averageBeforeTariff, pricing,
  asOfTick, expected, available, distance, contactDistance,
  canAfford, executable, unavailableReason
}
```

`expected` 已包含玩家、舰队、账户、市场、市场扩展、锚点、所有成员和读取到的势力权限版本。客户端直接使用这一数组，不要自己只挑 fleet/account 两条。提交会在权威状态重新计价，不信任 UI 总价。

浮点税率如 0.3 会呈现 Java float 的实际表示。UI 展示税率可以格式化，但不可把 UI 格式化结果传回来作为权威数据。

### 不依赖 jump interaction 的接触检查

市场扩展必须引用真实 `spaceEntities[anchorEntityId]`，与市场同 `locationId` 且不能带 jump。舰队必须同地点，并满足原版半径和的严格小于条件。**同星系、同 location 不等于停靠**。当前 `navigation.interaction` 仅支持跳跃，不在本模块里伪造/重用它；市场点击、接近和独立舰队交互保持由主线程接入。

### 权限与并发政策

这是多人权威政策，不冒称原版单机账户结构：

- 玩家必须显式控制舰队；势力控制需 leader/manager。
- 账户必须归舰队资产所有者，且玩家有账户支配权限；同队、同势力 member、财产所有权都不能替代明确的控制权限。
- 账户货币必须为 credits，不允许透支。
- 遭遇锁与 jump transition 都拒绝交易。
- 市场没有伪造的有限商人钱包；按原版交易路径改变玩家账户，税款不自动进入玩家殖民地账户。
- 买卖同步提升 market、extension、fleet、account 版本。同一市场两个玩家的旧报价不能超卖库存。
- 收据按已有 Repository 的 `(world, actor, requestId)` 作用域幂等；**不要把 ledger 的 requestId 单独当全局唯一键**，要与 playerId 组合。

## 持久结构

共享 `Market {id,version,owner,locationId}` 不需要新增字段。扩展键为 `reference.market:${marketId}`：

```ts
{
  id, version, schemaVersion: 1,
  data: {
    marketId, anchorEntityId,
    asOfTick, coverage: 'resolved-native-trade-v1',
    tariffRate,                         // 权威解析后的有效开放市场关税，不写死 30%
    admissionByPlayer: { [playerId]: 'OPEN' | 'SNEAK' | 'NONE' },
    illegalCommodityIds: string[],      // 权威解析的市场违禁品；未解析不得填“默认全合法”
    commodityOrder: string[],           // 原版有效 commodity 迭代顺序，避免改变 float 累加顺序
    commodities: {
      [commodityId]: {
        stockpile, demandValue, greed, utilityOnMarket, availableWithoutTrade,
        tradeMod: { both, plus, minus },
        supplyPrice: { highThreshold, highMult, lowThreshold, lowMult },
        demandPrice: { highThreshold, highMult, lowThreshold, lowMult },
        playerSupplyModsByPlayer: { [playerId]: { flat, percent, mult } },
        playerDemandModsByPlayer: { [playerId]: { flat, percent, mult } }
      }
    },
    marketSupplyMod: { flat, percent, mult },
    marketDemandMod: { flat, percent, mult },
    submarkets: {
      [submarketId]: { plugin: 'open' | 'black', inventory: { [commodityId]: number } }
    },
    tradeImpacts: [{
      requestId, playerId, submarketId, commodityId,
      channel: 'plus', quantity, createdTick, expiresAtGameSeconds
    }]
  }
}
```

`stockpile` 是经济 commodity-on-market 库存，不是 `inventory`。`tradeMod` 是已解析的原版三通道数量，当前仅支持原版默认 additive 模式，不支持给这三个 MutableStat 额外添加 percent/mult 的 overhaul。`availableWithoutTrade` 对应原版 getModValueForQuantity 中去掉 eMod 后的有效 available 值。`demandValue` 同类商品必须一致。原版的单玩家 price modifier 在多人中按 playerId 分开存储，每个获准入港的玩家必须显式解析；绝不把玩家 A 的折扣套给玩家 B，也不把缺失项默认当 1。动态价格类不能漏掉其他规格，例如 luxury_goods 必须包含 lobster；否则拒绝。

一次合法开放市场成交：

- inventory 与 fleet.cargo 等量反向变更，保留未动商品和合法的余数；允许超货舱容量，不加原版没有的购买硬上限。
- **不更改 stockpile**；plus 通道买入减量、卖出加量；下一笔价格从该原版余量公式重新计算。
- 保存一条带 120 游戏日寿命的影响事实。下一次经济解析器重建/过期处理必须消费这些事实；不要既保留已经包含影响的有效 tradeMod，又重复应用整份 ledger。

## `market.publish-snapshot` 集成

system 命令 payload：`{ marketId, data }`，data 为完整上述结构。

expected：markets/marketId、spaceEntities/anchorEntityId、现有 extensions/stateId（如已有）、admission 中的 players，以及市场 owner 若为 faction 的 factions/ownerId。初次扩展不存在时不伪造 version=-1；市场实体版本保护创建竞态。

发布同时提升 market/version；已有扩展需匹配旧 version，否则拒绝，避免用旧解析结果覆盖刚刚成交的库存。既有 world id、epoch、requestId、幂等规则仍由 Repository 处理。发布入口会检查当前 tick、完整状态及到期影响。

**不要为了让 UI 能交易而把测试数据发布到正式星区。** 当前测试使用明确标记的解析后 fixture；生产的 demand、stockpile、thresholds、库存、入港许可必须来自真实原版经济/外交解析器。不存在解析器时返回 MARKET_UNAVAILABLE / MARKET_SNAPSHOT_STALE，而不是复制旧值并把 asOfTick 改成当前 tick。

## 主线程最小集成改动

1. `ReferenceRuleset` 注册 `originalMarketProvider`，选择 `providers.market = 'reference.market'`；规则锁版本显式升级，旧存档走显式迁移或保持旧规则。不能默默换锁。
2. 接入主线程新增的 `compiledRuleset.validateWorld` 通用钩子。此 provider 已提供 methods.validateWorld；无需改通用 `WorldState` 的市场字段校验。
3. Worker 增加私有 `quote-market` RPC：先 `store.read(worldId)`，再 `rules.services.market.quote(world, {kind:'player',id: authenticatedPlayerId}, request)`。使用实际锁定 provider，不直接硬调用 reference 函数。
4. Gateway 仅新增 `market.buy`、`market.sell` 玩家白名单和登录会话绑定的报价 route；**不得放行 `market.publish-snapshot` 为玩家命令，不得让客户端选择 system actor**。错误报价不得回传整份世界/完整 admission/他人账户。
5. 真实经济解析器在权威 Worker 内准备 data 并调用 system-only 发布命令；市场实体和真实锚点由星区构建器建立。本次没有实现解析器。
6. UI 读取报价 expected 并显式确认交易，失败冲突重新报价；不要用客户端乘法替代批量积分价格。市场 approach/保持交互、原版市场布局由主线程实现，本模块不修改客户端。

### 重要时间集成限制

当前报价/交易要求 `asOfTick === world.clock.tick`。这是**未完成跨 tick 原版经济解析的保护栏**，不是可直接用于持续联网模拟的缓存策略。在世界持续运行时，不能靠反复改 asOfTick 使交易“看似可用”。主线程需要真实经济刷新及其有效性/版本模型，或先只在明确停表的开发场景验证此路径，再做真实经济集成。此限制保持公开，不能称为已经可玩的完整市场。

## 明确未实现 / 拒绝范围

- 经济库存生成、补货、产业/运输/供需传播、市场规模和稳定度推导、贸易影响跨 tick 到期推进。
- 真实势力外交/入港许可/违禁品解析、经济数据刷新调度。
- 黑市完整交易后果（走私、怀疑、声望等）：纯价格支持零关税，命令明确拒绝。
- Exotic 实际交易：纯报价接受已解析 utility，当前命令拒绝；其 origin/距离经济适配尚缺。
- military / storage / local-resources 等 submarket 语义、武器、战机、舰船、special/plugin 物品与 meta 类。
- 当前物流表不支持的 Omega 核心只可报价，不可成交，避免污染后续模拟。
- 多商品篮子一次确认的净额/共同关税舍入：本 API **一笔一商品**；多次请求不等价于原版同一个篮子，不能声称批量篮子已实现。
- quantity 仅正整数；单位量/支持金额限定在 Java float 的精确整数范围 `2^24`，超出明确拒绝。定价算法依照 Java float 运算，不承诺所有平台 pow 在极端值逐位一致。
- 转换循环最多 65536 步、待折叠贸易记录最多 4096 条；这是显式执行预算，超出拒绝/要求原版解析器刷新，不偷偷裁剪价格或库存。
- 玩家 UI、HTTP 路径与 Steam/LAN 市场联机未接通。本模块的真实链路在 Repository + SQLite 测试层，不冒称已过浏览器验收。

## 验证结果

2026-09-19：

```text
node scripts/import-campaign-market-reference.mjs --check
  33 commodities, 18 evidence sources, identical import
node --test scripts/check-campaign-market.mjs
  36 tests, 36 passed, 0 failed, 0 skipped
npx oxlint scripts/import-campaign-market-reference.mjs scripts/check-campaign-market.mjs src/campaign/rules/OriginalMarket.mjs src/campaign/rules/OriginalMarketPricing.mjs
  passed
npx tsc --noEmit --strict --skipLibCheck false --module NodeNext --target ES2023 --types node src/campaign/rules/OriginalMarket.d.mts src/campaign/rules/OriginalMarketPricing.d.mts
  passed
```

测试包括物理接触与严格边界、权限/势力账户、遭遇/跳跃锁、过期数据拒绝、所有缺失/陈旧依赖版本、非有限/伪造字段、两玩家争抢库存、超容量合法保留、V0 与动态公式、发布后报价成交、发布覆盖竞态、规则替换和保存钩子。SQLite outbox 故障注入证明库存/资金/版本/receipt 一起回滚；文件重开与 epoch fencing 后重放不重复扣款。

Java oracle 测试会在独立临时目录编译从本机源码提取的 `PriceCalculator`、`Market` 两个价格方法、`StatBonus.computeEffective`，核对源码 SHA-256，并对 **320 组**库存、数量、阈值、greed、修正、关税输入逐项比较 gross/tariff/creditsDelta。该测试需要 JDK，本机运行成功，没有跳过。它验证的是给定解析输入下的计价，不证明经济输入生成已经完成。

## 主线程集成补充

`reference.cooperative 0.8.0` 已注册本provider并接通通用 `validateWorld`、CampaignWorker私有报价RPC和经身份认证的HTTP报价/买卖白名单。`scripts/check-campaign-market-gateway.mjs` 的4项真实HTTP集成测试通过，覆盖买卖及重放、权限/禁止发布、双玩家库存冲突、跨tick过期拒绝。此前“HTTP路径未接通”是子任务交接时的状态；现在已接通底层边界，但**真实经济更新、原版市场UI及生产联机仍未接入**。测试港口只存在专项测试，不是开发世界中的伪原版市场。

## 2026-09-20 后续：混合市场篮子权威结算

见 `campaign-market-basket-progress-2026-09-20.md`：同子市场多商品净买卖统一税额、一次原子结算，已接真实Worker/认证HTTP；逐行账本幂等与故障回滚验证。旧“未接网关/只有单商品”描述保留为当时历史。经济刷新/市场UI依然未完成，same-tick保护保留；未发布。默认规则0.14.0、market provider0.2.0，不迁移用户存档。

## 2026-09-20 后续：开放市场资源补货与计时

见 `campaign-open-retail-progress-2026-09-20.md`：原版资源上限/刷新/衰减、同一权威时钟下的零售计时、system原子刷新和显式所有者授权已接线；320组库存Java方法与4组帧率对照通过。旧阶段测试数字保留。当前完整campaign为515项/510通过/5可选跳过；真实上游经济/进港UI仍未接齐，same-tick保护保留，不使用测试库存填正式世界。规则锁0.15.0，未迁移用户存档。
