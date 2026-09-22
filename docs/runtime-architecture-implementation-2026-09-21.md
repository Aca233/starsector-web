# Combat runtime implementation — pre-code comparison, 2026-09-21

Status: runtime core integrated; the whole P0–P5 proposal is NOT complete. The evidence below was recorded before coding.

## Evidence → invariants → migration → verification

- Original installed 0.98a-RC8: `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:58–119,202–287,392–439` retains per-weapon timers, target filtering and ally occlusion. This migration does not change those policies, RNG, precision, roster count, effects or fixed dt. No desktop/native UI interaction is authorized; native live UI equivalence remains unverified.
- Current `CombatSession.advanceSimulation/fixedUpdateScheduled` owns damage-lab restore, battle notifications and exactly-once pending ticks. Move that ownership into an explicit authority/host boundary; preserve input-before-prediction and synchronous original engine phase order. A rejected/late worker result must never advance a discarded battle.
- Current `OwnershipPool` already validates the real phase and commits in actor order. Reuse its audited mixed tier in single player, rather than remove checks. Preserve player AI before prephase. Only audited native systems may enter the codec; activation/flux transitions still recompute on authority. All private owner fields in those kernels must be republished or restored, including object-valued activation inputs.
- Current renderer consumes `CombatEngine`, granting unused simulation write APIs. Introduce an explicitly scoped presentation read contract and remove engine capabilities at the rendering entry. Borrowed synchronous data is NOT a detached RenderFrame, checkpoint or worker migration; document that distinction rather than silently deep-copying incomplete state.
- Current rAF scheduler can execute eight expensive ticks before painting. A cooperative wall-time budget may bound catch-up work without enlarging dt or reducing target Hz. Keep existing backlog cap, separately expose wall-frame clipping, and test backlog accounting / reset / late async completion. This changes catch-up pacing, not per-tick simulation semantics; compare TPS and render FPS separately.

## Verification before acceptance

Freeze current source graph before changes; compare full engine + player AI + fire-control WeakMap state against it. Exercise real module Workers with supported mixed ships, non-audited serial barriers, controls, pause, reset, disposal and roster changes. Run typecheck/lint, deterministic authority/scheduler contracts and headless production browser checks. Use a fresh build directory; never recursively remove public-asset junctions.

## 实际接入（2026-09-21）

### 1. 权威步进与宿主事务

- 新增 `src/engine/runtime/CombatAuthority.ts`。单机 `CombatSession` 和 LAN `host.worker.ts` 都经过这一个步进入口；内部仍调用同一个 `CombatEngine.fixedUpdate`，没有第二套玩法实现。
- 单机原有 damage-lab 保护/恢复逻辑原序迁移，原版扫描/发射/伤害/RNG 顺序不变。权威记录 tick/epoch，拒绝重入和非有限/非正 dt。
- 新增 `CombatTickHost`，至多保存一个已经采样的 tick。再次调度返回同一个 promise；pause/直接编辑会串行结算已采样输入；restart/换局/dispose 丢弃旧事务；迟到结果只释放，不再次提交。
- 保留 `session.engine` 作为旧 UI/生涯/实验场编辑适配器，替换引擎会先丢弃旧事务。这还不是“所有外部写入口已收拢”。

### 2. 单机/联机共用 AI 池生命周期

- `AuditedCombatMulticore` 统一启动、并发限制、超时、回退、销毁；`LanCombatMulticore` 保持原导出兼容。
- 单机保留已验证的原生 Onslaught 快速 codec，避免为了形式统一，强制走更贵的通用 derived-world 校验。
- 通用审计层增加 **FORTRESS_SHIELD / HIGH_ENERGY_FOCUS**，结合已有 NONE / BURN_DRIVE / AMMO_FEED；不是宣称所有相位舰/航母/模组都能并行。
- 只预测第一个未知行为串行屏障之前的连续任务，屏障后不再发布必然作废的工作。执行次序和未知副作用的保守回退不变。
- Worker 提案结束后恢复私有 AI/防御计时和 system activationInput/target/teleport 等引用。是否采用提案，只能由下一份权威发布状态决定，不能让拒绝的提案留在 Worker 内继续演化。
- `CombatWorkerBudget` 复用现有 LAN 成本策略到通用单机路径：24 次串行预热、12 次并行测量、周期性串行对照；没有净收益时退回串行并冷却；LAN 保留 10s，单机延长到 60s，避免每十秒重复探测已证明更慢的路径。拓扑失效后有 250ms 重建退避。不是降 AI Hz。
- Jets 未纳入本次新增支持：其 AI 读取发动机熄火比例，而目前 Owner 的发动机健康仅作宿主验证，并非完整镜像。不能因为新增几个 system ID 就冒充 codec 已覆盖。

### 3. 呈现入口收窄，但未完成 detached RenderFrame

- `ICombatRenderer`、WebGL 主渲染器/各 pass、贴图闭包只接收 `CombatRenderView`，不再接收 `CombatEngine`。
- 工厂生成独立、冻结、无原型的稳定视图对象；顶层不暴露 fixedUpdate / AI / RNG / spawn / damage / weaponSystem / fxSystem。
- 尾迹、移动光束残影、网络弹丸/预测、本地枪口和粒子旁路改为显式显示字段；本地/LAN 调用点及现存浏览器检查一起迁移。
- **这是同步借用视图，不是深层只读**。Ship/组件仍有可变方法和共享引用，既不是跨线程不可变快照，也不是 ReplayCheckpoint。深层写权限和分离记录仍待迁移，不能据此声称 UI 已彻底脱离模拟。

### 4. 调度实验与默认行为

- 增加可配置 catch-up wall-time budget，以及 clippedWallSeconds / completedSimulationSeconds / observedWallSeconds / catchUpYields。
- 4ms 预算实验确实让重载混编更频繁绘制，但也降低了实际 TPS，因此**默认已恢复 Infinity，保持原追帧行为**。不把此实验当作性能收益，不默降模拟频率。
- 原有 100ms wall-frame clip 与 8 步 backlog 安全上限保留；两种时间损失分开报告。异步旧事务失败不能重置新的时钟。

## 验证及证据

全部在 `artifacts/runtime-architecture-20260921/`；后台/无头执行，未操作桌面、暂存、提交、发布或生成发布包。

- `contracts.json`：17 项宿主/权威/调度/呈现能力/Owner 私有状态/串行屏障契约。
- `battle-equivalence.json`：4 个场景，各 180 步、合计 24 个完整状态检查点一致：100 Onslaught、100 Harbinger/Paragon、24 Doom/Harbinger、24 Odyssey/Paragon。
- `mixed-owner-equivalence.json`：4 个场景，各 120 步、48 个完整检查点一致；结构化克隆消息的确定性 Owner 驱动。20 Onslaught/Paragon 提交 744、20 Hammerhead/Sunder 提交 2,126；相位/航母混编只有小前缀可提交，不能算大范围加速。这个驱动不是实际线程性能测试。
- 比较包含 engine、playerAI 和每个挂点的 autofire WeakMap tracker，保留引用关系、Map/Set、非有限值和负零，仅归一化函数身份及 wall-clock kernelMs。
- `authority-worker.json`：真实浏览器 module Worker 使用共享权威入口，收到 tick 0–60 的 61 个严格递增快照，逐份消费确认。
- `renderer-contract.log`：真实 WebGL 弹丸旁路像素验证：空画面 3,316、显示 4,965、移除后回到 3,316；WebGL/page errors 为零。
- `authority-worker.log` 也包含多队伍可见性/部署的浏览器回归通过结果。首次独立可见性脚本因未配置测试 Vite 服务失败，之后使用专用临时服务复验通过；首次 Worker 探针缺少构建全局常量，补齐测试引导环境后复验通过。
- `network-contracts.log`：22 项 authority I/O / 生命周期现有测试通过。
- 类型检查通过；lint 只有已有的 `scripts/check-campaign-calendar-integration.mjs:29` 未使用参数警告。

### 性能结果，不冒充优化成功

早期放开通用路径、还没有成本保护的 50 Onslaught/Paragon 对照：固定工作量总耗时约 55.99 → 82.89ms，**明显倒退，未采用该默认策略**。

短追帧预算实验的生产 rAF 数据也未作为最终默认方案：100 Harbinger/Paragon 显示从约 5.21 → 23.37 FPS，但 TPS 从约 29.91 → 23.12；24 Odyssey/Paragon 从约 7.59 → 27.37 FPS，但 TPS 从约 43.94 → 27.12。最终关闭此默认预算，不能将这些 FPS 数字作为交付收益。

最终受保护路径的初轮配对（1440p、每场 180 固定步，后 120 步计时；包括 fixedUpdateScheduled、可选真实 AI Worker、visual、绘制和离线 gl.finish；**不是生产 FPS**）：

| 场景 | 基线 ms/工作帧 | 新版 ms/工作帧 | 观察 |
| --- | ---: | ---: | --- |
| 100 Onslaught | 112.964 | 115.026 | +1.83%，没有加速证明 |
| 50 Onslaught/Paragon | 58.420 | 61.082 | +4.56%，有测量/校验开销，不能宣称净收益 |
| 20 Onslaught | 20.024 | 19.691 | -1.66%，不能从单次小幅变化宣称稳定提速 |

三场完整状态 hash 一致，浏览器/WebGL 无错误。并行提交正确不等于值得启用；通用成本保护会退回串行。

### 最终复验与未通过的性能目标

- 单机冷却延长到 60s 后，50 Onslaught/Paragon 反序配对总工作量 63.969 → 63.076ms（-1.40%）；同场景 A/A 为 59.622 → 59.815ms（+0.32%）。不把一次 -1.40% 认定为稳定提速。
- 50 Hammerhead/Sunder 为 51.046 → 51.238ms（+0.38%），通用池被成本保护退回 serial。支持正确，不代表线程有净收益。
- 最终原生 **manual** 输入路径、100 Onslaught、120 步（后 60 步计时）：104.740 → 105.130ms（+0.37%），模拟+visual 为 80.109 → 79.933ms；完整状态 hash 相同，最后一批有 99 次真实 Worker 提交。
- 生产 rAF 冷启动暴露过原生路径的启动回执超时：缩短为 1.5s 会在主线程同步追帧时误退回串行。最终对 legacy-native 保留原有 3s 初始化/帧超时，通用池维持较短时限。修复后两次生产采样都出现真实提交（2,475 / 7,524）。
- 生产短窗口波动很大：新版两次平均 tick 分别约 170/61/45ms 与 83/33/22ms，重复基线约 96/39/28ms（依次为 100 Onslaught、100 Harbinger/Paragon、24 Odyssey/Paragon）。不能把跨时间窗口差异归因成代码收益，也不据此武断断言外部负载是唯一原因。最终重复样本实际 TPS 约 11.95 / 28.75 / 42.12，明显没有达到百舰 60 TPS。
- 三组冻结工作量终帧像素比较仅有 180/729/340 个 RGB 通道不同，总计每张 11,059,200 通道；平均绝对差均小于 0.00007（0–255 标度）。目视检查未见漏画；这不是逐像素完全一致，也不是原版实机画质等价证明。

证据：`mixed-long-cooldown.json`、`mixed-aa.json`、`audited-final.json`、`native-manual-final.json`、`production-final7*.json`、`production-current-baseline.json`、`visual-comparison.json`。最终浏览器构建为 `build-after7`；性能验收仍未通过，不以本轮重构宣称解决多船卡顿。

### 并行工作区保护

验证过程中另一项任务修改了 hull overlay 剔除及部分 campaign/network 文件。没有覆盖或回滚那些更改。`common-sources.json` 将这些共同改动固定到新旧两边；其中 WebGLShipPass 的共同版本只撤掉本任务的类型入口变换。`build-before2` / `build-after4` 才是这一共同背景下的配对，不能把其它任务的剔除收益算成本任务收益。后续 `build-after5` 包含调度器真实完成计数的契约修正，`build-after6` 加长单机成本冷却，`build-after7` 恢复原生快路径原有启动/帧时限。

最后 source-check 发现 `LanBattle.tsx` 在冻结构建之后被另一任务加入 `renderCulling` HUD 计数（接口和 HUD 赋值）。本任务的呈现适配导入及三处调用保持不变，已保留该共同修改并复跑当前工作区类型检查；冻结浏览器结果不冒充覆盖这次后到的 HUD 增补。

## 尚未完成的目标架构

本次交付是**运行时核心与迁移边界接入**，不是整份 P0–P5 提案完成。

以下仍未完成：单机整场权威移入 LocalWorkerHost、所有 UI 输入/改装/部署写入口命令化、detached RenderFrame/HudState、完整 ReplayCheckpoint 与安全迁移、稳定实体 handle/逐字段 Float64 StateStore、通用相位/航母/模块行为 kernel，以及百舰实际 60 TPS/60 FPS 验收。当前主线程仍执行单机模拟。现有 worker-lab/网络呈现快照不能冒充完整状态恢复协议。

因此不能标为“新架构全部完成”，也不能承诺多船卡顿已经根治。下一阶段的必要闭环是完整命令与 detached 呈现协议下的 LocalWorkerHost，而不是继续增加未经审计的 Worker 白名单。

## 2026-09-22：Renderer 舰船读集已收窄，默认后端仍未迁移

已新增 `ShipRenderState`，WebGL 舰船/护盾/系统/损伤等消费者不再要求完整权威 Ship 类型。实验性 `LocalCombatConfig.presentation = "render"` 使用独立呈现舰船/系统/挂点对象，采样计算后的护盾、幅能、相位、系统表现、武器射程与姿态，不遍历舰船 AI、装甲格受击逻辑和武器控制器。原有 `compatibility` 仍为默认；此阶段本地协议为 5，后续共享显示字典已升至 6。

此边界只是 renderer 与当前通知 HUD，不是完整 TacticalHUD / 部署 / 生涯读写迁移；其它特效仍复用既有 Float64/记录图桥。投影对象的 TypeScript 顶层只读不等于深冻结全部嵌套向量和内容。不得据此宣布完整架构完成或切换普通战斗的后端。

固定代际内不切换对象原型：未知查询在初始化时整帧选择兼容模式；受限模式启动后若查询契约改变则明确失败，要求新建兼容代际，不从显示帧恢复权威。内置 RecallDevice/PhaseAnchor 的纯相位读取有私有弱引用标记，保持原函数/参数/调用体，不为未知闭包授予资格。详细实测、验收与局限见 `render-projection-performance-2026-09-22.md`。

## 2026-09-22 后续：共享武器显示字典（仍为 opt-in）

显示规格现已按复制后的显示内容共享，保留每次采样原可变字段；实际射程按挂点传输，避免同外观的不同射程被合并。协议版本 6。一次既有 100 混合主舰 / 300 对象配对中，编码＋解码 92.65→81.47ms；18/24 对更快，仍有波动，这不是 FPS/TPS 或实际 Worker 往返结果。2,359 项既有及新增契约检查、类型检查和局部 lint 通过。默认 inline/compatibility 没有切换，整场新架构、完整 HUD 与命令迁移仍未交付。详见 render-projection-performance-2026-09-22.md 第三块。

## 2026-09-22 后续：默认地图操作已进入权威命令边界

默认 CombatView 的 TacticalMap 下令/取消/护航/选舰/设目标/撤退已接 session.dispatchControl，先经过在途 tick 屏障；HUD 去掉缺少回调时直接写 Ship 的分支。新增数据型 TacticalControl，权威端生成向量/时间/序号并检查当前有效性，LocalCombatKernel 共用同一实现。协议 7 的 HUD 回执携带 CP/selection/map/orders，仍不是完整 HUD 读集。2,420 项契约、类型检查、局部 lint 和一次实际默认页面+真实 Worker 操作场景通过。默认引擎仍 inline，完整部署/读集/Worker 接管及百舰 FPS/TPS 验收没有完成。详细证据在 render-projection-performance-2026-09-22.md 第四块；不得将此前协议 6 的性能数字冒充此轮复测。

## 2026-09-22 后续：实际部署写入口已接通，协议 8

第五块完成默认 CombatView 中舰队增援和模拟器部署的写入口迁移：UI 只提交后备舰船 id、双方目录 id 或部署上限；CombatSession/LocalCombatKernel 共用 DeploymentControl，权威侧解析真实配装与 DP，检查当前代际/内容/预算后调用既有部署规则。临时模拟定义不再由生产部署 UI 注册进全局内容库，Worker 呈现帧携带的定义可以恢复舰名；原有内容签名保护保留。等待回执时阻止重复提交，拒绝保留选择，资源刷新晚于成功 ACK 消费。LocalCombatProtocol 升至 8。

2,456 项既有与新增契约检查、一次应用类型检查、改动文件 lint（两个 UI 警告定向修复并复查）通过。实际 CombatView 模拟器、真实 FleetDeployment＋CombatSession 以及真实 LocalWorkerHost 的同一个无头部署场景通过：双方预算校验、失败/延迟回执、己方后备所有权、3 艘主舰/45 对 10DP、名称与资源就绪、内容签名不变、命令不推进 tick/实际 step 推进到 tick 1。舰队组件验证不冒充完整生涯端到端，未完整回归联机部署，也未进行原版实机补验。

截至此块，上文“部署写入口尚未迁移”的阶段记录已由这两个实际入口的接入更新；**部署状态读取仍依赖 CombatEngine，完整 TacticalHUD/部署只读投影仍未交付**。普通战斗仍为 inline authority，LocalWorkerHost 默认 compatibility；Worker 生命周期与结算、完整 StateStore/恢复迁移和百舰实际 FPS/TPS 验收仍未完成，不能标记为新架构全部完成或多船卡顿已解决。本块没有新性能测量，不将协议 6 的桥接数字冒充协议 8 结果。详情与产物见 render-projection-performance-2026-09-22.md 第五块；未提交、发布。
## 2026-09-22 后续：两个实际部署窗口已使用独立读源，协议 9

第六块新增 DeploymentView：成员身份/状态/DP、实际冻结配装、结构/CR、完整名单预算和代际。默认 CombatView 的舰队增援、模拟器、舰船配装检查子树不再接收 CombatEngine/Ship；CombatSession、LAN 显示适配和 LocalWorkerHost 提供相同读源，写入继续走权威命令。Worker UI 快照与可变解码图隔离，旧快照不随新帧修改；不变成员/可变配装快照可复用，普通非部署战斗避免附加全场扫描，缺失显示实例仍计占用 DP。协议 9。

最终 2,524 项契约通过，完整类型/lint 与复查修正后的定向检查通过。一个既有无头部署场景中，真实 CombatView/inline 与真实 Worker 直接供给的两个实际部署窗口通过：模拟器 45/10DP→45/15DP；后备 45% 结构、37% CR、实际卸下武器仍保留为空；一次确认只部署己方后备、敌方保持后备、命令不推进 tick。首次整站导航超时后隔离挂载实际组件重试，故不声称完整主页启动或生涯端到端验收；LAN 完整回归和原版实机仍未做。详见 render-projection-performance-2026-09-22.md 第六块。

上文第五块“部署子树仍直接读取 CombatEngine”的阶段差异已由此更新，但顶层 CombatView、完整 TacticalHUD/战术地图、输入循环、Worker 生命周期/结算接管仍待迁移。默认后端未切换，没有新的百舰 FPS/TPS 或桥接性能数字，不能标记新架构全部完成/多船卡顿已解决。未提交、发布。
## 2026-09-22 后续：实际战术地图已接独立读源，协议 10

第七块新增 TacticalMapView 纯数据读集，按现有观察阵营/公开战场规则预筛地图接触，包含可见任务目标、地形与旗舰幅能/CR/装甲。实际 TacticalMap、Painter、ShipStatus 不再接收 CombatEngine/Ship；绘制和拾取共用同一已绘制接触帧，同次采样复用可见性检查，关闭地图不枚举舰船/复制地形装甲。快照冻结并与可变解码图隔离，动态字段保持正常 delta；旗舰身份按 id 匹配。默认 CombatView→TacticalHUD、LAN 显示适配和真实 LocalWorkerHost 接通该读源，写入仍走第四块的权威命令。协议 10。

完整类型检查、2,582 项契约及定向 UI/脚本 lint 通过。既有无头地图场景中的实际默认 UI 与真实 Worker-only 地图均通过选舰、命令、取消、失败/延迟回执和关闭检查：默认暂停 tick 35 不变；Worker 命令 tick 0、真实 step 后 tick 1，旧快照/释放隔离正确。完整场景 95/96 条通过，唯一失败是历史双队 LAN 传感器策略期望，与已提交 9e83433 的公开战场规则不符。仅修正测试期望并做双队 9 项定向复查通过，保留普通传感器规则；没有修改运行策略，也没有宣称修正后完整场景已重跑。页面错误 0；原版实机仍待许可，详细日志/宿主修正见 render-projection-performance-2026-09-22.md 第七块。

第六块所述战术地图直接读取引擎的差异已解决，但完整 HUD、顶层 CombatView/输入、Worker 生命周期/结算、StateStore/恢复接管仍未完成。默认后端保持 inline/compatibility，此块没有新的 FPS/TPS、百舰或 Worker 往返测量，不能标记新架构全部完成或多船流畅度目标达成。未提交、发布。
## 2026-09-22 后续：正常战斗主链路默认 Worker，协议 11

第八块已把普通 CombatView 接入 LocalWorkerHost：完整 HUD/联系人/雷达/武器技能/装甲/通知、输入 ACK/控制代际、镜头音频、暂停屏障、重启/切舰/切遭遇、资源生命周期、故障停止/释放，以及 GameSession 舰队权威结算。普通入口默认 worker-render，只有视觉实验室与明确 `?combat=inline` 参考路径继续同步运行；失败不会自动退回主线程。主线程保留初始引导/配装构造，但 Worker 活跃时拒绝 session.engine 访问，主循环不推进引导引擎。只读详情限旗舰/锁定目标，其它联系人不复制武器/装甲；与并行装甲 mutation/copyCells 优化兼容。新 Worker 初始化验证当前数据定义快照后再次核对内容签名，运行时修改仍拒绝。

完整 TypeScript、最终改动 lint/diff 检查及 **2,621 项契约**通过。既有地图组合场景最后的自然战斗结算 fixture 超出步数，保留 exit 1；仅改用可控测试靶舰并定向复查 hosted 分支 exit 0。实际普通页面从 tick 9 暂停下令、选组/锁定目标/开关地图，到真实移动至 tick 22；切场拒绝旧回执并释放旧 host；真实 Worker 269 tick 后击毁测试敌舰，GameSession 权威结算仅写回一次，pendingCombat 清空；故障停止不 fallback、卸载彻底释放。页面错误 0，HUD 截图已检查；原版实机、完整 LAN/生涯端到端及百舰 FPS/TPS 未补验。详细实现、失败/复查记录和产物见 render-projection-performance-2026-09-22.md 第八块。

上文第七块的“普通后端仍 inline，HUD/输入/生命周期/结算未迁移”已被此轮更新。**仍未完成的是运行中完整 StateStore/ReplayCheckpoint 和崩溃无损恢复，不得用显示快照代替；百舰实际流畅度也不能只凭架构迁移宣称达标。** 同步编辑工具/受限渲染兼容路径保留，不是正常入口的双权威运行。未提交、发布。
## 2026-09-22 后续：确认边界重放恢复（第九块，协议 12）

新增 CombatReplayCheckpoint/CombatReplayJournal，保存同页初始配置与完整 ACK 输入/命令日志，在全新 Worker 中执行原权威路径来重建隐藏 AI/WeakMap/技能闭包等。默认战斗故障覆盖层可手动“恢复至已确认进度”；暂停恢复、丢弃未确认操作、旧代际隔离、不重播声音、不回退 inline。版本/内容/命令回执/RNG 等低开销见证不符即拒绝恢复。空闲暂停的 Worker 故障也通过订阅立即报告，而不必等待下一个命令。

内存日志采用连续相同输入 RLE，上限为 216,000 tick/131,072 记录/32 MiB 估算日志载荷；超限仅关闭恢复。真实页面确认边界恢复至 tick 82，另与未中断 Worker 连续比较 60 tick 的所选状态，包含最多 41 个弹丸，结果一致。完整 hosted 场景 pageErrors=[]、后续普通舰队结算只一次；既有 2,621 契约以及类型/lint 通过。见 render-projection-performance-2026-09-22.md 第九块的准确覆盖范围和定向空闲故障复查。

第八块的“完全没有 ReplayCheckpoint/故障恢复”已被此块部分替代：已有同页已确认日志的重建恢复，但**即时全量 StateStore、中场磁盘存档、浏览器关闭后续战、舰队中途恢复后结算的专项验证仍未完成**。本块没有百舰性能新结论，不能宣称整个长期架构完工。

## 2026-09-22 后续：持久中场点与刷新后的舰队续战（第十块，协议 13）

已新增 IndexedDB 中场存储与“舰队 / 存档”实际入口。主动保存完整确认日志，跨真实页面刷新后显式重放同一遭遇并暂停；原 GameState JSON 格式及战前/战后归属不变。完整 GameState 绑定、代码指纹、内容签名、事务 revision CAS/tombstone、控制代际和候选 Worker 验证隔离旧写入/旧出击/不兼容构建。中场日志不进入导出 JSON，不每帧写盘，不自动恢复。启动在存储检查完成前不推进战斗；错误或发现适用点会打开存档面板。

真实页面保存 tick 45、reload 后恢复同遭遇 tick 45，继续 237 tick 真实击毁靶舰并只结算一次；中场槽清理，再次刷新没有旧点，战果仍一条。IDB 特殊数值/typed array、陈旧写冲突、不可用存储、错误版本/遭遇均有检查。最终启动定向复查将 IDB 加载延迟一秒时保持 paused/tick 0 后正常恢复。应用类型/lint、既有 2,621 契约通过；首次 helper 导入错误和启动暂停竞态失败记录保留，未用广泛矩阵反复跑。细节见 render-projection-performance-2026-09-22.md 第十块。

第九块“完全没有中场持久保存/舰队中途恢复结算验证”已被替代。**剩余仍包括瞬时全量 StateStore、跨构建迁移、跨浏览器中场导入/导出、完整 LAN 恢复和真实百舰 FPS/TPS 验收。** 浏览器持久数据可能被隐私模式/清理/配额策略移除；已做真实页面刷新，未操作用户桌面浏览器退出/重启。未发布。
