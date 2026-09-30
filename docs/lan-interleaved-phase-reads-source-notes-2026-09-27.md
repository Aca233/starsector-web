# 交错写入依赖组隔离的相位读取复用：实施前（2026-09-27）

## 原版证据 → 不变语义
本机0.98a-RC8；再次读取../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/Ship.java:5006实时phased，以及API impl/combat/PhaseCloakStats.java:407–415的IN/ACTIVE/OUT即时变化。缓存不得跨任意可能影响状态的写入。无UI变化、不操作桌面、未做新的原版实机验证。

## 诊断与区别
20步源码内计数1692701次allSystems，1327052次归于相位查询；不是耗时证明。旧LAN owned-phase接线、静态非相位能力缓存、单舰预瞄资格/几何索引均已否决，本轮不恢复这些实现、不择优重测。
新方案借用已保留的owned-interleaved writer认证及parent/sourceCarrier连通组：只复用其它静止依赖组的实时isPhased结果；当前正在更新的整组始终执行原getter。不同于仅减少数组分配，也不同于固定步快照或资格缓存。

## 生命周期与边界
- 新VITE_AI_INTERLEAVED_PHASE_READS默认关闭，必须已有VITE_AI_INTERLEAVED_THREATS通过全部闭合Worker/原生更新/无未知效果资格才可开启。普通引擎与exact-AI-only工厂不授权。
- 每次完整fixedUpdate建立新scope；每舰更新前清空整组并标记writing，模块AI及ship.update期间该组不读写缓存。结束后重新审核组内各成员hasOwnedLocalThreatUpdate；不再纯读则关闭整个scope，不能恢复已失效许可。
- 未知writer、未知依赖、重入scope、异常/finally一律关闭。关闭后不保留到fighter/status/collision/dispatch阶段；miss抛异常不记录结果。父舰相位递归服从同组writing屏障。
- 只缓存boolean相位结果，不缓存成员资格、目标、几何、命中、弹药/幅能、RNG，不省略角色/距离/射界/碰撞/权威校验，不改60Hz、精度、实体、画质或过载保护。
- 闭合realm已有身份契约，不冒充任意同realm prototype monkeypatch的安全沙箱。测试未知外部相位回调、status/interceptor/armor/flux/advance等资格丢失时保持回退。

## 预先规定的验收
完整实现后集中一次typecheck、四生产文件+测试lint、相关差分合同；资格/默认关闭、依赖组在写入前与后失效、当前写组动态状态/多技能/父舰/载机、未知效果与异常、重入与finally、实际20步减少live getter次数但无计时声明；60个完整步authority+隐藏tracker/RNG逐步一致，技能/排散/近距开火/封舱场景不减。
唯一独立隐藏Node ABBA，A0/B1/B2/A3，每臂150热身+120完整fixedUpdate，2玩家+20AI三舰循环seed917/3200DP，176实体734挂点。两臂原四实验全开，只改变本候选；两组分别至少省3%、四终态完全一致才保留。不重跑择优、不降低门槛。
离线通过才沿用既有冻结资产/源码的双无头浏览器实际176实体场景做一次功能验收。浏览器若仍过载，不宣称联机可玩或输入P95改善；候选保持默认关闭。失败核对写集SHA后精确恢复备份，保留所有证据与其它改动。不提交、推送、打包或发布。

最终：六项行为合同经两处测试工具定向修正后通过，生产候选字节不变。首次且唯一ABBA两组慢1.0805%/0.1846%，未过门槛；四文件候选归档，726模块基底精确恢复，不跑浏览器。完整依据见同名前缀result文档。
