# Rust 普通舰船系统准备与派发的实际成本

## 目标与本次范围

保持当前战斗、舰船包、技能键、资源、伤害和反馈全部行为，定位 ordinary prepare/dispatch 的真实成本，只减少有证据的同一不可变观察内重复读取。主代理授权生产范围仅 `gravity_runtime.rs::prepare/dispatch_with_flight`；需要其他生产来源接点时先精确报主代理授权。既有 publication 六源、实际系统玩法、phase、gravity owner、飞行和其余来源冻结。本块不删字段、降舰船数、降低更新频率、简化校验或冻结跨系统 live 值，不改 UI、平衡、生涯存档或发布。

玩家操作及取消、失败、快捷键、布局沿既有实现，本块没有新的产品取舍。原版窗口、实机截图和键鼠交互不在本次授权，仍待核实；只做后台源码和无头诊断。主代理记录的 allshipprepare 7.916ms/dispatch 7.213ms 是更广父函数成本，不能归给某个 callee。上一块 gravity hydrate 真场仅约 .02ms/frame 已关闭，不重复或复活。

## 原版证据 → 预期规则 → 当前差异 → 验证

原版版本 `../starsector-core/localization_version.json:7` 为 0.98a-RC8。本轮复读 `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipSystemAPI.java:9–14,31–36,49–61,65–85`，真实 IDLE/IN/ACTIVE/OUT/COOLDOWN、active/effect/charge、可取消与动态修改接口；`../starsector-core/data/shipsystems/ship_systems.csv:1` 的系统费用、regen、时长、禁用控制字段；`../starsector-core/data/shipsystems/scripts/AmmoFeedStats.java:11–24` 的真实属性 apply/unapply。这些证据约束生命周期与动态属性存在，不能证明 Web 扩展系统回调的全部时序。

实际严格基线为 `src/engine/simulation/Ship.ts:931–1002`：取消在 update 前，所有系统按 allSystems 顺序更新，再战备值、取消；`ShipSystem.ts:220–226` 先分别捕获并清空 pending activation/active 队列，再 activation→active→advance；`simulation/systems/CombatShipStatusSystem.ts:98–124` 每系统当时重新求 `dt * ship.subjectiveTimeMultiplier`，每船系统之后 hullmods，再该船的 damage/weapon/engine 反馈。Rust 对应来源为 gravity_runtime、ship_state、system_owner、system_world、aux_runtime、combat_visuals。验证须保实时读取、队列顺序、费用/位置/RNG/输出和原首失败，不以 DTO 或窄场通过冒称整个可玩完成。

## 真实顺序、写边界与错误

`prepare` 先取出并最终放回 gravity owner；按当前 row 取 ship→begin_clock（引擎 prev 与 clock 有真实写入）→can_advance；捕获当前系统 id 顺序，查 gravity ship metadata。每 id 原序 `owner.read_slot`，它仍验证 body→ship→gravity meta；有引力 slot 则 observe/cancel/update/restore，普通 slot 则 begin_system（原规格索引失败保留原 trap、控制取消、动态 regen、lifecycle 写入），随后 visual notices 才扩展 events。readiness 消耗真实 RNG、可改 disabled/overload/shield，之后引力取消再回写。不跨 begin_system/readiness 合并观察或改变错误次序。

`dispatch_with_flight` 先校验 dt→world.rows 的完整捕获顺序→每 handle 当时首 row→ship；DOCKED 跳过全船，DEAD/RETREATED 跳过系统/hullmod仍做反馈。活船捕获当前 ids，每 sid **fresh modifiers→写 live→当前 subjective dt 校验**，再识别 drone/gravity/ordinary。普通 `slot` 的原读取为 first lifecycle→meta→spec clone；dispatch 清 pending queues，按 activation→active→advance 调回调。Host.ship 先首 identity→ship/world→完整 modifiers→独立 engineering→combat/armor→carrier root/weapon 等完整观察；同一 dispatch 可能 spend_stock/set_regen/heal/spawn/pose，不能跨这些写复用。dispatch 成功后先 visual system_notices，再 restore 原 slot（lifecycle/meta）；下一 sid 重读 live。

该船全部系统后 repair（HP/charges）、aux status（可 stealth/出生 mine/登记 gravity）、fresh modifiers→live，最后 status_components（输出、visual RNG、清 feedback 与 bounded 校验）。新增舰载机同步准入但不添加进本次 captured list。不能跨 repair/aux/status 或整船循环缓存当前状态。所有 Result、原 trap、partial write 与 caller 完整事务恢复顺序不变。

## 联机、存档、依赖与交付顺序

单机与 LAN 都从同一 Rust/Wasm 权威执行；不改命令许可、座位、ACK、并发或存档，没有客户端第二份逻辑。先本方案→仅 tmp native 副本的低开销 sampled timers/counters→实际 22主舰/176初始 body/270tick、每 tick full capture 与 ACK→按事实判断是否值得窄实现。诊断按 prepare/clock/read_slot/ordinary update/readiness、dispatch modifiers/slot/回调/Host.ship/repair/aux/status/restore 分开；同时记录更广 scene prepare 与 cancel 的父成本，区分嵌套时间，不相加。

重型 CPU 等主代理窗口，本轮先准备不编译、不运行。只有实际明显重复并可证明同 immutable scope 时实施；跨来源生产接点先写准确范围由主代理协调。若当前授权内没有明显收益，保生产零改并给实际热点。若实施，同其他 native/TS 冻结，仅 owned delta 的 actual270 与 LAN60（实际 reserve 部署）全 snapshot/scene/capture rawbits、ownkey 原序、alias 对照集中一次，并对必要 malformed/首错误/duplicatefirst/实时写后的新 scope 复读定向验证；同 resident 局部成本确有收益才保留，否则精确撤回。正式 ABBA、installed 同 SHA、整场可玩与全部迁移完成仍归主代理，不用局部诊断冒称通过。

## 验收与当前状态

诊断必须真实生产 Kernel、full capture+ACK、source fingerprints 全部列出变化，生产不得留 perf imports/exports。采样计时明确报告样本及估算，不当正式加速数。规则/RNG/资源/计时/判断严格一致；几何沿用户既定微小容差，但本性能块目标为所有原位一致。保所有原错误与 live 重读、失败事务、不读未来世界或删除完整校验。

目前：来源和方案已完成；临时诊断准备中，未运行、未改生产。没有新的 UI/原版实机证据；真实热点、可优化性和当前最终门禁待实际诊断及主代理集成。
