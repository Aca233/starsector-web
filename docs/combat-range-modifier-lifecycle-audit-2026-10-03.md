# 战斗 range / modifier 生命周期审计 — 2026-10-03

## 0. Source notes / 最小对照（先于任何功能代码）

- 目标原版：**0.98a-RC8**。本次检查 `C:/starsector-core`、`C:/decompiled` 均不存在；原版脚本、反编译逻辑、截图与实机操作**待核实**。没有桌面授权，不补做原版实机或 UI 验证。
- 已读 `C:/starsector-web-master/AGENTS.md` 及 `C:/starsector-web-master/docs/combat-work-demand-census-{source-notes,results}-2026-10-03.md`。本块独立追查现 Web 执行语义，不修改原版规则，不宣称原版等价；不涉及生涯、发布、提交或暂存。
- 原版证据 → 预期行为：原版资料缺失，只能保留 Web 当前各阶段真实读序、组合顺序、回退与发射时实时资源规则；不可将未经核实的新机制当作“还原”。
- Web 证据 → 当前差异：`ShipSystem.readModifierTable(readers)` 中 readers **只是标量覆盖兼容性检查，不是字段投影**，每次仍执行完整 modifiers 回调、auxiliary / runtime / parent fold。消费端多次索取相同 range，不代表整表或后续阶段不变。
- 预期实现边界：准备必须绑定真实同步只读阶段或完整写入 revision；准备和权限检查成本一起计入。先复用现有跨度，不创建 whole-tick cache、不改变 dt/响应频率/武器数/射程公式。
- 验证方法（供主线后续实施）：同一既有场景逐步快照、双 RNG、AI/defense/tracker 对照，加 activation/update/parent/runtime/restore 定向边界；最后由主代理独占集中 ABBA。**本次未运行构建、类型检查、lint、测试、bench 或计时**。主线独占验收/计时，本审计不打断它。最新回执：current-first 单独 ABBA 无整步收益，已撤回；tree.nearest 算法重写正在集中验收。本文不把已撤回方案算作接受成果，也不对 nearest 给出未经本任务验证的结论。

## 1. 结论与普查解释

1. 真实根因是**消费端索取一个小字段组，却反复运行整个动态规则翻译和组合图**；不是已证明的“写入过于频繁”。60639 次需要 range 的范围表读取中，同 system/tick 相同 range 输出重复 39832 次（65.687%），只是该观察窗口的结果重复。
2. 普查比较的是 `weapons[type].rangePercent ?? 0`（脚本还有 OTHER 观察槽），**没有比较整个 SystemModifiers，也没有比较最终武器射程或弹速**。不能据此推导 Eclipse 的 flux-sensitive damage、Rocinante 的 speed/RoF 或 module 可用性不变。证据：`C:/starsector-web-master/artifacts/combat-work-demand-census-20261003/run-census.mjs:25`。
3. 当前真正能安全复用的天然边界是：
   - 每个 WeaponThreatFrame / FleetTactics readiness 的同步、原生 source 物化；
   - CombatAIPhase 的 root+module **plan**（closeObservation 在 controls/effects 前）；
   - 全部 state/motion/weapon-state 完成后、emission 前的 **fire-query**；
   - legacy/interleaved 模式只能每 shooter 当前查询跨度，不可扩成 whole-world/tick。
4. 当前已经有两个正确方向的机制：CombatQueryReads 和 FireControlQueryBatch.sourceModifiers；应修正消费者绕行或反复翻译，不能再创建按 tick 驱动的外层总缓存。
5. **首选只读阶段方案，不首选全局 revision。** revision 方案需要覆盖 public 字段、嵌套输入、parent/module/carrier、runtime source alias、owner-wire 和 snapshot 直接赋值；只给 activate/update 或 RuntimeCombatModifiers.set 加版本是不完整方案。
6. 本次只提交审计文档；没有新增 helper。现成的生命周期/表读取接口已足以描述实施边界，额外未集成抽象目前不能证明减少了真实工作，也不应占用主线计时窗口。

普查 phase 分布保留为观测，不转换成节省 ms：enginePrelude 20807、fleetAI 25567、world:fire-query 14265。全部 readModifierTable 的 127787 次与带 range reader 的 60639 次不是同一口径；probe 包容计时也不能相加或当净收益。

## 2. 当前实际规则图（不是根据文件名猜测）

### 2.1 Registry 的可达定义

证据：`C:/starsector-web-master/src/engine/extensions/ship-systems/Registry.ts:35–60,83–85`；`C:/starsector-web-master/src/engine/extensions/DefinitionRegistry.ts:6–15`；`C:/starsector-web-master/src/engine/extensions/Immutable.ts:7–20`。

- 当前直接注册：NONE、EclipseProtocol、GlorianaEdict、Hyperion Yamato/Jump、AdunArkSystems、RocinanteSystems、ZhefengSystem、GravitySystems；另外可注册 unavailable source adapter。
- 注册时递归 immutableCopy；Registry 不允许重复 id 替换。definition 身份可作为**该已审核规则程序**的认证，不证明运行时输入不可变，也不证明函数闭包没有私有状态。
- nativeStatDefinitions 在注册 NONE 后、注册其它定义前建立：当前初始内容只有 NONE。hasNativeSystemStats 另通过 originalStatDefinitions / gravity / rocinante / zhefeng 集合认证其它实际定义。名字里的 original/native **不是原版 0.98a 验证结论**。
- `C:/starsector-web-master/src/engine/extensions/ship-systems/NativeSystemFactory.ts:3` 的 nativeSystem 直接 throw。LidarArray、Sensor Drones 等磁盘上的定义本次不属于当前 Registry 可达生产系统。不能拿其 range 写入当本场景实际来源；未来重新接入须重新审计。
- 相反，EscortPackage / PhaseAnchor / shield_always_on 是真实已注册 HullMods hooks：`C:/starsector-web-master/src/engine/extensions/HullMods.ts:296–301,410–423`。它们不能因为 ship-system native factory 被移除就从写入图中删掉。

### 2.2 完整组合顺序必须不变

`C:/starsector-web-master/src/engine/simulation/ShipSystem.ts:265–279`：

```text
own: available ? (isActive ? definition.modifiers : definition.passiveModifiers) : {}
 → available auxiliary 的递归组合（同 capacity）
 → 仅 owner.system === this 时组合 owner.runtimeModifiers.value
 → 存活 parent / owner 条件通过后，按 parent.allSystems 原顺序组合
   available && !disabled && isActive 的 parent.moduleModifiers(system, owner)
```

- active **替换** passive，不是二者相加。isActive = lifecycleActive 或 definition.isExecuting(system)；只有 state/effectLevel 不足以普遍决定 active。
- 自身 own 路径没有统一 `!disabled` 条件；disabled 的影响有的在具体回调、有的在父模块 gate 中。优化不能偷偷加全局 disabled gate 来“修正规则”。
- `combineSystemModifiers` 中百分比/flat 相加，`*Multiplier` 相乘；weapon types 按 BALLISTIC/ENERGY/MISSILE 折叠。不得用无序合并、提前归一化或重排乘法改变浮点值/缺省语义。证据：`C:/starsector-web-master/src/engine/extensions/ship-systems/Modifiers.ts:3–19`。
- readModifierTable 只对实例原型和被请求 scalar 方法覆盖进行兼容检查；**它本身没有 native definition / pure-callback 全域证明**。证据：`C:/starsector-web-master/src/engine/simulation/ShipSystem.ts:285–292`。
- Readonly<SystemModifiers> 不是运行时冻结，也不是 deep readonly。最终表可能是回调返回对象；runtimeModifiers.value 也公开内部缓存。不得把可写借用表长期挂在 Ship 或共享给不受控回调。

### 2.3 当前动态字段组的真实依赖

| 已注册规则 | range / speed 与整表的不同依赖 | 源码证据 |
|---|---|---|
| EclipseProtocol | ENERGY range=20×level，speed=60×level；但整表 damage 还读 owner.flux.fluxPercent。level 相同不保证整表相同 | `C:/starsector-web-master/src/engine/extensions/ship-systems/EclipseProtocol.ts:20–31` |
| GlorianaEdict → module | 选中舷 BALLISTIC range=15×level；依赖 parent 关联/childModules membership、moduleMount.slotId、accepted activationInput 的 point/origin/facing、owner/child 生存与退场、vent/overload、child blocksWeapons、至少一个未 disabled 且 ammo!==0 的实弹武器；loader 还影响 RoF/fluxCost | `C:/starsector-web-master/src/engine/extensions/ship-systems/GlorianaEdict.ts:14–22,53–59`；`C:/starsector-web-master/src/engine/extensions/ship-systems/GlorianaEdictState.ts:12–32` |
| Rocinante fire control | 没有 range 改动；BALLISTIC speed=25 仅 ACTIVE、!disabled、owner living、!vent/overload 时有效；同时修改 RoF/fluxCost/dissipation | `C:/starsector-web-master/src/engine/extensions/ship-systems/RocinanteSystems.ts:111–119` |
| AdunArkSystems | 当前 forge/module hooks 不写 range/speed；整表依赖 effectLevel、owner coupler hullmods、AFT 工程段 alive、module alive；barrier/repair 也向 module 传播其它字段 | `C:/starsector-web-master/src/engine/extensions/ship-systems/AdunArkSystems.ts:9–10,28–38,50,58` |
| HyperionJump | 当前不写 range/speed；passive ENERGY damage/RoF/fluxCost 依赖 COOLDOWN、cooldownTimer/maxCooldown、teleportVisual.origin 和 owner online（含 vent/overload/retreat/runtime disableSystems），不是 effectLevel-only | `C:/starsector-web-master/src/engine/extensions/ship-systems/HyperionSystems.ts:16–21,79,104` |
| ZhefengSystem | 当前不写 range/speed；整表依赖 IN/ACTIVE/OUT、disabled、owner alive/retreated、vent/overload | `C:/starsector-web-master/src/engine/extensions/ship-systems/ZhefengSystem.ts:15–20` |
| RuntimeCombatModifiers | 任意 SystemModifiers 数据，能够引入任何 type 的 range/speed；实际 EscortPackage 写 B/E range=20×mag。Bulkheads 不直接写 range，却通过 disableWeapons 改变 Edict module range gate | `C:/starsector-web-master/src/engine/extensions/RuntimeCombatModifiers.ts:4–14`；`C:/starsector-web-master/src/engine/extensions/EscortPackage.ts:17–25`；`C:/starsector-web-master/src/engine/content/GlorianaBuiltins.ts:21–42` |

这张表只限定当前 function 内容。未知 definition、动态 moduleModifiers 或任意 isExecuting 继续完整旧路径，不按 system id 字符串推测依赖。

## 3. 真实写入口与失效域

| 写入入口 | 实际写入 / 调用位置 | 失效域 / 为什么不能 tick 缓存 |
|---|---|---|
| 安装与组合图建立 | ShipSystem constructor 初始化 definition/timings/capacity/owner，并执行 initialize；Ship constructor 建 systems/system/defenseSystem、逐槽 auxiliary，构建 child.parentShip/moduleMount | `C:/starsector-web-master/src/engine/simulation/ShipSystem.ts:77–99`；`C:/starsector-web-master/src/engine/simulation/Ship.ts:504–517`。图身份、slot 顺序、parent/module 与 rule program 必须重新绑定；public/TS readonly 不是运行时不可替换保证 |
| activate/reset/deactivate | activate 写 activationInput/target/serial、isActive/state/effectLevel；reset 清 accepted input 并可 onReset；deactivate 调 onInterrupt、beginOut | `C:/starsector-web-master/src/engine/simulation/ShipSystem.ts:133–138,160–184,197–201`。AI effects 或命令边缘同 tick 可修改自身和所有依赖模块 |
| update 与阶段转换 | update 连续推进 IN/OUT strength；beginActive=1；beginOut 保留 OUT entry level；finishOut=0；COOLDOWN 推进 cooldownTimer；charges regen | `C:/starsector-web-master/src/engine/simulation/ShipSystem.ts:202–245`。effectLevel/retainedEffectLevel/state/active 和冷却型 passive 都可失效；ACTIVE 稳定也不证明 owner 稳定 |
| 原生 AI 控制/效果提交 | controls 写目标/aim/input；effects 闭包调用 advanceAI、系统 activate、defense/vent。Hyperion AI 还临时写准星→activate 捕获→恢复 | `C:/starsector-web-master/src/engine/ai/CapitalShipAI.ts:128–151,308–349`；`C:/starsector-web-master/src/engine/extensions/ship-systems/HyperionSystems.ts:59–64`。必须在 controls 前结束 plan lease；恢复准星不恢复已捕获 activationInput |
| local state hooks / 幅能 | prepareStep 先 statusEffects.advance、installedHullMods.advance，再 systems.update、CR/取消、shield upkeep、system usage flux、advanceHullModFlux | `C:/starsector-web-master/src/engine/simulation/Ship.ts:930–944,977–1036`。owner flux/overload/vent、systems disabled、runtime data 可能变化；state 中间不能持有整表 |
| runtime data producer | RuntimeCombatModifiers.set/delete/clear，set 不复制输入；dirty getter 合并 sources | `C:/starsector-web-master/src/engine/extensions/RuntimeCombatModifiers.ts:4–14`。仅 Map 身份不够；同 id 替换、嵌套原地修改、value 返回对象污染均可能没有可见 revision |
| 实际 range runtime writer | advanceEscortPackage 读 combatShips/team/geometry/盾半径、hull size、sMods；mag 变化才 set/delete | `C:/starsector-web-master/src/engine/extensions/EscortPackage.ts:6–25`。range 源会在 prepareStep hullmod advance 改；是已注册 hook，不能忽略 |
| 间接 module range writer | advanceBulkheads 写 runtime disableWeapons、flux；封舱结束 delete；武器 advanceState 改 disabled/ammo，可改变 usableBattery | `C:/starsector-web-master/src/engine/content/GlorianaBuiltins.ts:26–42`；`C:/starsector-web-master/src/engine/simulation/ShipStepBatch.ts:89–91`。child 自身变化能改变父 Edict 给该 child 的 range，而 parent effectLevel 没变 |
| dispatchEvents / advanceCombat | statusSystem 逐 ship 调 onActivate/onActive/onAdvance，再 hullmod.advanceCombat；Edict onAdvance 清 activationInput、中断；Hyperion 成功跳跃更新 teleportVisual | `C:/starsector-web-master/src/engine/simulation/ShipSystem.ts:189–195`；`C:/starsector-web-master/src/engine/simulation/systems/CombatShipStatusSystem.ts:94–103`。不是 AI plan 的 continuation；必须新采样 |
| 火力实际提交与伤害/退场 | commitFire 按实体顺序消耗幅能、弹药并运行发射插件；伤害改变 hull/weapon/engine health；destroyed transition deactivate+disabled | `C:/starsector-web-master/src/engine/simulation/ShipStepBatch.ts:105–109`；`C:/starsector-web-master/src/engine/simulation/systems/ShipWeaponControlSystem.ts:690–701`；`C:/starsector-web-master/src/engine/simulation/CombatEngine.ts:1200`。不得拿 fire-query 整表替代后续实时 damage/RoF/flux-cost reads |
| ECM / 预览回滚 | prelude updateElectronicWarfare 重写 ecmRangePenalty；previewNativeAI 临时更新并 finally 恢复同批值 | `C:/starsector-web-master/src/engine/simulation/systems/ElectronicWarfareSystem.ts:3–18`；`C:/starsector-web-master/src/engine/simulation/CombatEngine.ts:638–651,805–807`。这是最终 range 的另一输入，范围百分比表不包含它；preview 也不能污染真实阶段准备 |
| owner wire hydrate | Owner.apply 通过 ownSync[].codec.apply 直接写节点；generic codec 用 node[fields[i]]=value | `C:/starsector-web-master/src/engine/ai/multicore/Owner.ts:85–118`；`C:/starsector-web-master/src/engine/ai/multicore/ScalarWire.ts:2048`。绕过 activate/update/set 等方法；新阶段 epoch/重绑定不可省 |
| snapshot target restore | unpackRecord / native generated restorer 直接赋值 effectLevel/state/activationInput/disabled/owner/parentShip/runtimeModifiers；definition/auxiliary/moduleMount 从本地 spec 保留，不传输 | `C:/starsector-web-master/src/network/AuthorityCombatSnapshot.ts:39–48,498–527`；`C:/starsector-web-master/src/network/NativeRecordRestore.generated.ts:283–349,2790–2802`。这是显示/目标恢复路径，不冒充完整 resumable checkpoint；但足以证明同对象 identity 可收到新值，跨恢复必须丢弃派生准备 |

源对象间 dependency 至少包含 parent↔child、sourceCarrier↔fighter。只失效被激活的 system / parent 本身是不充分的。`C:/starsector-web-master/src/engine/ai/WeaponThreatEnvelope.ts:40–49,109–112` 已有依赖 family 合并/invalidate，可作为实现参照，不是额外缓存权限。

## 4. 消费阶段与当前已有只读机制

### 4.1 实际执行图

```text
enginePrelude:
  player time reader → combatEffects（任意写者）→ visibility / ECM writes
  → WeaponThreatFrame source capture → yield（async 模式存在 await）
fleetAI:
  CombatAIPhase / scene 建立 → planFleetAI readiness
  → 所有 root + module plan
  → closeObservation → 所有 controls → 所有 effects/after receipts
ships/decks:
  enqueue（phased）或 legacy/interleaved ship.update
world:state → motion/afterMotion → weapon-state
  → fire-query（全部 query 先于 emission）→ close frame/roster
  → fire-commit（按 ship 顺序）→ finish/receipts
terrainStatus:
  dispatchEvents + hullmod.advanceCombat → 后续碰撞/武器伤害/显示投影
```

证据：`C:/starsector-web-master/src/engine/simulation/CombatEngine.ts:688–699,805–853,884–925,978–1018,1046–1066`；`C:/starsector-web-master/src/engine/simulation/ShipStepBatch.ts:61–118`。

### 4.2 各消费者的准确范围

| 消费者 | 已有准备 / 当前重复来源 | 建议边界 |
|---|---|---|
| WeaponThreatFrame | 构造时每 source 一次 range table，循环传给 weaponRange；随后 ship.getMotionStats、blocksWeapons 仍实时读系统；packet/results 是预先采样威胁，不是全世界 modifier lease | `C:/starsector-web-master/src/engine/ai/WeaponThreatFrame.ts:25–64`。可在此 source materializer 内复用已认证表做原生 motion；不能把表通过 await 交给 fleetAI |
| FleetTactics.readiness | 每有 battery 的 ship 一次 range table，weaponRange 循环复用；speed=ship.getMotionStats 又重跑 motion 系统；numerical/legacy tactics 都共用 readiness | `C:/starsector-web-master/src/engine/ai/FleetTactics.ts:49–80,99–101`。保留现有 eligible battery/weighted median/role 与排序；首先只消除同 source 物化内重复，不跨 effects |
| CombatAIPhase / readPlane | scene 为 closed owned/exact roster 创建 DecisionReadPlane；plan 绑定 shared reads；execute:74 在 controls 前 closeObservation | `C:/starsector-web-master/src/engine/ai/CombatAIPhase.ts:31–65,72–89`；`C:/starsector-web-master/src/engine/ai/CombatDecisionScene.ts:72–85`。plan lease 才是共享依据，scene 存在或 tick 相等不是依据 |
| CombatQueryReads.sourceModifiers | 按 Ship 缓存完整表；认证 native readModifierTable + hasNativeStats；motion 可用同表 shipMotionStats。只有通过 querySourceModifiers/queryMotionStats 的消费者才受益 | `C:/starsector-web-master/src/engine/ai/CombatQueryReads.ts:18–39,43–48`；`C:/starsector-web-master/src/engine/ai/ShipCombatProfile.ts:35`；`C:/starsector-web-master/src/engine/ai/TacticalPositioning.ts:44`。整表可只在已认证计划跨度保留；unknown callbacks 不擅自共享 |
| WeaponThreatEnvelope / ThreatAssessment live fallback | Envelope.get 循环 weaponRange(ship,mount) 未带 source table；ThreatAssessment 的 fallback 也是逐 mount 实时 range；effects 刻意撤掉 queryReads/threatFrame 后再评估 | `C:/starsector-web-master/src/engine/ai/WeaponThreatEnvelope.ts:74–96`；`C:/starsector-web-master/src/engine/ai/ThreatAssessment.ts:157,175`；`C:/starsector-web-master/src/engine/ai/CapitalShipAI.ts:320–333`。这是可以继续追消除重复的真实入口，但 effects live fallback 不能借用 plan table |
| FireControlQueryBatch.sourceModifiers | stageObservation 下每 shooter 懒准备一次 range+speed 所需的完整表；batch 在 planFire finally close，发射不借用它 | `C:/starsector-web-master/src/engine/ai/FireControlQueryBatch.ts:50–71,114–119,239–257`；`C:/starsector-web-master/src/engine/simulation/systems/ShipWeaponControlSystem.ts:336–338,484`。优先复用这个生产出口，重复问题不授权平行外层 tick table |
| Autofire aim / preAim / numeric 输入 | prepareAimQuery 使用 batch.sourceModifiers 计算 combatWeaponRange/combatProjectileSpeed；guided 路径按既有 maxSpeed/projSpeed；数值执行消费实际 query 的 range/speed | `C:/starsector-web-master/src/engine/ai/AutofireController.ts:159–165,381,398,455`。数值输入/搜索是主代理独占范围，本任务不修改、不把 main 正在修正的分类/顺序问题算作本次实现 |
| 实际 emission / arcs / display | 发射实际射程、RoF/flux-cost/damage 是当前状态规则；Ship display/render getRange 是实时值，投影逐 mount 构造显示 range；owner Protocol 发布和检查也读 range | `C:/starsector-web-master/src/engine/simulation/Ship.ts:1107–1114`；`C:/starsector-web-master/src/engine/runtime/local/RenderShipProjection.ts:97–104`；`C:/starsector-web-master/src/engine/ai/multicore/Protocol.ts:285,356`。这些不默认加入 AI/fire-query lease，也不允许显示端反推权限 |

WeaponThreatFrame 当前 forecast 的速度字段使用 `mount.spec.maxSpeed ?? mount.spec.projSpeed`，不是 combatProjectileSpeed。记录真实现状；本优化不能顺手统一速度公式，造成威胁预测行为变化。原版对应语义待核实。

## 5. 污染 / 失效风险：必须排除的近似方案

1. **same system + same tick / effectLevel**：会错过 passive 替换、auxiliary 激活、OUT retained strength、owner flux/vent/overload、parent/child readiness、冷却型 passive。
2. **相同 rangePercent 就共享整个表**：range 不变时 Eclipse damage、Rocinante speed、Adun/Hyperion/封舱的其它字段仍可变化；不等价。
3. **WeakMap<definition/system,永久表>**：immutable definition 只固定程序，system identity 不固定输入。TS readonly owner 和嵌套 activationInput vector 都不是无写证明。
4. **revision 只挂 activate/update**：CR 直接 disabled、status/HullMods/runtime writes、weapon availability、owner wire、snapshot generated setter 都绕过它。
5. **runtimeModifiers revision 只挂 set/delete**：set 留下 caller 对 nested weapons 的别名，value 留下内部 cached 的可写别名；外部原地写不会 dirty。这是 API 审计风险，未声称本普查实际发生污染；本次不擅自冻结/改现有扩展行为。
6. **借用表反写**：同 object 的 Readonly 只是类型标注，外部污染可能跨查询存活；阶段产物若传出封闭消费者应拷贝 scalar projection，不发布完整 callback-return table。
7. **parent-only invalidation**：模块封舱/弹药耗尽/武器故障可改变 Edict range；carrier refit/rebind 可影响 fighter 最终 range。需要双向依赖 group，而非“更新哪船删哪船”。
8. **在 state 或 emission 开始前读表并用到底**：state 途中有 flux debit；weapon-state 改 ammo/disabled；emission 途中每枪也消耗 flux/弹药。只读期是局部，不是整个 Ship.update。
9. **未知 extension 削减回调次数**：readModifierTable 返回表不代表 callback pure。保持标量方法覆盖/自定义 getMotionStats/自定义 modifiers 的原读序；unknown callback 前结束可借用跨度，不把一次 reject 后来变为 permission。
10. **跨 await/prephase**：fixedUpdateAsync 在 threat frame yield 后 await compute；stepInProgress 只防重入 fixedUpdate，不单独证明所有 public 字段不被写。现 packet 的阶段采样是已存在语义，不能以它为由给 raw modifier table 新增长生命周期。证据：`C:/starsector-web-master/src/engine/simulation/CombatEngine.ts:665–684`。
11. **OwnedNativeSystemModifiers 误扩容**：当前 allowlist 只列 NONE/BURN_DRIVE/AMMO_FEED/HIGH_ENERGY_FOCUS/MANEUVERING_JETS/FORTRESS_SHIELD，实际 Registry 初始 nativeStat 仅 NONE；不是对当前 custom systems 的全表 cache。enableOwnedNativeModifiers 还只在安装时拒绝 parent.moduleModifiers，private owned runtime 前提不可移植到公开对象。保留其 own-only live ordered fold，不扩大名单或伪造 revision。证据：`C:/starsector-web-master/src/engine/simulation/OwnedNativeSystemModifiers.ts:7–38`；`C:/starsector-web-master/src/engine/simulation/ShipSystem.ts:18–33`；`C:/starsector-web-master/src/engine/runtime/owned/OwnedCombatSession.ts:85–96`。

最终 range 还依赖 ECM、sourceCarrier fighter flat、ShipSpec/WeaponSpec/hullmod inputs，以及 threshold 顺序。`C:/starsector-web-master/src/engine/simulation/WeaponRange.ts:28–38` 保留动态实时计算。武器 spec 生命周期由另一任务负责；这里不复制其 revision 或修改 HullMods/Weapon。

## 6. 可实施方案 A（推荐）：真实只读阶段的 source 准备

### 首个最小候选：只限定 fleet readiness 的同步 source 准备

**先只实施这一块，A1/A2 暂作边界备忘，不并行扩大。暂不改生产。**

- 阶段：`CombatEngine.planFleetAI()` 内原生 numerical fleet readiness 的同步采样，**不是整个 fleetAI trace 标记，更不是一个 tick**。不包括 WeaponThreatFrame、root/module AI plan、AI effects、fire-query 或 emission。
- 实际需求：`FleetTactics.readiness:54–56` 求 range table、供 battery 逐挂点算 range；随后 `:66` 的 native getMotionStats 在 `ShipMotion:25` 再求 motion table。当前通常是 **同 source 两次完整组合图求值**，不是“每次 motion 十次标量”——stat-table 已存在，别夸大收益。
- 最小改动候选文件（尚未取得新独占、尚未修改）：
  1. `C:/starsector-web-master/src/engine/simulation/CombatEngine.ts:235–242`：只在当前 worker-owned + phased + exact numerical gate 内创建本次 readiness 准备生命周期，调用 `planFleetTacticsNumerically`，以 try/finally 在返回前关闭。fallback `planFleetTactics` 在关闭后执行，完全保持旧路径。
  2. `C:/starsector-web-master/src/engine/ai/FleetTactics.ts:49–80`：numerical 路径把真实 producer 的准备上下文传给内部 readiness；legacy readiness 不接它。对有 battery、native getMotionStats、native readModifierTable、hasNativeStats、满足 range/motion scalar 兼容的 source，只在原 range-read 位置求值 **一次** `[getWeaponRangePercent,...motionReaders]` 完整表。battery 用这张表；motion 仍在原 `speed` 消费位置调用 `shipMotionStats(ship,0,table)`。不能把 motion 提前到 range 循环前，也不能提前读取全部 source。
- provider 只需 per-source 局部表/局部 prepared record，不需要新 tick Map、persistent WeakMap 或新规则服务。若复用 CombatQueryReads 的现成代码，也不延长其寿命；只有实际 source materializer 能取得准备值，数值 fleet solver 接收 readiness scalars，不接收表或 Ship reader。
- 所需 imports / 现成参考：`nativeGetMotionStats` 来自 `C:/starsector-web-master/src/engine/simulation/Ship.ts`；`nativeReadModifierTable` 来自 `C:/starsector-web-master/src/engine/simulation/ShipSystem.ts`；`motionReaders/shipMotionStats` 来自 `C:/starsector-web-master/src/engine/simulation/systems/ShipMotion.ts:12–25`。不修改这些生产者，不修改禁改文件。
- 权限必须来自实际 owner caller 和当前注册不可变 callback 程序，不能用传入 `{readonly:true}` / `tick` 作为凭证。保守首版不接入有 runtimeModifiers 数据、未知 owner/parent/getter/definition/modifier 回调的 source；parent module hooks 或 carrier 如未得到完整闭包认证，该 source 回退。这缩小覆盖率，但不把存在私有 Worker 当作所有任意扩展纯性的证明。
- **失败回退**：stat-table=false、没有 battery、native/purity/reader 认证失败、motion scalar override 等，执行原 range-read + 原 getMotionStats；不要因为 union-reader 拒绝就把合法的原 range 标量覆盖绕掉。兼容检查失败必须发生在 callback 求值前，不产生一次额外求值再重跑旧路径。
- **关闭/失效**：单 source 物化完成即不再借用其表；整次 planFleetAI 返回/抛错即清空准备上下文。从不跨 controls/effects、state、weapon-state、dispatchEvents、await、preview/restore/rebind。若途中发现未知 callback，后续不用旧 provider；不重新打开同一 provider。
- 所有 runtime/range/owner 改动在下一次该同步采样重新读；本候选没有 revision，因此不声称支持写入后重用。同 source 内没有已认证的只读证明时就走原路径。
- 可接受的收益假设只有“符合门禁且有 battery 的 source 从两次组合改一次”；不能承诺整步收益，也不能把 39832 次重复都归到这两个调用点。准备、兼容检查、fallback、release 成本必须一起计入主代理后续 ABBA。

这个候选的根因边界是 **原 consumer 实际需求重叠**；不改变 fleet weighted median、role、速度公式、排序、武器资格或 threat 观察时机。没有 helper / 生产集成 / 新测试工程。

### A0. 先做 source materializer 内局部复用，不扩大生命周期

- WeaponThreatFrame 和 FleetTactics.readiness 已有每 source 一张 range table。对认证的 native `ship.getMotionStats`，允许在**该 source 的同步物化函数内**使用同表 `shipMotionStats(ship,0,table)`，保留 capacity/零 dt 语义；unknown motion override 仍调用原方法。
- 认证必须同时覆盖 `ship.getMotionStats` 和 system 的 `motionReaders` 标量方法：只检查 getWeaponRangePercent 的旧表不能授权绕过 getSpeed/getAcceleration 等覆盖。可在已认证 source 准备入口请求 range + motion readers 的兼容检查并只求值一次；任一覆盖不兼容时保留旧 range + 实时 motion 路径，不强行借表。
- 无 battery/source weapons 时不要为了统一接口而额外 prepare 一张 table；原先何时触发回调仍是限制。
- 原生表认证缺失、scalar 覆盖、可观察 custom callbacks：保持旧逐 getter 路径。不能仅凭“已经取得 table”就判断可减少 callback 次数。
- 这是小边界候选，不承诺其收益；准备/门禁/投影成本必须计入。

### A1. root+module plan：沿用现有 DecisionReadPlane / CombatQueryReads

- provider 由真实 CombatAIPhase/scene 建立；可按 source Ship 索引，在**第一次真实需求**时执行原 ShipSystem 组合图一次。按有需求 ship 准备，不按所有 ship×weapon eagerly 生成。
- 战术 combatProfile/TacticalPositioning/其它只读 fallback 要向同一 provider 索取，而不是绕回 scalar full-table build。准备必须来自已经认证的 stage owner，不由 caller 传 `{readonly:true}` 或 tick 字段冒充权限。
- 现 `CombatAIPhase.plan:47` 遇非 nativeAIInstance 仅关闭 systemInputs/attachedMotion，没有因此关闭 scene/readPlane；不能把这条分支误读为共享 modifier 权限已撤销。若扩展 provider 到更多消费者，必须另行认证全部可达 plan 回调，或在未知 AI 前关闭 provider 并改走独立/live 路径，不只认证系统 definition。
- FleetPlan 与 ThreatFrame 处在不同入口/await 边界，不自动 seed 这个 provider；若要把 fleet readiness 纳入同步 plan lease，必须显式绑定 planFleetAI 的真实 native caller，并证明该调用及此前步骤没有 raw-world writer。最小首版不跨这两个边界。
- `execute()` controls 前 closeObservation、异常 finally、unknown AI/after callback 都撤销；不恢复旧 lease，不序列化，preview/hydrate 重建。
- effects 中的 defense live reevaluation 继续 live path，不使用 plan-time damage/range/geometry 值。

### A2. fire-query：只在全部 weapon-state 完成后新准备

- 生命周期：ShipStepBatch enter(fire-query) 后开新 epoch；只对被 batch/roster 认证且实际 query 的 shooter 取 source table。
- 复用 FireControlQueryBatch.sourceModifiers 出口；在每个射手的实际查询链中保持一次准备，不另建 global tick 缓存。NumericAcquisitionFrame / WeaponAcquisitionKernel 的集成由主代理决定，本任务不编辑。
- 最小结果只向射程/弹速消费者暴露如下 **scalar group**：BALLISTIC/ENERGY/MISSILE 各 rangePercent 和 projectileSpeedPercent（缺省 0，undefined weaponType 仍 0），及不可伪造的 stage 归属。不要把 damage/RoF/ammoRegen/fluxCost 整表交给发射阶段。
- projection 如果在 provider 内构建，读取/分配也属于准备成本；保留 NaN/Infinity/-0/缺省和原浮点表达式，不为了紧凑格式改变行为。
- combatWeaponRange 保持原静态规则、ECM/fighter flat/threshold 计算；若进一步准备最终每挂点 range/speed，必须与另一 spec 生命周期任务的真实版本出口协调，且不能复制一套字段签名每次查询重新审计。
- frame/rosters 在 fire-commit 前关闭；actual emission 继续读取即时幅能/弹药/系统倍率。legacy/interleaved 每 shooter prepare→query→close，不借用 phased world 的 epoch。
- unknown query callbacks 保留既有阶段采样语义，不给它们新的共享范围。扩展访问到真实 Ship 时不声称它被锁定。

### A3. 拒绝扩大玩法和误计收益

- 本方案不减少每步 preAim 响应，不改变 1.5range、角色/射界/接触几何/current 优先/平局顺序，不跳过冷却诊断/导航消费者。
- 不修改 threat clock、AI 时钟、entity/mount 数、dt、显示 ms 或 RNG 流。
- 不是要求当前主线立即集成：主线先完成独占 ABBA。这里是下一块修改边界，不是已通过的优化候选。

## 7. 备选方案 B：真实写入 revision（代价更高，不能半做）

若必须跨同步只读跨度复用，需要由 authority producer 提供 revision，不通过消费者逐字段 WeakMap 比对冒充版本。

最低需要：

1. **program/topology revision**：安装/refit/定义身份、system/system-list/auxiliary 链、owner/parent/moduleMount/childModules/carrier rebind。
2. **lifecycle revision**：state、lifecycleActive、effectLevel、retained OUT strength、disabled、activationInput（含 nested vector）、cooldownTimer/maxCooldown/teleportVisual。isExecuting 的 private execution 变化也必须可见。
3. **owner-rule revision**：flux/overload/vent/death/hull/retreat/dock、工程段生存、weapon availability、runtime disableWeapons/system 等；不能只订阅 effectLevel。
4. **runtime source revision**：set/delete/clear，以及所有合法原地变化/alias。要改变 alias API 必须先确认兼容边界，不能悄悄冻结用户对象。
5. **family propagation**：parent↔children、carrier↔fighters；Edict 子模块自身 eligibility 改动必须触发自己的 composed range 失效。不要因不写 range 字段而漏掉 indirect disableWeapons。
6. **range environment revision**：ECM、carrier fighter flat、ShipSpec/WeaponSpec 经另一个任务认证的版本。不把 static spec 永久冻结当作已追完生命周期。
7. **restore / realm epoch**：owner-wire.apply、snapshot direct decode、preview begin/rollback、world dispose/rebind、replay 新引擎都要作废旧派生产物；revision 不从显示 snapshot 借来作 authority 权限。

更合理的 field-group revision 区分 range/speed、motion、damage/flux/RoF，不因 range 不变而共享其它字段。但构建正确 dirty graph、通知所有 writer、hot-path branch/map 与 family invalidation 成本很大；当前证据优先支持方案 A。

## 8. 准备成本与后续集中验收（未执行）

成本口径：

```text
净收益 = 旧完整 step 成本 - 新完整 step 成本
新成本必须包括:
  owner/reader admission + demand discovery + callback evaluation + ordered folds
  + scalar projection/allocation + source lookup + consumer kernel
  + invalidation/close + restore/rebind/fallback
```

- 在真实 producer 记录 prepare requests、distinct source prepares、hits、rejections、ordered-fold 次数/分配；拆 plan / source-materializer / fire-query / live-effects，不用 tick 内相同输出充当 hits 权限。
- 同 native seed917 / 2玩家+20AI / 734挂点窗口，由主代理统一 ABBA。计数 probe 和 uninjected 计时分开，不碰计时进程或反复并行 tsc/lint。
- 最小定向行为矩阵：IN→ACTIVE→OUT retained / COOLDOWN passive；Eclipse 相同 level 改 flux；Rocinante active vent/disabled；Gloriana parent activate、child sealed/unsealed/ammo0/故障、accepted input 清除、parent/child death；Escort mag set/delete；auxiliary 变更；ECM preview 回滚；owner/snapshot 同对象 hydrate；unknown scalar/motion/module/isExecuting callbacks；fire-query close 后读取；query throw 的 finally revoke。
- 对比保留原始快照、双 RNG、AI/defense/tracker 及 close/fallback 行为；计入准备成本后仍改善才考虑生产接入。
- 原版源码核实：未完成；原版实机/UI：未完成；本次 Web：源码静态审计完成，未进行运行验证；性能：无新结论。主线已有 tsc/lint/270步严格一致是主线顺序修正结果，不记成本文方案的验证结果。

## 9. 独占修改文件与后续所有权

**本任务实际新增/修改（独占）**：

- `C:/starsector-web-master/docs/combat-range-modifier-lifecycle-audit-2026-10-03.md`

**本任务没有修改**：所有生产代码、helper、测试、配置、构建输出、bench artifacts、存档、生涯文件。没有桌面或子代理操作，没有提交/暂存/推送/发布。

**不可写 / 不申请集成**：

- 主代理独占：`C:/starsector-web-master/src/engine/ai/NumericAcquisitionFrame.ts`、`C:/starsector-web-master/src/engine/ai/WeaponAcquisitionKernel.ts`。
- 另一任务 / 禁改：`C:/starsector-web-master/src/engine/simulation/systems/ShipWeaponControlSystem.ts`、`C:/starsector-web-master/src/engine/extensions/HullMods.ts`、`C:/starsector-web-master/src/engine/simulation/Weapon.ts`。
- 本文建议未来可能涉及 CombatQueryReads/DecisionReadPlane、WeaponThreatFrame/FleetTactics 的 source materializer、FireControlQueryBatch/ShipStepBatch 的真实跨度绑定、ShipSystem/RuntimeCombatModifiers 的 revision 出口；**这些不是本任务已获独占的文件，也没有在本文中修改或集成**。

备注：本工作目录没有可用 Git 仓库（git status 报 not a git repository）；因此不伪称有 git diff/clean 基线。通过本任务实际文件写入范围报告所有权，不覆盖他人并行改动。