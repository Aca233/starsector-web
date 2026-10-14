# 常驻系统 owner 与实际武器/舰装联合验收方案

2026-10-08；本块是已批准 Rust/Wasm 战斗迁移的联合验证，不改变玩法或界面。浏览器与桌面共用 Wasm，规则、资源、RNG 严格相等；只有纯几何计算使用 `max(1e-9,32*EPS*max(1,abs(a),abs(b)))`。

## 目标、范围和玩家流程

保持当前七包技能键/右键的启动、关闭、阶段提示、共享储备、失效与取消操作。验收关注技能启动后真实硬/软幅能、实时伤害/射程/弹速、正在进行的武器周期、父模块增益、成功大和发射、方舟重构、封舱和脱战抢修。技能接受输入必须捕获实际 owner 位置/速度；超载、排散、失效或资源不足沿现有规则进入 OUT/冷却，不返还已支出的成本，不复活旧发射事件。

只新建共享核联合 oracle `scripts/lib/rust-core-system-owner-check.ts`。主任务负责共享 Rust/ABI/runner/生产接线及最终可玩验收。本块不修改 UI、不扩展舰船/舰装规则、不运行可见窗口、不发布或修改生涯存档；独立场景通过不能视为全战斗完成。

## 来源与最小对照

原版版本由 `../starsector-core/starsector.log:1` 确认为 0.98a-RC8。本次读 `data/shipsystems/scripts/AmmoFeedStats.java:9–18` 的独立实弹 RoF/flux stats 与 `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipSystemAPI.java` 的 IN/ACTIVE/OUT/COOLDOWN、charges、effect 约定。原版 API 证明生命周期与独立属性消费合同，不证明 Web 七包原创技能数式。其它来源与差异见 [system-world-plan](rust-combat-system-world-plan-2026-10-08.md) 和 [ship-effects-plan](rust-combat-ship-effects-plan-2026-10-08.md)，不把改编声称为原版等价。

实际 oracle 来源：`Ship.ts:933–1100` 的 prepare→integrate→finish，`ShipSystem.ts` 的接受/取消/overshoot/有序 modifier fold，`ShipWeaponControlSystem.ts` 的 advanceState、实际 request/advanceLifecycle、发射和 recoil 回调，`WeaponRange.ts` 的静态+动态射程/弹速。后续世界事件顺序依据 `CombatShipStatusSystem.ts:90–98`：所有 ship/weapon 更新后逐船 dispatchEvents，再 advanceCombat。实际动态舰装使用 `GlorianaBuiltins.ts`、`HyperionHullMods.ts`、`RocinanteHullMods.ts` 的真实已注册回调；不复制它们的规则作为预期值。

原版界面实机、悬停/禁用截图没有新增证据，仍待许可/待核实。本块保持已有界面；无头 Worker 只证明运行环境规则一致。

## 真实取样与实施顺序

1. 使用实际 Ship 构造器生成最小可信静态舰体/武器，按构造顺序在共享 RustCombatCore 安装 Flux/Shield/ArmorGrid、mount health、weapons、engines/readiness、lifecycle/kind/range inputs/system-world 一次；普通帧不上传 JS 规则结果。
2. 在命令边调用实际 TS activate 与 Rust accepted-system；输入 origin/velocity 从实际 resident owner 捕获。逐步运行实际 Ship.prepareStep、integrateStep、WeaponControl.advanceState、实际武器提交、Ship.finishStep；所有船完成后调用实际 system.dispatchEvents 和已安装 advanceCombat。呈现音效/粒子回调不构成规则 oracle。
3. 在完整后事件/弹体阶段取 snapshot，对照生命周期全部 timers/counters/pending、flux/clocks、RNG、ammo/cycle、动态定义 mask/值、HP、实际 projectile source damage/range/speed/位置。只读私有 TS 动态状态如无法访问，使用源 status 与真实资源/HP结果对照，并明确该范围；不虚构内部预期。
4. 用最少互补场景集中验收，任何 source/Rust 差异报告具体 tick/字段。主任务修共享核后定向复查；不把错误行为重新定义成 oracle。主任务在 Node 与全新无头 dedicated Worker 运行同一检查。

实际阶段屏障复查：`Ship.ts:933–1060` 的 prepare 对所有源ship完成，先执行installed `advance`/readiness再系统 update、flux upkeep和pending成本；所有integrate（含补偿与盾更新）完成后，所有武器advanceState，再按source ship/mount顺序实际request/lifecycle或query plan/commit，随后所有finish（scorch/engine）。`CombatShipStatusSystem.ts:90–99` 每ship依次dispatch全部system，再installed `advanceCombat`，最后运行所有弹体/光束；joint snapshot位于最后阶段之后。direct manual fixture输入不等于持续`ship.isFiringMain`，此条件单独由pilot覆盖，真正短cycle必须选择源代码会增加周期编号的burst beam，不能假称普通弹体增加该字段。

## 场景与验收

- 日蚀：pending 硬幅能先结算，多武器同 tick 与连续 burst 发射当场重新读取 flux；动态 damage/speed/range。
- Zhefeng：真实护盾升起、IN 非 PD 周期取消、PD 可继续、ACTIVE 降盾并取消 pendingRaise、OUT 重新允许护盾/武器和减速 RoF。
- RocFire：实际 slot.controlRole 与武器 isPointDefense 刻意不一致，验证 role 政策及动态实弹 rate/cost；真实 railgun 回调额外 120 软幅能在同 burst 中影响日蚀伤害。
- Yamato：注册的 system-only spec、真实 source projectile 初始化、成功扣储备和 RNG；不把计数增量当发射。
- Ark：真实 AFT 工程资格、corona/共享材料与有序 assembly/craft HP 治疗，边界 craft 不治，工程失效改变 regen。
- Gloriana：真实封舱先于系统成本、独立资源/定时/禁止开火，以及锁舷 Edict 对直接 parent/module 的真实 fold；封舱终止增益资格。
- Hyperion repair：真实短周期即使 tick 内结束仍重置 quiet，真正 hull/armor damage callback 打断，6s静默、储备与20%总材料预算/80% ceiling。
- Authority：过期 owner/target generation 拒绝且此前同批成本/事件不提交，投影副本不改 authority。范围内状态整批 rollback 不能覆盖生产恢复/网络尚未验证部分。

所有场景不增加产品取舍。必要依赖是主任务的 ABI12/header44 共享核、初始化完整 kind/range inputs、真实同步 owner Host 与 scratch/ordnance 整步事务。缺接线时报告失败并继续主任务修复，不回退半步 TS。

## 进度与实际证据

2026-10-08正式共享 `node scripts/check-rust-combat-core.mjs --system-owner` 已完成Node与全新无头dedicated Worker：每端10场景、155步、15个实际Ship构造、71个真实弹体、56,765严格字段、4,151几何字段、最大几何差0、32次rollback检查。包含实际短burst beam静默打断、材料耗尽与80%维修上限。结果 `artifacts/rust-combat-core-20261008/verification-p2-system-owner/result.json`；ABI13 Wasm897,907bytes，SHA256 deda84187fee959d17b6e5df039da3fd9023118d4fc84e954b771c456c2fc493。仅证明此系统联合域，生产完整可玩仍未完成。

策划和来源已完成；oracle 实施中。Node/Worker 联合验收、生产联机权威和完整可玩状态尚未由本块证明。最终填入实际运行结果与剩余差异。

### 已定位共享核真实差异（待主任务修）

联合 oracle 第一个实际 Node 场景在 `initialize-fire.rangeInputs` 事务拒绝 code2。2026-10-08 19:51 共享 Wasm 与当前 `state.rs` 源哈希相等，排除旧 build：`native/combat-core/src/state.rs:149` 总 tag 白名单仍是 `6..=9 | 11..=79`，新 range inputs **tag81** 即使有正确 match 分支仍永远被拒绝；tag80已有单独前置分支。须主任务准入81并重建。oracle没有删除必需rangeInputs绕过该错误。

首稿已使用实际 Ship 构造，所有动态回调/实际发射与 source 状态。ABI12 weaponRanges仅发布index+static12字段，不发布live range/speed，动态结果通过实际弹体逐次对照。scoped ESLint通过；联合执行尚停在上述实际拒绝，未宣称通过。

2026-10-08 后续共享 build 已准入 `11..=86`，首轮正式 `node scripts/check-rust-combat-core.mjs --system-owner` 通过前八组，Hyperion第9 tick真实ArmorGrid受损后失败：Rust HP `333.1666666666659` / TS `332.3333333333326`。`state.rs` tag26直接 `armor.impact`，未触发 `HyperionHullMods.ts:55` 对应的 `FieldRepair::on_damage`；`ship_state.rs::armor_impact`已有回调但该raw ArmorGrid入口未走它。主任务负责修共享实现，不能通过改预期或删除受损场景解决。

为追后续失败，在 artifacts 下复制 Rust 源仅诊断准入81及tag26回调，共享源码未改。诊断运行完整9场景152步、15真实Ship构造、71真实弹体、56,031严格字段/4,147几何字段、29批次rollback通过；这不是正式验证。进一步检查发现实际普通弹体 `requestWeaponFire`不递增`firingCycleId`，所以短周期覆盖改用真实已结束的爆发光束，并对周期/quiet重置、材料耗尽、Zhefeng状态、真实Roc角色决策和Ark边界craft增加非空覆盖断言。既有beam生命周期/模拟方法仍作为oracle，不复制公式。

补充一个真实795HP Hyperion无武器quiet场景，确认只修至80%、后续不继续扣储备；这与材料预算耗尽场景互补。最终统计须以正式Node/Worker结果为准。
