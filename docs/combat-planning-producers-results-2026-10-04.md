# 原生规划生产者重写结果

## 保留与目标
保留5个旧生产文件改动与1个生产ledger。CombatAIPhase.ts已回到原文件全部原字节；同日ThreatFacts6文件候选已全部撤回，前轮nearest/phase producer/fleet storage仍在。回滚 VITE_COMBAT_PLANNING_PRODUCERS=false。**砍半目标没有达到**，不能把本轮称为根治或稳定60Hz。

## 真执行链
FlightDecisionRoster实际原生producer按team/target发布一次readonly有序权限列表；unknown/旧provider仍保留原数组身份与原地补成员副作用，真publication缺成员只复制不改shared列表。ShipStepBatch按actual publication identity合并union，不改变first-insertion顺序，不去重generic未知iterator。Engine内部不可外部mint的WeakMap记录本步实际AI phase与factory world；AttachedModuleMotion只在该真实同步plan域复用已经完成的member证明。没有第五参数/DTO开关借权，普通caller-built world不继承。unknown aiBatch.finish边界删除phase发布能力，step finally也清除；父/模块关系、motion/vector边界、NONE系统及所有live规则仍读取。

## 完整行为与边界
270步baseline/candidate/rollback raw全快照、双RNG、20790 AI/defense与195934 tracker/per-mount RNG严格相同，无字段白名单。candidate与两rollback的所有既有nearest/acquisition kernel工作量严格相同。44边界通过：team/target/source有序权限、target替换、team变更、roster关闭、generic custom iterator、caller-built AI world、unknown finish回退。app tsc+改动文件lint通过；最后未知provider别名兼容问题定向修复并通过3个原函数直接对照+该文件lint（不重新启动全套）。

270计划：权限列表26147次请求，实际构建1351次/复用24796次；native contact union原6028431次成员遍历，现在166335次（5852096次重复行访问不再发生）；15120个module计划复用同span已完成的member证明。全部实际计算与轨迹不变。计数仅为工作量，不能换算ms。

## 无插桩ABBA
整步 41.127 → 37.443ms（-8.96%）；AI 14.918 → 13.083ms（-12.30%）。逐轮：baseline 41.312 / candidate 39.525 / candidate 35.360 / baseline 40.942。两个相邻对方向一致，但p95与非目标阶段有明显漂移，不把全部净差归因、不外推到所有机器/真实host。此轮硬目标 20.564ms，仍差16.879ms。当前环境与前轮31–33ms不同，不能串加/拼成更大的收益。timing未与tsc/构建/子代理重型工作并行。计时bundle保留；最后修复只改unknown分支，native分支未改。

## 根因与下一层
真实热路径仍是通用可覆写Ship/Weapon对象驱动kernel：规则读、兼容证明、metadata翻译与有效数学混在串行AI/火控阶段。此次从producer降低重复输入/证明，效果约9%，远不足50%。火控静态规则还没有真实publication/revision写入口；不能恢复已失败的永久WeakMap或擅自freeze现有可变spec。

host.worker的legacy whole-AI owners要求THREAT_PHASE=false且usesPhasedWorld=false，默认路径不会用它；WeaponThreatWorkers仅opt-in承担纯forecast子段，不能把开workers当成已砍半。CPU为i5-10400F，6核12线程；主模拟阶段仍主要串行。下一块须按实际read/write依赖拆大块数值fire planning和AI阶段，独立能力证明未知policy/modifier/parent/module读取与publish/restore边界，不可直接对全部Ship复制后并行或减规则。

原版目标0.98a-RC8 core/decompiled缺失，原版源码、实机/UI及真实Web/LAN host待核实。没有生涯、桌面、提交/推送/发布。证据：artifacts/combat-planning-producers-20261004/accepted-summary.json、logic-result.json、timing-result.json、boundaries-result.json、compat-result.json。
