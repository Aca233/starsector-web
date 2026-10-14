# 相位锚点 Rust 迁移来源核对（待实施）

版本0.98a-RC8。仅核对已有Web相位锚点，不扩展玩法；此记录不是实现/验收通过。

`../decompiled/starfarer_api_source/com/fs/starfarer/api/impl/hullmods/PhaseAnchor.java:24–27,38–73` → 开启成本归零；双方同一次战斗共享紧急下潜资格，damage>=hull且CR>=部署成本才能拦截，HP保留1、计入舰队repairTracker的额外CR事件而不直接扣当前战斗CR → 当前 `src/engine/extensions/PhaseAnchor.ts:9–25` 同样使用encounterEffects/pendingCombatCRLoss、真实hullDamageInterceptors。实际迁移必须在唯一ShipState.apply_hull的正伤害资格门后同步执行，不能用倍率代替致命拦截，也不能各舰各保一条命。

`PhaseAnchor.java:76–148` → emergency期间retreating、阻止USE_SYSTEM、progress += amount*chargeUpDur、强制IN、结构免伤；原Fader每次至少advance一次、达到progress1后再次advance，渐隐移到(0,-1000000)；潜航且不chargedown时耗散/三类射速/三类弹药恢复×2，退出即移除；不增加系统弹药恢复 → 当前Web在 `PhaseAnchor.ts:27–48` 精确表达progress与首帧alpha-=dt、后续alpha-=2dt、真实retreatFromCombat、enhanced状态边沿。原版浮字/jitter未完整实现，不新增虚构视觉。

`PhaseAnchor.java:153–159,184–200` 与 `../starsector-core/data/hullmods/hull_mods.csv:80–84` → creation安装listener、before creation成本0、仅原生phase且与adaptive coils互斥 → Rust模板必须使用真实已安装资格及完整安装hook，而非所有phase默认享受。

共享接线合同：scene级一次性资格与每舰emergency/progress/alpha/vanishing/enhanced必须入Clone恢复；伤害被拦截同步HP1、pendingCRLoss、retreating、所有system真实deactivate、external phased/visualAlpha、HULL_DAMAGE=0；early hullmod阶段按源dt advance后才求当步live modifiers。退场必须递归子模块、clearInput、降盾、取消排散、所有system真实deactivate、归零速度并移动pose/previous，不可输出通知代替真实动作。两个声音按源顺序commit后播放，不消费combat/visual RNG。

验证方法待实施：actual installPhaseAnchor/advancePhaseAnchor/applyHullDamage，覆盖damage< / == / > HP、CR边界、双方竞争、0部署成本、已有phase/OUT、系统IN/ACTIVE/OUT取消、progress和alpha邻界、死亡/退场门、重复damage、恢复后再次伤害、两种RNG保持。UI未调整；无原版实机/截图验证，明确待核实。

2026-10-09 碰撞消费者最小对照：原版 `ShipAPI.java:336,391` 提供 isPhased/setPhased；`PhaseAnchor.java:98–109` 强制实际 phase cloak IN，并将结构伤害倍率置0。原版内核碰撞源码未由该公开 API 证明，原版实机仍待核实。当前 Web `Ship.ts:755–774` 完整 isCollisionless 由 parent/docked/retreated/shield/allSystems/external presence 和 runtime collisionDisabled 构成；炮弹 `ProjectileCollisionHandler.ts:181–184,208–216,549`、光束 `BeamSimulationHandler.ts:192–196`、船碰撞 `ShipCollisionSystem.ts:111`、小行星 `AsteroidSystem.ts:162–164` 都读取它。当前 Rust weapon_world 的 ship_query/beam candidates 与 terrain_owner::Host.read 只看 CombatShip 的局部 shield 状态，需要统一唯一 world.phase reader。验证在同次 lethal hook 后查询 parent/module、external alpha0 与 system phase gates，strict 决策和 RNG 不放宽；真实操作 UI 未改。
