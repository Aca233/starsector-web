# ECS 权威数值基准与验收口径（2026-10-13）

本文是 [单机 Rust 权威迁移策划案](single-player-rust-authority-plan-2026-10-13.md) 阶段 1 的交付物。用户 2026-10-13 决定**改写验收口径、以 ECS 为新基准**（不再逐位复刻 TypeScript）。因此本文要回答的唯一问题是：**换成 ECS 权威之后，"什么算对"由谁定义、怎么验、验到什么程度算过。**

## 一、参考层级（2026-10-13 更新：本项目已独立，原版不再是约束）

用户 2026-10-13 明确：**本项目是独立项目，不再以原版 Starsector 为依据。** 因此参考层级改为：

1. **本项目自定规则**——数值与行为的唯一依据。规则可以自由演进，不再需要原版锚点。
2. **本项目管理规则**——联机权威/权限/幂等、存档安全、确定性重放等工程约束（见第二节）。
3. **现有 Web 权威行为**——本轮迁移的**对齐目标**：用户已决定"沿用现有 Web 已调好的数值"，即 **ECS 只换执行位置、不换规则**。基准链路已选定为 **TS 单机链路**（2026-10-13 决定），即玩家当前在单机实际玩到的那套数值与行为。因此 ABBA 式的"TS↔ECS 同场同结果"等价门**重新成为有效判据**（既有的 [check-rust-player-flow.mjs](../scripts/check-rust-player-flow.mjs)、[benchmark-rust-combat.mjs](../scripts/benchmark-rust-combat.mjs) 正是这个形态，可直接复用）。
4. **ECS 自身实现**——可自由选择数据结构与算法（SoA、空间哈希、f32 等），只要对得上第 3 层。

配套原则：

- 已有原版对照资产（`docs/rust-combat-*`、`scripts/check-rust-*` 探针）**原样保留、不再新增**，并在本文件与相关策划中**标记为历史/仅供参考**；它们不再构成验收约束。
- 迁移期间**不允许**顺手改变玩法数值；要改数值属新需求，需单独立项，不与本次迁移混做。
- 参考层级第 3 层需要"唯一基准"才能自动比对，见第五节。

> 历史标注：本文件早期版本（同日）曾把原版 0.98a-RC8 反编译证据列为最高依据，并据此规划 `../decompiled`、`../starsector-core` 的取证工作。该方向已被用户决定取代，相关取证已停止，不再执行。

## 二、ECS 权威必须满足的宿主硬契约

这些来自现有 Worker/会话层的实际校验，与"换内核"无关，属不可协商项（每条附证据）：

| # | 契约 | 证据 |
| --- | --- | --- |
| C1 | 协议版本 `LOCAL_COMBAT_PROTOCOL = 17` 双向校验 | [LocalCombatWire.ts:5](../src/engine/contracts/LocalCombatWire.ts#L5) |
| C2 | 4 种请求 `init`/`restore`/`step`/`commands`，3 种应答 `ack`/`failed`/`replay-progress` | [LocalCombatWire.ts:13-33](../src/engine/contracts/LocalCombatWire.ts#L13-L33) |
| C3 | `sequence` 严格 +1；tick 精确语义（restore→checkpoint.tick、step→latest+1、commands→不变） | [LocalWorkerHost.ts:149](../src/engine/runtime/local/LocalWorkerHost.ts#L149) |
| C4 | **witness 必须是 22 个有限数且 `witness[0]===tick`** | [LocalWorkerHost.ts:153](../src/engine/runtime/local/LocalWorkerHost.ts#L153)、[CombatReplayCheckpoint.ts:56](../src/engine/runtime/local/CombatReplayCheckpoint.ts#L56) |
| C5 | 恢复必须 fresh worker、逐 tick 重放不得丢弃、**逐条命令回执 `accepted`+`reason` 全等**、末尾 witness 全等 | [local-combat.worker.ts:71-104](../src/engine/runtime/local/local-combat.worker.ts#L71-L104) |
| C6 | 重放期必须静音（不得重放音频/事件） | [local-combat.worker.ts:22-26,74,104](../src/engine/runtime/local/local-combat.worker.ts#L22-L26) |
| C7 | 内容指纹 `localCombatContentSignature()` 由 host 与会话持续校验 | [LocalWorkerHost.ts:69-72,107](../src/engine/runtime/local/LocalWorkerHost.ts#L69-L72)、[CombatSession.ts:180-183](../src/engine/runtime/CombatSession.ts#L180-L183) |
| C8 | 权威指纹 `{kind:'rust-wasm', sha256}`，恢复时跨 SHA 必须如实拒绝 | [CombatReplayCheckpoint.ts:33-39](../src/engine/runtime/local/CombatReplayCheckpoint.ts#L33-L39) |
| C9 | 呈现必须是纯数据（禁止出现 TS 模拟对象），字段闭集 | [CombatPresentationEncoder.ts:465-466](../src/engine/runtime/local/CombatPresentationEncoder.ts#L465-L466) |
| C10 | 冷启动失败才允许整场回退 TS，且只在 init 阶段带 `startupFallback` | [local-combat.worker.ts:49-57](../src/engine/runtime/local/local-combat.worker.ts#L49-L57) |

## 三、确定性与一致性要求（本轮回执修正）

**重要修正**：恢复**不是**靠中途快照，而是**从 tick 0 重放**整段 journal（[local-combat.worker.ts:84-101](../src/engine/runtime/local/local-combat.worker.ts#L84-L101) 逐条 `stepScheduled` + 逐条命令回执比对）。因此 ECS 权威的第一硬要求是**可确定性重放**，而不是快照/回滚 API。

要求：

- **D1 重放确定性**：相同 seed + 相同配置 + 相同命令序列 → 每一步的 witness 与每条命令回执逐位一致。这是 C5 的前提，也是崩溃恢复（`recoverAuthority`）的前提。
- **D2 随机流**：必须显式设计并文档化（几条流、算法、每次消耗顺序、游标如何进入 witness）。**已建立两条流**：`EcsRandom`（[ecs_core.rs:75](../native/combat-core/src/ecs_core.rs#L75)）逐位复刻 TS `SimulationRandom`（mulberry32 + binary64 未截断游标）；战斗流用 `seed`，视觉流用 `(seed ^ 0x9e3779b9) >>> 0`（同 `CombatEngine`），identity 分配器共用战斗流。**仍待办**：各子系统（散布、伤害浮动、AI 决策）的真实随机消耗尚未接入，目前只有基元与诊断出口；战机编织项目前仍是 `sin`（[:785](../native/combat-core/src/ecs_core.rs#L785)）。
- **D3 tick 与步长**：**已补**。`ecs_tick`（[:1546](../native/combat-core/src/ecs_core.rs#L1546)）可读提交 tick；`ecs_step_checked`（[:1568](../native/combat-core/src/ecs_core.rs#L1568)）要求 `expected_tick` 精确匹配并拒绝越界/非有限 `dt`，返回码 `1=OK / 0=未知 world / 2=tick 不匹配 / 3=dt 非法`，拒绝时不推进 tick；`ecs_dt_min/max` 公开契约常量。旧 `ecs_step`（[:1084](../native/combat-core/src/ecs_core.rs#L1084)）保留"返回 sprite 数 + 静默 clamp"（[:623](../native/combat-core/src/ecs_core.rs#L623)）语义，既有 CLI 调用者不受影响。
- **D4 跨平台浮点**：`ecs_core.rs` 全 `f32`、**不引用 `canonical_math`**（对比 `core_*` 用 f64 + [canonical_math.rs](../native/combat-core/src/canonical_math.rs)）。IEEE-754 四则运算本身跨机一致，但 `sin/cos/atan` 等超越函数在不同引擎/平台**不保证逐位一致**。
  - 结论：**同机同构建**的重放确定性（D1）用 `f32` 可以达成；**跨机/跨平台**逐位一致**不能声称**，除非为超越函数引入 canonical 实现。跨机一致性目前只被联机显示副本需要（客机不回放权威），因此本文把它列为"未声明能力"，而不是阶段 2 的必交项——但一旦要支持跨机共享检查点或服务端与浏览器互相恢复，就必须补。
- **D5 输出抑制**：重放期必须能丢弃音频与事件输出；ECS 现状每步清空 outbox 且**无序号、无 ack**（[ecs_core.rs:312-318,531-534](../native/combat-core/src/ecs_core.rs#L312-L318)），需补"已确认到某序号"的语义（对照 `core_ack_events`/`core_ack_audio`）。
- **D6 数值确定性 ≠ 数值正确**：D1 只保证可复现。数值是否"对"由第五节的基准链路对齐与允许差异清单判定。

## 四、ECS 现状与契约的差距（本轮已核实）

| 契约/要求 | ECS 现状（2026-10-13 第 5 轮后） | 证据 |
| --- | --- | --- |
| C2 请求/应答面 | 仍无协议层（只有 C 导出；三轮共新增 22 个权威导出，`ecs_*` 从 21 增至 43） | [ecs_core.rs](../native/combat-core/src/ecs_core.rs) 导出清单 |
| C4 witness | **已组装**：22 个 f64 字，字段与 `LocalCombatKernel.replayWitness()` 逐位对齐（几何集 `{8,9,10,11,12,16,17}`）；`[19]` 增援与 `[21]` 光束因 ECS 尚无对应系统而固定为 0（代码内已标注为占位） | `ecs_witness_ptr` [:1699](../native/combat-core/src/ecs_core.rs#L1699)、`refresh_witness` [:1482](../native/combat-core/src/ecs_core.rs#L1482) |
| C5 重放 | **回执通道已建立**：`ecs_apply_commands` 在不推进 tick 的前提下抽取队列并记录位置化 `[accepted, reason_code]`（0=OK/1=未知 opcode/2=未知目标）；仍缺宿主信封（`ack`/`failed`/`replay-progress`） | `ecs_apply_commands` [:1684](../native/combat-core/src/ecs_core.rs#L1684)、`ecs_command_results_ptr` [:1720](../native/combat-core/src/ecs_core.rs#L1720)、`apply_commands` [:1389](../native/combat-core/src/ecs_core.rs#L1389) |
| C7 内容指纹 | 无内容准入；TS 侧把装配压成 1 个 `weaponDamage` 标量 | [RustEcsBridge.ts:146-186](../src/engine/runtime/rust/RustEcsBridge.ts#L146-L186) |
| C9 呈现 | 只有聚合 HUD + sprite 缓冲；无光束、无护盾体、无伤害数字 | [:1176](../native/combat-core/src/ecs_core.rs#L1176)–[:1284](../native/combat-core/src/ecs_core.rs#L1284) |
| D2 随机流 | **已建立**：两条 mulberry32 流 + identity 分配器，与 TS 逐位一致；子系统消耗未接入 | `EcsRandom` [:75](../native/combat-core/src/ecs_core.rs#L75) |
| D3 tick | **已建立**：tick 可读 + `expected_tick` 校验 + 显式 dt 契约（拒绝码 0/2/3） | [:1546](../native/combat-core/src/ecs_core.rs#L1546)、[:1568](../native/combat-core/src/ecs_core.rs#L1568) |
| 状态读回 | **已建立**：逐舰 16 f32 读回（id/team/active/位姿/速度/血量/软硬幅能/护盾/过载/装甲均值），并与 witness 交叉校验一致 | `refresh_ship_state` [:1338](../native/combat-core/src/ecs_core.rs#L1338)、`ecs_ship_state_ptr` [:1656](../native/combat-core/src/ecs_core.rs#L1656) |
| D5 输出抑制 | 每步清空 outbox，仍**无序号、无 ack** | `push_event` [:406](../native/combat-core/src/ecs_core.rs#L406)、step 内清空 [:626](../native/combat-core/src/ecs_core.rs#L626) |
| 被加载的产物 | 安装态 wasm **0 个 `ecs_*` 导出**；带 `ecs_*` 的构建仍未安装（构建只落在 `artifacts/`） | `game-assets/runtime/combat-core.wasm` vs 构建产物 |
| 内核适配层 | **已建立但未接入**：[EcsCombatAuthority.ts](../src/engine/runtime/rust/EcsCombatAuthority.ts) 封装导出、归一化 u32 有符号陷阱、提供 `tick`/`stepScheduled`/`stepChecked`/`pushCommand`/`applyCommands`/`setControl`/`replayWitness`/`readShips`/`dispose`；`src/network` 与 `local` 仍无引用 | 见该文件类注释与验收用例 |
| 输入采样通道 | **已建立（内核语义层）**：`ecs_set_control(world, ship, aim, thrust, strafe, firing)` 每 tick 一份、step 消费后即清；手动分支复用 AI 的同一套限制（转向速率、加速度、限速、0.25s 冷却、友军火线走廊）。**仍缺**：宿主 `CombatControlSample`（按键名/指针）→ 这些语义量的映射，属桥接层 | `set_control` / `step_manual_control`、`ecs_set_control` 导出 |

**桥接注意（本轮实测发现）**：wasm 的 `u32` 返回到 JavaScript 是**有符号 i32**，因此 `u32::MAX` 之类的失败哨兵到达 JS 是 `-1` 而不是 `4294967295`。例如 `ecs_spawn_ship` 失败、`ecs_apply_commands` 的未知 world 都是 `-1`。未来写 ECS↔TS 桥时必须归一化（`value >>> 0`）后再比较无符号常量，否则失败分支永远不触发。

### 进展与验收证据（2026-10-13 第 2–5 轮）

- **第 2 轮**：确定性 RNG（战斗/视觉/identity 三面，与真实 TS 源码逐位一致，含跨 2³² 游标边界）、tick 契约、逐舰状态读回、13 个新导出。
- **第 3 轮**：22 元宿主 witness（含角色标记 `SHIP_ROLE_*` 与 `ecs_mark_ship_role`）、命令回执通道（`ecs_apply_commands` + 位置化 `[accepted, reason_code]`）、8 个新导出。
- **第 4 轮**：内核适配层 [EcsCombatAuthority.ts](../src/engine/runtime/rust/EcsCombatAuthority.ts)（暂未接入 Worker），并把 **D1 重放确定性端到端证出来**。
- **第 5 轮**：**外部控制输入通道**（`ecs_set_control`：`aim`/`thrust`/`strafe`/`firing`，每 tick 一份、step 后即清）；手动分支复用 AI 的同一套物理限制（转向速率、加速度、限速、0.25s 冷却、友军火线走廊），因此手动输入不可能超过 AI 的能力上限。适配层同步获得 `setControl`。
- **构建**：`pwsh -File scripts/build-rust-combat-core.ps1` → `artifacts/rust-combat-core-20261008/build/wasm32-unknown-unknown/release/foundry_combat_core.wasm`，**2,807,319 B，sha256 `7bd9ff07…`**，编译 0 错误（既有 dead-code 警告非本次引入）。
- **验收**：[check-ecs-authority-foundation.mjs](../scripts/check-ecs-authority-foundation.mjs) **19/19 通过**，证据 `artifacts/ecs-authority-foundation-20261013/result.json`：
  1. 战斗流 / 视觉流 / identity 分配器对真实 TS `SimulationRandom` 逐位一致，witness 三项全等；
  2. **30 万次抽样跨 2³² 游标边界**逐位一致（"游标按 binary64 累加不截断"的关键证据）；
  3. 游标恢复后抽样一致；负数/小数/NaN 游标被拒；
  4. tick 契约：错序/非法 dt 拒绝且不推进 tick，未知 world 返回 0，旧 `ecs_step` 仍可推进并 clamp；
  5. 逐舰读回数值正确；
  6. **witness 布局与角色**：22 字、`[0]===tick`、全有限、RNG 六字与 RNG witness 相等；未标记角色时玩家/敌人字段为 0；非法索引/角色被拒；清除角色后掩码更新；
  7. **witness 追踪权威状态**：witness 的玩家位姿/速度/朝向/血量/软硬幅能与逐舰读回**逐位相等**（两条独立通道交叉校验）；横向冲量只让玩家速度按冲量方向变化；占位字段恒为 0；
  8. **命令回执**：位置化 `[accepted, reason]` 正确；`ecs_apply_commands` **不推进 tick**；空批次不清空已读回执；新批次替换；旧 `ecs_step` 路径同样记录；
  9. **适配器驱动**：按宿主调用范式（init → commands → step*）驱动内核，回执、tick 推进、读回、`dispose` 后拒绝调用均正确；
  10. **错序 tick 拒绝**：复放已提交 tick 被拒且不改状态（重放危险面）；
  11. **重放确定性（D1）**：同一份 48 步 journal（含两批命令）跑两次，**逐步 witness 逐位一致、回执完全一致**，且断言非平凡（玩家确实移动、tick 走到 48）；
  12. **roster 上限与 u32 归一化**：第 257 艘必须失败——若不做 `>>> 0` 归一化，该失败分支永不触发（第 4 轮发现的陷阱）；
  13. **控制输入驱动运动**：满推力 30 tick 的位移与解析值 `accel·dt²·n(n+1)/2`（=11.625）吻合到 0.05 以内，朝向收敛到瞄准点——即输入通道被钉在舰体自身的物理上限上，而不是"能动就行"；
  14. **控制仅作用一 tick**：只武装首 tick 与武装两 tick 产生不同轨迹（样本不会泄漏到下一 tick），且重复运行可复现；
  15. **带输入的重放确定性**：含控制样本、命令与"无输入回落到 AI"段的 30 步 journal 跑两次，逐步 witness 与回执完全一致，且开火样本确实产生了弹丸；
  16. **AI 路径跨构建零行为变化**：把**安装态的 10-10 构建**（早于第 2–5 轮全部改动）与当前构建在同一 AI-only 场景各跑 48 步，逐步比对 HUD 的 x/y/rot/hp_ratio/flux_ratio **逐位一致**——用旧产物直接证明新代码路径没有扰动 AI 运动。
- **无回归**：`validate-ship-pack.mjs` PASS（exit 0）；微基准 0.274 / 0.021 / 0.295 ms（近几轮 0.274~0.286 / 0.020~0.022 / 0.295~0.308，噪声范围）；改动文件 oxlint 0 警告。
- **本轮修掉的自家缺陷**：验收脚本曾把 `await Promise.all(pending)` 放在最后四个用例**之前**，导致这些用例的失败会晚于 `passed` 判定而被吞掉（表面仍"通过"）。已把 await 移到判定前，并加"用例计数对账"，记录数与启动数不符即硬失败。
- **未做**：宿主协议信封（`init`/`step`/`commands` 的 `ack`/`failed`/`replay-progress`）、`CombatControlSample`（按键名/指针）到内核语义输入的映射、内容准入（C7）、呈现信道（C9）、音频/事件 ack（D5）、子系统真实随机消耗、增援与光束。适配层**尚未接入 Worker**。生产 `game-assets` 产物**未替换**。

## 五、迁移对齐清单：ECS 必须对上的"现有 Web 行为"

因为已决定**只换执行位置、不换规则**，验收方式回到"同场同结果"：同一 seed、同一配置、同一命令序列下，ECS 权威必须与选定基准链路逐步一致。需要逐域对齐：

| 领域 | 对齐内容（不改动，只求一致） | ECS 现状 |
| --- | --- | --- |
| 运动/推力 | 加速度、限速、转向速率、角速度衰减、漂移阻尼 | 部分（无侧推、朝向由 AI 直写、无角质量） |
| 护盾 | 开合状态、弧/半径几何、护盾效率、命中转幅能 | 部分（运行期不可开合/转向） |
| 装甲/伤害 | 装甲格损伤与传播、直接船体伤害、伤害类型倍率 | 部分（8 扇区替代装甲格、无伤害类型） |
| 幅能 | 软/硬幅能、耗散、通气、过载触发与恢复 | 部分（开火不耗幅能、装甲命中不加幅能） |
| 火控/开火 | 蓄力/连发/冷却/弹药、射界、炮塔伺服、散布与后坐 | 部分（单武器标量 + 固定 0.25s 冷却） |
| 弹丸/光束 | 弹丸飞行与命中判定、光束持续结算 | 弹丸基础可用；光束缓冲恒空 |
| 导弹制导 | 制导类型、转向、目标丢失行为 | 未实现 |
| AI | 战术意图、防空/PD、副炮自动瞄准、航向机动 | 部分（选靶/转向/距离保持；无防空/PD） |
| 舰载机/无人机 | 编队出击、空战、回航补给、受伤与死亡 | 部分（Boids 有；战机 hp 永不减、无武器） |
| 相位 | 潜航状态机与碰撞/护盾交互 | 未实现 |
| 引力/地形 | 引力井持续场、小行星碰撞 | 未实现（仅一次性径向冲量） |
| 部件损伤 | 武器/引擎部件损伤与传播、熄火 | 未实现 |
| 事件/呈现 | 音频事件、命中火光、状态快照 | 部分（5 类事件、无序号/ack；无光束/护盾导出） |
| 内容准入 | 舰船/武器/机翼/系统的编译与指纹 | 未实现（装配被压成 1 个标量） |

**允许差异**（需逐条列明并给理由；除此以外的差异即失败）：
1. 表现层容差：音频位置/听者坐标、粒子与拖尾的随机外观，允许几何级容差（沿用既有 ABBA 的 `32*EPSILON` 级别判定）。
2. 浮点：ECS 为全 `f32`（[ecs_core.rs](../native/combat-core/src/ecs_core.rs) 内 0 处 f64），与现有 `f64` 链路存在表示差异；容差需按域实测确定，不得笼统放宽。
3. 不得有"行为性差异"（伤害数值、命中判定、AI 决策顺序、随机数消耗顺序）——这些必须完全一致。

**基准链路（已定，2026-10-13）**：以 **TS 单机链路**为基准——玩家今天在单机实际玩到的那套数值与行为。判定方式：同一 seed、同一配置、同一命令序列下，ECS 权威与 TS 权威逐 tick witness、逐条命令回执一致；比对工具沿用既有 ABBA 形态（[benchmark-rust-combat.mjs](../scripts/benchmark-rust-combat.mjs)、[check-rust-player-flow.mjs](../scripts/check-rust-player-flow.mjs)）。

**同时记录的既有事实**：两条现有链路**彼此已经不一致**。10-13 同 SHA ABBA 实测：TS 臂与 `core_*` Rust 臂各自内部逐位可复现（TS≡TS、Rust≡Rust），但**跨后端从 tick 9 起分歧**（witness[8] 差 5.8e-3，容差 ~1e-9；tick 18 战斗 RNG 游标已分成 3196082344602 / 3207071739480，全量 3411 处越界）。因此：

- 单机（玩家今天实际玩到的）＝ TS 链路 ← **本次基准**
- 联机房主与服务端 ＝ `core_*` Rust 链路 ← 与基准不一致，属既有缺陷，另立条目，不阻塞本次迁移（见第七节第 2 项）

## 六、阶段验收门

- **G1（阶段 2 完成度）**：C1–C10 逐条有实测证据；D1 用"同 seed 双跑逐位一致 + 中途恢复回到同一 witness"证明。
- **G2（数值与行为）**：按第五节，对**选定的唯一基准链路**做同场同结果比对——逐 tick witness 与逐条命令回执一致；允许差异逐条列出并有理由，未列出的差异即失败。
- **G3（性能）**：在**同一 ABBA 场景与同一测量口径**下与当轮 TS 权威比较（当前 TS 基线：simulation 21.45 ms / roundtrip 29.01 ms 均值）。禁止用 `benchmark-ship-balance.mjs` 的纯物理微基准充当端到端性能证据（该脚本测的是 Node 内 `ecs_step` + 一次 memcpy，不含内容/AI/伤害/呈现/IPC）。
- **G4（可玩）**：真实无参 URL 启动 → 部署、驾驶、开火、撤离、结算各一次；检查点同 SHA 恢复成功、跨 SHA 如实拒绝；崩溃恢复不热切后端。
- **G5（不回归）**：联机与服务端既有检查保持通过；整场冷回退安全机制保留（用户 2026-10-13 决定）。

## 七、未决与待核实

1. ~~基准链路选择（阻塞 G2）~~ **已定（2026-10-13）：以 TS 单机链路为基准。** G2 解阻塞，阶段 2 可以开工。
2. **TS↔`core_*` 既有分歧**：已确认为既有缺陷（单机与联机数值不同），**另立条目**，本轮不修、不阻塞迁移。是否要让联机向基准看齐由用户后续决定。
3. 跨机逐位一致性（D4）是否要作为能力声明——取决于是否要让服务端与浏览器互相恢复检查点。
4. 原版相关资产已在文档层标记为历史/仅供参考；是否给 `docs/rust-combat-*` 与 `scripts/check-rust-*` 加统一的历史标注（不改内容、不删文件）由用户后续决定。

## 八、权威成本分段实测（2026-10-14，独立复核）

在造投影 spike 之前先回答了"ABBA 的 `rust-wasm simulationMs = 88.54 ms` 到底花在哪"。该数字口径是 **worker 侧"从收到消息到编码开始"**（对 Rust 路径含 `copyControlSample` + `encodeRustSceneControl` + `applyCorePacked` + `core.step` + `refresh()`），并非纯 Rust 模拟。

工具：[profile-authority-split.mjs](../scripts/profile-authority-split.mjs)（沿用 `profile-rust-hot-step.mjs` 的注桩法，驱动真实单机 `RustCombatKernel`，roster 与 [rust-combat-performance.ts](../scripts/lib/rust-combat-performance.ts) 完全一致 = 176 实体）。近乎无插桩模式三次运行：

| 运行 | 单 tick 总耗时 | Wasm 内部 `state::step` | JS 胶水 | Wasm 占比 |
| --- | --- | --- | --- | --- |
| 1 | 84.94 ms | 65.65 ms | 19.29 ms | 77.3% |
| 2 | 68.27 ms | 52.61 ms | 15.66 ms | 77.1% |
| 3 | 71.31 ms | 55.62 ms | 15.69 ms | 78.0% |

结论：**绝对值噪声大（68~85 ms），比值极稳（Wasm ≈77~78%）**，与浏览器侧 88.54 ms 同量级。"深拷贝是主因"的猜测被否定——显式计时的 scene draft clone 仅 **2.44 ms**。因此 ECS 单向投影能替掉的是 encode（单独测得 53.45 ms）与那 16~19 ms 胶水，**替不掉 53~66 ms 的模拟本体**。

**与并行工作流的关系（重要）**：同日有另一条工作流在推进同一目标，其分档与本测量一致（Stage 1：克隆+校验+提交+Cache = step 的 21.4%，floor ≈31.1 ms），并已产出更细的 Stage 0 分段（`sim 49.83 = applyPacked 1.51 + step 39.53 + snapshot 3.65 + scenePublication 5.11`；`encode 29.09`）与单向投影原型（6 舰 0.020 ms / 22 舰 0.143 ms）。其迁移方案 [core-authority-migration-plan-2026-10-13.md](core-authority-migration-plan-2026-10-13.md) **明确把 ECS 定位为契约层 + 单向投影层，并复用了本线路的缓冲常量与验收脚本**（`check-ecs-authority-foundation.mjs` 在其构建 `06da0c7a` 上 19/19 通过）。故本文档不再重复其性能结论，只保留可复用的诊断工具与本节分段证据；G3 判据不变，但"单机切 Rust 的性能前置"已由该工作流接管，本节仅作交叉验证。
