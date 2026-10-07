# 高 ms 砍半：第一块执行域重写（2026-10-04）

## 验收目标与原版边界
同既有 seed917、2玩家+20AI、734挂点、standard、60Hz场景，使用无插桩ABBA，整步目标至少降低50%。不改dt、实体/挂点数量、模拟频率或ms统计。原版目标0.98a-RC8；C:/starsector-core与C:/decompiled均缺失，原版源码/实机/UI待核实。不改UI/生涯，不操作桌面、不发布。

## 原版证据 → 预期 → 当前差异 → 验证
原版算法尚不能核实。本块以现有Web的每步raw快照、AI/defense memory、tracker/per-mount RNG及双RNG为精确行为基准，不声称原版等价。
当前 CPU 500us样本只用于定位，含inspector成本，不作计时基线。AI/火控仍最大；AttachedModuleMotion资格路径约2.47ms；ThreatAssessment包容约3.52ms（重叠，不可相加）。没有一个占20ms的函数。JIT探针发现多种对象shape的wrong-map退优化，但不能仅由次数推算耗时。

## 本块：threat producer/consumer分离
依据 docs/combat-native-threat-consumer-audit-2026-10-03.md 的实际注册callback读集：初始18个definitions没有消费者读取threat明细。宿主需threatCount及far weapon存在/最早ETA；facing仍需全部imminent明细。保留全部候选、ETA、damage、shield flux、数值归约顺序，不减少far贡献，不降低防御次数。

新私有observation输出精确facts，并保留far行的接受时数值快照（eta/damage/flux/方向差分/kind/sourceId/原序号）。只有imminent立即构建对象和atan2；若effects边界出现未知callback/defense方法，显式materialize接受时的完整assessment，不从已变化world重算。不得getter/Proxy探测、伪造空threats、虚假length。公开assessThreats/ThreatAssessment完整接口保留；SystemAIContext的可选threat增加明确facts联合类型，未知callback实际仍取得完整对象。

Consumer read-set资格独立于统计/forecast gate：只捕获本Registry初始注册且本次已审计的definition及advanceAI函数identity，后续未知注册不继承。producer只在原生完整staged weapon frame、observer现有exact纯统计读边界与原生atan2下启用。callback准入在真实调用前重新判断；full fallback保留原输入快照和插入顺序。vent仍沿现有live全明细复核。

## 计划验证
整块完成集中一次app tsc、改动文件lint、复用既有270步严格三路径场景和相关边界；通过后独占ABBA。未通过/性能回归只撤回本块；50%目标未达不得称根治。
