# Rust 常驻武器特殊效果：策划与来源对照

2026-10-08；沿用总策划、浏览器与 Electron 共用 Rust/Wasm 和几何有限舍入/真实规则严格一致的取舍。本块属于真实可玩闭包，不把独立模块通过当作生产交付。

## 目标、范围及操作体验

保持现有武器充能、束流接触、命中、EMP、护盾增伤和声音/冲击表现。迁移已登记的 Tachyon Lance、Graviton Beam、Sabot、Mote、Hyperion Yamato 和 Gloriana Siege 六个 effect；状态由 Rust 常驻 beam/ship 持有，命中直接调用 Rust 的真实伤害提交，不能把 JS 回调作为每步规则求解。未知注册 ID 必须明确拒绝。

本块不改变 UI、武器数据、原版差异、系统、导航、制导、爆炸/地形或生涯存档；这些由其对应实施块完成。暂停不推进效果或随机数；取消/重开销毁实例，陈旧实体身份不能续接新 beam/listener。命中 shield/hull/环境的回调资格沿现有接触处理器，效果不会再做一次接触查询。无目标和部分亮度的 beam 保留已存在状态；光束删除则状态随实体删除。

## 原版证据 → 预期 → 当前差异 → 验证

版本 0.98a-RC8；本次查阅 `../decompiled/starfarer_api_source/com/fs/starfarer/api/impl/combat/`：

| 来源 | 预期和现有 Web 合同 | 迁移与验证 |
| --- | --- | --- |
| `TachyonLanceEffect.java:21–66` | .2–.3 秒 interval、wasZero 防重复 DPS duration、前帧 ray endpoint 判穿盾、hard flux-.1、energy/EMP .25/.5 | Web 使用两条确定 RNG、带权 engines→weapons 选择和真实 armor/components；严格对照 Web TS，不改成 Java float/Math.random |
| `GravitonBeamEffect.java:20–56,72–106` | 当前终点全亮度盾弧命中，按 weapon identity 一秒刷新；1/2/3+ 束分别 1.05/1.08/1.10 | listener 在目标 ship phase 先到期，beam contact 后仅刷新，不立即重算当帧 shield modifier；身份包括 source generation 与 mount |
| `SabotOnHitEffect.java:19–40` | 25% hull EMP，伤害为零 | 原版先抽样再检查 shield；当前 Web 先 shield short-circuit。本迁移保持已授权 Web RNG 顺序，不借语言迁移修正规则 |
| `MoteOnHitEffect.java:24–75` | fighter/missile 额外 energy；普通舰有穿盾 EMP | Web HF/普通 fighter/missile 为1000/200，非fighter判穿 shieldPiercedMultiplier、现有 outgoing/CR位置保持；fighter护盾明确硬幅能 |
| `HyperionYamatoHit.ts`、`GlorianaSiegeHit.ts` | 已授权 Web 扩展、固定冲击 puff/flare，无额外随机或伤害 | 输出具名纯展示记录，保留盾/环境资格和所有参数，不冒充原版能力 |

还查阅实际 `TachyonLanceEffect.ts`、`GravitonBeamEffect.ts`、`ComponentDamage.ts`、`OutgoingDamage.ts` 和 effect Registry/四个 hit 文件；权重为1/max(1e-6,distance)、最大100000，候选含暂时禁用组件，hidden weapon排除，无候选 center 不抽样。EMP shield arc 是atan2(sin,cos)且至少1°，不是碰撞5°门槛或半径判定。

没有原版截图/实机补验，用户不许可桌面输入；不声明原版视觉或实机等价。当前六个 effect 仍运行于 TS，Rust 常规 contact尚未闭合这些回调。

## 规则、权威、阶段和失败处理

实施仅写 `native/combat-core/src/weapon_effects.rs` 和本文件、隔离验证文件。核心集成由主任务维护，避免覆盖共享 battle/state/protocol 文件。类型化数值状态包括beam Tachyon interval/wasZero、Graviton wasZero和ship weapon expiry列表，支持clone进入已有事务回滚。依照现有世界阶段，listener advance在接触前执行；beam effect在普通接触/普通damage后执行。

即时damage sink是Rust内部真实提交接口：顺序包括armor、hull、sparks、component、statistics、声音及destruction；调用者必须同步完成这些步骤再查询下一个contact。显示event只承载视觉数据，不能回写damage、RNG或listener。Mote/Sabot的效果damage遵照当前TS不另记不存在的统计项。Tachyon raw EMP只记录一次。无可伤害interval仍遵照当前TS初始化抽样行为，已到期interval下次 eligible advance重新随机起点且不携带overshoot。

身份/关闭/失败沿总策划的epoch/generation与整步事务；联机客户机不能调用damage sink。pause/afterbattle不推进；同构建恢复必须包含resident effect state和两条RNG，裸表现记录不能恢复。生涯schema不改、不暂存/提交/发布。

依赖顺序：来源/本策划→独立常驻数值模块与Rust内部即时提交接口→一次集中TS/实际Wasm差分→主任务连接真实world/事务→生产可玩闭包验收。此块不要求新玩家取舍。

## 验收与状态

严格比较 interval/elapsed/wasZero、listener顺序/expiry/multiplier、两个RNG、EMP选择kind/index、damage金额和提交顺序；允许已确认容差的local/world geometry并记录。覆盖无目标/部分亮度/关闭damage、连续nonzero duration、interval重新初始化、盾弧最低角度/偏移/phase、disabled/hidden组件、无候选、Sabot shield RNG门槛、Mote普通/HF/fighter/missile、listener同weapon刷新/不同generation/1/2/3+到期，以及cosmetic shield/hull/environment资格。集中跑Node与fresh headless dedicated Worker，不操作用户桌面。

当前状态：来源阅读、策划、六类注册效果的独立常驻实现和一次集中差分完成。`scripts/check-rust-weapon-effects-module.mjs` 对实际 TS effect hooks 与已编译 Wasm 对照，Node 和 fresh headless dedicated Worker 均通过18场景×90步：33,285严格字段、6,268几何字段、2,286有序提交/表现记录，最大几何差为0。记录见 `artifacts/rust-combat-core-20261008/verification-weapon-effects/result.json`。没有可见窗口、没有生产启用。

此验证把真实effect hooks接到记录damage services，证明金额、请求顺序、目标选择/interval/listener状态和随机游标；**未证明实际Armor/Component/world接线**，不能以此声明整场伤害或可玩。改动TS/MJS的严格scoped ESLint通过；直接`tsc --strict`引入真实TS依赖图后仍报已有AI/System/CombatEngine及`ImportMeta.env`/raw声明问题，没有本fixture文件诊断，不声称全项目类型检查通过。

### 主任务接线合同

- `Effect::registered`只识别真实六个ID；Yamato是`web_sc2_hyperion_yamato_impact`。按`has_beam/has_hit/has_projectile_hit/has_environment_hit`验证hook，未知/不匹配拒绝。
- `BeamEffectState`随真实beam克隆/回收；`GravitonHits`随目标ship克隆。notify只刷新列表，不重算当前frame盾倍率；ship listener phase调用`advance`，回写或删除graviton modifier。weapon身份用source identity+generation+component，不用beam/cycle替代。
- `TargetInput`所有值必须由此刻resident world读出。engines/weapons保持原顺序，含暂时disabled、排除hidden；shield center含offset、FRONT facing用ship facing，kind遵循Shield0/1/2/3；Tachyon from用`rayEndPrevFrame??endPos`，Graviton用当前end。
- `Sink::armor_energy`接Rust `armor_impact([localx,localy,amount,ENERGY=0,hasStrength=0,strength=0,isBeam=0,applyHull=0])`，Tachyon/Mote的TS默认hitStrength使用该amount，随后独立`hull`。不能改成beam damage路径；`components`接`ShipState::propagate`，source weapon/engine damage multiplier为实际source。两个方法返回`Result`，错误原样回滚整步；visual/gameplay RNG以可变参数在正确位置传入，不能缓存sample或改用临时RNG。
- `BeamInput.has_target`必须与target Option一致。调用Tachyon时effect state初始化即使无target仍按TS消费首次interval RNG，但BeamSimulationHandler只在`damageActive!==false`调用effect，因此外层资格须保持。后续tick内frame pause/aftermath不调用。
- Mote普通船/fighter hit不在本hook补写当前TS不存在的stats/destruction；outer handler已有毁灭检查。Tachyon独立raw EMP统计和音频/毁灭顺序由sink实现。Mote missile额外damage helper只返回金额，caller同步更新target HP/拦截/回收，source保留语义见OutgoingDamage。
- 所有cosmetic/emp/sound记录提交后进入现有发布音频/FX；cosmetic固定puff参数无额外RNG。Tachyon/Sabot变体由visual RNG在damage之后抽样；不能在展示线程重新抽样。

仍待主任务闭合：实际battle调用、组件RNG/armor-scars/统计/毁灭、事务回滚、表现事件消费与七包完整生产可玩。完成前保持开发中。

### 追加真实提交适配块

为减少主任务接线风险，追加仅本域的 `weapon_effects_owner.rs`：Rust内部sink直接调用现有ShipState armor_impact/apply_hull/propagate/flux_operation，具名输出保留表现/统计和damage notice的完整跨方法顺序；destruction由同一Rust世界闭包立即提交而非延迟事件。追加隔离验证让actualTS ArmorGrid/ShipDamageState/WeaponComponentHealth与actualRust对象承接上述effect，集中核对每装甲格/HP/组件/两条RNG和请求顺序。仍不改shared lib/state/battle/protocol，也不把隔离通过替代实际生产闭包。

追加块已实现并通过Node/fresh dedicated Worker：`scripts/check-rust-weapon-effects-module.mjs --owner`，8场景×64步，146,040严格字段、16,158几何字段，最大差0；真实装甲格/HP/伤痕/组件/幅能/两条RNG一致。一次Tachyon致死触发同步Rust回调写dead；**此回调没有完整世界爆炸**，fullWorldDestruction仍false。证据见`verification-weapon-effects/owner-result.json`。普通effects Wasm SHA256 `22a64e0b2584786578b200e242d241757c72fe33d7292a1e9765785ffd398c9d`；owner Wasm `686b3950e2ef922ad81b92d167e3ec88b9eb11f8b72f0b0d23a0054c3b73fcaf`。

`OwnerSink`接线时必须传入本步resident bodies、source组件增伤和真实destruction函数（函数参数含同一gameplay/visual RNG及有序Record输出），结束调用`finish()`以传播非返回值提交的错误。`Record`包含damage notices、EMP、armor sparks、音频、统计与固定cosmetic参数；不要分多个输出缓冲导致sound/destruction/stat顺序丢失。真实world可能同时持有asteroids/ordnance/deployment，可在destruction闭包捕获其mutable引用；不能使用no-op闭包进入生产。adapter不判断pausing、admission或afterbattle，由外层真正阶段控制。实际battle接线、完整world死亡爆炸、事务/重复发布、完整生产仍待完成。
# 主核心真实接线（2026-10-08）

延续原完整迁移授权，玩家操作和规则不变。在真实FireEntry一次安装效果身份及baseEMP/宽度/颜色，在Beam常驻tachyon/graviton clock、舰船常驻graviton listener。prepare原listener时点先衰减并派生shield multiplier；hit barrier读取当时真实armor/flux/shield/components。常规命中立即结算后才调用onHit，真正beam在本次damage pulse之后运行effect（无目标tachyon仍初始化原RNG）。同步OwnerSink把额外伤害当场写入Rust armor/hull/components/flux，并产生有序表现/统计记录；错误参与整步回滚。舰船死亡世界闭包尚在接入前必须显式失败，不用仅写dead冒充全部殉爆。未知effect拒绝，展示副本不回写状态，重开丢弃本局memory；恢复要包含listener及beam effect state。依据本机0.98a-RC8 TachyonLanceEffect/GravitonBeamEffect/SabotOnHitEffect及当前TS真实hooks，原版实机视觉仍待核实。验收集中用真实fire→contact→onHit/beam→armor/components/flux/RNG核对，原普通弹体分支回归已通过，不重复未受影响检查。完整production/七包可玩和性能仍未交付。
