# 资源产业特殊物品上游准入 — 原版证据（2026-09-22）

## 本轮范围

本机版本 Starsector 0.98a-RC8，与 `reference-resource-industries.json` 的 originalReference 一致。已有共享 live helper 实现三种物品效果，本轮只接通其物品—行业兼容性门禁、真实加载准备、财务和 accessibility 准入，不扩展效果，也不将旧 detached commodity pass 改成 live。

已重新阅读项目 AGENTS.md。未操作桌面/启动窗口，未运行任何验证；主代理负责一次集中验收。本轮不修改 Runtime、LiveIndustryEffects、CivicLifecycle、ResourceLifecycle、测试、capture 文件或总进度。

## 原版证据 → 预期行为 → 现状差异 → 待验收项（编码前记录）

以下 Java 文件均位于本机 `../decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/`。

| 证据 | 原版含义及本轮行为 | 差异与集中验收项（未执行） |
| --- | --- | --- |
| `../starsector-core/data/campaign/special_items.csv:18,20,23` | mantle_bore → mining；soil_nanites → farming；plasma_dynamo → mining。aquaculture 不是 soil_nanites 的合法安装行业。 | 现有资源 helper 的私有表已有这三对；导出统一兼容性谓词，财务/accessibility/加载准备共用。错误行业、未知 item、null/undefined 不能由谓词返回 true。 |
| `ItemEffectsRepo.java:80–91,268–375,422–433` | mantle_bore 只对存在相应资源 condition 的 ore/rare_ore/organics +3；plasma_dynamo 对 volatiles +3；soil_nanites 为 supply bonus +2。三者均未写 income/upkeep/accessibility。 | 财务及 accessibility 目前拒绝全部三种资源物品；应允许合法配对沿用既有财务计算/accessibility 无直接效果分支，不能凭此新增金额、可及性 bonus 或 supply 操作。 |
| `BoostIndustryInstallableItemEffect.java:22–38` | soil_nanites apply/unapply 只写 supplyBonus（unapply 为 modifyFlat(0)，非删除）；需求增加参数为 0。 | 门禁不得重复执行或清理物品经济效果，现有 live helper 继续负责。 |
| `BaseIndustry.java:182–200,204–215` | 更新 supply/demand bonus → 可选财务更新 → AI/improvement → transient immigration → item requirement/apply 或 unapply。缺条件应停用效果，不等于物品从产业上卸下。 | 兼容性准入不得提前读取 planet/conditions、拒绝当前不满足环境的已安装物品、或改为卸载；保留 live finance → item 的原次序。 |
| `BaseInstallableItemEffect.java:87–92,116–150`；ItemEffectsRepo 上述行 | live requirement 检查使用 checkSurveyed=false；mantle_bore 禁宜居/气巨，plasma_dynamo 要气巨；null planet 在 GAS_GIANT 与 NOT_A_GAS_GIANT 检查中均不报未满足；soil 禁稀有矿石/挥发物 condition。 | 这些限制归现有 live helper 的真实条件/planet getter，不加入本轮静态 admission 谓词。缺 planet getter 不能猜 false/null。 |
| `Farming.java:30–49`、`Mining.java:27–42` | 两者先 super.apply(true)，随后新 demand 和 heavy_machinery deficit；unapply 委托 Base。 | 本轮只修上游阻断，不改变效果顺序/共享对象/Java float 行为。 |

## 已核对的调用边界

- `prepareNativeIndustryCommodityPass` 既用于真实 `NativeCampaignRuntime` 加载初始化，也用于旧 offline restore；它只准备真实保存状态与输入，并不执行 resource apply。本轮在此只校验资源物品的已实现合法配对，保留实际 item id/引用数据，不检查运行条件、不套用物品效果。
- `updateOriginalIndustryFinances` 是实际 live `applyFinances` 调用的规则入口。新增合法资源物品准入，不新增 item 财务因子，不索取 planet 环境快照。
- `reapplyOriginalIndustryAccessibility` / `reapplyOriginalLocalAccessibility` 共用白名单校验。合法资源物品没有直接 accessibility 效果，不能被当成未知物品拒绝，也不能要求 `portItemContext`。
- `applyOriginalResourceIndustry` 是旧 detached/offline 算法，仍严格 `specialItemId === null`；`reapplyOriginalIndustryCommodityPass` 同样不具备真实 resource item 时序。会增加清楚的 null-only 错误与声明注释，不放宽这些入口。
- 真实 loading prepare 允许合法 item，并不代表 offline restore 可以计算它们。后者执行 legacy commodity pass 时仍拒绝有资源物品的条目，不能静默丢弃 item 或只算一半。

## 公共接口（供 ResourceLifecycle / 主代理使用）

```ts
isSupportedOriginalResourceItem(industryId: string, itemId: unknown): boolean
```

只识别 farming+soil_nanites、mining+mantle_bore、mining+plasma_dynamo。无物品应由调用方的 `itemId === null` 分支处理。该接口不代表原版安装 UI、环境条件已满足、完整生命周期已实现或完整世界帧已接通。Rawls 负责 `OriginalResourceLifecycle`，本轮不改其文件。

## 验收建议与保留边界

主代理集中对照：三对正确资源物品可经过真实 loading prepare、finance、accessibility；错配及未知物品拒绝；soil+aquaculture 拒绝；finance/accessibility 输出与相同原有 stats 的无物品输入相同；accessibility 不索取 port context；live item 的真实条件/getter/供应副作用仍走既有回调；旧 direct offline resource apply 和 combined offline commodity pass 均拒绝非 null item。

未做游戏 UI/原版实机截图，未做 Web 验证，未运行 typecheck/lint/场景。没有新增安装货舱操作、等离子视觉、未知产业效果、补造 capture 或关闭真实 getter 缺失保护。本说明不表示完整资源生命周期/完整生涯已验收。

## 本轮编码交付

已实现共享 `isSupportedOriginalResourceItem`，由资源 live helper 自身、financial/accessibility 门禁和真实加载准备复用。新增的加载检查不改动 SpecialItemData 或经济 state。已为旧 direct resource apply / combined commodity pass 保留并前置显式 null-only 拒绝；旧 offline restore 仍调用该受限 pass，未偷换成 live。

改动文件：`OriginalResourceIndustries.mjs/.d.mts`、`OriginalMarketFinance.mjs/.d.mts`、`OriginalMarketAccessibility.mjs`、`OriginalIndustryCommodityPass.mjs/.d.mts`、`server/campaign/native/IndustryRestore.mjs` 与本说明。未运行验证；集成结论由主代理集中验收后给出。
