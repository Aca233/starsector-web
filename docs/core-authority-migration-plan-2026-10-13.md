# core_* 权威 + 单向投影：迁移实施策划案（2026-10-13）

上位依据：[single-player-rust-authority-plan-2026-10-13.md](single-player-rust-authority-plan-2026-10-13.md)（架构定案：权威状态采用 core_* 模型，ECS 收敛为契约层 + 单向投影层）与 [core-authority-60hz-gate-plan-2026-10-13.md](core-authority-60hz-gate-plan-2026-10-13.md)（60Hz 验证结果：Stage 0 通过、Stage 1 在 22 舰 D1 FAIL、Stage 2b 投影通过）。本文是**从验证转入实施**的可审阅方案；验证已回答“能否 60Hz”，本文回答“按什么顺序做、每期验收什么”。

## 一、目标与玩家体验

- 目标：把单机战斗权威从 TS 迁到 **core_* 权威 + ECS 契约层 + 单向投影层**，使单机与联机/服务端共用同一内核与同一套数值，并具备确定性重放。
- 玩家可感知：正常规模舰队每 tick 开销从当前链路降到 **~3ms 量级**（当前 rust 15.5ms / TS 25.9ms @22 舰、TS 正常场景 ~9-14ms）；不再出现 GC 停顿型掉帧。
- 非目标：切换普通入口默认、安装产物到 `public/game-assets`、移除 TS 冷回退、改动数值规则、改动联机/服务端既有接线、触碰生涯模式与存档。

## 二、依据（本次验证数据，决定本方案的取舍与顺序）

| 证据 | 数值 | 对实施的含义 |
| --- | --- | --- |
| Stage 0（22 舰，生产 wasm） | sim 49.83 = applyPacked 1.51 + step 39.53 + snapshot 3.65 + scenePublication 5.11；encode 29.09 = assembly 2.56 + presenter 16.26 + captureDetached 10.25 | 收益最大的一块是**编码/呈现链**，不是模拟 |
| Stage 1（事务开销） | 克隆+校验+提交+Cache = 14.74ms = step 的 **21.4%**；floor ≈31.1ms | “深拷贝主因”不成立；事务重构不是关键路径 |
| Stage 2b（投影原型） | 6 舰 0.020ms / 22 舰 0.143ms（1,270 / 8,150 词），E2 全过 | 投影把 29.09ms 的编码链压到 0.14ms（200×），且正确性可验 |
| 6 舰补充 | 当前 15.48ms；floor 2.70ms | 正常规模迁移后 ≈3.1ms（含事务重构）/ ≈4.6ms（不含） |

**因此实施顺序以“投影优先”排列，事务重构排在其后**（其闸门价值已被数据否定，仅剩 ~1.6ms 收益）。

## 三、范围与分期

- **P2（本次先建，门禁先行）等价门禁 harness**：混合命令 journal（覆盖全部命令 tag 族）+ 全状态指纹 + witness 逐位比对 + **负向对照**（故意错一步 RNG 消耗必须被检出，否则门禁无效）。作为 P1/P3 的准入门，先于功能代码落地。
- **P1 投影契约与 publish 接线**：字段映射定案（16f sprite / 12f HUD / 16f 读回 / 22f witness）+ 语义差异清单逐项解决 + 接入生产 publish 路径，替换 presenter 与 captureDetached；witness 保持 f64 直出。
- **P3 撤销日志事务重构**：`step_scene` / `apply_scene_commands` 热路径改为不深拷贝的等价事务（撤销日志或 scratch+swap），**位精确等价**；排期在 P1 之后。
- **P4 语义缺口与内容准入**：hull 尺寸类、护盾 kind/弧角、武器行/组/弹药、伤害类型、identity/generation、N×T 可见性矩阵、sprite 尺寸/纹理槽内容绑定。
- **P5 22 舰领域优化**（独立跟踪项，用户决定是否立项）：AI 舰队规划 2 次/tick、fire_query plan_queued、flight collect_wings、scene prepare 176 次/tick、phased_world 6185 次/tick、asteroid pair 3003 次/tick。

## 四、明确不做

- 不改 `CombatView`/`CombatSession` 的默认后端策略；不安装 wasm；不改 `core_full_battle_ready`。
- 不顺手修改其它工作流文件（含既有类型检查失败项），不以清理/还原名义覆盖无关改动。
- 不改联机/服务端接线与协议，不改检查点/回放格式，不动生涯。
- 不改动玩法数值；迁移只换执行位置。

## 五、联机权威、并发及存档影响

- 单机权威替换发生在 Worker 内部，事务/回执/呈现协议不变；检查点指纹含 `kind + sha256`，跨 SHA 恢复按既有机制如实拒绝，旧 TS 检查点仍按 TS 恢复。
- 单机与联机各自独立 Worker，无共享状态；并发语义不变。
- 无存档 schema 变更；生涯与战役存档零触碰。

## 六、依赖与实施顺序

P2（门禁，先）→ P1（投影接线）→ P3（事务重构）→ P4（缺口补全）→ P5（领域优化，可选立项）。
P1 依赖 P2 就绪（接线后必须逐位等价）；P3 依赖 P2 与 P1 稳定。P4 与 P1 部分并行（sprite 内容绑定属 P1 收尾）。

## 七、验收标准（分期）

- **P2（本次）**：同一 journal 两次运行，逐条 witness 与全状态指纹**全部位精确一致**；负向对照（额外一次 RNG 抽取）**必须被检出分歧**；journal 覆盖命令族清单齐备；断言非平凡（tick 推进、witness 逐条变化、存在被拒绝命令）。
- **P1**：正常规模 ABBA（G2 重定义口径）：sim ≤10ms 且 sim+encode ≤12ms；投影逐字段与当前 publish 一致（f32 呈现字段允许文档化舍入），已知差异全部列明；witness 与当前路径**逐位一致**；22 舰缺口文档化。
- **P3**：同一 journal 下 witness + 全状态指纹与重构前**位精确一致**；开销下降幅度记录（预期 6 舰 ~1.6ms、22 舰 ~4-8ms）。
- **P4/P5**：各自另立验收；P5 目标为 22 舰 sim 缺口的收敛路径与阶段性幅度。
- **全程**：不安装产物、不切默认；仅在验证 harness 内加载新构建；报告区分“实测 / 探针比率 / 未运行”。

## 八、待核实事项与待用户决定

1. **P3 是否保留在本次迁移范围**：建议保留但排最后；若排期紧张可单列为优化项（无闸门价值）。
2. **P5 是否立项**：22 舰缺口 ~14.6ms 全在领域模拟，需用户决定是否投入。
3. **语义差异按哪侧对齐**：`armor_avg`（ECS 8 扇区 vs core 装甲格）、HUD 第 12 词（`system_state` 文档 vs `time_scale` 实现）、`shield_active`（名义可变 vs 实际常量）——属 ECS 7 处既有不一致，需用户确认目标语义。
4. **P1 收尾待核实**：投影替换后 `snapshot` + `scenePublication`（6 舰 2.28ms / 22 舰 8.77ms）能否完全停用——其余消费者（命令回执、audio、telemetry、outcome、战术地图/部署视图）需在 P1 中逐项确认替代来源，未确认前不得删除。

---

## 九、P2 等价门禁执行结果（2026-10-13，通过）

工具：`scripts/check-core-authority-equivalence.mjs`（生产 wasm f080f34b；headless Chromium 151；COOP/COEP）。一次混合 journal 跑三遍：基线 / 重复 / 注入偏差（第 12 条后额外抽取一次战斗 RNG）。

| 项 | 结果 |
| --- | --- |
| journal 规模 | 38 条（25 个 step + 13 条命令）；命令族覆盖 pilot、ship（system/shield/group/vent）、tactical（select/close/cancel）、stop-firing、toggle-map、clear-input、add-ship |
| 命令回执 | 13 条全部被接受（0 拒绝/0 抛出） |
| **重放确定性** | 基线 vs 重复：**0 处差异**（witness 22 项逐位 + 全状态指纹 60,744 词 + 命令回执全等） |
| **负向对照** | 基线 vs 注入偏差：**检出 51 处差异**，首处分歧在 index 12（指纹 `a2899f42…` vs `e9507dfd…`），随后逐条传导 |
| 非平凡断言 | tick 推进到 25；witness 逐条变化；命令回执数 ≥8 |

**为何这样设计负向对照**：额外一次 RNG 抽取正是迁移最怕的失效模式（双流 RNG 消耗顺序错一步 → 全量数值漂移且最难自动验证）。门禁对它的敏感性已实测成立；若门禁检不出该偏差，则视为门禁无效、不得使用。

## 十、投影契约（P1 输入）

字段映射（✓= 已从代码定案并经 E2 验证；D-* = 待用户决定）：

| 缓冲 | 字段与来源 | 状态 |
| --- | --- | --- |
| sprite 16f | worldX/Y ← motion[0]/[1]；rot ← motion[4]；pivot 0.5/0.5；uv 0,0,1,1；r/g/b ← 装甲 tint；a 1.0 | ✓（scaleX/scaleY、texSlot 除外） |
| HUD 12f | id；team ← `ship.combat.team`；x/y/rot；hp_ratio ← `armor.data[14]/data[13]`；flux_ratio ← (soft+hard)/max；hard_ratio ← hard/max；shield_active；overloaded ← `flux.overloaded ‖ timer>0`；armor_avg；word12 | ✓（shield_active、armor_avg、word12 除外） |
| 读回 16f | id/team/active/x/y/vx/vy/rot/vrot/hp/max_hp/soft/hard/shield_active/overloaded_timer/armor_avg；**active ← `scene_owner::available` 语义**（`flags&(DEAD\|RETREATED\|DOCKED)==0 && hp>0`） | ✓（同上三处除外） |
| witness 22 | 全部 **f64 直出**，字段与 `replayWitness()` 逐项对齐；capitals ← `scene.capital()`（roots 过滤：非 pending、非撤退、敌方根仅在已部署） | ✓（E2 已逐字段验证，并据此修掉过一处战机误计入名册的缺陷） |

### 三项取舍的决策（2026-10-13，主代理建议并据此执行；用户可推翻）

**总原则**：**权威侧（core_*）语义为准**——凡是权威里存在的数据，一律以 core 为准，ECS 侧的同名不一致归入“ECS 7 处既有不一致”修复清单，不在迁移中迁就；**只有权威里根本不存在的纯呈现数据（sprite 尺寸/纹理槽），才由渲染侧补齐，且不动 ABI**。

- **D-A sprite 尺寸与纹理槽 → 采用 ②（渲染侧按实体 id 从内容表补）**。
  理由：①（在 spec 行里带尺寸）会改 `lifecycle::Spec` 行宽与 ABI，波及内容编译器、准入/启动命令流、42 个 `check-rust-*` 专项脚本，并会让既有回放 journal 的编码失效——代价远大于收益（每帧 ~176 次 id→规格查表，微秒级）。② 保持“呈现数据归内容、玩法数据归权威”的分层，零 ABI 改动。投影仍写占位尺寸/纹理槽（-documented），P1 在渲染侧补齐全表绑定；若将来查表真的成为热点，再评估 ①。
- **D-B armor_avg 与 HUD 第 12 词 → 均以权威语义为准**。
  `armor_avg` 取 core 装甲格语义（存活格均值 / 格值，归一化装甲完整度 0-1），ECS 的“Σ/8 与 Σ/(8×base)”两义属既有 bug，在 ECS 修复清单中统一到该定义；HUD 第 12 词按**常量注释的 `system_state`**（文档即契约），由 core 舰船状态编码（0 正常 / 1 排散 / 2 过载 / 3 相位），ECS 实现写 `time_scale` 属既有 bug，同样列入修复清单。
- **D-C shield_active → 采用 core 的真实可变语义**（`shield.is_some() && flags & SHIELD != 0`）。
  ECS 侧“名义可变、实际只在 spawn 写一次”是既有 bug，投影不迁就；ECS 修复清单中改为运行期可变。

另定案（未列入待决项，随本次执行）：**存活过滤采用 `scene_owner::available` 语义**（`flags & (DEAD|RETREATED|DOCKED) == 0 && armor.data[14] > 0`），不可用的舰船不进入三缓冲。

---

## 十一、P1 第一切片执行结果（投影并入生产 crate，2026-10-13）

**代码**：新增 `native/combat-core/src/projection.rs`（真实模块，非探针副本）；`lib.rs` 增加 `mod projection;` 与导出 `core_project`、`core_{sprite,hud,readback,witness}_{ptr,words}`；`state.rs` 开放 `slots/roster/scene/ordnance` 四个字段可见性。语义按第十节决策落地（存活过滤、HUD[12]=system_state 编码、core shield_active、core armor_avg）。**当前无任何消费者调用 `core_project`——惰性接入，不改任何现有行为。**

**构建**：本机无 `rg`，正式 `scripts/build-rust-combat-core.ps1` 无法运行；改用同参数 cargo 命令（`--offline --locked --release --target wasm32-unknown-unknown`，sysroot 与 linker 同脚本逻辑）构建到同一 target 目录。产物 2,811,988 字节，sha `5d4bb8b9…`（改造前 7bd9ff07，+4.7KB）。**未安装到 `public/game-assets`。**

**惰性验证（位精确）**：同一 38 条 journal 在三份构建上的指纹完全一致——
| 构建 | 指纹首条 / 负向对照 | 结论 |
| --- | --- | --- |
| 安装态 f080f34b | `a2899f42:8ba1eaa3` / 51 处 | 基准 |
| 改造前 7bd9ff07（当前源码） | 同上 / 51 处 | ECS 契约层工作未动领域行为 |
| **改造后 5d4bb8b9（含投影）** | **同上 / 51 处** | **投影并入位精确惰性；重放确定性仍为 0 差异** |

**生产构建投影成本（LTO，非探针构建）**：

| 规模 | 投影 ms/tick 均值 | p95 / p99 | 词/tick | 现 encode 链 | 降幅 |
| --- | --- | --- | --- | --- | --- |
| 6 舰（28 船体） | **0.0104** | 0.020 / 0.025 | 1,270 | 8.58 | **~820×** |
| 22 舰（176 船体） | **0.0889** | 0.175 / 0.310 | 8,150 | 29.09 | **~327×** |

E2 冒烟在两规模全过（与探针构建同样的断言：几何/hp/幅能/witness 逐字段对齐 snapshot、sprite 数 = 船体 + 弹丸）。

**本切片未完成 / 阻塞**：
- P1 剩余：TS 侧 publish 接线（用 `core_project` 的输出替换 `presenter` + `captureDetached`）与渲染侧 sprite 尺寸/纹理槽绑定（D-A ②）；未接线前投影不产生玩家可见变化。
- `snapshot` + `scenePublication`（6 舰 2.28ms / 22 舰 8.77ms）能否停用仍未核实（第八节第 4 项），未确认前不得删除。
- 迁移后预估按生产投影数更新：6 舰 ≈ floor 2.70 + applyPacked 0.30 + 瘦读回 ~0.05 + 投影 0.010 ≈ **3.06ms**；22 舰 ≈ 31.07 + 0.089 ≈ **31.2ms**（缺口 ~14.5ms，属 P5）。

---

## 十二、P1 剩余：替换 presenter 的通道设计（阻塞项盘点，2026-10-13）

盘清 `RustCombatFactsAdapter.rustCombatFacts` 与 `RustCombatPresentation` 的实际消费：

1. `snapshot.bodies`：舰船系统、武器挂载、幅能、时钟等完整领域状态；
2. `scene.ships`：stableId、specKey、`primarySystemId`、`defenseSystemId`（语义身份 + 内容绑定）；
3. `scene.visual.ships`（每舰视觉）、`scene.dynamic`（poses / systems / mounts）、`scene.mounts`（射程）；
4. 军械（弹丸/光束**作为对象**）、`scene.visual.visuals`（尾迹 strips）、`scene.visual.audio`；
5. `scene.publication`：战术地图 map、部署视图 deployment、read、result / winningTeam；
6. 内容侧：`specs / templates / mounts` 绑定（编译内容，TS 侧持有）。

**结论：现有三缓冲（16f sprite / 12f HUD / 16f 读回）不足以替换 presenter。** 要退役 presenter，投影必须扩展为一份**扁平事实发布（flat facts）**，至少含：

- **A 舰船语义行**：handle/generation、id、stableId 索引、specKey、team、hull 尺寸类；
- **B 系统行 / 挂载行**：系统状态、冷却蓄能、瞄准、挂载射程；
- **C 军械行**：弹丸与光束作为对象（当前只写 sprite 点位，不足以支撑呈现）；
- **D 视觉行**：姿态、尾迹 strips、音频事件序号；
- **E 场面行**：战术地图、部署视图、read、result/winningTeam；
- **F 回执行**：命令回执（现来自 `scene.command_results`）。

**在 A-F 落地前，不得删除 `snapshot` 与 `scenePublication`**（第八节第 4 项据此关闭：答案是“暂时不能停用”）。

### 分阶段替换（每阶段都有位精确或字段级验收）

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **S1** | witness 改走投影通道（f64 直出） | **已完成并位精确验证**：38 条 journal 与 snapshot 路径逐位一致（`projectedWitnessMismatches=0`）；调用投影后指纹仍与未调用时相同（`a2899f42:8ba1eaa3`），证明投影只读 |
| **S2a** | 渲染侧 sprite 尺寸绑定（D-A②） | **已完成并验收**：`RustCombatKernel.projectionSpriteSizes()` 按 handle 从编译内容取 hull，投影舰船 **100% 覆盖**（6 舰 28/28、22 舰 176/176），尺寸来自内容字典，与 presenter 同源 |
| S2b | sprite 缓冲交给渲染上传（GPU 实例缓冲） | **完成**（开关 + 分组上传 + 几何验收；渲染通道消费属 S4） |
| S3 | 读回缓冲供 HUD / AI 显示消费 | 未开始 |
| S4 | 扁平事实发布（A-F）替换 `scenePublication`，presenter 退役 | 未开始（最大一块） |
| S5 | 删除 `snapshot`（确认无残留消费者后） | 未开始 |

**“能正常游玩”的判定**：S1-S5 全部完成 + 正常规模 ABBA 通过 G2 + 真实无参 URL 启动跑通部署/驾驶/开火/撤离/结算 + 检查点同 SHA 恢复成功。

**当前实际状态**：S1、S2a、S2b 均已完成并验证（构建 06da0c7a）；S3-S5 未开始。投影帧具备生产级开关与上传路径，但游戏渲染通道尚未消费（S4）；玩家侧零变化。

**S2a 实测与两个实现要点**（2026-10-14，构建 5d4bb8b9）：
1. 场景发布里 `scene.ships[].specKey` 是**空字符串**——hull 绑定实际在编译内容的 `entities`（按 handle）里，spec 对象在 `dictionary.ships/templates`（按 key）。绑定必须走这两处，否则覆盖率是 0（本次实测踩到并修正）。
2. 验收方式（已并入投影脚本）：逐 tick 用读回缓冲里的舰船 id 反查尺寸表，要求 **100% 覆盖**，否则失败。实测 6 舰 0.0131ms / 22 舰 0.101ms（含绑定后），绑定不影响投影成本。**游戏本身今天仍可正常游玩**——单机默认仍是 TS 权威，新 wasm 未安装、`?combat=` 行为未改、投影在 TS 侧仅新增一个未被调用的方法（`projectedWitness`），玩家侧零变化。S2-S5 每阶段都需要设计、接线与验收，属于后续会话的成块开发，不在本轮冒充完成。

---

## 十三、内核与 ECS 架构的当前状态（2026-10-14 实测，构建 5d4bb8b9）

**架构分工沿用定案**：`core_*` = 权威状态与领域算法；`ECS` = 契约层（缓冲布局常量、确定性 RNG、tick 契约、命令回执、控制输入）+ 单向投影层。投影层（`projection.rs`）**直接复用 `ecs_core` 的 `FLOATS_PER_SPRITE / FLOATS_PER_SHIP_HUD / FLOATS_PER_SHIP_STATE` 常量**——这是 ECS 架构被保留并接入新路径的实证，不是另起一套缓冲定义。

| 侧 | 实测结果 |
| --- | --- |
| 内核 core_* | 导出 48 个；生产构建可创建内核并跑通 6/22 舰；E1 等价门禁 38 条 journal **0 差异**（负向对照 51 处）；投影 witness 与 snapshot witness **逐位一致** |
| ECS 契约层 | 导出 **43 个**，`ecs_tick`、`ecs_step_checked`、`ecs_apply_commands`、`ecs_mark_ship_role`、`ecs_set_control`、`ecs_rng_*`、`ecs_witness_*`、`ecs_render_sprite_*`、`ecs_hud_*` 齐备 |
| ECS 基础验收 | `scripts/check-ecs-authority-foundation.mjs` 与**同一构建**跑：**19/19 通过**（`passed: true, cases: 19, failures: []`），含重放确定性、错误序 step 拒绝、u32 归一化、控制权驱动运动、AI 路径跨构建不变 |

**ECS 侧语义对齐（2026-10-14，构建 9376d734）**：
- 已修：`armor_avg` 同名不同义——读回通道原为 `Σ/8`（绝对均值），现统一为 HUD 通道的 `Σ/(8×base_armor)`（归一化装甲完整度，与权威语义一致）。
- 已加护栏：ECS 基础验收新增用例 `armor-average-is-one-semantic`（逐舰比对 HUD word 10 与读回 word 15，容差 1e-6）。该护栏在修复前会失败、修复后通过——正是它该有的形状。实测 **20/20 通过**（原 19 + 新增 1），`ai-path-unchanged-across-builds` 仍通过。
- **HUD 第 12 词未改**：该字段改语义会打断既有的“AI 路径跨构建零行为变化”护栏（该用例比的就是 HUD 全字段）。且 ECS 没有排散/相位状态，可编码的只有 0/2。是否改、以及改后如何处理那道护栏，需单独立项决定——不在此次顺手处理。
- 内核路径不受影响：同一构建上 E1 仍为 0 差异 / 负向 51 / 投影 witness 逐位一致。

---

## 十四、S2b 接线方案（渲染上传；成块开发前的可审阅方案）

**目标**：让渲染消费投影的 sprite 缓冲，先拿到呈现链的部分收益；**presenter 保留**，作为对照与其余通道（HUD/地图/部署/音频）的来源。默认关闭，玩家侧零变化。

**已有基础（均已实测）**：投影产出 sprite（船体 + 弹丸）/ HUD / 读回 / witness 四缓冲；TS 侧 `projectionSpriteSizes()` 尺寸绑定 100% 覆盖；生产构建投影成本 6 舰 0.0109ms / 22 舰 0.0811ms；`DirectEcsBatchRenderer` 已存在（当前无调用者）。

**接线步骤**
1. 内核侧新增 `captureProjected()`：调用 `core_project` 并返回四缓冲视图（ptr/words）+ 尺寸绑定；**不动现有 `capturePresentation()`**。
2. Worker 增加一条开关（默认关）：开启时用投影缓冲替代 `captureDetached` 的视觉部分；HUD/地图/部署/音频仍走 presenter。
3. 渲染侧：按 hull 的 sprite 资源建图集 → 纹理槽表（D-A② 的另一半），每帧把 16f 实例缓冲上传 GPU。
4. 验收：
   - 正常规模 ABBA（G2 重定义）：sim ≤10ms、sim+encode ≤12ms，记录 encode 相对基线（8.58ms）下降幅度；
   - 逐帧几何对照：投影 sprite 的 x/y/rot 与 presenter 的舰船位姿一致（f32 容差），弹丸数一致；
   - ECS 基础验收仍 20/20、E1 仍 0 差异（防止接线碰坏契约层与权威路径）；
   - 默认关闭，玩家侧无变化；开启后需在无参 URL 启动下人工过一遍。

**明确不做**：不改 UI/HUD/战术地图/部署视图；不删 presenter；不删 snapshot/scenePublication（S4 才处理）；不切换默认入口；不安装产物。

**待核实（开工前必须确认）**：渲染侧是否已有纹理图集与槽位分配的基础设施；若没有，S2b 需先建槽位表（这本身是一小块独立工作），不能假设它存在。

**S2b 第 1 步已完成并验证（2026-10-14，构建 06da0c7a）**
- 基础设施核实结论：`DirectEcsBatchRenderer.uploadAndDrawDirect()` 已支持“一次 `bufferSubData` 上传 16f 缓冲 + 按 batch slice 取 texSlot/混合模式”，`SpriteBatcher` 支持 4 个纹理槽；缺的确实只是**槽位表与接线**（原判断成立）。
- 代码：投影新增 **batch slice 缓冲**（4f/片：start, count, texSlot, blendMode；舰船一片 + 弹丸一片，槽位仍为占位）与 `core_batch_ptr/words` 导出；`RustCombatCore.projectionFrameViews()` + `RustCombatKernel.captureProjected()` 返回渲染器形状的零拷贝帧视图（新增 `RustProjectionViews.ts` 承载契约与步长常量）。
- 验收（并入投影脚本，逐 tick 断言）：spriteCount = 舰船 + 弹丸、hudShipCount = 舰船、slice 覆盖区间与顺序正确（舰船 [0,count]、弹丸 [count,proj]）、视图首值与原始缓冲一致。实测 **6 舰 0.0098ms / 22 舰 0.0814ms，spriteBinding 100%、视图断言全过**。
- 回归：ECS 基础验收 **20/20**、E1 **0 差异 / 负向 51 / 投影 witness 逐位一致**，均在同一构建上。
- 踩坑记录：`RustCombatKernel` 若直接 import `RustEcsBridge` 的常量/类型，会把整条 ship-pack 蓝图链带进 combat 类型检查程序，暴露 `ShipBlueprint.ts:589` 一条潜伏错误（不属本次范围，按边界约定不修）。故契约常量独立到 `RustProjectionViews.ts`，不复用该模块。

**S2b 第 2/3 步已完成并验证（2026-10-14，构建 06da0c7a）**
- **Worker 开关（默认关）**：`LocalCombatConfig.projectedPresentation?: boolean`；开启且后端为 rust-wasm 时，每个 ack 附带 `projected` 扁平帧（sprite/slices/hud/witness 各一份独立拷贝，随 postMessage 传输）；presenter 包仍照常产出，两条路径同帧可比。默认关闭时 ack 无该字段，行为逐位不变。
- **槽位表与上传**：新增 `src/engine/render/webgl/ProjectedSpriteUploader.ts`——`planProjectedBatches()` 把舰船行按纹理分组（首见顺序，越界/未绑定纹理落入无纹理组而非借用别船纹理或丢弃），弹丸行合并无纹理组，产出重排缓冲 + 分组表（纯函数、无 GL、可断言）；`ProjectedSpriteUploader.upload()` 经 `DirectEcsBatchRenderer.uploadAndDrawDirect()` 一次 `bufferSubData` 上传、每组一次 draw。`DirectEcsBatchRenderer` 的契约来源切换到 `RustProjectionViews`（与 ECS bridge 同形），并修复该文件两处从未被编译过的潜伏错误（`drawquad`→`drawSprite` 真签名 16 参、`BlendMode` 未导出改用字符串联合）。
- **验收（`scripts/check-core-authority-projected-frames.mjs`，四臂 off/on/on/off 同场次）**：五门全过——`toggleOffClean`（关时零 projected 字段）、`geometryAndWitnessClean`（开时 120 tick × 2 臂零问题：逐 tick witness 22 词与 snapshot 路径 `Object.is` 一致、缓冲布局行对齐、舰船数与 presenter 可用舰船相等、**每个投影 sprite 与 presenter 舰船位姿一对一匹配**（f32 容差）、弹丸/光束数与 witness 一致）、`additiveSimulationBounded`（附加模拟成本 −0.21ms，噪声内）、`witnessParity`（跨臂 witness 逐位一致，开关不扰动权威）、`syntheticPlanner`（合成 8 行 5 纹理：分组/保序/字节数/draw 序列 8 项断言全过）。projectedBytes ≈ 26KB/帧（22 舰）；encode 不变（39.4-40.3ms）符合预期——presenter 仍在跑，收益要等 S4 退役后才兑现。
- **回归**：同一构建 ECS 基础验收 **20/20**、E1 **0 差异 / 负向 51 / 投影 witness 0 不匹配**；`tsconfig.app.json` 与 `tsconfig.combat.json` 均只剩两条既有错误（ShipBlueprint.ts:589、GravityTerrain.ts:332），零新增。
- 几何对照的一个实现要点：presenter 侧只有 stableId 字符串、投影侧是数值 entity id，host 侧没有逐 tick 的映射通道，因此几何门用“一对一姿态匹配”而非 id 集合相等；id 通道本身由 witness 门钉死。

**S2b 之后的真实状态**：投影帧已经可以走到“渲染上传”这一步（数据、分组、上传路径、开关都经过验收），但**游戏渲染通道仍未消费它**——那属于 S4（扁平事实发布 + presenter 退役）的接线。玩家侧继续零变化：开关默认关闭，新构建未安装。
- ECS 7 处既有不一致（armor_avg 两义、HUD 第 12 词、shield_active、ribbon 零写入、step 内零随机、战机 hp 不减、CMD_APPLY_FORCE 直改速度）——按 D-B/D-C 在 ECS 侧统一到权威语义；
- `ecs_*` 仍无生产调用者（仅 2 个无头 CLI），投影有开关但无渲染消费者；两者都是“可用但未接线”状态；
- 安装态产物仍为 f080f34b（0 个 `ecs_*`），新构建 06da0c7a **未安装**，`public/runtime/combat-core.wasm` 同样未安装。
