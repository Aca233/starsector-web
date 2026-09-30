# Owner观察字段直接访问：实测与验收（2026-09-26）

## 结论
**保留协议层候选，不强制开启生产多核，也不宣称已解决卡顿。** 200舰固定Owner调度配对中，发布打包均值9.074→8.400ms（−7.43%），最慢Owner同步2.358→1.974ms（−16.28%），完整模拟56.044→54.869ms（−2.10%）。打包在六个连续区间均下降，同步和模拟各五个区间下降；这些相关区间不是独立实验，不能冒充统计显著性。
总体交付仅88.324→87.824ms（−0.57%），连续六块中仅三块改善。模拟P95反而+1.71%，因此只认目标同步/发布成本的下降，不把整体小波动包装成稳定的延迟突破。
**优化后多核仍慢于同场串行参考**：串行模拟42.437ms、交付75.095ms，多核54.869/87.824ms。两臂多核在本实验被测试脚本强制保持，不代表默认选择结果。生产成本门、退役、冷却策略完全未改；默认模式单独审计仍在tick49退回串行。

## 来源与修改范围
修改前source-notes见owner-observation-wire-source-notes-2026-09-25.md；本轮跨越25日晚至26日，artifacts目录沿用开始日期。
本机0.98a-RC8的CombatEntityAPI.java:8–9、WeaponAPI.java:158/185、ShipAPI.java:329作为实时状态接口证据。优化的是Web内部编码，不替换原版规则/UI；无原版可见实机验收，不占用桌面。

生产仅新增ObservationWire.ts，修改Protocol.ts和Owner.ts：
- 将固定30个舰船观察字段、12个挂点观察字段的动态字符串路径读/写/比较展开成直接属性访问。
- 字段集合、顺序、偏移、SAB、Float64、tag/dictionary、null/undefined、NaN/Infinity/−0及对象标记不变；仍逐次读取每个动态值，不做跨步值缓存。
- 派生射程、DPS、炮口、放幅时间和运动属性仍在原有位置计算。derivedWorld=true的LAN完整校验保留全部观察字段。
- 嵌套写入仍先调用reader获取值，再访问/创建子对象；空值、读取异常后的部分写入和比较短路顺序与通用函数一致。
- 保留通用readPath/writePath和协议路径表。新增模块只type-import协议类型，不将CombatEngine引入Owner静态加载图。
- 不降频、不减实体/字段/精度，不改AI、武器、RNG、校验门槛或权威发射次序。上一轮OwnedFireControlReadGuard未改。

## 测量方法
一次正式速度实验：真实production local Worker和nested owner Workers、主线程production decoder，独立无头Edge153、16逻辑CPU、cross-origin isolated；200艘Onslaught、seed917、固定dt，150tick预热＋180tick测量，serial/before/after逐tick交替。前后完整源图310/311模块冻结，仅上述3个生产模块不同；无profile/stages/额外计数计时插桩。

新增--owner-pair仅用于归因：两份测试构建的CombatMulticore允许Owner工作，不因成本比较而退役；仍记录成本。所有资格检查、deadline、状态验证、失效回退和完整simulation step保留。默认脚本行为不变，且该选项不能与--serial-pair合用。测试实际before/after均tick2启用4个Owner，测量段各180个新批次、invalidated均0；不是比较一个并行臂与一个已退回串行的臂。

### 完整测量段
| 指标 ms | before均值 | after均值 | 均值变化 | before P95 | after P95 | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| 完整模拟 | 56.044 | 54.869 | -2.10% | 65.915 | 67.040 | +1.71% |
| 显示编码 | 20.794 | 21.411 | +2.96% | 28.930 | 29.385 | +1.57% |
| Worker往返 | 77.252 | 76.704 | -0.71% | 92.875 | 94.080 | +1.30% |
| 主线程解码 | 11.071 | 11.120 | +0.44% | 14.030 | 14.685 | +4.67% |
| Worker往返＋解码 | 88.324 | 87.824 | -0.57% | 106.520 | 105.395 | -1.06% |

Worker往返＋解码不包含渲染、网络或input-to-photon，不是FPS/TPS结论。没有声称未修改的编码/解码变快：编码均值+2.96%、解码+0.44%，抵消了部分模拟收益。

### 同批次内部成本
| 指标 ms | before均值 | after均值 | 均值变化 | before P95 | after P95 | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| Owner发布打包 | 9.074 | 8.400 | -7.43% | 11.050 | 11.050 | 0.00% |
| Owner等待（含同步/计算） | 10.660 | 10.346 | -2.94% | 15.235 | 14.040 | -7.84% |
| 回传校验 | 3.124 | 3.079 | -1.44% | 4.595 | 4.285 | -6.75% |
| 合并（含重算） | 0.428 | 0.439 | +2.41% | 0.640 | 0.655 | +2.34% |
| 最慢Owner同步 | 2.358 | 1.974 | -16.28% | 4.335 | 3.940 | -9.11% |
| 最慢Owner计算 | 6.837 | 6.926 | +1.30% | 9.855 | 9.185 | -6.80% |

wait已包含同步及Owner计算，不能与sync/kernel再相加；merge也已包含重算。重算均值0.049→0.053ms，不删冲突/重算检查。主要收益来自发布打包和同步，而不是通过缩减返回结果或移除校验伪造。

| 连续30tick区间 | 发布打包均值变化 | 同步均值变化 | 完整模拟变化 | 交付变化 |
|---|---:|---:|---:|---:|
| 151–180 | -6.29% | +2.07% | +0.04% | +0.27% |
| 181–210 | -11.20% | -8.47% | -2.00% | +1.47% |
| 211–240 | -4.52% | -36.45% | -4.46% | -3.11% |
| 241–270 | -9.51% | -21.38% | -0.84% | -1.27% |
| 271–300 | -5.83% | -2.90% | -2.75% | -0.84% |
| 301–330 | -7.25% | -19.16% | -2.28% | +0.40% |

## 正确性及真实失败记录
- 一次typecheck及7个改动代码/测试文件oxlint通过。
- 第一次combat-ai在新增第24项失败，前23项通过：测试对无限弹药使用Infinity+1，值没有变，却要求校验拒绝。冻结旧Publisher与候选均正确接受该未变值（fixture-failure-oracle.json）。只修夹具并assert变更确实发生，未改生产校验。
- 第一次添加尾部过滤因CRLF匹配失败而未写入，命令链仍继续，意外再次执行前23项；第二次合同又在夹具直接访问undefined fireControl时报错。没有把这次写成“定向”或“通过”。保留contracts.log、contracts-followup.log、初始/中间夹具。
- 修正尾部过滤和临时嵌套容器/恢复后，从第24至51项定向执行28项全部通过。与已执行的前23项合计覆盖51项，不声称一次完整命令全绿，也未再跑整套。
- 新合同80872次比较，1218次逐字段失效检查，4个完整冻结旧Publisher帧对照，74400次真实Owner字段/偏移核对；含特殊值、边界哨兵、字典、对象身份、nullish父节点、getter读取次序、短路和读取异常的部分写入。普通及derivedWorld校验均对照冻结旧实现。
- 330tick正式配对：660次跨臂有效帧、662次完整显示图（18103234对象节点访问）、11次权威/隐藏火控/RNG检查点一致；都在测量计时之外，不减校验。
- 默认自动模式另做55tick激活/恢复审计，ownerPair=false、serialPair=false；tick27启动4个Owner、tick49因no-measured-benefit回退，19个新批次、invalidated=0。初始化和重放各55个roster、11000个火控batch且0拒绝，witness/authority+hidden/display一致。不将这段带计数的耗时当速度收益。

## 工件与并发边界
artifacts/owner-observation-wire-20260925保留baseline-sources.json、candidate-input-sources.json、measured-sources.json、original-files、candidate-files、所有验证/失败日志、fixture-failure-oracle.json、owner-pair-200/result.json、comparison.json、default-activation-restore/result.json、source-verification.json及final-workspace-verification.json。
源图hash逐项有效，measured与candidate完全相同。Owner静态加载图2662390→2669532字节（+7142字节），没有引入CombatEngine。
收尾时本轮7份代码/测试文件与保存版本hash一致，上一轮Ship guard未变。其他任务继续修改了：
- src/engine/ai/FireControlGeometry.ts
- src/engine/content/GlorianaPack.ts
- src/engine/ai/AutofireController.ts
- src/engine/ai/TacticalPositioning.ts
- src/engine/ai/TacticalNavigation.ts
- src/engine/simulation/systems/ShipCollisionSystem.ts
- src/engine/simulation/systems/weapon/ProjectileExplosionSystem.ts
- src/engine/simulation/systems/weapon/ProjectileCollisionHandler.ts
- src/engine/simulation/systems/weapon/VoidShieldArea.ts
全部保留，hash差异有记录。真实性能与Worker验证针对冻结候选，不声称覆盖之后追加的并发修改。未暂存、提交、推送、打包或发布。

## 后续
继续降低发布/回传验证的实际代价，以及它们引起的长尾；不以强制CPU高占用或取消安全回退替代性能收益。这次让多核少做了一部分协议杂务，但尚未把200舰Owner路径变得比串行更快。整体优化目标仍在进行中。
