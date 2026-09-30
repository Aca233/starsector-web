# 舰队掩护扫描局部标量：修改前对照（2026-09-26）

上一轮私有键布局缓存已否决并逐字恢复；当前重读AGENTS且只做后台单代理工作。本轮先查导航/威胁源码及历史实验：Phase34已有累计风险下界剪枝且未达其当时22舰性能门槛，不原样复活。另一已拒绝方案是舰对距离Map/Float64矩阵；本候选不创建这些结构，也不降低其历史门槛重标为成功。

## 原版证据和范围
原版0.98a-RC8 CombatEntityAPI.java:8–12、30提供位置/速度/朝向/碰撞半径；重新查看CombatFleetManagerAPI.java:74、80、87的部署、Waypoint、TaskManager接口及BasicEngineAI.java:16–65的航向/朝向分离。当前FleetTactics是显式Web启发式，不宣称其评分为完整原版AI。无UI/玩法/频率/精度/实体数量变更，原版实机/截图不操作。

## 当前热点与算法冗余
最新保存CPU诊断中distance self39.483/inclusive100.420ms/60tick，仅作定位，不是收益预测。covers的谓词在多个友舰上反复计算同一distance(ship,target)；nearest reduce在未换最优时反复计算distance(ship,best)，且相等判断再次计算两端。采用两个局部标量：本观察舰到已选目标的距离、当前最近掩护的距离。只有必要时懒计算，下一观察舰/下一plan调用重新开始。不缓存成对舰船表、不跨plan、不新增对象池，全部候选仍扫描，距离仍是原Vector2.distanceTo而非平方距离或近似。

## 所有权与回退
保留公共planFleetTactics的逐次live读取及所有回调顺序。CombatEngine仅在FireControlQueryRoster私有Worker登记时选择内部owned入口。owned入口仍要求全部输入ship通过既有hasOwnedFireControlReadHooks，运动查询与distanceTo保持原生，Math.hypot为核实过的原函数；不把普通公开对象或未知效果当只读。就绪摘要先按原方式构建，随后在该同步规划内准入；准入失败退回原算法。不跳过任何真实联机/火控校验；复用的是该只读域内已算过的距离值。

## 语义与验收
保留原候选/队伍/ID次序、精确距离和坐标参数顺序、NaN/Infinity、平局、评分/求和、隐藏敌人、手动控制/命令、RNG与返回完整计划。缓存NaN也是合法的只读数值，不与undefined未计算混同。第一次掩护无需距离，出现第二候选才计算当前最优距离；切换最优后保存原来已计算的候选数值。

冻结当前完整生产源，只改FleetTactics/CombatEngine；扩展既有combat-ai场景加载同realm旧planner比较全部FleetPlan，覆盖不同编队/顺序/重复ID/命令/失效/极值和直接公共回调路径。计数仅测试构建插入，用来验证确实少算距离，不进入正式性能。一次typecheck/改动lint/combat-ai；一次200舰150预热+180测量无插桩真实Host串行配对，保留完整显示/权威/隐藏火控/RNG对照。要求模拟与完整交付均值降低、各多数分段改善且交付P95不增才保留；失败逐字撤回，不重采择优。

## 集中验证

实际准入同时检查hypot/max/min/abs/atan2/sin/cos七种Math仍为核实的原生函数，替换任一种都保留原路径。一次TypeScript退出0（9906ms）、五处lint退出0（103ms）、完整combat-ai退出0（3831ms），53项foundation场景通过。专项354断言比较126份完整计划，117份获得准入；distance helper调用1621471→1290747，仅为操作数证据，不是速度。验证包括随机编队/三队/命令/手控、重复ID/隐藏/极值、跨调用变更、未知hook/替换运动/数学/距离回退、公共位置访问器与可变distance回调读序，以及CombatEngine两个生产入口的Worker选择。正式源图320模块，候选仅FleetTactics与CombatEngine，不插入计数。

## 测速前并发更新（未启动正式测量）

V1 preflight发现其他任务修改9个模块：CombatHudView、HullMods、LanShipProjection、ShipSystem、系统Registry和4个Gloriana内容模块。前置assert退出1，尚无任何性能样本。未覆盖这些改动；阅读新增passiveStatusText及舰装range/状态功能后，冻结candidate-current-sources.json并由其替换本轮两份修改前文件生成baseline-current-sources.json，两臂同为320模块且只差两份候选。V1、更新清单/差异与失败检查均保留。

既有combat-ai loader补充显式冻结源支持，定向lint两脚本与完整原场景复查通过（仍53项，专项结果相同），未再次typecheck、未改生产候选。正式测量只使用这份已复查的V2图；后续其他任务可继续编辑，不混入任一测量臂，若自己的两个候选文件漂移则仍停止。不能把其他任务的新舰装完整交付视为本轮验收。

## 最终验收

唯一正式配对：模拟均值−3.977%，交付均值−0.989%，但交付P95 +0.050ms（+0.07134%），未通过预写P95不增门槛。已按候选SHA精确回退四份文件并归档helper，完整320模块与V2 baseline-current源图一致，9份并发更新及之前接受的导航优化保留。候选和所有正负结果均保存，不重抽样、不改门槛。详见fleet-cover-scalars-performance-2026-09-26.md。
