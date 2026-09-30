# 私有Worker预瞄候选范围：修改前对照（2026-09-25）

## 为什么不是重开旧失败方案

上一块行写出优化已实测否决并精确恢复；编码微调停止。本轮重新读FireControlQueryBatch、Ship.update、ShipWeaponControlSystem、AutofireController以及2026-09-24预瞄范围树失败证据。旧实验同时修正ArmorGrid全反射资格并建立层次树，综合模拟成本反而更高。此后已验证的Worker所有权入口已经启用当前事务，单独降低资格成本；当前默认200舰batch不再始终回退。因此这里只针对已经存在的Worker事务测试新的轻量候选结构，不修改/降低任何资格门槛，也不恢复旧树或旧ArmorGrid资格修正。

本机原版0.98a-RC8的API/配置沿用本轮刚重新读取的CombatEntityAPI.java:16–20、settings.json:8–9；机制边界与原版fire-control来源见worker-fire-query-source-notes-2026-09-25.md。预瞄是Web已有追踪逻辑，本轮保持其射程1.5倍率、指定目标优先、最近有效目标与严格平局顺序，不宣称原版实机/UI已验证。

## 已核对的读写域

CombatEngine.ts:787起已有nativeThreatPhase、combatEffects、方法/名单getter门槛。FireControlQueryRoster.begin仍在每舰运动/系统/组件维修后，对全名单调用hasOwnedFireControlReadHooks；statusEffects/hullmod advance可改变后续舰船，所以不能跨舰省略检查。ShipWeaponControlSystem.ts:291–402的batch只覆盖aim/decide/preAim，finally在发射与幅能消耗前关闭。未知回调、runtimeModifiers、父舰/舰载来源等回退规则全部保留。

仅该Worker标记继续向batch私有字段传递。普通可变引擎/公开对象即使获得原有batch也不会建立新索引。新索引读取当前事务中的目标位置、速度和当前获取半径，不跨batch/舰船/tick复用；不改变火控目标资格、canTarget、拦截/射界/碰撞、RNG、发射频率或普通调用读取顺序。

## 候选与保守包含关系

只优化preAim后备名单；指定目标先执行原track，不修改aim正式目标扫描。首次预瞄后备查询仍返回原名单，重复查询且目标>=32才建轻量索引。按位置跨度较大的轴排序，保存原序号和两轴位置；全名单的半径上界与两轴速度极值用于复用现有outsideAcquisition的保守获取范围公式。每次查询二分出轴窗口，再按另一轴保守过滤；结果按原序号恢复，密集候选直接回原名单。不为每个叶子构建树节点/堆栈。

获取半径必须是collisionRadius与ACTIVE shield radius+shieldCenterOffset的最大值，包括护盾正在展开但arc尚未覆盖的情况；不能换成碰撞contact extent。速度用相对速度L1上界，horizon=delay+(beam?0:(range+maxRadius)/speed)，range/speed/delay与坐标/速度/半径不确定时全名单回退。统一padding至少覆盖每个旧谓词padding；对边界宁可多保留。剩余候选仍执行全部原资格和精确预瞄。

## 验收计划

冻结当前301模块基线及2个修改前文件。扩展既有combat-ai场景：数学包含性/原序、边界和非有限、高速向内、偏置/展开护盾；真实100舰Worker资格、普通引擎与关闭/名单变化/下个batch状态刷新；与冻结旧AutofireController同类模块图比较preAim、aim、decide和完整tracker/RNG。一次类型/改动lint/该既有场景后，真实200 Onslaught/seed917/150预热+180测量tick配对，不开profiler、不择优重跑。有净收益才保留；否则精确撤回本候选而非既有优化。若需要生产激活计数，仅独立极短探针且不把其计时当性能。

## 集中检查与修正记录

一次类型/7个改动代码文件oxlint通过，既有combat-ai前46场景通过；新增数学场景首次因测试假盾心函数用了原地Vector2.add而移动目标失败。原生getShieldCenter返回新向量，不存在该测试副作用；只将夹具改成clone().add，未改生产算法或放宽包含性断言。定向helper复查19351断言/1152查询，其中776次实际缩小候选；8个真实Worker资格batch中5个缩小名单，104挂点/阶段的aim、preAim、decide与完整tracker/RNG同旧控制器相等。原日志保留。

纯度复核：NativeAim只对clone后的相对位置/速度计算；ShipWeaponControlSystem的当前batch中仅写挂点角度、追踪器、请求集合，发射/实际幅能在finally.close之后。保守证明用全名单半径/相对速度非负上界：limit、horizon、reach对这些上界均单调，统一padding不小于每个旧谓词的padding；筛掉的任一轴差若超过统一bound，旧outsideAcquisition也必然拒绝。坐标比较直接用entry-origin，避免origin±bound的抵消误差。

真实Worker性能冻结源图301→302模块：只修改AutofireController、FireControlQueryBatch，新增PreAimRangeIndex；已有其余299模块不变。

## 激活诊断（不用于性能）

第一轮无profiler完整性能为模拟均值−0.13%、交付均值+0.91%，未证明收益。随后3tick冷启动激活探针发现build/query均为0，不能把这组性能直接当作索引内核加速/退化。新增测试构建计数：preAimTargets调用次数、Worker资格及可见敌舰名单大小分桶（0、1–7、8–15、16–31、32–63、64+），用150tick预热+3tick探针确认测量阶段的真实覆盖，保持生产源码不变。此诊断不是重跑性能找有利结果。


预热探针确认前153tick有298043次Worker预瞄后备调用，全部有效目标数处于16–31区间，最大27，索引build/query一直为0。32门槛确实错过真实工作负载。因此按实际候选规模调整为16（仍需重复查询），追加真实100舰资格下15/16/27敌舰边界测试；这是激活覆盖失败后的实质候选修正，不把32门槛性能记录覆盖或拿不同版本择优。先短探针确认激活，再对最终精确源码重做完整路径验收。

## 最终状态

16门槛的最终真实Worker模拟均值−2.14%、p95−4.73%；交付均值仅−0.48%。保留小幅模拟优化，不宣称整体延迟大幅改善或60Hz完成。最终3tick探针594索引/5295查询；启动/恢复批次及完整状态对照通过。完整性能、未激活版本记录和解释界限见同日performance文档，最终302模块hash与实测源图相同。
