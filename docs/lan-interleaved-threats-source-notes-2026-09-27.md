# 模块交错段精确威胁包络（实现前，2026-09-27）

## 原版和当前证据
本机0.98a-RC8；重新读取 ../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/Ship.java:1813–1847：advance先推进监听器，不能假定更新只是位置变化。反编译有类型异常，不照搬。本候选不改玩法、顺序、UI、精度、实体数量、刷新频率或过载保护。没有原版实机/视觉验证许可。

最近完整热负载采样中，有标签模块AI inclusive 1287.709ms，其中assessThreats 793.649ms；采样不是A/B性能。根AI包络已在finally关闭。目标是另建独立模块交错包络，不延长根AI生命周期、不扩大旧nativeThreatPhase/compactForecast许可。

## 写入域审计与资格
- CombatEngine.fixedUpdate模块AI→navigateRetreat→Ship.update串行；随后才进入fighter/status/collision。status阶段才dispatchEvents/onAdvance/advanceCombat。本段生成新弹体、增加或改写beam，故它们仍实时读取，绝不共享旧弹体/beam索引。
- Ship.update: statusEffects.advance任意callback，必须为空。hullDamageInterceptors任意callback，必须为空。ArmorGrid三个回调和FluxTracker.onOverloadStarted必须为构造时记录身份。未知伤害/相位/range/system AI读者由独立exact读资格拒绝。仅私有structured-clone Worker所有权允许；不是抵御同realm任意monkeypatch的安全边界。
- ShipSystem.update只推进自身阶段/排队事件，不dispatch。系统定义必须属于已审计exactAI+nativeStats。combatSkills.advance只写本舰HP/私有WeakMap。原生故障伤害、ComponentDamage写本舰/组件；voidShieldContact可写assemblyRoot，必须失效整依赖组。
- HullMods独立定义身份许可：无advance且原有纯range许可的定义；两种导弹补弹advance；Gloriana原生注册副本的bulkheads.advance。bulkheads只写本舰flux/runtime/私有WeakMap。不是按字符串ID接受外部定义。phase_anchor（共享encounterEffects及拦截器）、escort_package、shield_always_on暂不纳入；未知advance关闭整段。
- 相位Shield的private raisePhaseFlux存在回调；本候选保守拒绝PHASE防御，不扩大其许可。非相位Shield.update不触发此回调。
- retreatFromCombat只改本舰及childModules；已审计路径不更改parent/sourceCarrier/child拓扑、不增减实体。parent/sourceCarrier连通组覆盖依赖。每次AI后、ship.update后失效整组；每次更新前重新确认写入门槛。资格丢失立即close，当前及后续均回到无复用路径，finally无条件close。
- 包络仅含range/DPS/motion/muzzle，per-mount浮点/顺序/ETA保持；当前ships每次照常动态取得，退出战场不继续出现在威胁名单。没有snapshot数组跨段替代roster。

## 实施和预注册验收
新增 VITE_AI_INTERLEAVED_THREATS 显式实验开关，默认关闭。四生产文件写集已存before字节。先完成整块，再一次typecheck、改动lint、以下差分合同：实际176实体734挂点，初始化/重建/default关；依赖组失效、退场、近距开火/新beam弹体、技能/排散/低CR/封舱；status/interceptor/armor/flux/未知advance与AI回退；异常finally关闭；逐步完整authority及隐藏autofire/RNG状态。

性能仅一次顺序独立隐藏Node进程A-B-B-A，各臂150热身+120计时完整fixedUpdate，真实2玩家+20AI三舰循环、seed917、3200DP。两组分别至少省3%且状态完全一致才保留；不重测择优、不改门槛。离线合格才跑现有176实体D3D11 1280×720浏览器（10s普通+10s输入后70ms忙任务、800ms停顿ACK、同局重连）；不能把Node速度冒充Hz/P95收益。失败候选核对全部目标hash后按before字节撤回，保留证据。

实现后首轮typecheck发现moduleAI实际为WeakMap，不能values枚举；改为沿当前combatShips逐船get身份核验（不重建、保留原集合）。lint通过，尚未执行合同/计时。保留首版冻结与日志，修复后建立v2冻结。

首轮五行为合同与唯一ABBA均通过（14.3346% / 9.7435%），但复核工件发现“projectile-beam”子场景实际0弹体/0光束，不能算覆盖。仅修复该非计时子场景，改用真实挂点fireWeapon发射并强制断言两类实时威胁及beam更新；定向重跑该合同，绝不重跑ABBA择优。当前冻结726模块（并行新增GlorianaSiegeHit和军械内容），A/B共用同一冻结，终态hash不同于旧基底，四臂仍严格相同。

最终裁决：保留第四个默认关闭实验。Node唯一ABBA过门槛，实时弹体/beam覆盖补验通过；真实浏览器仍主机过载、HUD等待超时，max observed snapshot tick32、176实体；无有效Hz/P95，ACK/重连未执行，cleanupCompleted=true。详情见同名前缀result文档。
