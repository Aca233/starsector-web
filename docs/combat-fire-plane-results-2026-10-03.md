# 火控读阶段编译重写结果（2026-10-03）

## 实际改动与根因

没有解除计时指标/步长/主机硬件的限制，也没有降频或减少规模。上一轮之后再次对冻结默认源码做 CPU 采样，剩余 fire-query 约 11.37ms，其中数值帧准入约 1.94ms、input 约 0.83ms、scope 自身约 0.38ms（Profiler 窗口，inclusive 不可相加）。根因之一是只读火控阶段仍把共享数据准备当作逐对象/逐挂点的通用调用重复执行；并非 GC 为唯一根因或网络 RTT。

完成三处生产改动：
- `NumericAcquisitionFrame.ts`：不可变 spec 几何 finite 事实持有正向证书；替换 spec 重新检查。每帧检验原型一次，但每个当前向量的坐标/方法 own 描述符与 native hooks 仍检查。原生系统/空 runtime modifier 才能按相位只读 span 复用 `isPhased`，不跳过外部 effect。船体、护盾和各队目标 eligibility 保留。
- `CombatFireFrame.ts`：实际登记私人 ShipStepBatch、没有独立 store observation 时，共享 acquisition 16 列数值姿态，省去另一份 4 列姿态及提前构造的对象 contacts。首次确需回退时从捕获 scalar pose/extent 建对象索引，绝不取 live 状态；core/kinematics/debug store、普通/未登记路径保留原捕获布局。
- `AutofireController.ts`：实际 native plan/world 经已有 descriptor/身份/生命周期边界后，绑定 shooter/source/row/team/tree 一次；每挂点仍取 live range/speed/delay，角色分类只在本帧已封闭挂点范围内复用。解决 scope/输入的重复环境适配，而不是永久赋予火控许可。source/frame/batch/budget 引用替换后不使用旧查询 binding，未知 binder/accessor 拒绝。

`VITE_COMBAT_FIRE_PLANE` unset 在登记私人原生边界默认启用，`false` 回旧数据准备。旧 decision/fire-flight/stage 内核继续默认；失败的 core getter/motion 保持 OFF。fire permission、扫描 cadence、RNG、射界、独立模块旋转、防御/系统触发以及 ordered commit 没有删减。

## 最终默认版本，同窗数据

复用既有 seed917、standard、2 人+20 AI、三类舰船（初始22根舰/176实体/734挂点）权威场景。150步预热+120步计时，ABBA；基线为上一轮冻结真正最终默认的源码（含最后 descriptor/ref guards），不是从上一轮时间表取数字。候选所有新/旧接受开关 unset，core/motionfalse。

| 项 | 冻结基线两臂均值 | 最终候选两臂均值 | 本窗口降幅 |
| --- | ---: | ---: | ---: |
| 整步 | 43.290ms | 33.438ms | 22.76% |
| fire-query | 12.446ms | 9.443ms | 24.13% |
| AI阶段 | 13.044ms | 10.552ms | 19.11% |

四臂整步分别 [45.118325, 35.050747, 31.825287, 41.462581]ms；两个候选都快于两个基线。**AI 等未直接改动阶段也下降，存在全进程分配/JIT/同机负载耦合，不能精确把全部整步收益归给新火控编译器。** 上一轮 35.38ms 来自另一窗口且最后 guard 未重计时；不能拼成累计百分比，也不是现场 browser Worker 指标保证。

实耗工作（每个候选270步）：
- compiledFrames=270、contactPlanes=270：不是只有探针或部分阶段启用。
- shooterPlans=47207：实际原生舰船查询执行进入绑定。
- immutable geometry checks=16/13；positive hits=47197/47200，取代逐帧重复 bounds 检查。动态姿态/生命周期/effects 未持有跨步许可。
- classBuilds=155133、classHits=24529：为既有单帧挂点角色分类复用，不缓存 mutable spec 的 range/speed。
- 旧 sharedPlans=20520、rootScores=5977、moduleScores=23169、fleet 距离请求/实际构建完全保持上轮数据；没有删模块职责来换时间。

最终四臂完整 captureCombat+engine RNG 均一致，末态170实体/90投射物，shots235/243，RNG `[917,15731318768774,222]`。

## 集中验收 / 具体失败与修复

- app 类型检查 + 三个改动文件 lint 通过（最终 cache-free 源码日志 typecheck-final/lint-final）。没有跑发布 build、生涯套件或新建测试工程。
- 初版测量脚本路径错误（baseline import 多了一层 ../），未运行游戏；修路径后完成 ABBA。
- 初版额外 probe 的 unowned scene 使用 players=[]，createLanWorld 正确拒绝“无效控制席位”。错误之前，同场景270步每步完整快照/RNG和 flag false270步回退对照已通过，四臂终态也全等；没有把 probe 配置失败说成生产故障。
- 发现新 query-input WeakMap 缓存仅命中739/179662=0.41%，撤掉，未保留低价值复杂性。最终重新做同场景 ABBA 终态/RNG及失败边界项，没有重复已经过的270步逐字段轨迹对照。因此：**270步逐步验证属于撤掉 query-input cache 前版本，最终版本覆盖四臂完整终态+RNG、准入/关闭/回退；不宣称最终每步都重新验过。** 缓存尝试保留 query-cache-attempt 供审计。
- 最终额外边界检查：unregistered默认OFF；unknown isCollisionless/vector方法 getter 不调用即拒绝；resolved/unresolved scan/preAim 相同；spec引用替换、foreign source、关闭拒绝；实际 batch frame/shared plane 捕获不随 live teleport 变化。probe wrapper 不用于计时；其 native plan-loop 未准入，不以此证明原生 plan binding（以 ABBA work counters证明）。
- 单独定向加强首次 lazy fallback：**在第一次消费对象索引之前** teleport live ship；首次结果与独立 captured-pose object-index oracle 相同。见 first-lazy-fallback.json；没有重跑计时。

## 仍未完成 / 不冒充还原

平均候选整步约 33.44ms，仍高于60Hz预算16.667ms。AI+fire-query约 19.99ms，单这两阶段就超预算，剩余通用模块决策、威胁评估、拦截/BVH/阻挡等实际计算尚未全部重写。**没有“解除限制后已60Hz”结论。**

本机 C:/starsector-core、C:/decompiled 缺失；目标原版0.98a-RC8源码/实机/UI等价待核实。本轮没有浏览器/transport/跨机/UI截图验收，旧 LAN armed/default/ACK/reconnect 结果不归到当前源码。没有桌面键鼠/可见窗口、子代理、git暂存提交、打包推送或发布；没有改生涯。

文件证据：artifacts/combat-fire-control-kernel-20261003/authority/result.json、performance-summary.json、weighted-hotspots.json、source-before/、final-source/、source-integrity.json。
