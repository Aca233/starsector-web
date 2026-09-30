# 封闭AI写入区间的成员名单复用（2026-09-28）

## 来源和真实问题
- 原版API只读证据：../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEngineAPI.java:50 getShips、63 removeEntity、460 addEntity。实体名单可以改变，不能跨任意更新或公开扩展调用保存旧名单。本轮不修改玩法/UI，原版实机未验。
- 当前CombatEngine.ships每次展开capitalShips→assemblyShips，再连接fighters/bombers/drones并过滤撤退；updateShipAI通常重复取findHostile与scene名单。旧nativeThreatPhase已有复用，自定义三舰在独立exact/interleaved分支却仍走反复展开。
- 现有profile simulateStage get ships inclusive约5.06%，其下含combatShips/assemblyShips，不能相加，也不是保证收益。此轮复用既有profile定位，不为此重采。当前已加入其它任务的Adun代码，基线重新冻结，不复用上轮740图作当前源。
- 已审计当前Ship.update/CombatEngine/CombatDeployment：部署/新舰/翼队/无人机与技能世界事件在两个区间外推进；原生navigateRetreat可能改变成员。因此交错段遇到任何初始retreating，或当前舰开始retreating，名单快路径立即失效并不在本区间重开。

## 边界与写集
仅WeaponThreatEnvelope.ts、CombatEngine.ts。新增VITE_LAN_OWNED_PHASE_ROSTERS，默认关闭；依赖已经通过资格的exact根AI或owned-interleaved threat span。只暴露该span已持有实体的原有有序数组，不缓存敌我/存亡/距离/相位/命中结果；未知钩子继续原路径。
- 根AI只传复用成员表，不顺带启用旧native forecast、HostileQueryBatch、导航/光束/友军索引。
- 交错段继承已有逐舰hasOwnedLocalThreatUpdate检查和finally失效；撤退直接停止名单复用。模块AI、MANUAL锁敌和findHostile使用同一有效名单；武器世界、弹体/光束列表仍走现有live路径。
- 普通引擎/公共factory不能从此获得Worker所有权，原getter继续返回新数组；不改变HUD、packet、精度、Hz、实体/效果数、过载保护。
- 除写集外保留全部并发工作。不提交、推送、发布。失败前按完整写集绝对路径/candidate/before SHA归档后仅恢复两文件。

## 集中验证
先一次typecheck、两文件lint，既有三舰176实体734挂点场景。独立真实before/after/default关闭bundle；计数用额外probe bundle，绝不混入性能bundle。
- 实际root/module AI名单逐调用与即时engine.ships成员/顺序相同，且get ships实际调用数下降，默认关闭计数相同。
- factory生命周期/close、原始顺序、技能依赖保持；撤退、未知status writer、引擎方法覆盖、异常finally与重建回退。
- 60完整固定步技能/近距交火/排散/低血模块逐步authority及隐藏RNG/autofire一致。默认关闭另做自然场景对照。
- 只对具体失败修复/复查，不跑退休fixture阻断的整套suite。动态名单与引用规则不是仅比击杀数。

## 唯一无插桩ABBA（事前固定）
A0/B1/B2/A3独立隐藏Node，固定同一个绝对node.exe；150完整fixedUpdate热身/120热步，两玩家+20AI三舰混编、seed917、3200DP、固定1/60。四项已有模拟实验两边相同开启，只新flag不同。场景和所有测量输入冻结。
- 两对热段完整fixedUpdate均值各至少节省3%；冷150步各不得回退超过3%；初始化回退不得超过max(5ms,基底10%)。
- 20/270步完整authority+隐藏tracker/RNG、资产SHA、实体/挂点初始数量一致。
- 单个唯一ABBA目录，禁止择优重测或事后改门槛；读取passesPrescribedGate，不以进程exit0代替通过。实际输入/网络/渲染延迟不由离线结果证明。
- 只保护实际打包输入/工具/资产；目录中不被入口导入的新增文件不自动混入运行。测试末尾记录当前源码漂移；若相关源已被其它任务改动，不自动晋升默认。
