# Rust 常驻导弹制导、诱饵及 MIRV：实施方案与来源

## 2026-10-09 实时导弹观察成本续块

本块已集中验收并冻结。最终生产只改 battle.rs guidance item 构造（全文 SHA30db3fc1f0e88180674b61b073a813d121913bb99abf01920f95fe35b6b69b54，该片段 SHA b499c775514db729768a0b097a20b305e038742f9c900fd49b03d89014ab5879）、missile_owner.rs (bb02b43b2d0af1865e85f1132e98e1eccdfc7d3b2432dbfd1e66196127736142)、missile_guidance.rs (4ee7cc5e6c21736d26eaf51a9df5442fafb6d31a4c82cab326bcf757f566283c)。TargetWorld/Targets 在当前借用期按原序完整 observe 被查询实体；普通 missile/flare 算术和 RNG 不改，Mote 仍原 World。world.rows 在原 item 边界验证，sync 数字 id 后备改为直接查询同 resident serial/id，MIRV 真实 child 仍原独立 Delivery clone。没有跨 item cache 或不完整观察，没有 timer/diagnostic import 进入生产。

tmp/flight-guidance-observation/result.json 与 sources.json：同全部其余 native 冻结旧新 plain 0f88567ace29422ee591f27f0d51f24e36d85eeb7fd1a34f3da584058501bd03 / 5c153a1633a3760684766eb8469dd7ff8936a4cc9aa76195e164a0eea939a3fc，rustc opt3 exit0。actual RustCombatKernel 22主舰/176body 270tick 全 snapshot+scene 以及 actual RustLanKernel 60tick（含tick8真实reserve部署），118,797,117 strict值/7,664,261对象/104,960,199 typed cells，Object.is、own keys/order/prototype 全同，maximum216projectiles/34guidance，source changed[]。直接现有 TS missile/flare oracle 每版24场3,600步、995,196strict/114,552geo，257 missile/child与92flare出生、201/42contacts，max几何2.842e-14。actual worldFixture ordinary lethal8步真正目标死亡+hulk、完整旧新 snapshot和失败batch完整rollback严格同；既有真实 gravity capture fixture 两版 bits255，涵盖 Rc spec分离、held/other/saved不变、stale拒绝与RNG不变。未装 installed、不跑 final Cargo，不称整体finalSHA或可玩门禁完成。

死亡旧TS oracle 原本在旧baseline ordinary lethal tick4 hulk0 field0 Rust2 vs TS1失败，断言未删除/放宽；本块定向使用原真实 worldFixture 推进，比较完整old/new死亡结果，保留该已存在原版合同差异供主代理整体收尾。测试 fixture 全局注册重复遇到 Duplicate weapon 后，改为两个独立 bundle模块实例，当前定向结果通过，不把 fixture bug 改生产。

一次 targeted tmp计时副本结果 profile-result.json（不代正式ABBA）：同真实22/270全发布hash相同，第181–270tick原 guidance item30.544/step不变，guidance read+rule+sync1.042392→0.293428ms(-71.9%)，advance_projectiles10.521461→9.629277ms(-8.5%)；observe_ship10727.889→0、observe_projectile5299.511→30.544，此实际场后段 unguided rockets不请求舰船，不是取消guided target规则。timer与count有诊断开销，不能全归正式速度。plain全stepnative56.668→56.623ms、包含JS读的step69.719→72.123ms机器/其它段影响，不claim全步收益。当前本块有效只读成本减少保留；总体可玩、严格mixed规则与同最终 installed验证继续主代理。

目标是完整保留当前导弹、诱饵与 MIRV 的游玩结果，减少倒序弹体推进中的重复只读构造。当前 battle.rs::advance_projectiles 每 guidance item 先完整观察两份舰船、全部弹体和小行星，再深 clone guidance.child Delivery；真实目标查询通常只需要一艘舰船或一枚诱饵。此处成本只读，不是新的玩法或玩家操作。

本次再次核本机 0.98a-RC8 DamagingProjectileAPI.java:25–62 的动态伤害/源/已伤害身份，MirvAI.java:145–166 的当时目标与距离、harpoon_mrm.proj:19–23 的引擎规格；直接迁移合同为 WeaponSimulationSystem.ts:98–167 每枚倒序弹体当时生命周期→flare→angular→guidance→motion，MissileGuidanceHandler.ts:120–158 的有序即时目标查询，以及 FlareGuidance 的即时诱饵锁。原版 evidence→完整最新实体与不变有序规则→当前差异仅重复复制→同冻结真实 old/new 完整 publication 对照。原版实机与截图未补验；禁止桌面操作，没有 UI 修改，不声明视觉等价。

范围仅 battle.rs 的 guidance 观察构造、missile_owner.rs 的必要只读视图与 sync 输入、missile_guidance.rs 的必要查询接口。保留现有 slice World 供独立合同；增加单个 item 内的 resident 只读查询，仍使用原 observe_ship/observe 全字段组装，在原 roster 顺序查询当时实体，不提前跨 item 缓存。advance_mote 及其 retained/shared 逻辑保持原接口；普通 missile/flare 规则、算术、RNG 与门槛不改。只借不可变 Delivery.guidance，不深 clone child，真实 MIRV 出生仍独立 clone Delivery；保 ROOT 的 Rc/COW。禁止扩 ABI、Core、发射、beam、碰撞、数量、字段、频率、默认后端、网络、生涯或发布。

实时顺序仍由现有推进控制：begin/store 后才借视图，guidance 结束后释放借用，再 sync/store/顺序写锁/实际生成 child；更早的命中、捕获、phase、damage、retire 与出生对后续弹体立即可见。world.rows 每个 item 原边界完整验证，保持失效身份错误；ship_any 的 live 首匹配后 retained 全 bodies 后备顺序不变，sync 的 projectile 数字 id 保持原 handle 首匹配与旧 numeric 优先。没有省字段、写旧世界或玩家取消/失败新路径；错误仍由完整事务回滚 RNG/实体/事件，取消仍销毁整局。权威/并发/checkpoint 和存档格式不变。

实施为来源/本文→冻结旧 owned 片段→只读接口与实际构造→同完整 native 冻结 old/new 的真实22主舰至少270tick snapshot+scene 严格逐值/ownpresence/顺序验收，补现有真实 flare/MIRV 和 death/capture 隔离场。诊断 step 时间只用于确认本块收益，不冒充正式 ABBA 或最终 installed SHA。仅本块集中检查；整体正常游玩及同最终 SHA 门禁仍由主代理继续。没有新增产品取舍待用户确认，待核实是本块实测收益与真实全战差分。

本块属于已授权的完整 Rust/Wasm 战斗迁移；不改变玩家操作、UI 或现有 Web 玩法。目标是玩家现有锁定导弹、诱饵、MIRV 与微型舰载导弹正常追踪、失锁、加速和分裂，全部规则及随机状态由 Rust 常驻核心拥有。

## 范围、流程及失败处理

安装时一次提供原生武器/系统制导规格；之后在每个弹体生命周期更新后、运动前读取当时有序实体 roster，进行引擎转向与加速。普通制导保持原锁，只有目标死亡/相位或不再敌对才按 roster 首个敌舰重锁；诱饵锁有效时保留备用舰船锁。MIRV 在原顺序检查 elapsed、closing ETA、距离和朝向，成功后按 spread/inaccuracy/speed/id 的既有随机顺序发出有序子实体记录并移除母弹。调用方在当前事务内安装真正子实体，接通已有碰撞、伤害和生命周期，不把记录当作已交付实体。

诱饵处理 STANDARD、SEEKER、JAMMER 三类；等待期、独立免疫集合、ECCM 短路抽样、就近稳定 tie 与源寿命逐项保留。命中的修改应立即应用到仍存活的常驻导弹。Mote 保留 source 共享 attractor/mote membership、每目标两枚预算、硬避障、邻居凝聚和 steering。共享源状态由对应舰船系统推进；本模块不冒充已迁移发射系统。

本块不增加界面，不迁移近炸/拦截/爆炸/特殊 onHit 的提交，也不调整战斗地图和生涯。取消/重开销毁本局常驻状态；安装未知规格或步骤失败按总核心事务回滚包括实体、诱饵记忆、子弹生成及 RNG。各舰船及弹体身份须保留代次，免疫集合使用实体实例身份而非可重复的随机展示 id。

## 原版证据 → 预期行为 → 当前差异 → 验证

原版为本机 0.98a-RC8。`../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/missile/MissileAI.java:209–239` 显示目标有效性和 guidanceBonus 加权预测；`MirvAI.java:145–200` 显示 splitRange 随机化、最短时间/提前 ETA、距离/角度门槛，后续 `:245` 起显示分裂展开与速度；`FlareAI.java:33–78`、`SeekerFlareAI.java:39–112` 显示 .05–.1 秒扫描、免疫和 ECCM；`FlareJammerAI.java:46–95` 显示物理环绕目标且没有调用 chance 的逻辑；`MoteAI.java:43–80,187` 起显示共享 attractor 和 flocking。交叉检查 `../starsector-core/data/weapons/proj/harpoon_mrm.proj`、`data/shipsystems/proj/flare_standard.proj`、`flare_seeker.proj`、`mote.proj` 的行为/引擎配置，避免把反编译名称直接当规则。

迁移直接合同为 `MissileGuidanceHandler.ts`、`MissileLeading.ts`、`FlareGuidance.ts`、`MoteGuidance.ts` 及调用顺序 `WeaponSimulationSystem.ts:105–153`。现有 Web 已简化原版的转向任务、扫描网格与原版随机源；本次保留这些已授权差异，不以语言迁移加入原版行为。Rust 目前生命周期和普通弹体已有，但未接制导，MISSILE 类别仍受安装门禁。本模块补全真实 TS 算术及记忆，供主核心接线。

原版截图和实机相关显示/交互未验证，用户当前禁止占用桌面输入；无 UI 调整，不声明原版视觉等价。

## 权威、依赖、阶段及验收

沿用宿主 tick/epoch/序号，不接受客户端上报命中或整世界/导弹状态。模块的有序 World 视图由常驻实体直接构造；不可由每帧 JS DTO 充当权威。诱饵与 Mote 记忆参与 clone/rollback/checkpoint；投影是只读复制。生涯及存档 schema 不改。

顺序为来源与本文→纯 Rust 规则及持久记忆→真实 TS 方法 Node/Wasm 与 fresh dedicated Worker 集中差分→主核心实际子实体/诱饵/mote共享状态接线→完整可玩验收。严格比较目标身份、stage/decoy/fizzle、计时、寿命、所有 RNG、输出数量及顺序；几何 pose/角度/向量仅按已批准容差。覆盖目标死亡/相位/重锁、无敌舰、零转向、有限/无限角加速度、正 guidanceBonus、MIRV 奇偶 spread、提前/时间拒绝、flare ECCM 短路/免疫、seek delay、jammer orbit，以及 mote 的预算、硬避障和 attractor 分支。

待核实与剩余差异：完整 resident integration、近炸/拦截/爆炸、系统发射共享状态和生产/联机恢复仍由后续块完成；独立差分不代表完整战斗。没有新增产品取舍待用户确认。

## 独立模块交付与集中验证（2026-10-08）

完成 `native/combat-core/src/missile_guidance.rs`。生产共享 `lib.rs`、`state.rs`、`battle.rs` 与 TS ABI 均未修改。真正源方法 `MissileGuidanceHandler.updateMissile/updateFlare`、`advanceMote` 及私有 flare WeakMap/WeakSet 是差分基准，未在测试重新实现 oracle 算法。

`scripts/lib/rust-core-missile-guidance-harness.rs` 构建的 isolated Wasm 与 `scripts/check-rust-missile-guidance-module.mjs` 在 Node 和新建 headless Chromium dedicated Worker 均通过：24 场、1,888 步、60,898 严格字段、11,489 几何字段，6 次 MIRV、23 枚子弹、16 次诱饵锁。Node 几何完全一致；Worker 95 个舍入记录，最大 `5.684341886080802e-14`。结果为 `artifacts/rust-combat-core-20261008/verification-missile-guidance/result.json`；isolated Wasm SHA256 `bd4849fe893de238d0f074ef521106b88419e7630aeb7cd210a9f2b59cf443fe`。此文件含调试元信息，大小不用于生产性能比较。

集中验证包含舰船失效/重锁、零/有限/无限角加速度、guidance bonus、奇偶 spread、目标距离/最短时间拒绝、ECCM 短路与免疫、seek delay、jammer、mote attractor/预算/避障和同一步移除后共享列表的残留引用。改动 TS/MJS scoped ESLint 通过。依赖图 strict tsc 未整体通过；本次检查文件没有诊断，剩余现有依赖诊断保存在 `verification-missile-guidance/typecheck.log`，不能声称整体类型检查通过。

## 主核心接线合同

1. `Identity {handle,generation}` 必须对应真实实例。展示 `id` 的随机值不是可复用实体身份。安装规格保留 Option 的缺省语义，角加速度缺省使用 Infinity；舰船/弹体 allegiance 同时保留旧 `isPlayer` 是否存在，因为现有敌我后备路径按该存在性分支。
2. 按 `WeaponSimulationSystem.ts:105–153` 的顺序：elapsed/prevPos/arming → SourceMissileLifecycle（到期/失效先处理）→ flare → angularVelocity → 尚有动力/未disarm/非inertial的 missile 或 mote →普通运动→接触。本模块不重复递增 elapsed，也不移动主弹；返回 true 表示 flare 到期或 MIRV 成功，应在原 index 移除。
3. `World` 必须是此弹体处理当时的有序实时 roster。`retained_ships` 保留 jammer 的原始 orbitTarget 和 emitter/mote source；`retained_projectiles` 保留该次世界步 `MoteControl.onAdvance` 过滤之后仍属于 shared.motes、随后已在倒序弹体处理移除的对象。Mote 的每目标预算与 cohesion 读取共享列表中的对象；锁定查询只读 live roster。不能提前把共享列表再次过滤。
4. `advance_missile` 的 `Child` 输出保存真实 spawn pose、父 velocity、launch speed、伤害、source multiplier 与有序随机 id。按规格库 child_spec 接通原 onHit/视觉等静态字段，初始化原 ballistic lifecycle，再按输出顺序追加真实实体；倒序 loop 本次不推进新增的 children。成功母弹移除、split audio/smoke 与子实体安装必须在同一事务。不存在的 sourceDamageMultiplier 保持不存在，以便未来多代 MIRV 的后备伤害计算。
5. `advance_flare` 的 `DecoyLock` 必须在该 flare 更新结束、下一弹体查询前按输出顺序立即写回常驻目标。它只改 targetProjectile，保留备用 targetShip。`FlareState` 的 wait/spin/seekAfter/immune/target/orbitTarget 是 cloneable resident 状态，参与 rollback 与完整恢复；不能每帧重建，不能遗漏不在 live roster 的免疫实例身份。
6. `advance_mote` 之前由真正源系统更新 `MoteShared` 的 elapsed、attractor/lock 及按源系统过滤的 motes membership；初始化 age/turnSign、发射补充和死亡 disarm 的随机顺序仍归对应 system。source 可能已退出 live ship roster，仍须通过保留引用访问。源系统、onHit、拦截、近炸/爆炸闭包尚未在本模块交付。

## 本次主核心联合接线

先接通常规rocket、guided、MIRV和flare安装数据到FireEntry/Delivery，真实发射时创建带稳定serial身份的常驻弹体、捕获船目标代次。拆开原Projectile.advance的生命周期/运动边界，在flare→angular→guidance的当前原顺序调用现有模块；每枚倒序处理时借用此刻resident舰船/弹体世界。MIRV子弹按真实输出初始化ballistic状态、追加到真正ordnance roster，本步不再次推进；flare锁立即有序写回下一弹体可见。所有记忆、免疫、targets和split状态在现有事务回滚，发布复制完整状态。dud概率按真正source component索引查，不按当前目标偶然相同查。

原版依据在上述本机MissileAI/MIRV/flare源；本次再次查看MissileAI.seekTarget及harpoon_mrm.proj engineSpec，并核对WeaponSimulationSystem:105–176阶段。前述严格差分合同不变。此块仍先拒绝未安装子delivery/制导参数及未覆盖mote共享系统，近炸/拦截/范围爆炸由相应模块继续；普通制导闭环不等于七包生产可玩。没有新增玩家交互或取舍。
