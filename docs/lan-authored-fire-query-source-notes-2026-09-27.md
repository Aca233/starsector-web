# 自定义舰每舰发射前查询复用：实现前门槛（2026-09-27）

## 原版证据与不改变的行为
本机0.98a-RC8；再次读取 `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:236–268`（空间候选、阵营/可见性/角色、范围、提前量、射界、指定目标优先）与 `combat/systems/WeaponGroup.java:301–317`（逐武器AI、shouldFire、发射）。反编译类型异常不能直接移植。本轮保持Web现有“同舰瞄准后按挂点顺序发射”的行为，不称原版完全等价。不改UI、频率、精度、实体/效果数、过载保护；无桌面或原版实机验证。

## 新证据与范围选择
176实体冷启动采样中的ShipWeaponControlSystem占400.4ms/20.4%（短诊断且调用栈互有包含，不是稳态）。现有FireControlQueryRoster只在nativeThreatPhase成立才开启，且逐舰资格排除parentShip/sourceCarrier、多战术技能，因而三个真实自定义舰目录完全回退。
不延长根舰AI缓存至模块AI/Ship.update。Ship.update确实包含statusEffects.advance、舰装advance、技能时钟、运动/护盾/组件及发射；**system.dispatchEvents和advanceCombat在后续CombatShipStatusSystem执行**，纠正前文宽泛叙述。requestWeaponFire/发射能够改弹药、幅能和弹体；不能跨它们保留目标资格。

改为独占Worker专用、显式实验开关 `VITE_AI_AUTHORED_FIRE_QUERIES=true` 的发射前短事务。复用已有targets/blockers/preAim索引，仍在当前舰运动/系统/组件推进后重新资格检查，finally在发射前关闭。跨舰仅保留不可变配置/构造回调身份，不保留任何动态结果。

## 准入与回退
- 不替换旧nativeThreatPhase、compactForecast或原生通用资格，主线程/外部可变引擎不自动晋升。
- 独立技能读能力身份白名单（NONE、日蚀、敕令、大和炮、跃迁），不从stats-only或AI权限隐式扩展；同时分离上一候选的exact-AI集合。
- 审计四种定义的modifiers/passiveModifiers/isExecuting/moduleModifiers为纯读；父舰敕令可读模块弹药/幅能，但瞄准段不消耗这些状态。所有父舰/载机必须在当前名单中并逐舰通过同样资格。
- 多槽辅助链必须严格符合主槽→其它槽→防御，owner/定义匹配，防御无后继。每个begin重新校验，不把系统状态/链拓扑缓存成许可。
- 继续拒绝非空runtimeModifiers（包括紧急隔舱）、外部伤害/相位读钩子、拦截器、非原生装甲/护盾/过载回调、不受信射程定义；未知定义、额外辅助链、未观测父舰/载机回退。自定义状态效果advance在事务之前执行，安装的未知读钩子下一begin必须拒绝。
- 发射循环、角色过滤、精确几何、距离排序、tracker/RNG、弹药/幅能预算、模块手动输入不改。

## 固定验收（先于实现与测量）
1. 三舰176实体，真实模块/战机/轰炸机齐全；实际命中许可而非只有开关。
2. 跨事务目标存活、相位、可见性、阵营、父舰/载机/多技能状态刷新；关闭、名单替换/重排、未知回调和非空runtime回退。
3. 同源开关A/B，逐挂点目标、预瞄、开火决定与隐藏tracker/RNG一致；完整fixedUpdate状态逐步一致，覆盖技能、排散、模块脱离/隔舱回退。
4. 单次A-B-B-A，每臂30步热身+60步计时，根舰exact-threat开关两臂都true以隔离本改动。两个相邻配对各自shipsWeapons累计省时至少10%，完整fixedUpdate不恶化超过5%，四臂完整终态hash相等。保留JIT差异，不择优平均/重跑。
5. 集中一次全项目typecheck、改动lint、新合同；性能门槛通过后一次既有真实无头双浏览器房间检查，沿用旧冻结源码/完整CSS/资产，仅叠加本轮指定候选文件。176实体、20秒（普通+70ms压力）、800ms主机停顿ACK、重连、无过载及资产错误才算功能通过；源/资源漂移使运行无效。
6. 默认仍关闭，不提交/发布。浏览器失败或只取得离线收益不宣称端到端改善；即使单次候选房间成功，也不能替代完整延迟配对证据。
