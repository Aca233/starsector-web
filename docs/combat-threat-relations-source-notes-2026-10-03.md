# 同舰体观测者的保守威胁候选关系（2026-10-03）

## 原版与实现边界
目标0.98a-RC8，本机 C:/starsector-core 与 C:/decompiled 不存在；原版源码、实机、相关截图待核实。本块等价重写现Web内部执行，不改UI、预测频率、目标分配、压力/火力策略、物理与防御规则，不冒充原版移植。

## 最小对照
- 证据：combat-low-level-logic-audit-2026-10-03.md；WeaponThreatKernel.forecastWeaponThreats 逐observer×source×mount，场景每步76完整预测、13177.767 source visits、6679.358 mount visits；其中模块角度评估94.925/步，root3638.542/步，总计3733.467/步（据原始分角色计数明确归属）。56模块仍是独立威胁观测者，不能复制母舰结果。
- 物理/分组依据：Ship.syncModulePose / updateMotion 已核实模块附着母舰；本块只读取parentShip own-data descriptor组织候选组，未知getter/关系环回退独立组，不调用新用户getter。分组不授予规则权限，任何组只要用所有成员捕获几何的保守并集，均不能漏掉成员的原候选。
- 当前差异：同一母舰及其模块重复扫描、排除相同来源与挂点。
- 预期：保持所有76观测者及原精确公式，每组从捕获数值准备一次source/mount候选关系，再由每个观测者独立精算。candidate以原source顺序/原mount顺序输出，ETA与伤害求和顺序不变。
- 保守界：组的中心AABB、最大radius/horizon、速度区间，取source与区间端点的最大L1相对速度。组到source origin的L∞最小距离是各原距离的下界；组approachReach是各原approachReach上界。仅沿原source/mount reach条件严格拒绝；扩大浮点slack并对NaN/Infinity失效开回完整路径。readiness>组最大horizon也不能产生合法ETA（travel非负；NaN最终不输出）。
- 生命周期：只在同一不可变WeaponThreatFrame捕获跨度准备；更大horizon直接用原kernel。standalone mutable packet默认仍原完整kernel；可选threat worker分区仍原精确kernel与install协议，不增加await/跨线程payload，不复制或持有未来决策。
- 回滚：VITE_COMBAT_THREAT_RELATIONS=false 保留原完整扫描。仅模块共享且规模适合的捕获帧启用，不用缩减参战对象伪造收益。

## 验证
完整实现后集中一次app类型检查、三个改动文件lint、既有standard heavy authority场景(seed917/2玩家+20AI/734mounts)：冻结上一块final默认为基线，同窗ABBA完整终态/RNG、最终270逐步快照/RNG、flag=false回退。数值候选与完整kernel直接对照，包括组内不同center/velocity/horizon、阵营、挂点顺序、readiness边界、大坐标、非有限值、更大horizon、unknown parent getter。工作次数和耗时分开取证，不把离线probe替代真实authority执行，不启动桌面/子代理/发布。


## 具体失败后收紧（编码/验收轮）
初版把母舰和模块合并同组，逻辑/270逐步/数值边界通过，但准备+精算挂点访问约11532.67/步，比原6679.36/步多72.7%。母舰的巨大半径/长vent horizon使模块组的上界过宽，不能拿总墙钟轻微下降当结构成功。冻结失败尝试于coarse-family-attempt，最终母舰与附属模块分cohort，单成员直接完整kernel，只共享同母舰模块间关系。重查这条实际失败路径的ABBA、270逐步+每真实observer行原kernel对照及总工作次数；不重复无关全套数值边界。
