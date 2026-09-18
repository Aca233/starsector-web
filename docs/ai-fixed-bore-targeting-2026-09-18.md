# 固定炮实际炮口选敌（2026-09-18，已拒绝并撤回）

## 状态

**REJECTED / NOT_DEPLOYED。** 独立验证未通过，该候选已从生产 AutofireController 中精确撤回；实验检查改为必须显式指定冻结 bundle，未加入生产 ai:check，未启用 RL。先前幅能恢复候选已撤回，结果见 `ai-hard-flux-recovery-2026-09-18.md`。

## 当前基线与已确认问题

在同期原生舰船坐标适配改动后重新冻结 baseline：

`66feb262cbe924e1e42d18a53e50a27bcec9e1f99f56491929122e419f3128a7`

5 个开发编队，种子 1601，每场 60 秒，全部采用当前真实引擎。诊断只探测已经冷却、无限弹药、非 PD/制导的固定炮：原火控输出 ALIGNING 时，逐个合法可见敌人做原 acquisition，再用**不变的实际炮口、完整原世界的遮挡与幅能检查**测试能否 FIRE。探针不改变船头或位置，不额外更新模拟；每场与未加探针的权威 summary 完全一致。

在三舰混编中，`ship_3`（Hammerhead）的 WS 002 / WS 001（heavymortar）累计约 2.150 / 0.083 秒出现这种机会。舰船主目标是 `ship_2`（Wolf），船头也朝它转，但主炮追踪 `player_ship`，因此不开火；同时当前炮口已经可以对 Wolf 安全开火。

不是要求所有武器机械地服从船级目标，而是区分“炮塔可以转过去的目标”与“固定炮现在真正能打到的目标”。

## 候选范围

只修改 `AutofireController.aim` 的 acquisition 排序后选择：

- 仅 AI 的非 PD、非制导固定炮或零转速炮塔。
- 仅已冷却、非充能/连射周期、弹药与幅能足够、舰船和系统允许开火且没有进攻停火标志时。
- 在原合法候选与原效用排序中，优先找一艘**当前真实固定炮口能够命中、射线上没有友军/小行星遮挡**的目标。
- 固定炮口角使用舰体朝向 + authored baseAngle，不用前一帧的炮塔缓存角。
- 找不到时回退原来的预测 acquisition；玩家、可转炮塔、PD、导弹、冷却/充能/连射及幅能不足状态保持原逻辑。
- 原 decide 仍在本帧更新炮口后独立重查命中、遮挡、弹药与幅能。没有绕过许可，没有改伤害、武器数据、舰队分配或船体走位。

候选 bundle：

`e057f39e34c5985282cbc61ed4a3a087f71504dad6e0ed527633921d10d3a60b`

按源模块比较冻结 bundle，只有 AutofireController 模块不同，没有新增 runtime 模块。实验混合分发器只为选中的一队/一艘船调用候选 aim；其他函数不换。

## 同状态分支回放

开发三舰局重放至 30 秒后，只切换 `ship_3` 的 acquisition，其他舰船保持旧版本。双方前缀 summary 一致，两种分支分别加/不加发射与命中探针的完整 summary 一致。

| WS 002 指标（30 秒后至本局结束） | 原规则 | 候选 |
|---|---:|---:|
| 实际发射 | 6 | 12 |
| 实际舰船命中 | 1 | 5 |
| 对敌增加的实际幅能 | 44 | 179.582 |
| 造成装甲/船体损失 | 0 / 0 | 0 / 0 |
| 本局结束时间 | 41.433 秒 | 42.633 秒 |

这些命中都是护盾命中；**不能写成多打掉船体或已提高胜率**。两分支依旧都是我方（team 0）落败，候选所在 team 1 获胜；这一例并没有证明候选更快取胜。

## 当前验证

- 12 项候选合同检查已通过：实际炮口与预测目标区别、手动控制、可转炮塔、零转速缓存角、PD/制导优先级、武器周期、幅能/系统限制、无机会回退、友军、小行星、隐身/死亡/友方目标。
- 已完成 **48 场开发筛查 / 24 个换边配对**，六种等配置舰队，种子 1601 / 211 / 307 / 419，90 秒时限。计划已先保存。
- 使用等配置舰队是为了减少编队实力悬殊锁定结果；这些已用开发种子与编队不能称为独立验证，也不根据这一轮计分直接上线。
- 只有开发证据值得继续，才冻结独立的新种子验证计划；整体增强仍需真实新旧对打和适用范围内回归验证。

路径：`artifacts/ai/fixed-bore-target-2026-09-18/`。

- `baseline.json` / `baseline.mjs` / `before-AutofireController.ts`
- `diagnose.mjs` / `diagnosis.json`
- `candidate.mjs` / `mixed.mjs` / `isolation.json`
- `branch.mjs` / `branch.json`
- `bore-checks.log`
- `development-plan.json` / `compare-development.mjs` / `development.log` / `development.json`
- `checks-candidate.log` / `lint-candidate.log` / `build-candidate.log`

候选合同测试（不等于战力测试）：

```powershell
node scripts/check-ai-fixed-bore.mjs --bundle artifacts/ai/fixed-bore-target-2026-09-18/candidate.mjs
```

不覆盖旧结果；复跑应复制输入至新目录。工作区有其他同期变更，后续整合前必须再次核对当前 bundle 与冻结候选，不得重置其他任务内容。

## 历史过程：开发筛查与预注册独立验证

开发筛查为 8 胜、7 负、33 超时，计分 51.04%；这是小幅、探索性的正向结果，不足以确认增强，不能当成 51.04% 胜率。五舰组为 3 胜 / 4 负 / 1 超时（43.75%），没有因为它表现较差而从后续验证剔除。

候选代码没有据此调参。已冻结 `validation-plan.json`，采用 9 个场景（保留全部六个开发编队，加 Enforcer 混编、航母混编及非对称三舰），16 个新种子，180 秒时限，共 **288 场 / 144 个换边配对**。开发记录不混入验证统计。新种子列表、候选/基线哈希、bootstrap 种子与接受门槛全部先保存，再启动 `compare-validation.mjs`。

接受门槛：总计分 >50%，配对 bootstrap 95% 区间下界 >50%，没有单一编队计分低于 37.5%，且正确性/玩家控制/安全与路由检查通过。否则撤回本候选；不在出结果后调参、挑选编队、延长对局或追加样本争取过线。该验证现已完成；最终判定为拒绝，见下一节。

原有 72 项 AI 检查、12 项新候选检查、lint 和 build 已通过。完整检查第一次遇到 Windows PID 重用导致旧 component-check 目录撞名；测试辅助脚本已改用 mkdtemp，不删除或覆盖旧证据，独立复查 8 项 component 检查通过。这个测试辅助修正不是 AI 增强收益。

完整日志：`checks-candidate-recheck.log`、`component-harness-recheck.log`、`lint-candidate.log`、`build-candidate.log`；验证过程/结果为 `validation.log` / `validation.json`。

## 独立验证结束：拒绝候选

288 场真实新旧对打（144 个配对）为 **114 胜 / 117 负 / 57 超时**，计分 **49.48%**，实际胜率 **39.58%**。相对中性计分为 −0.52 个百分点。原预注册配对 95% 区间 **[47.57%, 51.22%]**；另外按 16 个种子块重采样得到 **[47.74%, 51.22%]**。两个区间均跨过 50%，不能确认增强，也不能断言普遍变弱。

| 场景 | 胜 / 负 / 超时 | 计分 |
|---|---:|---:|
| validation-bore-light | 13 / 14 / 5 | 48.44% |
| validation-bore-destroyer | 15 / 15 / 2 | 50.00% |
| validation-bore-strike | 12 / 12 / 8 | 50.00% |
| validation-bore-trio | 16 / 16 / 0 | 50.00% |
| validation-bore-five | 15 / 16 / 1 | 48.44% |
| validation-bore-cruiser | 13 / 13 / 6 | 50.00% |
| validation-bore-enforcer | 8 / 8 / 16 | 50.00% |
| validation-bore-carrier | 7 / 7 / 18 | 50.00% |
| validation-bore-mixed-trio | 15 / 16 / 1 | 48.44% |

原门槛失败，没有追加样本、筛掉不利编队或改参数争取通过。288 条记录、144 个配对、原 bootstrap、精确队伍分发器均复核；首个验证种子双方完整重放与原记录逐项一致，另有全旧分发器与原引擎完整回放一致。这些复演没有重复计为样本。审计见 `validation-audit.json`。

AutofireController.ts 已精确恢复到本实验开始的源码。同期其他模块发生变化，已保留：// src/engine/ai/TacticalNavigation.ts、// src/engine/simulation/CombatEngine.ts；新增 // src/engine/ai/FriendlyFireLaneIndex.ts。当前恢复 bundle 哈希为 `405b2fda184450d244d4843fd4c2a2fad2819a8820436ac495c44b0ba2cabe7d`，不能宣称整个工作区回到旧 baseline。没有将坐标/内容等同期变更算成本候选成果。Windows PID 撞目录的 mkdtemp 测试辅助修正保留。
