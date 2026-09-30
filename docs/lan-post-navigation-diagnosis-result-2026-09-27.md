# 当前基底热点归因（2026-09-27）
一次Node Inspector 1ms采样，150热身+120完整fixedUpdate。固定真实三舰176初始实体734挂点，三个保留实验开启；完整725模块与导航轮A基底一致。只在冻结诊断副本包装两个调用点，没有生产修改。

3369样本，总5373.306ms，其中fixedUpdate inclusive 5116.928ms。diagnoseModuleAI inclusive1287.709ms（fixedUpdate的25.17%）；根舰循环有明确wrapper标签的667.403ms。另有直接fixedUpdate→updateShipAI调用链，**不把有标签根舰耗时当所有根舰AI总量，也不推断无标签调用来源**。

assessThreats inclusive1358.768ms，其中有标签模块分支793.649ms；ShipWeaponControlSystem.update主Ship.update分支1269.924ms。combatWeaponRange inclusive574.646ms，resolveWeaponRange self228.777ms，combineSystemModifiers self271.923ms；get isPhased同名函数合计inclusive263.810ms，allSystems self91.785ms，GC115.567ms。嵌套inclusive桶不可相加；采样和wrapper有开销，不是性能对照/稳态浏览器Hz或输入P95。

四舰系中170实体有0或1战术槽，6休伯利安有2槽；已有单槽LAN接线、数组/能力缓存候选已否决，不能用该分布原样重开。下一方向：武器六个scalar getter只需要一个字段，但每次modifiers都可能组合整套普通+三类武器字段。审计原组合次序后尝试仅组合所需标量，无跨调用缓存；与此前最大航速标量公式候选不同。

终态活跃名单171，完整权威+隐藏RNG hash 60469c9c42c5d3674b1c281a867ef027621588cc45718b5770079460eaf01e52。工件artifacts/lan-post-navigation-diagnosis-20260927/summary.json、simulation.cpuprofile、roster-and-state.json、manifest.json。
