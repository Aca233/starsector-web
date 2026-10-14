# Rust 相位锚点真实被动钩子方案

目标是迁移已有已授权相位锚点，使配置该插件的相位舰保持相同潜航性能和致命伤害逃生流程。来源见同日phase-anchor-source-notes；原版0.98a-RC8的全场一次、部署CR事件、潜航×2和紧急渐隐均有API源码支持。原版实机浮字/jitter尚待核实，本块不增加UI或改舰船平衡。

范围包括typed安装state、真实hullDamage拦截、scene共享一次资格、HP1/额外CR损耗/退却state、系统真实deactivate、forced cloak与外部phase、增强modifier边沿、渐隐退场和声音顺序。排除未知自定义interceptor、UI、存档发布、生涯结算；现有pendingCombatCRLoss依然由上层战斗结算消费。根/子模块退场沿真实舰体关系递归。无新的玩家取舍。

操作与状态：玩家仍用现有盾切换。安装只将phaseActivationCost置0，不额外draw或激活。通常潜航且shieldState!=OUT启用耗散和三类射速/补弹×2，退出移除。真实正结构伤害门之后按安装顺序调用interceptor；非致命、资格已用、CR不足返回false；首次满足则scene.used=true、HP1、pendingCRLoss+=部署成本、retreating=true、所有system真实deactivate并清held、结构免伤、external phased；在此前未潜航时发出phase_activate声音，原当次损伤返回0。随后所有正结构损伤继续拦截。advance在原hullmod early位置、dt>0，dead/retreated不推进；progress+=dt*chargeUpDuration，forcedLevel=min(1,max(currentEffect,progress))；progress>=1首帧alpha-=dt、后续-=2dt，<=0真实递归retreatFromCombat。不启动任何死亡爆炸，不扣当前CR。

权威/失败：State与Encounter均Clone，可完整words诊断与snapshot；Body/ShipState仍唯一舰体资源所有者。独立owner以mandatory Services提供真实系统interrupt hook、当前assembly/system/external phased读数和递归retreat，禁止默认no-op或跳过共享动作。声音只在完整事务commit后投影，不消耗两RNG。陈旧generation、未安装、phase类型不合、未知服务/缺spec、非法数值失败并要求上层回滚所有state/舰体/scene/事件，不以事件代替HP/系统/退场动作。

实施顺序：来源/本方案→独立phase_anchor.rs完整state与真实Body adapter→actualTS installPhaseAnchor/advancePhaseAnchor/Ship.applyHullDamage/Shield.update集中Node+fresh无头Worker→root安装codec与ShipState.apply_hull、early、modifier/phase读取、scene恢复接线→生产完整可玩验收。root拥有共享lib/state/ship_state/system_owner/world_owner/protocol，不修改。测试Services实际用已存在System.interrupt/Shield.set_active/Flux.cancel_vent与实际pose清除且承认仅静态NONE-hook fixture；生产Services须运行真实onInterrupt，不可把测试限定当完整服务。

验收包含正常增强IN/ACTIVE/OUT、damage<、=、>HP、部署成本0与CR边界、双方scene竞争、现有phase静默激活、重复致命伤、系统deactivate、progress/alpha边界、actualforcedShield、真实退场位置/输入/vent/system、Clone恢复后资格保持、两RNG和全部真实规则字段严格；几何用既定max(1e-9,32EPS)。集中一次针对本块验证；失败定向修复。明确未做原版实机/UI比较及生产codec接线，不宣称fullBattleReady。

## 实际交付和集中验收

独立 `native/combat-core/src/phase_anchor.rs` 已完成State::install/before_hull/advance与Clone Encounter，mandatory Services没有默认实现。State::external_phase返回真实presence及alpha（不是视觉通知）；真实资源/系统/retreat写入同步Body。reserved runtime keys0xfffc0001/2按Vec顺序替换，保留明确定义掩码，不以总倍率绕过listener。install phase开启cost0，不消费RNG。

`node scripts/check-rust-phase-anchor-module.mjs` 在Node和fresh headless dedicated Chromium Worker均通过：每runtime36场景、791次完整比较、26次真正致命拦截、1次全Rust Clone恢复；253,993严格字段零差异、18,984几何字段最大差0。实际TS `installPhaseAnchor/advancePhaseAnchor/Ship.applyHullDamage/Shield.update/Ship.retreatFromCombat/ShipSystem.deactivate` 未替换；验证bundler只暴露private WeakMap供state观察。全部内部emergency/progress/alpha/vanishing/enhanced/externalphase、scene gate、modifier defined masks、pendingCR、HP、system timers/events、cloak/flux/pose/input/声音顺序有比较。scoped oxlint通过。结果 `artifacts/rust-combat-core-20261008/verification-phase-anchor/result.json`。

当前productionIntegrated/fullBattleReady仍false。harness admitted NONE slots执行实际System.interrupt，测试真正父/子树退场；生产shared Services须发所有真实onInterrupt/held动作，不能用这个NONE限定实现作为全系统service。root需在安装及apply_hull/early/完整phase读取/codec/recovery挂入State、scene与pendingCR，现独立文件不修改shared native，源码冻结期间未改任何native文件。原版实机floaty/jitter未验证。
