# Worker免分配相位成员读取：性能与正确性（2026-09-26）

## 结论：保留
本轮按真实分配采样定位Ship.isPhased/allSystems，删除封闭Worker单战术槽查询中不必要的成员数组、slice和some回调；不是引入池，也没有跨帧缓存相位值。一次无profile/stages正式配对显示：模拟均值减少12.47%，Host完整交付均值减少7.57%、P95减少4.80%；六个连续30tick分段均改善。保留本轮两个生产文件修改，之前有效优化不变。没有声称GPU/多线程收益、网络RTT或最终帧率收益。

## 生产边界
Ship.ts添加realm私有开关，local-combat.worker.ts仅在初始化和新Worker恢复入口显式启用。普通公开引擎仍走原allSystems；非原生Ship原型、own allSystems和多战术槽回退原实现。封闭域槽字段/数组是构造方普通数据，协议不能传入函数/访问器/原型；不把此开关当同realm安全沙箱。
每次查询仍实时读取父舰、dock、retreat、Shield、系统与外部相位Map；先保存main、defense引用再按顺序读相位，保留读取期间替换成员的快照语义及递归重入。不少读状态、不降频、不改精度、实体、配对顺序、伤害、显隐字段或校验。未优化多战术槽临时数组，也没有修改公开allSystems返回新数组的行为。

## 集中验收
- 一次完整typecheck通过（18,734ms）；六个改动代码/工具文件oxlint退出0，仅测试空生成器一条warning。补上显式空yield后仅该文件定向lint及292项相位合同复查通过，无生产改动、全场景或测速重跑。
- 292项相位合同（3项启用前公开读取合同、145次生命周期/护盾状态检查），覆盖DISPLACER、DISPLACER_DEGRADED、PHASE_TELEPORTER、SKIMMER_DRONE、DISPLACER_THREAT、ENERGY_CONVERSION。参考getter正文与冻结baseline逐字规范化比对通过。
- 原有void/collision场景22项通过，场景在同一Worker相位开关开启后执行。覆盖父子模块、实时状态/成员替换、公开getter/slice/iterator/species、覆盖allSystems、稀疏多系统异常、短路、外部效果插入删除/零值/异常及重入；未据此宣称原版实机/UI或双设备联机验收。

## 默认自动模式初始化/恢复（仅正确性）
200舰、0预热、55tick，raw Worker加既有--decode --fire-query-audit。初始化和恢复注册各1次，fastReads分别3472815和3439705；均确实启用。计数不同不代表状态差异：普通流程逐tick呈现/审计，restore重放中不逐tick发布同样帧。55次witness、56次完整显示图（831879节点）以及恢复witness/完整权威+隐藏状态/显示全部通过。
默认自动调度tick25启动、27启用4个Owner、19个fresh batch、invalidated=0，tick49因no-measured-benefit回串行；本轮未更改预算策略。插桩时间不当性能结果。

## 正式对照（只跑一次）
`node scripts/benchmark-real-workers.mjs --host-pipeline --serial-pair --count 200 --warm 150 --steps 180 --baseline artifacts/owned-phase-reads-20260926/baseline-sources.json --candidate artifacts/owned-phase-reads-20260926/candidate-input-sources.json --freeze artifacts/owned-phase-reads-20260926/measured-sources.json --out artifacts/owned-phase-reads-20260926/host-serial-pair-200`

200 Onslaught、seed917、固定dt，150预热+180测量，独立无头Edge153，hardwareConcurrency16、crossOriginIsolated。三臂逐tick交替，比较before/after，均固定串行，freshBatches=0、invalidated=0。不是CPU/heap采样结果，也无生产计数器。完整313模块前后只改Ship.ts与local-combat.worker.ts，实际测量源图等于候选源图；当前生产图无漂移。raw激活检查用312模块，唯一不包含LocalWorkerHost.ts（直接驱动Worker），全部312项也与候选一致。

| 阶段（ms） | 旧均值 | 新均值 | 均值变化 | 旧P95 | 新P95 | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| 模拟 | 41.491 | 36.317 | -12.47% | 50.425 | 48.035 | -4.74% |
| 显示编码 | 20.191 | 19.933 | -1.28% | 27.090 | 25.070 | -7.46% |
| Host发起→原始ACK | 62.079 | 56.657 | -8.73% | 72.550 | 67.805 | -6.54% |
| Host呈现处理 | 10.832 | 10.734 | -0.90% | 14.325 | 13.915 | -2.86% |
| Host完整交付 | 72.943 | 67.422 | -7.57% | 85.280 | 81.185 | -4.80% |

P95由原始样本按floor((n−1)×0.95)重算并与runner汇总核对。hostPresentationMs包含decoder.apply及Host地图/部署/字符串处理；deliveredMs包含Host.step至promise完成的复制/排队/ACK/日志，不包含渲染、网络、rAF pacing或input-to-photon。

| 连续tick | 模拟均值变化 | 编码均值变化 | 完整交付均值变化 |
|---|---:|---:|---:|
| 151–180 | -13.00% | -6.23% | -9.46% |
| 181–210 | -12.10% | -0.91% | -7.09% |
| 211–240 | -18.11% | -3.80% | -11.69% |
| 241–270 | -11.81% | -1.84% | -7.19% |
| 271–300 | -10.95% | -0.01% | -6.41% |
| 301–330 | -9.23% | +3.87% | -4.23% |

分段属于同一次运行，不当六次独立复现，也不声称所有舰型/设备显著性。660次witness、662次完整显示图（18,103,234节点）、11个完整权威/隐藏火控/RNG检查点通过。三个Host全部ready、pendingTransactions=0、tick330、journalEntries1、epoch1、sequence331。

## 工具修正与交付状态
统计脚本先后修正两处输入假设：profileArm序列化为null；raw激活图只缺Host模块。只重新分析既有结果，未重跑/筛选任何速度样本；记录analysis-repair.json。所有源图、原文件备份、原始结果与分块分析位于artifacts/owned-phase-reads-20260926。原V8采样证据见worker-allocation-profile-2026-09-26.md；没有追加采样，因此不声称优化后的GC或分配字节降低百分比。

总体优化目标仍active。未暂存、提交、推送、打包、发布、启动子代理或操作桌面。下一方向是仍约20ms的显示编码与派生属性分配；须重新依据热点和实际交付耗时筛选，不能以对象计数代替收益。
