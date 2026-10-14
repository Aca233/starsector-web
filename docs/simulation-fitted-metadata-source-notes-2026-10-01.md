# 默认装配的不可变元数据边界 — 2026-10-01

## 原版证据 → 行为边界

- 本机 ../starsector-core/starsector.log:1：Starsector 0.98a-RC8。
- ../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipAPI.java:85、99–100：战斗可变统计、舰体规格与装配分别暴露为 getMutableStats / getHullSpec / getVariant。
- ../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/MutableShipStatsAPI.java:30–31、196–197：运动与武器射程包含可变运行统计；不能因 tick 编号不变就复用全部派生结果。
- ShipHullSpecAPI.java 的 EngineSpecAPI 本身还有 setMaxSpeed 等 setter，不能据此声称原版所有规格天然不可变。

本轮只改变 Web 内部完成装配之后的所有权边界，不改装备、数值、界面或更新频率。编辑器设计与 evaluate() 的结果仍可变；显式 ShipSpec 调用仍按原契约保留身份与可变性；系统、载荷、ECM、武器输入和运行修正保持即时读取。原版实机和界面对照未进行；本轮无 UI 改动，不操作用户桌面。

## 当前差异 → 最小实现

prepareDeployment() 的 simulation-wave 早已对 resolved.spec 调用 immutableCopy。defaultShipFit() 却把 evaluate(createDesign(id)) 的可变结果直接交给默认战斗、援军与切舰路径，丢失同一种完成装配的元数据许可。ContentRegistry 注册的裸舰体和战机已经不可变；不能把探针的“装配 spec 可变”推广为所有生产路径都关闭缓存。

为 defaultShipFit 的新编译结果调用现有 immutableCopy：深复制并冻结工厂自有规格，登记 isImmutableMetadata；不冻结编辑器输入、不共享可变拟合结果、不修改 Ship 构造函数或任何外部规格。模块规格、轮廓点、装备槽和船插列表也获得同一元数据证书。

这样复用已有 hullBounds、resolvedHullMods / nativeRangeClassification 与 WeaponRange 输入键缓存，而不是另加整 tick 缓存。射程的 runtimeMultiplier/runtimePercent/runtimeFlat、可变武器字段、未知船插回调仍按现有实现即时读/失效。未知扩展不加入任何白名单；三个 AI 实验开关、并行批次资格、火控阈值 100 均不改动。

## 验证方法

冻结本轮修改前的实际工作区，而非 HEAD；先前小行星/避障优化已包含在基线。复用 benchmark-simulation-latency.mjs 和真实 LocalCombatKernel，以 24 艘 Hyperion 镜像测 60 tick 预热 + 120 tick 计时；逐 tick 交错前后并检查回放/RNG、隐藏火控、显示读值与完整权威帧。再用同一既有场景的较小 Gloriana 编组覆盖模块/舰载机，明确记录实际实体数量，不降低实体或更新频率。

集中类型检查、改动文件 lint 与既有 check-default-loadouts 场景，追加默认战斗、援军、切舰的不可变许可、深层模块/轮廓冻结、编译数值不变、草稿可编辑、显式可变规格兼容、即时系统/ECM射程、可变武器参数失效和未知船插回调不缓存等断言。

## 集中验收结果

- tsc -b --pretty false：通过；本轮默认工厂、既有装配场景和基准/场景文件 oxlint：通过。
- 既有 check-default-loadouts 场景：10,150 项断言通过，其中多数为递归元数据检查，不是 10,150 个独立战斗场景；7 种舰体与 13 个装配模板均保持数值/装备 JSON 一致。Gloriana 的 8 个模块与亚顿之矛的 4 个模块均获得递归证书，草稿/预览可编辑且不污染战斗副本。
- 显式可变 ShipSpec 保留对象与 bounds 身份；同 tick 将轮廓平移后，射线接触从 .25 变为 null，未命中旧包围盒缓存。缓存许可仍不扩展到 caller-owned 对象。
- 原生射程缓存对可变武器 range、PD/hints（含原地数组修改）、size、mountType、weaponType、missile/beam 输入与可变规格 oracle 相等；不推进 tick 时 ECM/system 射程序列仍为 600 / 480 / 720 / 900 / 600，动态读取没有被记忆化。
- 未知 stateful 船插定义在不可变规格上仍没有原生射程许可；4 次查询调用回调 4 次，修改闭包加成立即生效。installedHullMods 的公开列表仍为独立可编辑数组。
- 既有保存方案、空白装配、玩家/AI 默认装配、可控射击和 WebGL 渲染检查通过；page errors / missing assets 均为空，GL error 为 0。本轮场景没有测自然战斗帧率，也没有操作用户桌面。

### 配对基准（本轮默认工厂变化，不与前一轮混算）

原工作区冻结图含 370 个生产模块；最终候选图只有 DefaultShipFit.ts 与该基线不同。Hyperion 镜像 24 艘、60 tick 预热 + 120 tick 计时；Gloriana 镜像 8 艘、30 tick 预热 + 60 tick 计时，后者实际含模块/舰载机共 184 个实体（没有降低生产中的翼队或模块数量）。

| 场景/阶段 | 修改前 ms/tick | 修改后 ms/tick | 降低 |
|---|---:|---:|---:|
| Hyperion 仿真均值 | 31.28 | 20.68 | 33.9% |
| Hyperion 仿真 P95 | 40.65 | 27.41 | 32.6% |
| Hyperion 仿真+显示采集+解码均值 | 48.91 | 35.82 | 26.8% |
| Gloriana 仿真均值 | 148.50 | 74.10 | 50.1% |
| Gloriana 仿真 P95 | 172.49 | 99.19 | 42.5% |
| Gloriana 仿真+显示采集+解码均值 | 177.55 | 98.78 | 44.4% |

两臂合计 270 tick 的回放/RNG witness、隐藏火控、显示读值严格相等；Hyperion 7 次与 Gloriana 4 次完整权威帧字节严格相等。初始小行星均为 78，公开战场策略不变；Hyperion 平均弹丸 261.55（P95 447），Gloriana 平均弹丸 190.15（P95 230），两臂一致，数字包大小和节点数量也一致。

Hyperion 的证书/深冻结轮廓从 0/24 → 24/24；Gloriana 从 112/184 → 184/184，原来 112 个舰载机已不可变，补上的是 72 个主舰/模块。说明并非全项目的元数据缓存都关闭，更不能把已有 immutable simulation-wave 部署路径冒充同等新增收益。本轮没有打开三个实验开关、降低火控阈值 100 或扩大任何 native allowlist；运行时派生属性仍在原安全边界内读取。

### 局限与后续边界

结果是一轮逐 tick 交错 Node CPU 配对；单独收取的基线均值 33.31 ms 仅供波动参考，收益采用同一配对内的 31.28 ms 基线，不混用。未包含渲染、真实 Worker IPC、rAF、联网或多核调度，不换算成实机 FPS/TPS；两场景仍超过 16.7 ms，慢动作不能宣称已完全修复。未重测用户报告的 24 航母/549 实体大场景，未验证任意第三方扩展或原版实机等价。

派生属性分配、全场 AI 阶段许可和火力预算的武器×目标×弹丸循环仍有剩余工作；需要下一块独立审计和行为对照，不能用无条件整 tick 缓存或强制放行代替。默认工厂自有装配规格只读，但显式传入的装配/API 与编辑器输出保持可变；未知回调计算结果不缓存。

产物：artifacts/simulation-metadata-perf-20261001/ 下的 baseline-source.json、candidate-source.json、hyperion-paired/result.json、gloriana-paired/result.json、loadouts/loadout-validation.json 与 verification-summary.json。

不暂存、提交、推送或发布，不修改生涯内容。
