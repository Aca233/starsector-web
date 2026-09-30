# 自动驾驶单舰入口按队规划：修改前对照（2026-09-26）

## 来源与实际调用关系

上轮WASM数值内核已否决并精确回退。本轮检查原版0.98a-RC8 ShipAPI.java:227 getShipAI，以及CombatEntityAPI.java:8/9/30实时位置/速度/半径；原版API不是Web启发式证明。保持现有Web算法，不改原版机制/画面；未操作原版可见实机。

CombatControl.applyCombatControlSample先调用engine.updateShipAI(playerAI)，该方法没有传fleetPlan时会调用**完整**planFleetTactics。随后fixedUpdate在真实effects/visibility/EW之后另行调用planFleetAI，这是不同阶段，不能缓存复用旧计划。CapitalShipAI.update只读本舰assignment；TacticalPositioning.chooseCombatVelocity还会读sameTeam盟友的targetId，所以不能只计算本舰或只给一个assignment。其它队伍的计划在这个单舰入口不被原生AI读取。

FleetTactics每队danger/claims/previous/目标评分/掩护/approach lanes均独立；唯一共享输出是按ship.id写入的Map。因此全名单ID重复必须回完整路径，不能让省略队伍改变跨队同ID覆盖结果。所有ships仍参加readiness和本队的可见敌人/影响力计算，所有本队自主舰完整算分/承诺/进路，不减少实际参与交战的实体。

## 候选与准入

新增内部planOwnedFleetTeam入口，仅由Worker拥有权+原生CapitalShipAI.update且未传计划的补充调用使用。正常planFleetAI、Owner发布/验证和已有传入计划保持原完整入口。每次规划先执行原readiness，再检查原生数学/向量/可见性原型、live hooks、有限整数队号、唯一ID；未满足或小场景回原完整计算。public入口全部原读序；非原生AI回完整Map，不能把部分Map交给可能读取其它队伍的可执行扩展。

不跨帧/阶段缓存，不减少AI频率/精度、字段/舰船或任何权威校验。不复活WASM、舰对矩阵/掩护缓存或显示dirty journal。节省的只是单舰入口未消费的其它队规划，后续实际舰队AI仍全部执行。

## 验证与先验门槛

扩展既有combat-ai：冻结旧planner同realm全图对照，新队计划须与旧完整Map按唯一ID/队号筛选结果完全一致，保持盟友航线目标；多队/命令/玩家转换/不活动舰/手动舰/重复ID/特殊队号/public getter及hook回退，测试插桩验证真实原生单舰入口只生成本队、正常舰队和自定义AI仍拿完整Map。正式两次200舰150预热180测量、六排列、serial/before同码控制；相对差异按轮等权。门槛写入performance-gate.json，不根据结果修改或反复重测。
