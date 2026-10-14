# 引力进入共享战斗事务

2026-10-08；继续用户已批准的 Rust/Wasm 全战斗迁移，不改变玩家规则。独立 gravity_world/owner 的通过仍不能代表共享内核或生产可玩。

## 目标、体验、范围和操作

现有 F 区域操纵、按住与松开、右键推送、G 排斥、左键牵引、自牵、释放和历史技能保持原样。区域自然到期按既有费用与预警自动坍缩；中断只收场。牵引武器不能再发射普通假弹体。已接受输入使用同一个常驻生命周期，伤害、捕获、幅能、地形速度及反馈在完整事务中生效。失败不提交部分状态；暂停不推进时间/RNG。界面布局和当前输入流程沿生产 readiness 方案，无新 UI 或待决定的产品取舍。

本块负责一次静态配置、生命周期更新与逐槽事件分发、武器牵引、fields→damage→managed wreck 碰撞的原序、实际世界视觉/统计和只读发布。完整舰载机、AI、部署/结算/恢复/网络按既有并行工作继续；不发布生涯内容、不操作桌面。

## 原版依据、当前差异与核验

版本 0.98a-RC8；已读 `../decompiled/starfarer_api_source/com/fs/starfarer/api/impl/combat/GravityPullEffect.java:33–91`：暂停跳过、真实质量和半径产生速度外力。Web 多对象捕获/区域坍缩是已授权扩展，保持现有实现，不称原版玩法。

源和独立证据引用 gravity-owner-plan、gravity-world-plan。重新核实 `Ship.ts:937–1040`（全部系统更新后战备/取消/费用），`CombatEngine.ts:1150–1175`（nebula→status→fields→damage→gravity terrain→asteroid/pair），`GravitySystems.ts`（九类字段/自动坍缩/held），`GravityTerrain.ts:11–98`（实际 polygon、shield 最深接触、assembly 质量/即时同步/伤害）。当前 shared 缺引力模块、generic update 会丢失 expire hook、collapse view 恒 false、普通武器会重复发射、两套 terrain 未同步、floating 没调用真实工厂。核验采用真实 TS 和共享 Wasm 持续步，资源/RNG/决策严格；几何仅用户批准的 1e-9/32EPS。原版画面及实机无证据且禁止桌面，明确待核实。

## 权威、并发、状态与失败

world 保存引力 metadata 和固定 spec；唯一 lifecycle 仍是 ShipState.systems。一次安装从实际 terrain ship metadata 接上 mass/name/module 原序；环境 float ID 通过常驻独立 handle 映射，不能转整型丢身份。共享 terrain 是唯一位置权威，引力每个 barrier 只在 Rust 内部 hydrate 当前实体并立即写回。已消失的对象保留不复用 handle。实际视觉工厂必须在命中边界消费 RNG，不能到最后批量消费。同步伤害沿真实 ShipState 拦截/修复/root void；死亡仍最后原序 sweep。

引力 slot 更新替代该槽 generic update；非引力仍原序。allSystems dispatch 每槽回写后才读下一槽。捕获保留 original source、真实 source/team/targets/guidance 和 outgoing=1。held/cancel/death/retreat/reset 同时清 runtime；暂停允许接受原有输入但不推进。任何 stale/spec/Host 错误回滚整个 bodies/ordnance/world/RNG/events。客户机只消费发布，不取得直接伤害 API。存档没有生涯 schema 改动；同构建恢复必须含完整 metadata，不能把只读发布冒充 checkpoint。

## 依赖、实施和验收

1. 已完成来源核实与本策划；接线时先加入 gravity 模块及静态 metadata/命令和完整性校验。
2. 拆出 prepare 内部时钟/逐系统/readiness 屏障，低层旧调用仍复用同序；加入 custom update、原序 dispatch 和实际 collapse view。
3. 在 fire 之前提交真实牵引，阻止对应 ordinary emission；status 后 fields→damage→managed terrain，真实 visual/stat callbacks，单一 terrain 同步。
4. 一次共享 build、类型检查及实际 TS Node/fresh Worker 联合场景；按具体失败定向修复。保持已过域不重复全套；新共用生命周期变化需相关系统最少复查。

验收必须包含 BattleWell 到期坍缩费用/预警/维护停止、左右 held/松开/中断、tractor 不生成普通弹、真实捕获与导弹源重绑定、盾/装甲/组件/root void 与浮字两 RNG、managed wreck 真实薄多边形与 module 同步、失败整步回滚。本块完成后继续生产入口，不停止于此。原版实机和完整生产游玩结果分开记录。

## 进展

2026-10-09：共享 metadata94–103、单一生命周期 prepare/dispatch、真实query后的tractor、fields→damage→managed terrain、death/retreat interrupt以及world只读发布均已接线。实际TS Node/全新无头Worker各9场194步，61,706严格字段、2,436几何字段，max0；包含真正三实体装配、自动/手动坍缩、盾/装甲潮汐、自牵、左右松开、rollback与暂停发布。shared wasm1,175,974bytes，SHA25610c3c4c512d3eb4cdc7e6dcff539c7570363e326099fc49baa8f7a232f151e0c。结果verification-p2-gravity-runtime/result.json。

集中失败均已定位：fixture零幅能速度额外50应读实际hullStats，不给Rust重复加成；暂停是无step发布，不调用低层step(0)；terrain particle output允许唯一非实体source=(0,0)并仍拒绝其它零generation。未放宽几何或规则合同。类型检查通过；受影响system-owner与world-owner真实Node/Worker复查通过。

尚待生产页七包完整场景包含弹体捕获与导弹源重绑定、root void以及managed wreck的整体组合（独立域已验，不能声称本9场覆盖）；fullBattleReady=0，生产仍TS，未测整场提速。继续aux/phase/flight/AI和生产authority/UI/恢复，不止于此。
