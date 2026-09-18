# 固定主炮瞄准死区：发现了真实漏火，但整体收紧方案未通过（2026-09-18）

## 结论与当前运行状态

**REJECTED / NOT_DEPLOYED。** 本次没有上线“更强 AI”，也没有启用强化学习。

发现并复现了一个真实漏火问题：AI 使用玩家鼠标转向的 1° 停转死区，而固定炮的实际炮口命中检查可能需要更精确的船头朝向。针对同一个真实战斗状态，收紧转向确实增加了实际命中和伤害。但把精度统一收紧到所有可用固定武器的 AI 舰船，未通过预先规定的新旧对打门槛，因此已撤回两处运行时修改。

- `TacticalNavigation.ts` 与 `PlayerControls.ts` 精确恢复到本次开始时的内容。
- 先前的撤离意图 / DISENGAGE 修复保留；先前的掩护导航候选仍不启用。
- AutofireController、ShipCombatProfile、CapitalShipAI、FleetTactics、ShipWeaponControlSystem 的开始时哈希均未改变。
- 恢复后完整 CombatLab bundle 与本次新冻结的 baseline 哈希一致。此说法只针对本次实验，不是整个脏工作区或 git HEAD。

## 不是凭外观猜测：具体漏火证据

使用真实 60 Hz CombatEngine，开发种子 **1601**，无小行星，三种编队各回放 60 秒。只做诊断的回放与不加探针的回放，权威 summary 完全相同。

在 `dev-light`（两边均为 wolf + lasher，LINE）中：

- `ship_2`（Lasher）的 `WS 002`（lightag）累计约 **3.35 秒**处于已经冷却但 `ALIGNING` 的状态。
- 这些帧的船头误差小于 1°；探针保持位置、目标和其他状态不变，只将船头/固定炮旋转到 AI 当时要求的朝向，即可通过原有 `decide` 检查。
- 这是静态可开火机会，不等于未来必然命中；因此继续做了真实分支仿真。

### 相同战斗状态的真实分支

从同一版本重放至 **52.0 秒**，两分支完整前缀 summary 一致。随后只在一个分支让 `ship_2` 使用候选转向规则，其余所有船继续原规则；观察至 **57.0 秒**。

| 指标（这一门炮，5 秒窗口） | 原规则 | 候选 |
|---|---:|---:|
| 已冷却且 `ALIGNING` 的时间 | 4.467 秒 | 1.683 秒 |
| 实际发射弹丸 | 4 | 13 |
| 窗口内实际舰船命中 | 0 | 9 |
| 这些弹丸造成的装甲格损失合计 | 0 | 117.541 |
| 这些弹丸造成的船体损失 | 0 | 213.245 |

发射数量通过真实 `fireWeapon` 发射回调记录；命中与伤害通过碰撞结算前后记录，并以该炮在窗口内发射的弹丸 ID 过滤，不包含其他炮弹的伤害。加入命中探针后的完整 summary 与未加该探针的对应分支一致。

**这只证明了一个局部修正有效，不是胜率、整舰 DPS 或全局战力的证明。** 窗口内命中数也不应当作所有发射弹丸最终命中率。

## 候选改动（已撤回）

只改两个函数：

1. `cursorTurnCommand` 增加可选死区参数，默认仍为 1°，保留玩家行为。
2. `driveVelocity` 在 AI 舰船存在未禁用、非空弹药的固定武器时使用 0.1°；固定武器包括 HARDPOINT 和转速为零的炮塔。保留刹转预测、过载与系统锁转。

没有修改武器射程、散布、弹速、伤害、AI 火控的实际炮口命中检查、友军遮挡检查、幅能预算或强化学习策略。

冻结 bundle 的文本比较验证：除这两个函数外，baseline 与 candidate 完全相同。

候选的适用范围比上述漏火帧更广：只要有可用固定武器就改变转向精度，而不局限于“已经停转且实际漏火”的帧。不能把局部成功外推成这种广泛改动也成功。更精确转向为何在某些整场对局中变成负收益，**尚未通过帧级因果分析建立**；不把幅能、运动耦合或随机弹道当成已经确认的原因。

## 预先固定的新旧对打

在读取对打结果之前保存 `head-to-head-plan.json`，冻结候选哈希、编队、种子、90 秒时限、评分、bootstrap 和接受门槛。

- 6 种编队 × 6 个新种子 × 新规则分别控制双方 = **72 场真实新旧对打 / 36 个配对样本**。
- 种子：1709、1873、2017、2237、2411、2671。开发种子 1601 不参与。
- 胜 1 分，负 0 分，超时 / 同归于尽 0.5 分。
- 同一场只对候选所在一队切换转向函数，其他 AI、武器和物理相同。
- 6 个短场验证全旧分发器与原 baseline 相同；另有 57 秒开发全旧回放一致。6 个直接函数探针验证双方路由。
- 门槛：正确性与具体漏火分支检查通过，平均计分 >50%，且配对 bootstrap 95% 区间下界 >50%；否则撤回。不根据结果继续调参数或追加样本争取过线。
- 编队并非完全未经观察的新编队；新的是种子。不是一个全新舰船分布的独立验证。

| 编队 | 胜 / 负 / 超时 | 计分 |
|---|---:|---:|
| Lasher 单挑 | 0 / 0 / 12 | 50.00% |
| Wolf + Lasher 镜像双舰 | 1 / 2 / 9 | 45.83% |
| Hammerhead + Wolf 对 Sunder + Lasher | 2 / 2 / 8 | 50.00% |
| 三舰混编 | 6 / 5 / 1 | 54.17% |
| Shrike + Lasher 对 Hammerhead + Wolf | 2 / 4 / 6 | 41.67% |
| Enforcer 混编双舰 | 0 / 1 / 11 | 45.83% |
| **总计** | **11 / 14 / 47** | **47.92%** |

- **47.92% 是计分，不是胜率**；实际胜率为 15.28%。
- 相对中性 50% 的计分差为 **−2.08 个百分点**。
- 36 个配对样本，10,000 次 percentile bootstrap（种子 93017）：计分 **[42.36%, 52.78%]**，差值 **[−7.64, +2.78] 个百分点**。
- 区间跨过 50%，且 47 场超时；无法据此断言普遍变弱，也不能宣称增强。没有延长这些比赛或追加种子来改变结论。
- **门槛失败，候选撤回。** 不单挑表现较好的三舰组作为上线依据。

## 检查与证据位置

本地证据目录：`artifacts/ai/fire-opportunities-2026-09-18/`。

- `baseline.mjs` / `baseline.json`：新冻结的原 AI 与关键源码哈希。
- `diagnose.mjs` / `diagnosis.json`、`angular.mjs` / `angular-diagnosis.json`：开发诊断及静态纠正探针。
- `candidate.mjs`、`rejected-TacticalNavigation.ts`、`rejected-PlayerControls.ts`：拒绝的候选快照，非生产代码。
- `mixed.mjs` / `isolation.json`：只切换转向函数的实验分发器；没有生产开关。
- `branch.mjs` / `branch-replay.json`、`branch-hits.mjs` / `branch-replay-hits.json`：真实分支回放、命中归因及探针中性验证。
- `compare.mjs`、`head-to-head-plan.json`、`head-to-head.json`：预案与逐场结果。
- `contract-tests.mjs` / `steering-checks.log`：11 项候选合同检查，包括玩家死区、炮塔/固定炮区别、锁转、过载、刹转与不绕过实际炮口校验。**没有加入生产 ai:check。**
- `rollback.json`、`restored.json`、`audit.json`：回退与 36 个配对结果、双方路由、关键哈希审计。
- `checks-{candidate,restored}.log`、`lint-{candidate,restored}.log`、`build-{candidate,restored}.log`：完整检查日志。

产物 JSON 使用独占写入，重放需复制必要输入到新目录，不能覆盖已完成报告。当前 artifacts 是本机实验快照，并非新增线上测试套件。

核心哈希：

```text
baseline / restored: 8f8a93926df6ccfcb1fb9a1ac763636c610b3711ae4b9077d84e4b51215babf3
candidate:           e3ec6ca3ca2b58d51e439faea8b3184921a28a531db28ff222cc4bcd67b98b4c
```

候选通过原有 **72 项 AI 检查**、lint 和 build；候选 lint 有当时 UI 列表 key 警告，构建有大 chunk 警告。恢复版本的 72 项 AI 检查和 lint 通过，但首次全项目构建被同期 UI 类型错误阻断（NativeCatalog.tsx:458、RefitWeaponTooltip.tsx:48），这些文件未在本实验中修改。未修改这些 UI 文件；其同期修复到位后再次构建通过（`build-restored-recheck.log`），仍有大 chunk 警告。最终状态为恢复版本的 **72 项 AI 检查、lint、build 均通过**。检查用于排除回归，不代表战力提升；失败与成功日志都保留。
