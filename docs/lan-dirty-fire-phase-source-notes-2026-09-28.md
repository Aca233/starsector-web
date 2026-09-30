# 增量火控资格区间：实施前对照（2026-09-28）

原版 0.98a-RC8 `decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:244–260` 保留阵营、角色、射程、提前量逐目标检查；`combat/systems/WeaponGroup.java:301–317` 为 AI → shouldFire → 武器 advance。此次不改这些决策、数学、实体数、60Hz、画质或权限；无 UI 变化，原版实机/UI 未验收。

当前 Web 在 ShipWeaponControlSystem 的运动/护盾/repair 后开启 fire query batch，aim/preAim/decide 后 finally 关闭，再 emission。旧 authored 全舰重审候选已失败，不恢复旧候选。上一轮只读影子 3,682,614 行资格一致，strict（拒绝非空 runtime）已经覆盖，因此本轮不引入 data-only runtime 许可。

独立 `VITE_LAN_DIRTY_FIRE_PHASE` 默认关闭。只在已登记私有 Worker 的原生舰船更新区间使用，初始描述符/读者审计；五个系统定义独立注册身份许可（NONE/Eclipse/Edict/Yamato/Jump），未知定义不靠 ID 冒充。父舰与载机完整连通组在 writer 前后标脏；每舰发射前只重审脏组资格，实际目标、几何、挡线数据仍每舰新事务。不同名单（含同长替换/重排）、关系变化、陌生 world、未知 writer/read/budget callback、重入/异常终止整个区间。预算审计包括 canOmitUncontestedPenalty getter、needsDetailedPenalty、estimate、penalty、eligible；不只审计旧二方法。

写集备份见 artifacts/lan-dirty-fire-phase-20260928/before.json；不修改 ShipSystem，不启动其他实验、不暂存/发布。实现后一次集中 typecheck/lint，合同测试含真实 host init/reinit/default、依赖组/动态拒绝、未知方法/回调、异常、60 步技能/交火/排散/模块低血以及自然完整状态。通过后唯一完整 ABBA：两热配对各至少 3%，冷回退各不超过 3%，init 增量不超过 max(10ms,10%)；失败精确撤回，不重挑成绩。若通过才进入生产式浏览器检查。所有 Node 数据仅为离线性能/一致性证据，不是联机通过。
