# 相位锚常驻服务方案与来源对照

## 2026-10-09 Entries 身份索引诊断：未实施

目标为保持现有潜航与致命伤害拦截体验，只检查 `Owned.entries` 的身份线性查找是否值得加入只读索引；本次不改 `read_live`、State、相位规则、计时、CR、parent 链、错误顺序、UI、联机权威或存档。若扫描成本有效，原拟采用现有 Controls 的 Vec + 懒身份索引，重复身份仍取首行，任何可变 Vec 借用先失效，Clone 隔离且每次读取真正当前 State；当前证据否决在此场景实施，未加入该容器。

原版依据仍为 0.98a-RC8 `ShipAPI.java:336,391` 的 `isPhased/setPhased` 与 `PhaseAnchor.java:38–73,76–148` 的实时紧急下潜和 CR 事件；详细最小对照见 `rust-combat-phase-anchor-source-notes-2026-10-08.md`。本次复读当前 Web `src/engine/simulation/Ship.ts:755–774`：外部效果返回 undefined 才算未潜航，0 仍表示实际潜航。现有 Rust `State::external_phase` 同样保持 `None` / `Some(0)` 区别；索引若实施只能缓存身份到首行，不能缓存 alpha、emergency、pending CR 或决策。无界面调整；原版实机仍待许可，未新增画面等价声称。

一次相关诊断使用完整冻结生产 native 的临时副本，仅给 `read_live/external_phase/pending_cr` 加计时，并在后两项记录容器行数、实际比较次数、命中、空容器次数。真实生产 RustCombatKernel，seed917，22 主舰 / 176 初始实体，270 步、每步完整 capturePresentation 和 ACK。结果 `tmp/flight-phase-entries-profile/result.json`：全部 270 步相位锚 Entries 行数最大值为 0，external_phase 2,947,053 次，扫描与命中都为 0，pending_cr 0 次。后段181–270每步 read_live 12,672.33 次/5.485ms；external_phase 12,848.33 次/0.842ms，均为空容器。该时间包含诊断计时桥接和计数开销，不能声称 0.842ms 是可消除的线性扫描，更不能以它估计全场增益；read_live 包含父链、盾、系统与嵌套计时，未改或削减。

实施顺序执行到“诊断 → 来源复核 → 决策记录”结束；生产源不改，未运行无需的旧新270/60或容器变更 fixture。profile Wasm SHA `2684d667d1f2aa7347a45da552bb5c5c377f6143afa260c759f86607a149a051` 仅临时诊断产物，未替换 installed/finalCargo；所有冻结 native 及 bundle 输入指纹 changed=[] / sourceUnchanged=true。完成本次判断的验收为真实 count/timing 与零扫描事实；不得将其冒称正式 ABBA、完整迁移完成或可玩验收。ROOT 继续其它已定位热点及最终同构建门禁；没有新的玩家行为取舍或失败/取消流程变化，不需用户决定。

## 2026-10-09 相位元数据查找续块

本轮联合集中验收已通过：`verification-resident-combined/result.json`，实际生产 Kernel 的旧新 10 个性能文件，22 主舰/176 初始实体混编 270 步及含第 8 步真实 reserve 部署的 LAN 60 步，完整 snapshot/scene 值、字段顺序、数值位（含负零）与引用结构摘要逐位同，changed=[]。新 plain Wasm SHA `c0483fb0e38a04d15b91239263525badc018d8cf89a8999ad025de05b63fbe1d`；这是性能等价证据，不能替代 TS/Rust 混编规则或最终正式构建。此前 controls 容器修改/clone/重复首项/代次隔离 fixture 为 127/127。

实际22舰后段诊断每步约9,618次完整phase读取、4.33ms；同一读数仍需读取实时parent、shield、systems状态与external presence，但每个system的静态ControlSpec线性扫全场controls不是规则所需。沿下文已核原版0.98a-RC8及当前Web Ship.isPhased合同，本块仅给controls容器加入按(slot,generation,system)的懒索引；第一次以原序建立、重复key保原find的首项。索引只指向当前容器行，任何可变借用（push/retain/索引写/clear等）先使索引失效，下一读重建；值不跨修改缓存。所有parent/cycle、缺metadata、system spec、实时生命周期/盾/外部phase与错误先后保持。

范围为phase_runtime.rs容器和现有phase/motion/seat查询窄读接入，无玩法/UI、权限、频率、存档或Wire变化；不改AI、火控和相位值。已有相位fixture直接修改controls仍有效，不将公开可变Vec视作不可变。依赖现有真实phase服务，先方案再实施，集中同冻结源旧新实际22舰270步与LAN60步完整snapshot/scene比较，加现有缺metadata/retain/重复key首项及同容器修改后重读；最终新Cargo及全场验收仍待总收尾。取消、失败沿原世界事务。没有新的产品取舍，实机仍未经许可未验证。

## 2026-10-09 生产同步接口修订

最新集中实际验收已通过：Node/全新无头 Worker 各 130 场、1,104 次状态比较、341,071 严格字段零差异、27,810 几何字段最大差异 0；包含 26 次致命拦截、219 次 hook 与 219 次真实碰撞消费者比较、九类实际重力中断、完整 Clone 恢复和 8 个失败合同。新增嵌套 critical 装甲溢出、armor 生成结构伤害、world 爆炸入口、已 take 重力 owner 的中断与旧 controller restore、真实重力 Host 伤害、注册特效 WorldSink 伤害。真实重力 FX 使用现有 CombatFXSystem 对照视觉 RNG，未改规则容差。terrain/projectile/beam/explosion 资格读数与真实 Ship.isCollisionless、RuntimeCollisionKernel 命中比较，包含 parent/system phase 和 external alpha0；缺场景/元数据的实际武器 query 拒绝。结果保存在 `artifacts/rust-combat-core-20261008/verification-phase-runtime/result.json`。共享生产入口仍需 root 完整接线，不能视为全场可玩。

本次进入已授权的共享全链。`world_owner::Owned.phase:Option<phase_runtime::Owned>` 保存全场唯一 Encounter；`phased_world(world,bodies,row,specs)` 同步读取盾、系统 phase/up/down 门、parent 和外部 phase（包括 alpha0）。已有底层非场景 fixture 可使用有限的盾/parent reader；已安装相位锚而缺场景必须失败。生产准入要求完整 phase metadata。

`ShipState::HullServices` 及 `apply_hull_with/armor_impact_with/critical_damage_with/finish_weapons_with/finish_engines_with` 在实际内部扣结构值前执行同步拦截。旧无上下文方法遇到已安装锚失败，避免任何伤害入口漏接。`phase_runtime::with_ship` 临时 take 唯一 ShipState 给原有计算，服务通过同一 ShipState 引用执行 listener 与所有 slot 的实际中断；结束时原实例放回，包括错误路径。没有复制 Body/ShipState、JS 回调或帧后 HP 修正。相位锚拦截位于结构资格门之后、void contact 与维修伤害通知之前。

Readiness 部署故障暂存 Readiness 计算后，先恢复其真实当前 CR，再执行同步 critical_damage；峰值时间只观察该实际 queued fireWorld 的 ships scope，显式目标依旧按原读数查找。weapon/engine 的 critical 分支与 RNG/组件传播原顺序保持。

重力 stage 当前将 owner take 出 world。生产重力 HullServices 显式借这份 owner，精确改同一 SystemMeta 与 lifecycle；不是将 world.gravity 缺失当作无 hook。hydrate 的 controller 工作副本需要 interrupt_revision 见证：同步 hook 提升 revision 后，旧 controller restore 保留已经执行的 hook，不能把旧 field/held/lifecycle 覆盖回来。revision 属于完整 snapshot，非时间/RNG或玩家规则。

验收集中在实际入口：直接结构/armor overflow、critical/readiness/weapon/engine 故障、terrain/world explosion/effects/gravity，同次伤害后的 phase/fire/AI 读数，双方唯一资格、void contact 顺序、当前 CR/pendingCR、真实 gravity hooks 与 Clone rollback。共享 state/lib/protocol/metadata/early stage 由 root 接入；本代理完成服务和授权 shared 文件后继续实际全场验收。

消费者审计与实现：正式 `battle::advance_projectiles/advance_beams` 的 Some(world) 已转入 weapon_world；文件内两处直接 apply_hull 仅为旧 None(world) 入口，旧无场景方法对已安装锚报错。weapon_world 的 projectile ship_query 与 beam candidates，以及 terrain_owner::Host::read 已统一。按实际 `Ship.ts:755–774`、`ProjectileCollisionHandler.ts:181–184,208–216,549`、`BeamSimulationHandler.ts:192–196`、`ShipCollisionSystem.ts:111`、`AsteroidSystem.ts:162–164`，这些资格门读取完整实时 isPhased，再叠加 runtime collisionDisabled。mandatory terrain World::phased 已落；生产 TerrainWorld 读唯一 world.phase，旧无锚 fixture 有限 reader 对 anchor failclosed。武器生产 query 使用 Result，metadata 错误交整体事务回滚，不吞成无碰撞。beam 初始候选按源一次捕获保持，后续单次盾穿透重查点与源流程一致，不改变排序、RNG或命中规则。原版 ShipAPI 的 isPhased/setPhased 与 PhaseAnchor 强制潜航证据见 source-notes；原版碰撞内核未实机验证，不据此冒称原版新规则。

## 目标、体验与范围

沿用已验证的 `phase_anchor.rs` 与现有 Web 玩法，在生产战斗中真正同步拦截结构伤害、写入额外部署 CR 损失、中断实际系统、强制潜航与递归退场。玩家的输入、声音和舰船包不变；浏览器与 Electron 共用 Rust/Wasm。本块不新增相位锚 UI、原版尚缺的 jitter/浮字、部署规则或生涯机制。

## 原版依据与当前差异

0.98a-RC8 `../decompiled/starfarer_api_source/com/fs/starfarer/api/impl/hullmods/PhaseAnchor.java:24–73,76–148,153–159`，以及此前 `rust-combat-phase-anchor-source-notes-2026-10-08.md`：双方共享一次救命资格；额外 CR 记入战后事件，不扣当前 CR；潜航增强在 chargedown 时解除。实际 Web `src/engine/extensions/PhaseAnchor.ts` 的安装监听、两个声音、runtime modifier 顺序和首帧/后续渐隐是本迁移的严格基线。原版实机与画面未新增验证，仍待核实。

`Ship.ts:373` clearInput → trigger/方向归零、每 slot 清 gravityControlHeld、仅 directional push 立即 deactivate；`ShipSystem.ts:228` deactivate → onInterrupt、pending 两项归零、IN/ACTIVE 转 OUT，保留 activationInput；当前旧独立 fixture 仅覆盖 NONE 中断。本块接实际 `system_owner::slot/restore` 与 `gravity_runtime::interrupt`，逐 slot 保源顺序，不能用裸 lifecycle 中断冒充 gravity hook。

`Ship.ts` isPhased → parent、docked/retreated、own shield、allSystems phase、external phase presence。现有若干 Rust 查询仅看 shield；新 `phase_runtime::phased` 将成为生产统一 reader。系统 phase/vulnerableUp/vulnerableDown 由已安装定义一次编译为必填 typed ControlSpec，未知/遗漏报错；不根据系统名字猜 phase。

## 服务与完整流程

场景唯一 Owned 持有 Encounter、按安装顺序的 Entry{Handle,State,pending_cr}、各实际 system ControlSpec 和按源顺序的声音。install 验证身份/phase 资格，真实写 activation cost0。普通舰没有 anchor Entry，但仍必须安装 system phase metadata。

伤害资格门后且 HP 写前调用 before_hull：无 anchor 返回 false；已 emergency 返回 true；满足 lethal/CR/全场资格立即 HP1、RETREATING、pending_cr累加、结构倍率0、external phase presence、actual 所有 slot deactivate，并返回 true。临时 listener 副本仅为 Rust 借用切分，在函数结束后恢复同一权威 Entry；没有跨步双份演化状态。

每船 early 使用该船实际源 world dt，在 readiness/clock/live modifier 前 advance；退场递归 children 原顺序，跳过已经死亡/退场的节点，清实际输入与 held、降盾、取消 vent、逐 slot deactivate、position/previous=(0,-1000000)、速度0。target、aim、hold/autofire 不凭空清空。声音由外层事务成功后播放，无 RNG 消耗。

phase reader 每次从同一 Bodies 和 Owned 递归 parent、验证 cycle/identity、读取 shield、精确 system phase gates 与 external presence，不能把 alpha0 当作未潜航。所有 collision/AI/fire/flight/system 可读它或在有明确屏障的位置同步快照；每次状态改变后的 reader 均须一致。

## 权威、失败与存档

全部服务为同步 Rust，无 JS 热回调。Core 外层 Clone 包含 phase Owned、Bodies、world/gravity、声音与 RNG；失败由完整世界恢复，不允许只恢复 HP。before_hull 暴露函数式 split borrow，root 负责 world.phase take/restore，以及 critical_damage/armor_impact/weapon/terrain/gravity/death 等真实结构入口的唯一同步连接。安装、未知系统、stale identity、cycle、缺 metadata 均返回失败；不作成功 no-op。pending_cr 和 Encounter 必須导出到真正战后/存档字段。

## 顺序、交付与验收

先独立 phase_runtime 与真实 fixture；再由 root 接 scene、phase reader 与唯一 hull service；最后完整 UI/runtime 可玩集中验收。复用已通过 36 场 actual PhaseAnchor 对照，新增 actual 系统 IN/ACTIVE/OUT/IDLE 与 gravity well/maneuver/push/polarity 中断、递归 parent/system phase 门、pendingCR/双方竞争、目标保留、Clone 继续及 stale/cycle 拒绝。Node 和全新无头 Worker 比较 strict 字段，几何仅允许 max(1e-9,32EPS*scale)。本块通过不等于全场可玩。

## 已完成与待接线

来源、方案、唯一 world.phase、同步 HullServices、Readiness 当前 CR/队列 scope、重力 same-owner 中断与 revision restore、world hull/retreat/registered effect 服务和上述实际 fixture 已完成。state 已消费 early_world、prepare_world 与嵌套 with_ship；生产 metadata 安装、余下 battle/weapon/terrain/system/missile phase 消费者、完整输出与战后 pendingCR 导出由主代理统筹继续。无新的玩家行为取舍需要确认。
