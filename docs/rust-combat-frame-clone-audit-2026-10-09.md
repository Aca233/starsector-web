# Rust 帧事务克隆成本：只读审计方案

本块只定位性能成本，生产事务由 ROOT 负责；不修改游戏规则、玩家界面、操作流程、联机频率或存档。所有单步与命令失败仍要求原子回滚、保留完整权威校验、日志、双 RNG 和发布隔离。近炸实现和已通过验收保持冻结。

原版依据为本机 0.98a-RC8 settings.json:9 的 60fps 与 BallisticProjectile.java:162–180 的逐步实际弹体状态。原版证据并不能证明 Web/Rust 事务克隆策略，不能据此删除回滚。现 Web LocalWorkerHost.ts:22–36 只接受一个在途事务，checkpoint 只包含 ACK；receive:128–170 验证序号、tick、witness 后才接受发布。RustContentCompiler.ts:188、398、570–572 对内容/构造输入使用 immutableCopy，但 Rust 的运行时 Vec/struct 并无自动不可变品牌，必须核对原生所有写点。

当前 state.rs:789–798 的 step_scene 依次克隆 world、scene、roster bodies，构造 scene_authority，再克隆 ordnance/RNG；scene_runtime::advance 完成后仍完整 validate_scene_draft，最后才写 tick/time 与 commit_scene_draft。每个早退保留原 Core 状态。Body/ShipState/CombatShip 显式 clone 复制全部动态与静态字段；Ordnance::clone 复制 projectiles/beams，按已有合同不复制临时 emissions/effect_records。world_owner::Owned、scene_owner::Owned 则派生 Clone，深拷贝各嵌套 Vec/String/map。

实施顺序：冻结当前 native 源，记录文件 SHA；只在临时副本给 step_scene 的 world/scene/bodies/authority/ordnance/RNG 分段及 world 顶层字段添加计时，用与原派生 Clone 同样逐字段的 clone 观测；实际 22 根舰/176 body 混舰 270 步，逐帧真实 capturePresentation 与 acknowledgePublication，只平均 181–270 步。计时器无生产写入，不做正式 ABBA，也不重跑近炸/完整 oracle。记录实际 clone 调用和结构规模，避免把在途 ACK 未回收日志的积累误当正式负载。

若 clone 只占小量，则如实报告，不扩大修改。若存在显著不可变大对象，先核全部字段写入、动态出生/舰载机/metadata 准入、checkpoint 克隆后的隔离要求，交 ROOT 准确文件/字段/写点；需要生产授权后才能改成 Rc/Cow。允许共享的只能是无内部可变且所有修改显式 copy-on-write 的数据，不能因为名称叫 static/meta 就假设不变。扩展玩法或界面前仍须先更新策划。

验收为实际当前运行的 clone 分段计时、源码指纹与写点审计。通过仅代表审计完成，不代表性能门、最终 installed Cargo/SHA、完整游玩或原版实机 UI 通过；用户禁止可见窗口/键鼠操作，本块只后台文件与无头运行。没有新的玩家行为取舍或需要用户决定的事项。

## 具体字段与写入边界

| 候选 | 当前实际写入 | 隔离要求与可能方案 |
| --- | --- | --- |
| flight_runtime::Owned.statics，BTreeMap<String, StaticShip> | flight_wire.rs:37 安装；scene_dynamic.rs:48 在 add-ship/wave 完整事务里添加新模板。drone_spawn flight_runtime.rs:252–253 先克隆单个模板，再改克隆内 spawn_admission 标记 | 内容没有 RefCell/内部共享可变；可考虑整 map Rc + 插入时 make_mut，或 Rc<StaticShip> 值。drone 的单个模板修改必须复制后写，不允许写回注册表 |
| flight_owner::Owned.templates 的 CraftTemplate/Variant/StaticShip | flight_owner.rs:109–112 install；scene_dynamic.rs:41–44 找现有模板并追加 variants | 集合及 variants 都可动态写，必须保 copy-on-write。不能把整个 templates 声称永久不变。spawn:212–214 只克隆选中 variant 后构造 |
| combat_visuals::Meta.value 的 VisualMeta | visual_wire.rs:24、combat_visuals.rs:50–51 admit；flight_admission.rs:99 给真实生成舰注册新值；没有现有运行时 value 字段写点 | 可考虑 value:Rc<VisualMeta>；outer Meta.stable 必须仍独立 String，因为 scene_dynamic.rs:63 的 sentinel 重命名是真实写。shots/status/components 对 metadata 的局部 clone 也可因此便宜，但它们不属于此次只读 clone 授权 |
| ai_resident::Actor | actor_mut 下 order、memory、diagnostics、defense_facing，scene_dynamic.rs:61 还写 stable_id/reset memory | 混有真正动态状态；不能共享整个 Actor。若需 metadata 分离，会扩大多个 owner 的接口改动，当前不建议 |
| CombatShip/ShipState | 舰体 bounds 和 FireEntry constructor 与 query memory、attrs、graviton、readiness、death strings 混在同一 owner；scene_dynamic.rs:58 会写 death.strings[3] | 不能对整个 combat/death 盲目 Rc；当前 exact Clone 保完整写隔离。只有量化为主要热点后才拆具体字段 |
| Projectile.delivery | projectile.rs:32 已为 Rc<Delivery>，发生修改使用已有 make_mut 路径 | 大量 live 弹体克隆已经共享完整 delivery，不能重复计算此类优化的收益 |
| phase_runtime::Controls | 当前行 Vec 复制、index 为 Rc<HashMap>；DerefMut:16 在暴露任何 Vec 修改前置空 index | 已有拓扑共享与写入失效策略，本块不重复调整 |

以上行号对应此次冻结前读取的当前源，不代替正式最终 SHA。scene_authority state.rs:752–758 还复制 allocator generations/free/stable 字符串和 Collation，随后 allocator/Collation 可因出生及 dynamic admission 改变；这部分必须单独计时，不能与单纯的 Vec clone 混为一项。

## 实际结果与处理

冻结 native 完整 actual22/176body 270 步已运行，逐帧 capturePresentation 和 acknowledgePublication，181–270 共90样本。临时 profile Wasm SHA256 为8b83b373a556615c8440f96c9087d01097aae34ed0c5845a4fc6922799ceb3b9。world各字段计时完全按原派生 Clone 字段顺序，仅临时副本改写；没有生产 timer、生产数据结构或事务变化。source-binding.json 记录冻结文件 SHA；期间另 owner 修改六个生产 scene/system 文件，冻结副本始终同源，不能把该副本当作正式最新构建。

分段草稿 clone 总5.1613ms，其中bodies2.6673、world2.2083、scene0.19604、ordnance0.08935、两条RNG总0.00030ms。world内 flight1.1643、visual0.6710、AI0.1771ms，其余各项均小；这些嵌套项已包含在world总数，不能再次相加。authority构建0.35315ms另计，不属于简单clone。整个step121.057ms、scene_runtime::advance110.006ms，本轮多任务CPU竞争明显，所有数字只是诊断，不能当正式性能证明或提速承诺。

确认ACK负载：步前world.visual.audio与scene.audio平均0，无历史音频积累；真实规模176视觉meta/734挂载meta、21static模板、约2397trailpoints、171projectiles、12.5beams。clone占此次观测step约4.26%，不是最大热点。建议ROOT优先完成当前已有推进/火控/投影优化和正式新Cargo/ABBA，不仅为这些小项扩大为跨owner的大范围metadata拆分。Rc/Cow写隔离候选保留作后续证据，不擅自实施。

首次编写临时runner的工具patch因嵌套模板字面量失败，修正仅脚本引用后正式运行一次，native编译及实际270步均成功；没有生产失败或断言放宽。未重复已通过的近炸fixture，也未重跑完整规则oracle；actual运行成功不代表最终性能、完整可玩或原版UI实机等价。详细数字与限制在profiling-frame-clones/summary.json。状态：本只读审计完成、生产零修改、CPU已释放，最终新Cargo/同installedSHA/整场可玩仍ROOT推进。
