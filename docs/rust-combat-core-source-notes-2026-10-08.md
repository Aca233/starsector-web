# Rust 战斗内核：迁移依据与现状

2026-10-09 近炸舰体观察当前只读准备：重读0.98a-RC8本机API `ShipAPI.java:281 isAlive、336 isPhased、449 getParentStation、472 getChildModulesCopy` 与Web `Ship.ts:755–776`、`ProjectileCollisionHandler.ts:257–286`。原API只证明状态/关系接口，不证明查询缓存或Web近炸扩展完全原版等价，未运行原版可见实机。native当前几何only观察仍必须先system modifier完整前置检查、root错误，再collisionless短路的phase实时查询，最后当前shield/bounds投影；同一query immutable关系/engineering可尝试共享，不能跨写缓存/省校验/提前遍历未触达坏对象。具体来源→现状成本候选→顺序/失败→一次strict270/60与异常/next-query验法见 `rust-combat-explosion-effects-plan-2026-10-08.md` 当前授权准备段；重型profile仍等ROOT CPU窗口，未产生新性能或正确性结论。

2026-10-09 mixed226严格油门上游运动首因与窄修方案：重新查看本机0.98a-RC8 `combat/entities/ship/null.java:607–676,707–750`：有序侧推按面向±90°求方向再按加速度/舰级倍率施加，油门随后按面向施加，分别执行有限超速回收；Web `ShipMotion.ts:72–145` 的实际对象运动路径保已授权弧度、模拟输入及固定侧推→油门次序。原版UI/实机仍待许可，本次不改规则、操作、联机、存档或失败回滚。

真实source frozenABBA22舰seed917、同source Math/RNG/60Hz准入完全不变；`diagnostic-mixed-motion-first206/object207/result.json` source每word仍原ABBAexact，透明对象wrapper只记录原`advanceMotionWithStats`前后。206 ship_h actualslot12：motion before完整pose、controls[0,false,-.3586040601815961,1]、dt1/60、accel22/decel25/maxSpeed105/strafeMultiplier.25逐位同。侧推angle3.4180431108320715，source cos-.9620303181575148/stdWasm-.9620303181575149，thrust.09166666666666666同→dx-.08818611249777218/-.0881861124977722→侧推后vx1.3193388995783282/1.319338899578328；随后油门sin/cos、thrust、dy及两overspeed scale1全同→206最终vx1.3601215359190393/1.360121535919039→226严格throttle-.18697957096274023/-.18697957096274054。204/205完整math都同，207的输入继承206差；不是steering、控制或stats差。

实际Chromium Math与原样std/canonical Wasm probe按真实输入、原算序完整重构证明，仅侧推cos换已有canonical即可206输出逐位source同；其它sin/油门cos/sin无需改。证据 `diagnostic-mixed-motion-first206/math207/actual-motion-math-analysis.json`（完整两路径中间值）与上述object207真实前后。最小目标/范围：ROOT-owned `motion::advance`侧推支路仅`angle.cos()`→`crate::canonical_math::cos(angle)`，不替换其它trig、阈值、角度或算序。先本文→仅diagnosticclone一个调用候选270整合当前lane/beam修复→全部control/target/FireDecision/clock/RNG/资源/FX严格且几何仅已登记allowlist→ROOT窄生产挂接。失败沿原事务，token/源/DTO均不修正；没有新产品选择。270通过仍不替代正式installed sameSHA/七包Ready/网络/无头UI可游玩门槛。

日期：2026-10-08。只记录本次实际读取的证据；策划见 [迁移方案](rust-combat-core-plan-2026-10-08.md)。

## P1e 发动机与组件传播最小对照

- 版本沿用本机 0.98a-RC8。原版 `combat/entities/ship/null.java:225-232,292-345,354-400` 与 API `ShipEngineControllerAPI.java:29-48,79-97`：发动机健康→控制器→glow、临时/永久故障比例修正、强制熄火、普通 .5/延长 .99 阈值、等待已有喷焰归零才进入 DISABLED、五项机动 stats 受损。`computeEffectiveStats` 含 CFR 的 void/string 恢复异常，不能逐行照抄；与 Web 状态机、API 和 `ship/super.java:110-170,186-254` 的 2.5 倍级联/5 秒修复/先写永久位再 veto 交叉核实。
- 原版 `combat/entities/G.java:657-714,765-791`：喷焰 .4 idle、损坏淡出/初始恢复提前跳过、.01 spread、相反控制 .05 秒互锁。当前 Web `EngineController.ts` 使用确定性两条初始化 draws、f64、预定 contribution、analog maneuver 和固定包络；保留 Web 玩法而不宣称与原版 float/实际喷焰视觉逐位等价。未恢复到可读源码的原版 engine nested 类健康配置仅按 Web 已用 `engineHealthProfile` 迁移，不能冒充原版配置完全核实。
- 原版 `combat/entities/ship/new.java:98-150` 与 `Ship.java:4234-4309`：21 格组件图及 .5/.25、目标和来源武器/引擎倍率。Web `systems/weapon/ComponentDamage.ts` 保持其 ArmorGrid clamp/floor、weapons→engines 次序、有效 EMP 倍率和 HIDDEN 跳过；发动机系统喷口免伤和 DISABLED 门槛由实际控制器处理。独立或组合领域命令不等于 ProjectileCollision/Beam/Gravity 全链已迁移。
- 原版 `Ship.java:5492-5531`：严重引擎故障永久贡献补偿、.75–1.25 damage RNG、致命×10/非致命75%直接扣血；Web `Ship.ts:621-651` 实际 adapter 明确保留 armor.takeDamage、applyHullDamage、self-source applyComponentDamage。`ComponentHealth.ts` 的 critical RNG 只在该组件故障后消费，即便 criticalChance=0 仍抽一次。迁移真实侧伤，不把 critical 通知当完成。
- Web `Ship.ts:969-997,1044-1089`、`ShipMotion.ts:25-49`：上一步喷口拷贝、旧引擎态取消系统、运动后的 maneuver 几何、护盾/武器/贴花后推进引擎。保留 degrees→radians 与 boost/phase/最小速度算术位置，独立舰船原始 spec 喷口测量分母。模块推进、hullmod 补偿、后坐力与未迁移 CR 属性生产仍未准入。
- 原版默认/悬停/禁用/距离/确认等 UI 没有新截图或实机验证；本块只迁移执行域，布局和交互保持现状。验收计划采用实际 TS 类/函数及无头 dedicated Worker，分别报告源码依据、Web 对照与仍待验证实机。
- P1e 实际对照已通过：真实 `EngineController`、`Ship.prepareStep/integrateStep/finishStep`、`shipMotionStats`、`ComponentDamage`、`Ship.applyCriticalMalfunction/applyCriticalMalfunctionDamage`，以及既有 ArmorGrid/贴花/武器健康。owner 只提供独立船属性和未迁移的 CR/部署输入，事件见证 setter/wrapper 仅转发和记录真实方法的提交位置；禁止修复的场景直接调用实际 EngineController，未造一份算法副本。周期故障实际触发 3 次 critical 侧伤，另确认非致命装甲分支和致命分支，而不只记录空 callback。
- 运动 stats 以 degrees 原始字段保存，源括号/乘法顺序、boost/phase 和最小 1 位置保留；controller/slot/来源倍率常驻，不逐步回传 Ship。normal thrust、spread、HP、计时、贡献和 RNG 全部严格比较，几何 allowance 仅用于姿态/速度和 maneuver thrust；实际熄火/重启决策没有容差。几何误差上限、逐字段日志、来源哈希和真实 Worker 证据在 P1e result.json，完整系统/武器/模块/原版实机仍未证明。

## 原版证据 → 预期行为 → 当前差异 → 验证方法

| 证据 | 本次迁移必须保留的行为 | 当前 Web 与证据的边界 | 验证方法 |
| --- | --- | --- | --- |
| `../starsector-core/starsector.log:1`：启动器标记 0.98a-RC8 | 明确来源版本 | 启动器日志不能证明全部反编译文件与二进制逐字匹配 | 每个被移植机制继续记录对应配置、API、反编译实现；异常交叉核实 |
| `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/EveryFrameCombatPlugin.java:8-13`：输入、advance、世界与 UI 绘制接口 | 输入、规则推进、绘制职责分开；暂停/玩家控制不能由呈现时钟替代 | API 不证明原版的内部存储、线程、全部阶段顺序或 60Hz 固定步 | Web 权威命令/完整推进/呈现回执对照；本次保留 Web 当前固定步及已启用的规则 |
| `../decompiled/starfarer_api_source/com/fs/starfarer/api/plugins/ShipSystemStatsScript.java:8-14,24-25`：IN/ACTIVE/OUT/COOLDOWN/IDLE、apply/unapply | 系统生命周期及效果施加、移除保持有序 | 原版允许可变 stats；只读数值协议不是原版规定 | 移植状态机时对照 API、已核实实现及现有完整场景的状态、费用、充能、事件 |
| `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEngineAPI.java:81-101,150-157`：伤害点、来源、软幅能、发射来源 | 装甲命中点、伤害归属、资源及实体生成不能延迟到显示发布才提交 | API 不证明所有伤害数式已在 Web 还原 | 对照 armor/flux/hull、来源、真实发射、死亡、爆炸、两条 RNG；逐机制补齐来源 |
| `../decompiled/starfarer_obf/com/fs/starfarer/combat/CombatEngine.java:1439-1503`：时间倍率循环、姿态、模块位置、AI/Ship advance | 保留局部时钟、模块关系与顺序依赖；不以批量化消掉这些依赖 | 混淆变量、CFR 转换类型异常较多；这段只是快速时间推进的一部分，不是已核实的完整普通步顺序 | 与 API、系统配置及同场景 Web 行为交叉核实；不把异常代码原样照搬 |
| `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/BallisticProjectile.java:162-177`：elapsed、伤害倍率、fade soft-flux 与尾迹推进 | 弹体寿命、衰减及伤害属性属于实际规则；尾迹属于表现 | 该片段没有证明完整碰撞/伤害顺序 | 按弹体类型补来源；真实高速/穿透/护盾过载/死亡后续命中对照 |

未读取新的原版截图，未操作桌面或原版实机。本次是内部执行后端迁移，不变更 UI；原版完整玩法、全部阶段顺序与视觉等价仍未证明。

## 当前权威和提交接线

- `src/engine/runtime/CombatAuthority.ts:15-44`：epoch/tick 所有者；禁止重入；完整推进成功后 tick 才递增。异步取消不能被当成完整提交。
- `src/engine/runtime/local/LocalCombatKernel.ts:31-47,114-146`：本地配置、玩家命令、同步/调度推进；当前完整引擎仍是 TS 对象。普通本地战斗默认在现有 Worker 内运行。
- `src/network/host.worker.ts`：LAN/Steam 宿主仍经已有权威推进、capture/encode/回执接线；显示或快照不是另一份模拟权威。
- `src/engine/simulation/CombatEngine.ts:728-1221`：Web 当前实际阶段包括前置世界效果、舰队/舰船 AI、主舰/模块和武器、战机/无人机、地形/status/引力、舰体碰撞、弹体/光束、空雷、FX、死亡/部署/胜负。批处理分支会在正确边界延迟执行 `ShipStepBatch`；迁移必须按实际分支核实，不能只按注释概括顺序。
- `src/engine/ai/batch/StageProtocol.ts:1-135`：AI_PLAN/AI_EFFECT_READ/FIRE_QUERY/PROJECTILE_CONTACT 是阶段观测；它们不是 Rust 常驻权威状态。当前只读列和 `StageBridge` 可作为字段与规则整理来源，禁止重新把整世界 capture 作为每步输入。
- `src/engine/runtime/local/RenderShipProjection.ts:17-29,47-82`：已存在独立显示投影。当前投影采集仍依赖 Ship/System/Mount；Rust 接线需要由 publish 直接产出相同呈现合同，不能重建可变 Ship 来继续模拟。

## 必须先解决的扩展与回放边界

- `src/engine/extensions/ship-systems/Types.ts:8-27,144-148`：回调取得真实 Ship、projectiles、world、combatRandom，并可生成舰船/空雷/机翼与持续效果。
- `src/engine/extensions/weapon-effects/Types.ts:6-14`：beam/hit/advance 回调取得真实弹体、目标、挂点与世界。
- `src/engine/modding/BundledShipPacks.ts:22-52`：七个内置包。`ShipPackCapabilities` 当前证明的是 TS 宿主实现存在，不能直接当作 Rust 后端能力证明。重型三舰场景不能靠整场回退取得“Rust 已完成”的回执。
- `src/engine/simulation/SimulationRandom.ts:2-71`：state 是 JS number，`next()` 每次先做未截断的 number 加法，再进行 u32 位运算；不能直接迁成 Rust u32 游标。ID 分配计数、shuffle 与 RNG 消费顺序都是合同。`VisualRandom` 的无状态噪声不是 `CombatEngine.visualRandom` 的有状态流，不可混淆。
- `src/engine/runtime/local/CombatReplayCheckpoint.ts:6-31`：现有恢复是带 build/protocol 的 seed＋已提交日志重放；22 数字 witness 不是完整状态 dump。Rust 后端必须在 build/backend 指纹相容时重放并核对，不把显示投影当 checkpoint。

## 性能证据及限制

- [2026-10-08 阶段整理](foundation-stage-boundaries-source-notes-2026-10-08.md)：numeric opt-in、22 主舰/20 AI，完整 fixedUpdate 约 33.82 → 34.03ms；不是默认路径、真实 Worker 或绘图/网络性能。只能作为历史背景，新的 Rust 对照应冻结当时工作区重新配对。
- [2026-10-05 TS 数值 core 止损](combat-core-replacement-results-2026-10-04.md)：特定历史场景 35.109 → 55.202ms，真实行为未通过。不能复用该实验开关启用 Rust，不能把整理为数值列当作加速证据。
- [碰撞 Rust/Wasm pilot](../benchmarks/wasm-pilot/README.md)：特定 Node 查询基准中，中/大型 spatial+Wasm 耗时约减少 15%/25%；没有证明全战斗收益。
- [舰队影响力 Wasm 撤回](fleet-influence-wasm-performance-2026-09-26.md)：完整交付改善约 0.945%，尾部指标变差。小算术循环不是优先迁移边界。
- `src/engine/simulation/collision/RuntimeCollisionKernel.ts:97-98` 自动加载要求 window；当前检索未找到构造之外的生产 `loadWasm()` 调用。因此普通 dedicated Worker 不能仅因有 wasm 文件就宣称已启用此后端。

## 工具链实查

PATH 未暴露 cargo/rustc，但已找到并实际运行：

- `C:/Users/Aca/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe`：1.93.0，commit 254b59607，LLVM 21.1.8。
- 同目录 `cargo.exe`：1.93.0。
- host rustlib 中有 rust-lld；`wasm32-unknown-unknown` 标准库尚未安装。

旧 2026-10-04 方案中的“本机无 Rust 工具链/来源不存在”只代表旧环境，不作为本次阻塞结论。工具链准备采用项目忽略目录内的独立 sysroot，不改全局 PATH、现有 Rust 安装或日常构建。已完成实际 Wasm 编译和 Node/Chromium dedicated Worker 领域运行，回执见 [交付记录](rust-combat-core-results-2026-10-08.md)。

## P1a 常驻身份、随机与运动的具体来源

- 原版运动控制器：`../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ship/null.java:673-704,707-798`，已读取旋转指令、损伤漂移、无转向时减速、横向推力、前进/后退、有限超速减速和刹停片段。`ShipEngineControllerAPI` 及 `CombatEngine` 的实体 advance 接线与之交叉核实；混淆命名和不完整类型恢复仍限制解释。
- Web 当前来源：`src/engine/simulation/systems/MotionKernel.ts:1-98`、`src/engine/simulation/systems/ShipMotion.ts:72-142`、`src/engine/math/Vector2.ts:1-19`。保留 Web 的模拟输入强度、指令顺序、f64 缩放长度算术、漂移与减速顺序；Rust 三角函数的舍入只按用户选定的几何政策比较。这不是声称与原版 float 引擎逐位一致。
- 状态保留：初始化 motion 行进入 Rust 后常驻；普通 `step(dt)` 不上传 pose/velocity/stats。只有真实控制、stats 修订和生命周期命令改写对应部分。提交前在 Rust 复用 scratch 计算一次，拒绝非有限结果后再提交，避免半步发布；scratch 不通过 JS 或旧 solver。
- 原子命令与身份：整批先验证后应用；跨生命周期旧 slot/generation 不能操作复用实体，语义 roster 仍按插入顺序。Opaque core ID 不使用用户数字当裸指针，销毁后不复用实例 ID。
- P1a 当轮 `core_domain_mask=3` 只表示身份/RNG和运动。`core_full_battle_ready=0`；当轮没有系统/flux/armor、AI/fire/contact/伤害、七包准入或生产呈现，不可能作为完整战斗入口。开发绑定仍不被普通本地/LAN/Steam 权威导入；当前领域覆盖见后续 P1b/P1c 记录。
- 新校验集中比较实际 `SimulationRandom` / `MotionKernel`；长随机游标、命令失败原子性、失效代次、实例隔离、内存增长、已返回投影不会写回权威和实际 dedicated Worker 是本轮验收范围。无需原版实机或 UI 截图；没有完整战斗/网络/性能结论。

## P1b 幅能、局部时钟和通用生命周期对照

- 原版 `combat/entities/ship/D.java:143-155,186-227,356-414,516-578`：软成本空间检查、硬幅能和超量惩罚、回调时机、舰级过载基数、耗散 ×0.5、排散 ×2；API `FluxTrackerAPI.java:28-39` 交叉核对。原版 `increaseFlux` 的返回值表示成功，而 Web 表示过载；保留 Web 合同并单独迁移 `trySpendSoftFlux` 成功语义。原版 ventFlux 检查散热率并有最低排散量，Web 使用 totalFlux>5；原版无人机 3s 过载/零幅能细节与 Web 有差异，本次不顺手改玩法。
- 原版 `combat/systems/super.java:77-199` 和 `F.java:258-310`：充能 tracker、IN/ACTIVE/OUT/COOLDOWN、激活/退出及 apply/unapply。Web `ShipSystem.ts:196-306` 明确消费 overshoot、以 effectLevel 缩短 OUT、零 ACTIVE 立即退出、Infinity ACTIVE 保留显示 activeTimer；本次保留这些 Web 行为，不能声称与原版阶段算术逐位一致。引力自动坍缩覆写 expire，isExecuting/目标/条件/回调均非通用合同，仍待后续迁移。
- 原版 API `impl/combat/PhaseCloakStats.java:54-56,456-471`：局部相位时间倍率及玩家全局补偿；Web `Ship.ts:332,978-989` 的 tactical dt 和 subjective dt 在系统推进前取样。Web 未在此复刻原版玩家全局时间补偿，本次不改变。`NativeCombatSystems.ts:73-77` 留有时间贝壳算术，但 `NativeSystemFactory.ts:1-3` 当前 custom-only 构建直接抛出 Native system removed，Registry 不注册该目录。该遗留程序不属于当前已启用行为，本轮不迁移、不据此宣称支持时间贝壳；只迁移现有 clock 算术和具名属性修订。
- Web `Ship.ts:885-912,1040-1052`：硬幅能分量使用软幅能消耗后的剩余预算；allowZeroFlux、timeSinceFluxIncrease 和 suppress 分支；pendingActivationFlux 逐系统清空并结算。`FluxTracker.ts` 是本块严格差分源，不能让 geometry tolerance 放行资源和 timer。
- Web `ShipSystem.ts:214-245` 与 `CombatShipStatusSystem.ts:98-102`：激活费用与 pending callback 分离，中断清 callback 但保留已预留费用；派发先启动再 ACTIVE 最后 advance，派发 dt 重新读取当前主观倍率。通知序列只供领域验证，不代表回调副作用已迁移。
- Web `Ship.ts:473`：过载开始立即撤下普通/虚空护盾。Rust 本块清除资源域 shield-active 标志并按序输出通知/音频；完整护盾 collision/arc/phase 仍未迁移，不能据此进入真实碰撞后端。
- 无新增界面或玩家操作，未操作桌面；原版实机/视觉核对仍待许可。验收采用实际 Web FluxTracker/ShipSystem 的领域差分及实际 Wasm dedicated Worker，完整 Ship/世界/七包仍未覆盖。

- 验证边界：差分使用真实 `FluxTracker`、`ShipSystem`、`Ship.prototype.subjectiveTimeMultiplier` 和 `Ship.prototype.advanceHullModFlux`；owner adapter 仅提供该领域必需的输入，测试 callback 仅记录调用边界，无真实特殊副作用。没有用这个窄域 owner 代替整个 Ship 或把任意 TS callback接进 Rust。Infinity 只允许 toggle ACTIVE 的阶段字段；命令其它非有限值按非法协议拒绝。未迁移的 callback/护盾/CR/upkeep 不属于本次领域准入。

## P1c 护盾、相位与费用的最小对照

- 原版 `combat/systems/G.java:127-164,197-245,607-611` 和 `ShieldAPI.java:19-82`：半径/护盾类型的展开时间、upkeep、实体中心、护盾实际防护与角度；`entities/ship/trackers/oooo_1.java:29-37,47-94,129-139`（反编译类名 oooO）交叉核对 .35s 关闭、充能亮度与收费失败撤盾。Web `Shield.ts:183-241,427-474`、`ShieldDisplayMath.ts`保留自身 f64/弧度实现，queued raise 完全关闭后才升盾。截图/原版实机未验证，反编译片段不证明整体普通步顺序。
- 原版 `data/shipsystems/phasecloak.system`、`ship_systems.csv:47`、`PhaseCloakStats.java:24,54-56,456-471` 和 system charge tracker：相位 .5/.5/2、toggle、不可过载、局部时间最高3倍。Web `Shield.ts:240-327` 的 switch 一次只推进一个相位阶段，不消费 overshoot；forced-phase 原始 override 并非完整 PhaseAnchor 行为。本次按现有 Web 状态机迁移，保留原版玩家全局时间补偿未实现差异。
- Web `Ship.ts:978-989,1000-1052,1070-1077`：系统更新后先禁盾，普通软 upkeep 用 tactical dt，phase upkeep 用 world dt，系统维持成本与激活成本先于耗散，Shield.update 在运动后按取样 subjective dt。`ShipMotion.ts:20-33`：相位最高速度由当时硬幅能比例和 effect 调整；不得把前一步倍率累计进基础 stats。
- Web `Ship.ts:790-869`：舰体按钮返回 accepted，Shield.toggle 返回瞬时 active；queued raise 可撤销；Ship.startVenting 的立即撤盾/系统中断/声音顺序不同于单独 FluxTracker.startVenting。维持费失败下盾音量 .7，与玩家按钮 .65 区分。`Ship.ts:473` 过载直接撤盾，不通过反馈音频。
- Web `ShipSystem.ts:124-134,326-346,362-366` 与 `Modifiers.ts`：controlsActive 仅排除 releaseOnOut 的 OUT（不暗加 disabled/available 限制）；资源 modifiers 取 active/available 状态并按 auxiliary 组合，乘法右结合、软/硬成本加法。`AdunArkSystems.ts:49` 的现有 shield upkeep 为 `1+.5*effectLevel`。`GravitySystems.ts:38,128` 的 ACTIVE 固定费用含特殊场状态依赖，通用门控不能代表整个引力规则。
- Web `VoidShield.ts:1-94`：自创层数容量、命中/重启延迟、余步恢复、整层重建、armed/suppressed 与视觉包络；`Shield.ts:41-45,205-220,382-386,417-420` 和 `Ship.ts:473,854,1076` 接线。本块只沿用既有改编，不新增平衡参数。完整受击/殉爆与舰船特殊效果属于后续 P2/P3。
- 标准盾分段 hitLevels 只影响呈现；本轮不搬入规则状态。若使用独立吸收命令，只能证明该方法与容量恢复，不证明命中选择、碰撞、伤害、七包能力闭包或整个 Ship 更新完成。

- 实际验证采用真实 `Shield`、`FluxTracker`、`Ship.prepareStep/integrateStep/toggleHullShield/startVenting` 与 `ShipSystem`；窄 owner 显式提供空 hullmod/status/engine 输入、70% CR 和非模块状态，禁用未迁移的部署/PPT/CR 推进，仅保留 contact age 的主观时钟增长。运动使用真实 `MotionKernel` 注入已经求解的姿态，不用适配器替代费用、护盾或相位算法。还使用当前已注册 Adun 护盾超载的真实资源 modifiers，未注册停用原生系统。
- Node 和真实 dedicated Worker 各通过 14 个领域实体 ×100 步的差分，完整回执见交付记录。系统维持费独立于可选护盾安装；新增无护盾领域状态的实际 `ShipSystem/FluxTracker` 对照。只对预登记的 arc/角度/中心/aim/姿态比较应用几何容差，非有限几何差异拒绝，并逐项保留误差日志。失败批次及 OMNI 非法角度步骤不提交更早实体的费用/计时。仍没有原版实机、UI、真实命中或完整战斗验收。

## P1f 武器状态推进与停火的最小对照

- 版本为本机 0.98a-RC8。原版 `combat/entities/ship/A/if.java:628-738`：phase/弹药/健康/新禁用中断 burst、真实冷却和按类型 RoF；快射速源延迟由 burstDelay 或 refire+charge 决定，低于 `settings.json` 的 `minRefireDelay=.05` 时限制。`if.java:1279-1320` 和 `oooo_1.java:1004-1042` 的 disable/repair 委托共用 health tracker，结合 `ship/super.java:110-170,186-254` 核对健康和条件故障。反编译混淆状态符号不能直接当 enum 值照搬。
- 原版 `ship/A/oooo_1.java:442-527`：ammo regen 先于 health，burst beam 仅冷却阶段套类型 RoF，charge/ACTIVE/chargedown 用真实武器时间。Web `ShipWeaponControlSystem.ts:263-328,953-965` 将冷却推进和真实发射分为两阶段；此次按其生命周期余量公式和主观 dt 迁移，未迁移第二阶段的实际光束/弹体/能量回调。原版 projectile 对快 RoF 还检查 isFiring，Web 前置算法直接计算 rate；本块保留 Web 差异，不声称 Java float 逐位相等。
- 原版 API `CRPluginImpl.java:640-677`：武器永久禁用排除特殊类型/挂点，零 CR 放行，其它可用武器按非永久、有弹药且 maxAmmo>20 或 regen>0 判定。Web `ComponentMalfunctions.ts:5-34` 的准入类型以 HIDDEN 代替原版装饰/系统/模块槽，临时禁用武器仍作为其它可用武器。`Ship.ts:621-655` 严重故障先做组件禁用/永久补偿，再实际侧伤；周期故障的 controller 取消在 health callback 与 repair 之后，次序不可合并。
- Web `ShipWeaponControlSystem.ts:225-245` 新禁用立即毁掉 burst/charge/trigger，冷却取已有与 beamBurstDelay/refireDelay 最大值，不追加恢复冷却。`ComponentHealth.ts:47-81` 永久 early return 只发生在方法入口；同一步故障写永久位后仍执行当次 repair。`GlorianaTorpedoVisuals.ts:22-45` 双轨只投影视觉、在健康前更新，实际发射后的轨道清除尚未迁移。
- 本块按纯数据领域持久属性读取，不迁移 `ShipSystem.modifiers` 任意回调或 CR/PPT 生产。manualControl/canShipFire 为未来火控前置结果，尚未消费为真实发射。原版实机、hover/disabled 截图和击发视觉均待许可；当前不新增或重排 UI。

- 实际验收使用 `ShipWeaponControlSystem.advanceState/disableComponent/damageComponent`、真实 `ShipSystem` modifier readers、`Ship.prepareStep/integrateStep/finishStep`、永久 helper 和 `Ship.applyCriticalMalfunction/applyCriticalMalfunctionDamage`；owner 只提供明确域输入、空监听/引擎和未迁移的 CR/部署 producer。初始 mount 周期只安装一次，step 不还原 DTO，也没有空发射回调。11 实体/68 槽位 ×100 步在 Node/真实 Worker 严格对照通过；严重故障与永久补偿真实执行，包含周期致零血后的后续组件/贴花当步完成以及下步冻结。
- Rust 健康拆为 begin/finish，让实际侧伤保持在 interval 抽样与修复之间。停止新增冷却、禁用/修复队列和所有组成员由常驻控制器处理；未迁移 health-only 的旧实体仍走原健康推进路径。纯几何只放行 mount/hull 角度和姿态字段；计时、门控、ammo、health、永久位、组成员、事件/RNG 严格。完整指标见 results 的 P1f，来源/API 核实、领域运行与未验证原版实机分别记录。

## P1d 装甲与组件健康的最小对照

- 本机版本仍为 0.98a-RC8（`../starsector-core/starsector.log:1`）。`ArmorGridAPI.java:8-34,38-95` 确认 per-cell 约 armor/15、格值和原点接口；`DamageType.java:10-14` 核对类型倍率；`data/config/settings.json:192-194` 核对 .85 最大减伤、.05 残留与 DPS hitStrength .5。
- 原版 `combat/entities/ship/new.java:35-37,65-80,98-150,203-247,249-338`：float 格、支撑格、21 格分布、组件图、枢轴 floor 和伤害算术。Web `ArmorGrid.ts` 使用不同局部坐标表示、row-major Float32Array、dy→dx 顺序，边缘命中会 clamp、邻域越界作为零格并形成穿透；返回装甲损失用写入前 f64 nextArmor，存储再舍入。保留 Web 当前合同，不照抄原版中心先扣的顺序，不声称原版 float 引擎逐位等价。
- 原版 `combat/entities/Ship.java:4234-4309`：装甲结果、组件受损 0.5/0.25、结构 listener/扣血顺序；Web `Ship.ts:179-185,450-459`：直接扣血门槛、Vast Bulk/任意 interceptor、虚空 quiet delay。只准入无任意 interceptor 的独立主舰直接方法；完整命中链、EMP 图、listener 与死亡效果后续迁移。
- 原版 `combat/entities/ship/super.java:65-91,110-170,186-254` 与 `ShipEngineControllerAPI.java:29-48`：尺寸 HP、hardpoint 加倍/延长修复、.5–1.5 interval、2.5x cascade、条件故障、5 秒未命中修复、永久禁用和发动机 veto。Web `ComponentHealth.ts` 与 `weapon/WeaponComponentHealth.ts` 依照现有 f64/确定性 RNG、周期 reset 丢弃 overshoot；`WeaponSizes.ts:30-32` 显式将 XL 健康基线映射 LARGE。此次仅迁移武器健康方法，CR 故障回调、发动机状态机和完整停火副作用不准入。
- `ShipWeaponControlSystem.ts:232-245,304-320`：禁用后 burst/charge 清理由控制器执行，健康方法本身不包含完整停火；`Ship.ts:923-928,1073-1086`：健康使用预取样主观 dt，贴花用 world dt，发动机随后推进。未来批量武器/发动机接线仍须按实际分支整合，当前领域不能代替完整阶段。
- `ShipDamageState.ts:45-126` 与 `Ship.ts:458-459,1106-1107`：每个内格一次贴花、创建消费 visual RNG 六次、闪烁条件随机、dirtyVersion 同步和世界时钟；纯正弦亮度可由复制包络派生。虚空接触在逐格回调处立即发生。没有原版截图或实机操作；当前不改变 UI，视觉实机对照待许可。

- 实际差分采用真实 `ArmorGrid`、`ShipDamageState`、`Ship.prototype.applyHullDamage` 和 `WeaponComponentHealth` 方法，owner 只提供直接扣血输入/空 interceptor 集；武器 mount adapter 只提供健康字段和真实 health profile/tracker，未替换伤害或修复算法。12 实体、144 武器健康槽位 ×120 步在 Node/真实 Worker 均通过；格、伤害结果、HP、贴花强度/包络、健康/修复和 RNG witness 全部逐项严格一致。本块未使用几何豁免。
- Rust 使用 Vec<f32> 格存储、f64 求解与 pre-store nextArmor 返回算术；scratch 复用格/组件存储。发布为复制的 Float32 cells 与标量/包络，正弦亮度在 TS 副本派生。命令/步骤预览使用两条私有 RNG 副本，仅完整提交后替换；实际错误场景覆盖新贴花/interval 创建以及更早实体重取 interval/闪烁后回滚。原版/API 来源可核实，但没有完整伤害链、原版实机/视觉或生产网络验收。
