# Rust 边沿命令与系统读取（P4 已授权）

目标是让浏览器和桌面共用 Rust/Wasm 权威后，当前七包仍可按既有操作正常游玩。暂停中的技能、盾、排散、模块接管、武器组及目标命令立即生效；HUD 从已完成的 Rust 状态读取，不运行 TS 规则、计时或 RNG。

本块只迁移既有行为，不调整键位、玩法、界面布局、舰装或生涯内容。原版 0.98a-RC8 的 `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipCommand.java` 核实 USE_SYSTEM、VENT_FLUX、TOGGLE_SHIELD_OR_PHASE_CLOAK、SELECT_GROUP、TOGGLE_AUTOFIRE、PULL_BACK_FIGHTERS 等命令类别。七包技能为已存在的 Web 扩展，不能标成原版规则。原版实际界面各态尚未实机补验；此次不改 UI。

源码对照：`CombatCommands.ts::dispatchShipCommand/shipCommandFailure` → 有限 aim 在普通失败检查前更新，模块按 assembly preorder 选择，武器组操作作用于 manualWeaponShip，目标按真实轮廓+50选敌，召回立即同步存活 assembly；`CombatControl.ts::applyCombatControlCommand` → facing 无效先拒绝，Hyperion 跃迁先对实际场上舰船及小行星检查落点，再 dispatch，接受后才覆盖 activationInput.facing；`Ship.ts::hullShieldFailureReason/ventFailureReason/startVenting` → 严格失败优先序、音效和 interruption；`ShipSystem.ts::activationFailureReason/isActive/fortressVisualLevel` → 同一个真实 reason 查询供命令和 HUD，辅助链 visual level 递归取最大。

状态文本与动态字段的来源是注册七包 `extensions/ship-systems/{EclipseProtocol,GlorianaEdict,HyperionSystems,AdunArkSystems,RocinanteSystems,ZhefengSystem,GravitySystems}.ts`、`GlorianaBuiltins.ts::glorianaBulkheadStatus`、`HyperionHullMods.ts::hyperionRepairStatus/hyperionReactorStatus`、`systems/ModulePropulsion.ts`。当前注册的 Hyperion Yamato 没有 isExecuting 回调，真实 isActive 为 lifecycleActive；`SystemWeaponLauncher.ts` 的另一个执行 WeakMap 未被当前注册使用，不伪造额外运行状态。`WeaponPresentation.ts/ShipPresentation.ts` setter 当前无生产调用，因此当前认证七包的 presentationRelativeAngle/presentationPose 明确 absent；若未来启用 setter，准入必须同时增添对应 Rust owner。

操作流程保持：UI 提交一个边沿命令和边沿 aim/facing → Core 克隆整个权威事务 → 校验 owner、ABI/padding/identity → 合法 gameplay failure 返回拒绝及文本（普通 dispatch 已写 aim 不撤销）→ 接受命令即时修改当前 authority → 不推进任何 simulation clock → 已完成 publication 返回所有动态状态。格式错、陈旧 identity 或内部 host 不完整中止整个事务；接受/拒绝及浮字随权威回执传播。LAN 重放使用相同命令，客户端读取回执，不重做规则。无存档格式变更。

独立实施顺序：一次性静态 HUD 查询 metadata（模块 slot 标签及 modulePropulsion 声明分母/reserve 参数）→ 共用只读 reason/status reader → tags160–164 命令 → 独立 system/mount/ship 动态 publication → 纯 TS encoder/decoder → root 接入全场 dispatcher、compiler、adapter、Worker。generated actor metadata 由实际 birth 模板追加，不能从 hull ID 猜标签或动力数值。

命令固定22 word payload，共用 `[action,value,aimState,aimX,aimY,facingState,facing,0…]`。aimState/facingState 为0 absent、1 finite、2 supplied-invalid（值须0，安全传输 source 的合法拒绝而不放过非有限 ABI）。160 action=system slot/value=0；161 action0defense/1hullShield/2vent；162 action=module index；163 action0select/1mode/2autofire、value=group index；164 action0recall/1target。只有跃迁使用 accepted finite facing，但所有 command 都遵循上层 facing invalid 先拒绝。

读取 metadata tags189 begin `[bodyCount]`；190 per actor `[order,labelUtf16Count,hasPropulsion,slotCount,reserveSpeed,reserveAcceleration,reserveTurn]`；191 label chunk `[offset,count,up to20 UTF16 codeunits]`；192 propulsion slot `[index,present,slot,generation]`，absent 不省略声明分母；193 finalize。190–192 row owner 为实际 actor，begin/finalize为anchor。独立 Owned 可 clone，生成 actor 用 admit。

独立 publication `[version=1,recordCount,tag,width,payload…]`，tag1 system（body ID/systemId、isActive、optional UTF16 reason/status/passive、fortress/pulse、引力/跃迁 presence及完整动态）；tag2 mount（body/component、presentation angle presence、tractor/deflection完整 presence）；tag3 ship（body、presentationPose presence、teleportCameraOffset presence）。几何字段只按批准容差；presence、字段顺序、文本、目标、资源、RNG、计时和决策严格。

验收只集中一次：实际 source oracle 覆盖暂停技能/盾/vent、有效/拒绝 target、模块/组/召回、jump geometry/facing、重入 cursor hold、所有注册技能状态及引力完整 presence；读取前后 authority 与 RNG 不变，malformed/stale事务回滚。运行实际 native compile、相关 TS 类型/lint。完整整场/玩家流程由 root 验收，本域通过不能称可游玩完成。

当前待核实：原版实机 UI 仍待用户允许桌面操作；该事项不阻塞无 UI 变更的已授权迁移。当前没有新的玩家行为取舍。

## 同一授权范围的战术/部署回执补齐

实际源码 `TacticalControl.ts::applyTacticalCommand/applyTacticalViewCommand`、`DeploymentControl.ts::applyPreparedDeployment`、`CombatDeployment.ts::reason/requestRetreat`、`CombatEngine.ts::setSimulationPointLimit/issueOrder/issueEscortGroup` 已核对。当前 tags155–159 把选中已退场友舰、指挥点不足、后备队部署点不足、撤退资格等普通拒绝转换为 Err8，会中断 Worker；应保持具体 source reason、不推进时钟，只有 ABI、陈旧 handle 或内部状态不完整才中止整包事务。close/select 在 battleResult 后仍允许；选中只检查 dead/retreated/docked，不新增 HP 条件。任何 supplied target 都先检查可见性/阵营；cancel-target 仅取消本队所有者；order ID 分配发生在调用真实 issueOrder 前，后续拒绝仍保分配。

实现 `scene_wire::apply_control` 返回 `Result<(Vec<Handle>, Option<scene_commands::Outcome>),u32>`；保旧 apply 给既有 fixture。155/156/159/197返回完整回执，157/158仅暂存完整列表且无回执，malformed/stale/internal Err。tag197 payload `[limit,0…]`，边界不合法为 malformed；有效整数但非模拟、占用超限返回 source 普通拒绝。模拟占用按 capital 实际 isPlayer 分组，排除 dead/retreated，不额外排除HP0；动态准入由root保留198–199。操作布局、输入及LAN权威/存档边界与本方案既有部分一致。

系统 available 直接发布已有 lifecycle AVAILABLE 准入事实，该事实来源 `ShipSystem.available`（type !== NONE && !definition.unavailable），不从冷却、资源或 disabled 推断。实际命令 oracle 已发现分离 scene.audio/visual.audio 队列会颠倒多次暂停命令的音效：统一在每个命令结束时把 scene 音效按 source 顺序移入 world.visual 权威音效流，让 source 次序与ACK保持一致；完整帧其它挂点由root接同一 flush。

验收延用实际源码 Node 与 fresh Dedicated Worker oracle，追加战术/部署拒绝、指挥点/序列、battleResult、simulation-limit、selected HP0和whole-Core回滚；不以窄命令域通过替代完整可玩验收。

实际source oracle核实Ship.systems可以为空、allSystems仍含NONE facade。因此190第8个payload word追加实际tacticalCount=ship.systems.length，generated systemRead同字段；命令槽必须按此声明取值，不能从allSystems或NONE kind猜真实槽。

源码补核：TacticalControl的普通ESCORT order目标可为ships中的同队存活模块；只有escort-group wrapper目标要求capital。scene_owner::valid_order先已有active+available检查，因此普通ESCORT末层从capital friendly(t)改为同team，防止实际合法组件目标继续Err8。追加真实Ship parent链接目标的source oracle，普通module fire-control操纵仍由root实包玩家流程验收。

本块集中正式验收（2026-10-09）：16场263shipcommands+43runtime操作、1623getter、214970strict/6597geo、34rollback、374read-only、16completeclone，Node与freshDedicatedWorker均通过，windowAbsent=true。443真实依赖/native/fixture指纹及Wasm SHA642c30389ca3d678c2b2f947ec34c9f4853bba500996bd9e72820d31791b634f见artifacts/rust-combat-core-20261008/verification-scene-commands/result.json。当前TSC零诊断；尚未覆盖实际模块武器接管、positivecraftrecall与完整玩家流程，此项由root actualcontent full-flow继续，不能按本域结果标为完整可玩。
