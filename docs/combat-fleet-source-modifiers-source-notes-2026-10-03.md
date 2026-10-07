# Fleet readiness 同步 source modifiers — source notes（2026-10-03，先于编码）

## 原版证据 / 最小对照
- 原版目标 0.98a-RC8；C:/starsector-core、C:/decompiled 缺失。原版源码、界面/实机仍待核实；没有桌面操作授权。此块仅保持 Web 现有读序/规则的内部准备，不改变玩法/UI、不碰生涯或发布。
- 已读 AGENTS.md 和 combat-range-modifier-lifecycle-audit-2026-10-03.md。只实施首个 fleet readiness 同步 source 准备，不扩展 root/module AI、threat capture、fire-query 或 whole-tick。
- Web 证据：src/engine/ai/FleetTactics.ts readiness 原 range-read（54–56）求整表，motion 原消费点（66）再次经 ShipMotion.ts:25 求整表。readModifierTable 的 readers 只检查 scalar 兼容，不是投影。
- 预期：真实 closed worker owner 的 planFleetAI numerical 调用建立独立同步准备跨度；有 battery 且全部兼容/纯度认证通过的 source 仅一次 range+motion 整表求值；motion 留在原消费点。无 battery、不被认证、runtime/parent 等闭包未核实、scalar/motion override 全走原读序。
- 当前差异：重复完整动态回调/ordered composition，而非需要持有一整 tick。60639/39832 重复观测不给跨阶段复用权限。
- 实现边界：只改 CombatEngine.ts、FleetTactics.ts，可新增独立 helper；新专用 VITE_COMBAT_FLEET_SOURCE_MODIFIERS=false 和 VITE_COMBAT_STAT_TABLE=false 完全回滚本块。compatibility 在 callback 求值前完成；失败不求值一次再回退。表不写 Ship/Engine、不序列化、不冻结 caller spec 或输入；finally 关闭所有借用。
- 原读序约束：安装资格/battery/weaponDps 筛选、range/median、wings/offense、motion、role/availability 均不改。unknown 继续 range 旧 getter 再 motion 旧 getter；不 eager prepare 所有 source。

## baseline 冻结
- artifacts/combat-fleet-source-modifiers-20261003/source-before 保留原相对路径的两份源文件。
- artifacts/combat-fleet-source-modifiers-20261003/source-before-hashes.json 保存 SHA256；副本与原文件 hash 已核对一致。
- 主线 NumericAcquisitionFrame.ts / WeaponAcquisitionKernel.ts / nearest 不在修改范围；不改 ShipWeaponControlSystem.ts / HullMods.ts / Weapon.ts。

## 验证责任
- 本任务只做轻量源码/写入检查，不自行 tsc/lint/build/test/bench，不增加计时时钟；主代理集中验收与 ABBA。
- 需主代理验证：逐步 snapshot/双 RNG/AI+defense/tracker；native/no-battery/rollback/unknown/scalar+motion override/runtime/parent/custom-closure/exception close；准备和门禁成本计入整步。
- 主线 nearest 38.202→35.736ms 是其它方案观测，不能算本块收益；此块尚无收益或原版等价结论。
## 补证后的具体门禁（编码前）
- ownForWorker 仅是同 realm owner 契约；advanceCombat / system event / recoil / world hooks 可以在其它阶段写 mutable spec。不会沿用 hasOnlyLocalAdvanceHullMods 作为纯性证书，也不会按 spec identity 跨 source/phase 缓存。
- 独立 helper 只认证当前不可变 Registry 中已逐函数核实的 own modifier 程序：NONE、EclipseProtocol.modifiers（20–31）、GlorianaEdict.modifiers（52）、Hyperion Yamato.modifiers（49）、RocinanteSystems.modifiers（95、111–116）、ZhefengSystem.modifiers（15–20）。这组无 passiveModifiers / isExecuting；Adun / HyperionJump / 未知程序回退。
- 自身、auxiliary 链全部须原生 ShipSystem surface、相同 owner、无 scalar/private modifiers 覆盖；链循环回退。不使用 hasNativeStats 单一布尔判定纯性。
- 保守拒绝 runtime 非空、parent/sourceCarrier、任何 childModules / modulePropulsion 等尚未认证依赖闭包。mutable WeaponSpec 不冻结，每次准备前只证明 plain data/no accessors；mutable/unknown ShipSpec 回退。已标记 immutable spec 仍必须通过真实 native range-hook 身份认证。
- range 与 motion 联合 reader 的兼容检查先于整表 callback；原生 source / component descriptor、native motion/flux/system getter、weapon/wing data surface 才可跨本 source 纯计算区间借表。
- 只在原 range-read 位置准备，有 battery 才尝试；一次 source 的 maxSpeed 消费后立即释放。planFleetAI finally 关闭，上下文不传给 solver/后续 AI。
- 计数名称 fleetModifierPreparationWork（spans/requests/prepared/hits/fallback/noBattery/closed），从 FleetTactics.ts 重新导出，无 performance.now/Date 运行时计时。
## 实现完成（未运行验收）
- 修改 CombatEngine.ts、FleetTactics.ts；新增 src/engine/ai/FleetSourceModifierPreparation.ts。源文件 baseline/hash 先行冻结，主线 nearest 文件未写。
- Engine 仅当前 numerical 分支的真实 native planFleetAI + native roster getters 创建上下文；helper 验证 owner 的实际 ships 身份/顺序。上下文只能由 factory 铸造，与本数组绑定，finally 关闭。legacy / 数值异常 fallback 不借旧上下文。
- 请求点在 readiness 原 range-read；无 battery 仅记 noBattery，不求表。motion 在原 speed 消费点求完整 shipMotionStats，随后释放该 source 唯一 pending table，不保留 source Map。
- 对未知/scalar/motion override 保留原 range callback → range/median/wings/offense → 原 motion callback。联合 readers gate 在 callback 前完成；回退不会先额外求值一次。
- 已将检查收窄为本计算实际可达的 prototype programs，而非每个组件全方法反射；parent/carrier/child 先廉价拒绝。没有新增长期 admission/spec cache，不因覆盖率低扩张范围。
- fleetModifierPreparationWork 从 FleetTactics.ts 和 helper 导出。定义：spans/closed 为创建与关闭上下文数；ownerRejected 为 factory 拒绝数；requests 为有 battery 的 source 准备请求；prepared 为求值成功数；hits 为原 motion 点实际复用数；fallback 为请求未获认证数；noBattery 单独统计（不算 requests/fallback）。无计时时钟。
- 实际 176 实体/734 挂点覆盖**未测**。保守排除所有 parent/sourceCarrier/childModules 和未审核 passive 程序，可能低覆盖/0覆盖；主代理先看计数决定是否计时，本任务不跑场景、不扩大门禁、不声称收益。
- VITE_COMBAT_FLEET_SOURCE_MODIFIERS=false / VITE_COMBAT_STAT_TABLE=false 时不创建上下文，保持旧 reader 路径。
- 主代理待验收：类型/lint、270 strict及定向 override/runtime/parent/noBattery/close/throw/flag 边界；不重复搭测试工程。source-after-hashes.json 是交接 SHA256，不是通过证明。- 额外保守关闭边界：第一个不获认证 source（或无 battery source）进入原回调前撤销该上下文；后续 source 全走旧路，不在同一 owner 调用内重新开启。这样 unknown fallback 不能修改原型/状态后让其它 source 借用旧的跨度级纯程序认证，也无需对每 source 反复扫描全局原型。此限制可能进一步降低覆盖，主代理须先查 prepared/hits，不强行 ABBA。
## 主代理定向失败修正
首次270严格对照全通过，但prepared/hits为0。具体发现Ship.ts:123原生parentShip默认null，初版门禁只允许undefined，错误排除全部root。仅修正该空parent表示（允许null或undefined），不扩大parent/child/carrier/hook闭包；先定向复查helper和既有boundary/覆盖，仍无覆盖则不做ABBA。
