# 系统 AI 输入依赖执行层 — 实施结果（2026-10-03）

## 实际交付
四个战斗文件修改，未触碰生涯、UI、物理 tick、参战规模、挂点或 AI 决策/威胁预测频率。
- Registry 以注册后不可变 definition 身份认证 Eclipse、Gloriana Edict、Hyperion Yamato/Jump 的 forwardClear 非依赖；复制/替换/第三方注册不继承权限，jets/drives 等未认证系统仍完整 eager 净空。
- SystemAIInputs 提供独立 effects 输入跨度。它只授予纯读准备的减免，不保存位置、相位、生命周期或碰撞结果，不延长已关闭的 plan index/数值帧。
- CapitalShipAI 保留 modifiers/boostSpeed 读取及 activation/quietFor/防御流程；按依赖提供真实惰性 forwardClear 字段，不用 true 伪造安全数据。fallback 在原 context 位置 eager 求值，quietFor 仍在查询之后读取。
- CombatAIPhase 在原生 worker 的控制写完、effects 开始后启用；未知 AI 方法、世界 accessor/依赖记录器、未知 receipt、异常或关闭撤销权限。纯读权限不是任意同进程 property interception 的沙箱。
- `VITE_COMBAT_SYSTEM_INPUTS=false` 回退完整输入；unset 仅在被准入的原生 worker span 默认启用。

## 验证与证据
沿用既有 standard 重型 authority 场景：seed917、2玩家+20AI、22根舰、初始176实体、734挂点；150热身+120计时，同窗ABBA，没有开新测试工程。

| 指标（双臂均值） | 冻结接受基线 | 依赖驱动候选 |
|---|---:|---:|
| 整步墙钟 | 41.258ms | 33.726ms |
| fleetAI+controls+effects | 14.344ms | 11.806ms |
| effects 标签 | 1.502ms | 0.426ms |
| fire-query（未直接改） | 10.929ms | 9.540ms |

四臂整步分别 43.601, 35.109, 32.343, 38.915ms。整步观察下降约18.26%，但**不将全部7.53ms归因本块**；effects 直接观察减少约1.08ms，其它桶有机器负载/GC/JIT耦合，不能与前窗口收益拼接。未独立跑最终候选 CPU profiler，未达到/承诺60Hz。

候选两臂各270个真实 effects span，7020个输入按依赖延期、0 eager corridor、0实际 corridor 查询；即每步26次降到0，计时窗3120次消除。基线每步26次来自前一底层审计的保留原查询消费探针，不伪称本次冻结基线内新增查询计数器。真正需要净空的未知/推进程序不在延期集合。

- 四臂完整终态 captureCombat+RNG 一致；终态170实体/90投射物。
- source-abba 270步逐步完整快照与RNG对照通过；false 回退270步完整终态/RNG通过，0延期。
- 定向检查发现可选字段 accessor 被误作 absent 的权限问题（不是游戏轨迹差异）。以独立 sentinel 区分，且不调用 accessor；修复后定向检查通过。
- **最终 source 再做270步逐步完整快照/RNG对照通过。** 计时使用 source-abba；最终只变 descriptor 拒绝分支，正常 native data descriptor 分支不变；未重复ABBA，不能冒充“最终hash重新计时”。
- 第一实施块 app tsc 与四文件 lint 通过；最终 descriptor 修复再 lint 对应文件与相关场景通过，没有重跑全套。

证据目录：`C:/starsector-web-master/artifacts/combat-system-inputs-20261003/`。`source-before`、`source-abba`、`final-source` 和各hash分开保留；`result.json` 与 `guard-fix-result.json` 分别标明计时及最终复查范围。

## 未解决的底层根因
本块解决的是“执行层无条件准备消费者不需要的输入”，不是整个高ms已经根治。
1. 56附属模块仍走自由机动站位/避障/steering，物理仍依附母舰。未删模块AI，也未默改舰队火力、claim、目标分配；需要后续能力分层重写。
2. 每步76完整威胁预测的 observer×source×mount 排除工作仍在。未利用20Hz开关降频，需要保守候选关系/批次执行重写，保持ETA、顺序、求和和防御响应。
3. 原生 phase/allSystems 关系递归、其余火控成本仍在；preAim eager BVH 未改。

原版目标0.98a-RC8，本机 core/decompiled 缺失；本块是现Web规则内部等价重写，原版源码/实机仍待核实。未操作桌面、未补测browser/transport/跨机/UI，未提交、推送、打包或发布。用户现场显示ms尚未重新采集，本场景墙钟不代替现场验收。
