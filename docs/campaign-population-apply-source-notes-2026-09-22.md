# 普通无物品 Population 完整 apply/unapply — source notes（2026-09-22）

本机版本 Starsector 0.98a-RC8；已先重读 AGENTS.md 与原版源码。本轮只修改 CivicIndustryEffects/CivicLifecycle 及其声明，不改 Runtime、LiveIndustryEffects、capture、测试或总进度。不操作桌面，不运行验证。仅接普通 `specialItemId === null` 人口，orbital fusion lamp 等特殊物品仍拒绝。

## 编码前最小对照

源码位于 `../decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/`（Misc 位于 api/util）。

| 原版证据 | 本轮应保持的行为 | 原有差异 / 后续集中验收 |
| --- | --- | --- |
| PopulationAndInfrastructure.java:62–79；BaseIndustry.java:182–200,1356–1374；Population:533–538 | modifyStability → updateSupplyAndDemandModifiers → Base 财务 → 空的 AI 专用回调/PAI_improve → 新供需。人口 alphaSupplyBonus=true，improvementSupplyBonus=false。 | 现有市政 effects 排除 population。需让所有新增 effects 写真实 row.entry.state 与 market stats，财务服务读 rebuilt bonus/旧 demand。 |
| BaseIndustry:190–191,211–215；Population:153,215 | Base 阶段已有 transient add/remove，Population 尾部再次 add/remove。共享集合操作按 objectRef 幂等。 | 保留 Base 时点和尾部重复调用：供需 lazy getter 应已经看见 Base 的注册，而非直到末尾才出现。 |
| Population:80–99；BaseIndustry:720–740 | domestic_goods → luxury_goods → food；非 habitable 再执行 food、organics 两次 getter。每一项先读取当前 industry demand，再 lazy available。 | 不能合并两次 food，不能预读 availability；三个 stability modifier 都有明确 else 删除。 |
| Population:101–119；Misc.java:4434–4439 | 有效队列首港口需无当前建设（排除 population-tag 行业及 upgrading）；无港口惩罚和 size accessibility 都只有条件成立时写入，没有本段 else 清除。 | 服务 `isSpaceportFirstInQueue()` 返回这个完整有效布尔结果，而非仅队列首项标签；unapply 才清理旧 access flat。 |
| Population:120–154,315–320；Misc:4387–4408 | 复用动态 helper；之后读取真实行业数（含原版 upgrading/queue 规则）与共享 maxIndustries.computeEffective(0) 的 Math.round，设置/清除 overmax；尾部 immigration。 | 不把 maxIndustries 多包成 EconomyMutable，不取裸配置上限，不预取 industry count，不重新运行旧 population 分支。 |
| Population:189–215,383–393 | Base PAI_improve 清理/移民移除 → stability `_0..2` 全 channel → access `_0..1` flat → dynamic exact cleanup → income/upkeep/stability 的 unmodifyStability → 尾部移民移除。 | 不清空其他插件 bonus；comm relay 仅在无 comm_relay condition 时移除 core_comm_relay。supply/demand 不清空。 |
| BaseIndustry:391–407,496–520,548–556；reference-military-bases.json.industrySpecs.population | startBuilding 使用原 spec buildTime=0 并 unapply；finish 先 building=false/progress=0/time=1，再 buildingFinished 的通知/推进队列，再 reapply。 | 现有生命周期 >=1 校验会阻断 population startBuilding 后的合法 0；为人口建设及取消后保留此原版零日状态。population upgradeId=null 仍拒绝升级，不新增 UI 建设/拆除权限。 |

常量复用现有 reference-market-accessibility（无港口 penalty、size bonus）、reference-market-stability（PAI_improve、overmax penalty）。原版 `CommRelayCondition.java:15` 的 modifier id 是 `core_comm_relay`；其余 id/供需偏移来自上述 Java 方法体。动态部分已由 OriginalPopulationIndustryEffects 记录证据，本轮不复制公式。

## 接口约定（主代理接 Runtime）

在 `applyOriginalLiveCivicIndustry` 的 runtime 增加可选 `population`（调用 population 时必需）：

```ts
population?: {
  modifyStability(): DeepReadonly<OriginalPopulationStabilityResult>;
  dynamic: OriginalPopulationIndustryEffectsRuntime;
  readIndustryCount(): number;
  isSpaceportFirstInQueue(): boolean;
}
```

所有服务同步；不提供历史/0 fallback。`modifyStability` 必须操作同一个市场并返回其真实诊断；`dynamic` 继续提供真实 prevStability/doctrine/ships getter；`readIndustryCount` 实现 Misc.getNumIndustries；queue 服务同时处理 Misc.getCurrentlyBeingConstructed。

市场额外使用真实 conditions、incomeMult、upkeepMult、maxIndustries；声明将这些列为 population-only 字段，不要求仅调用港口/地防的旧消费者补造数值。maxIndustries 本身是 EconomyBonus，只在求 effective 时使用 `{base:0, modifiers:market.maxIndustries}`，传给 dynamic helper 时直接传 market。

`hasOriginalCivicEffects('population')` 将为 true；生命周期 existing apply/reapply/finish callbacks 可用。特殊物品仍由 effects 与 lifecycle 两侧拒绝。结果的可选 population 字段保持主线原有 modifyStability 诊断形状；额外 populationEffects 记录逐次 deficitReads、尾部 industryCount/maxIndustries，不返回替代市场状态。

## 未完成/未验证

不含人口灯光、heat condition、特殊 item、UI、实际世界帧选派或 Runtime 服务接线；不声称这些完整。未运行任何检查或原版实机/Web 验证。主代理集中验收应覆盖 alpha/improved、非 habitable 重复 food getter、已安装外部 modifier、有效 queue、超上限切换、Base/尾部 immigration 幂等与零日人口建设 finish 顺序。

## 本轮实现交付

已开放 `hasOriginalCivicEffects('population')`，在现有 apply/unapply 入口新增无特殊物品人口分支；原港口/地防分支保留。人口 supplyBonus/demandReduction 的 rebuild 在财务回调前写回原 stat/数组句柄；market 动态、accessibility、stability modifier 同样原地修改。不清空供需、不因 building/disrupted 跳过人口逻辑。

生命周期已去除过时的“population 未接通”门禁，明确拒绝人口特殊物品，并放行人口原版零日 buildTime（建设及取消后均合法）。保留原 finish/queue/reapply 顺序与无升级配置。本轮未改 BaseIndustryFrame。

结果接口：`result.population` 是开头 modifyStability 的真实诊断，与主线旧返回形状兼容；`result.populationEffects?.deficitReads` 包含按原顺序执行的每次扫描（每行含 commodityIds/commodityId/deficit）；该 populationEffects 内 industryCount/maxIndustries 在末尾实际读取。主代理应选派一次此回调，不再重复旧 Population 分支。

实际改动仅为 `OriginalCivicIndustryEffects.mjs/.d.mts`、`OriginalCivicLifecycle.mjs/.d.mts` 与本说明。未执行验证；Runtime 服务与 LiveIndustryEffects 选派由主代理接入，本轮不声明集成已验收。


## 普通人口闭环补齐

只读核对主线已准备的 population 服务与 LiveIndustryEffects 消费方式后，在本侧保持 result.population 的既有 stability 结果形状，新增 result.populationEffects 存放附加诊断；无需变更已有服务参数。另根据 BaseIndustry.java:533–536，取消只重置 building/upgradeId/buildProgress，不重置 buildTime，因此允许普通人口取消后的 time=0 状态，防止下一次重应用/建设或生命周期校验错误拒绝。仍未运行任何检查，统一验收由主代理进行。

## 管理员读取接入时点

依据 BaseIndustry.java:1385–1391 与 PopulationAndInfrastructure.java:64–65，管理员输入不能在进入人口 apply 前预读：modifyStability 的 lazy 副作用必须先发生。effects runtime 新增可选同步 `readAdministratorIndustryInputs(): {adminSupplyBonus, adminDemandReduction}`，人口在 modifyStability 返回之后、updateBonuses 之前调用；港口/地防也在 updateBonuses 之前调用一次。验证两项均为原生 float 后才写回 entry.modifiers，不更换 modifiers 对象。缺省只兼容直接 helper 调用保留既有显式输入，实际 Runtime 必须提供服务；不是允许 Runtime 猜历史值或零。Runtime 接线由主代理负责，本轮未修改 Runtime，也未运行检查。

## 精确撤销与灯具拒绝复核（未运行验证）

再次逐项对照 PopulationAndInfrastructure.java:189–215,383–393,533–538 及 BaseIndustry.java:204–215,1679–1685。现有普通人口 unapply 的顺序、id/channel 与源码相符：

- PAI_improve 仅 flat；stability 的 ind_population_0/1/2 才是全部 channel；accessibility 的 _0/1 仅 flat。
- dynamic cleanup 仍由原 helper 精确撤销；hazard-defense 开关为 false，不移除 ground_defenses_mod 的 _1。
- unmodifyStability 仅移除源码列出的 income/upkeep mult 与 stability flat；不做前缀扫描或清空。无 comm_relay condition 才移除 core_comm_relay。
- 不改 supply/demand 历史、core/improved 安装状态、其他 modifier、永久移民列表或其他 objectRef 的 transient 注册；不调用管理员/commodity/dynamic apply 服务。
- BaseIndustry.setSpecialItem 需要先执行旧物品的 unapply。因此不允许以设置 null 为由绕过尚未实现的旧灯具撤销。

据此仅收紧特殊物品的早拒绝：restore 在调用 share 之前拒绝人口非 null 物品；startBuilding 在修改 flags/time/progress 之前检查人口的两个物品表示均为 null；setter 明确拒绝灯具安装以及把既有不支持的灯静默改成 null。普通人口 null->null 仍是正常无物品操作。接口签名和 Runtime 服务不变，未新建模块、未改 Runtime/LiveIndustryEffects，未执行检查。
