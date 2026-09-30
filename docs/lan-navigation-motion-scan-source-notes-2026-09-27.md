# 私有Worker导航扫描内运动复用（2026-09-27，编码前）

## 进展与证据
上一回合是实质进展：预瞄提前范围拒绝通过唯一ABBA（4.13%/12.02%整步收益），但真实176实体房间仍开场过载。目标保持active；当前没有测试进程或外部阻塞。

本轮重新读取原版0.98a-RC8的 `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/movement/BasicEngineAI.java:46–79`，确认期望朝向/航向分离和推进命令；Web当前避碰算法仍是Web策略，不宣称等于原版AI。保持所有障碍/速度候选、积分次数、几何公式、horizon、顺序、RNG和UI；原版实机待许可。

当前WeaponThreatEnvelope已经缓存敌舰motion，ThreatAssessment也在单次敌舰扫描内复用，不能重复把它当成缺失。真正未命中的是TacticalNavigation.obstacles的reuseMotion：依赖旧hasNativeThreatPhaseHooks，原创系统因此每个障碍都重新算观察舰getMotionStats。新启动profile中obstacles inclusive154.908ms（旧冻结图、冷启动、与其它桶重叠；不是本轮性能结果）。

## 有界实现
仅host.worker私有域显式 `VITE_LAN_NAVIGATION_MOTION_READS=true`。新增资格与原生reuseMotion分离，不扩大旧nativeThreatPhase，不改变forecast或NavigationObstacleIndex，也不打开任何额外几何快路径。原默认逻辑原样保留。

在单次obstacles调用内，原生getMotionStats/Vector2方法、无依赖记录器、观察舰及父舰通过已有hasNativePreAimRangeReads实时纯读门槛时，惰性复用观察舰maxSpeed和速度长度。该门槛检查不可变船定义、无runtime/外部相位回调、原生盾心、全部系统槽已审计stats/isExecuting定义；不缓存这些资格。

每个可能执行isPhased的障碍先检查同一纯读门槛；遇到未知相位/系统/父舰回调时，在调用前清空motion并永久退出本次新复用（该回调可以改变观察舰或安装更多回调）。自定义障碍速度length也在调用前退出。自己的assembly/dead短路仍同序。小行星保留完整原扫描。查询返回后所有临时数据消失，不跨舰/tick缓存。普通未启用调用、未知观察舰、noteNavigationObstacle、自定义方法维持原始次数/异常。

## 预注册门槛
冻结最新全图；A=本轮两个生产文件before，B=候选，其余完全相同。前3个实验（exact-threat、motion合并、early-preaim）两臂均true。176实体/734挂点、seed917、2玩家+20AI、3200DP不变。

实现完整后集中一次typecheck、改动lint和合同；验证初建/重建/默认关闭，避碰与forwardPathClear在近远、速度、盾、系统激活、非有限输入下逐项完全相同，未知回调改变运动参数/安装新回调、抛错、父舰回调、自定义向量与递归查询保持原行为；60个完整fixedUpdate的权威＋隐藏tracker/RNG逐步一致。

仅一次ABBA，每臂150热身＋120计时，四臂终态hash相同且两组完整步耗时均降低至少3%才保留。调用减少只是激活证据，不能代替性能。正确性失败只定向修复，不计时失败候选；性能失败按候选hash核对后精确回撤。通过才做一次既有真实无头联机场景，仍失败不宣称Hz/输入P95。默认关闭、未发布，不暂存/提交/打包。

## 合同定向修复
一次typecheck/lint通过；初建/默认关闭、12种callback边界、60步完整状态通过。导航对照将来自A/B不同bundle的Vector2实例直接deepStrictEqual，因原型身份不同失败（不应比较两个模块的类身份）。只把返回速度投影为精确x/y数值并分别验证其本臂原型及是否借用desired；无生产变化/无容差。原始日志保留。定向只重跑导航项及此前被门闩阻止、从未执行的ABBA；另3项通过证据仅在A/B bundle和冻结图hash完全一致时复用。

## 最终处置
唯一ABBA整步−3.075%/+30.937%，第二组未达预定门槛。已hash核对后精确回撤两处生产文件；完整725模块before基底一致。仅历史冻结候选/测试/文档保留。没有运行已被性能门槛阻止的浏览器场景，不启用或发布本候选。详见同日result文档。
