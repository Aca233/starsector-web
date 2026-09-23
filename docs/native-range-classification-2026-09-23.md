# 原生射程配置资格缓存

实施前：子代理只读审查指出不可变配置的 hasOnlyNativeRangeModifiers 重复遍历已解析列表；显式采样栈19.232ms/6.145s，约0.31%，不是大幅提速承诺。主代理复核原版0.98a-RC8 ../starsector-core/data/hullmods/IntegratedTargetingUnit.java:31–34，原版对实弹/能量射程应用舰级百分比；本轮不改此规则，只缓存Web原生扩展资格分类。

DefinitionRegistry拒绝重复ID且immutableCopy深拷贝冻结定义；isImmutableMetadata是可信WeakSet，不能以Object.isFrozen替代。将已有解析缓存的值封装为私有条目，懒存nativeRange布尔值，避免在每次命中时另查一张WeakMap。可变规格每次重新解析，未知ID抛错仍不缓存；外部mod保持false且实际回调继续运行。所有实时系统/护盾/母舰资格检查仍留在原位置。公共installedHullMods返回新数组不变。

验证：扩展既有check-weapon-range脚本的immutable/false/换装/新定义契约；既有22船整步场景逐帧对照完整快照和RNG，并测两个座位配置，净收益为正才保留。不改变画面或AI/物理Hz，原版实机未操作。

## 离线候选结果（最终不保留，见文末）

- TypeScript、改动文件lint通过。
- 30,916项范围/分类对照通过，外部可变射程回调仍按原次数调用（8次）。包含immutable true/false复用、可变换装即时改变、未知ID先抛错再注册恢复、公共返回数组独立所有权。
- 既有22船场景：每种玩家配置600tick，240预热、360计时样本，逐tick交替A/B和B/A。1,200帧完整快照、权威RNG、候选重放一致，changedFrames=0。

| 控制座位数（总22船） | 整步mean ms | mean减少 | P50 ms | P95 ms |
|---|---|---|---|---|
| 3 | 7.7158 → 6.8307 | 11.47% | 7.3767 → 6.6543 | 10.6933 → 9.4096 |
| 5 | 7.4628 → 7.2026 | 3.49% | 7.2610 → 7.0927 | 10.5738 → 9.7372 |

这是离线整步CPU结果，变化随配置较大；不是固定收益承诺，不能据此说实际Hz/RTT提高同样百分比。旧48船采样的0.31%只统计显式函数栈，既不是新场景测量也不含所有JIT内联归因，不用它解释或放大本次结果。此前系统拓扑缓存导致整步变慢，已按冻结基线完整撤回，包括readonly API改动；不与本项混合归因。

源码与证据：artifacts/native-range-classification-20260923/retained-source.json、simulation.json、contracts/range-contract.json；HullMods.retained.txt保存当前生产源。不修改AI/物理频率、伤害或射程算法；没有生涯变更、提交、推送或发布。

### 当前源真实48船房间A/B

两臂除冻结/当前HullMods外使用同一当前构建脚本，核对产物control仍逐次every、candidate使用缓存。1房间、2个隔离native接收Worker、8秒、本机实际WebSocket/delta/PMD。

| 指标 | 旧分类 | 缓存分类 |
|---|---|---|
| 物理Hz | 59.70 | 59.54 |
| full-state apply Hz（客机1） | 47.34 | 41.07 |
| 全进程CPU含客机ms | 18594 | 17625 |
| 过载恢复次数 | 0 | 0 |
| 输入到应用P50 ms（客机1） | 32.66 | 31.72 |

短时顺序A/B不等于可靠的容量/延迟提升结论；没有secondary motion socket、RAF、GPU、WAN或输入到可见测量。保留离线CPU节省证据，不把物理Hz变化归为稳定提升。

## 最终决定：撤回默认生产修改
针对首组客机Hz回退，额外只做一次B→A顺序复核：control 44.57Hz、candidate 44.35Hz，物理均约60Hz，无恢复。大幅回退未在第二组复现，但两组客机Hz合并比率0.9293（约-7.1%），进程CPU比率0.9653。这不足以证明适合默认接入的整体收益；不把较低发送/应用数量带来的进程CPU减少当成胜利，也不据短样本断言必然因果。

HullMods.ts已恢复本轮冻结基线的完整字节；候选不在生产。源码副本HullMods.retained.txt/早期retained-source是当时离线阶段的记录，最终以decision.json和当前源码为准，retained-source已标retained=false。新增射程契约仍有独立语义回归价值，保留测试（不主张当前启用了该缓存）。下一步应回到真正缩短展示快照/接收路径的架构连接，而非继续围绕0.3%显式热点增加缓存。
