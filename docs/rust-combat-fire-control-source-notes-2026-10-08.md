# Rust 数值火控：来源对照与本块策划

2026-10-09 身份/roster索引候选最终取舍：same其它native冻结，onlyfire_query候选actual270+LAN60/真实reserve/capture全350201415strict、113700301typed逐位同，必要身份/firsterror/floatserial+未推进body两边131071bits。checked时其它owner修改native与TS presentation，故`verification-fire-roster-index/result.json` overall false是最新磁盘指纹gate；frozenbundle实际strict通过不能冒称最新sameSHA。诊断local native均值77.095→75.911但median73.576→74.167，LAN12.978→14.107/median12.552→13.583回退，lowtimer plan13.904→13.801基本不变：admission3.837→2.629被scope3.377→4.062成本抵消。**没有稳定收益，已仅撤回本次roster patch到保存的before-roster-index（已验收PreparedHulls状态），不把额外复杂度交production。** `profile-summary.json`标记accepted=false/productionRosterIndexReverted=true，原证据保留，不重复passed场景。World原已借切片、观察一次且不足.6ms，进一步不扩大缓存或冻结真实写入；所有已accepted几何/校验优化保留，交ROOT最终正式构建、完整玩法和ABBA。

2026-10-09 FIRE_QUERY身份/范围局部索引方案（先计数/来源/方案后实现）：低开销仅分阶段计时的actual22舰201–230观察，`plan_queued`7.0496ms，其中admission1.8891ms（一次）、owner scope/world validation1.6570ms（175.7667次）、body/mount/visibility观察.4727ms（一次）、projectile/ledger观察.0451ms（一次）；proof `profiling-fire-world-construction/result.json`。没有每unit深复制世界的证据，World实际借切片，故本轮不改Body/Armor/World所有权或跨调用cache。剩可证热点是active/queue/scope的重复linear身份成员查询。

目标/范围：仅fire_query当前plan_queued内建立按完整(handle,generation)键的原首行局部BTreeMap与成员BTreeSet；active/queued/ships/missiles保原遍历与第一错误先后，通过临时seen集合检查与原prefix contains等价。队列scope/missile_scope/budget_scope仍为原body/projectile顺序0/1数组；每entry建立其真实roster键集合以回答原contains，不把roster换成全部active，不省scope验证。ordnance missile admission仍原floatserial完全相等语义：只确为u32精确整数的serial可成为对应membership，不把非整数/NaN/负/越界按cast混入；0/-0仍对应原0比较，generation完整保持。body key→row map插入原first，重复body身份不改变owner首行选择；scope检查仍对每row成员，以免把重复body身份错误收窄为一个row。索引仅保存身份和row，不复制body/weapon/dynamic值；原观察、validated World、PreparedHulls、live幅能、所有规则数式/排序/RNG/资源/存在性原样。

来源/流程：原版0.98a-RC8 `ShipAIPlugin.java:12–27`要求advance/重新评估，`BoundsAPI.java:24–39`说明mutable当前geometry，不能因性能冻结更多状态；Web `FireInputs.ts:197–218` 当前真实roster/epoch成员编译，`FireProgram.ts:78–85` bind真实FIRE_QUERY只读输入，本轮同该生命周期，不声称原版排序/UI等价。UI/操作、取消/暂停/禁用、联机权威/并发、存档/rollback均无变化，非法输入仍在原位置返回同码。原版实机待许可，此块无界面改变。实施顺序：本文→onlyowned fire_query最小索引→冻结其它native old/new actual270+LAN60完整publication/capture严格对照一次→针对身份首match/代次/floatserial/错误先后与失败memory未推进fixture一次→低timer同freeze成本交ROOT。验收所有字段bit同且非法输入同第一错误；不重复hull/token已通过小场景，不运行正式ABBA/全套。最终sameSHA真实可玩门禁仍ROOT，无新待用户产品取舍。

2026-10-09 本轮PreparedHulls已验收：同其它native冻结，仅本两source变化actual22舰270步与LAN60/实际reserve/capture全部 **350201415严格字段、113700301 typedCells逐位相同**；13824几何bits覆盖凹/凸、空/退化、NaN/Inf、盾、换切片及修改后的body，9必要errorbits同，借用期mutation被编译器E0502拒绝。baseline466da756/currente6f8dba6 plain诊断构建，proof `verification-fire-prepared-hulls/result.json`；checked期间只有其它owner system_owner改变，old/new冻结source相同，owned和TS未改。paired native诊断实际last90均值105.864→96.175ms，LAN16.284→16.910，极重并发编译负载下只供诊断；不得作为正式提速或最新完整native验收。正式cf8c性能失败证据仍保；最终freshCargo/LTO+sameSHA全玩法/ABBA门禁由ROOT继续。

2026-10-09 火控同一次观察的船体几何复用方案（正式 ABBA 性能仍未达标，先方案后实现）：实际22舰第201–230步窄profile每步 `segment/hull` 各17707.2次，反复计算同一个body的 `(-facing).cos/sin` 与原顶点顺序min/max；dense timer会放大耗时，仅调用数作热点证据，不能称正式提速。原版0.98a-RC8 `BoundsAPI.java:8–39` 明确凹/凸多边形、update(location,facing)以及可clear/add的bounds；Web `FireControlGeometry.ts:8–45` 仅缓存深冻结 authored bounds，mutable/refit仍重读。预期为原polygon与盾精确接触、原padded local rejection；当前Rust每segment从同一immutable FIRE_QUERY观察重新计算所有不变量。

目标和玩家体验：同场目标、炮塔、友军避射、资源、按键与画面保持一致，只减少完全相同输入的重复数学。范围：仅owned `fire_control.rs/fire_query.rs`；新增借用原body切片的短寿命 `PreparedHulls`，逐body只计算原表达式的cos/sin及原顶点顺序min/max一次，同一 `plan_queued` 内供各owner/mount/真实FireBudget使用。`Program` 临时持有其不可变借用；每次调用必须核对实际body切片指针与长度一致，否则走原live hull。公开 `hull/segment/FireBudget::penalty/Program::new` 保持无缓存原入口；没有跨step、跨body写入或基于ID/浮点key的持久缓存。不可变借用保证被复用的body不能被安全Rust写入；下一观察重新准备，scope/visibility/live flux/决策始终按原入口和顺序读取。

玩法规则、UI和完整操作流程没有新取舍：仍在真实运动/相位观察后准备、按原mount顺序查询、转炮后判定、原有序资源consumer重查、成功后发射；取消/禁用/暂停/错误仍原行为。预算、盾参数、内点/边遍历、所有eps、circle第一根、候选排序、clock/RNG/真实决定及存在性不改；不加入更早world-box rejection，不代数简化数式，不缓存armor伤害结果。联机权威、并发、回滚与存档格式不变，scratch仅借本次只读观察而不写入保存。依赖/顺序：本文→最小精确实现→冻结其它native并一次old/new actual270+LAN60完整publication/capture逐位对照→一次mutable/new-slice/异常几何与必要错误fixture→同freeze窄计时交ROOT。验收要求所有字段bit严格、错误/次序相同且新body/new-slice立即重读；原版实机与最终Cargo/LTO/七包Ready/ABBA/LANSteam/无头UI仍归ROOT最终门禁，未满足前不启用默认。当前没有待用户决定产品取舍；原版界面实机仍待许可，本轮无界面改动。

2026-10-09 本阶段最终集中mixed证据：86d77a35当前所有生产+仅configure_mount cos候选真正270 `differences[]`，6432547严格事实和3409467几何事实，max1.5347723092418164e-11在预登记容差内，source所有每帧22word仍原ABBAexact。targets/真实FireDecision/RNG/所有controls/防御/盾朝向/资源/伤害/clock/FX/audio均同。按下文先写来源方案现只production该一个cos窄挂existingcanonical，sin、refresh_bore与global signed保持。证据`diagnostic-mixed-fire-pivot-cos/mixed270/result.json`和完整rows；两火控生产文件冻结交ROOT正式sameSHA Cargo/install/七包真实Ready/ABBA/LANSteam/无头UI终验，raw诊断零差不冒称整个项目可玩完成。

2026-10-09 真160防御上游158muzzle首因与第二个窄几何修方案：再次读原版0.98a-RC8 tracker `oooo_0.java:111–164` 先pivotLocation/pivotFacing再目标方向/有限turn；Web实际 `FireControlGeometry.weaponMuzzle:78–111` 先relative转shipFacing，再barrel转oldmountAngle并相加；`NumericAcquisitionFrame`真正boundsolve→`WeaponAcquisitionKernel.acquireNumericShip:88–90` 必须原`origin+(target-origin)+velocity*time`算序，beam time0也不能代数简化。159之前source/native所有完整pose、clock、RNG、target及控制同；actual158 enemyWS005 facing2.5957409300285623、relative[-75,0]、oldangle4.142817648989043、barrel[23.593,.076]同，**source shipcos-.8546854317628956/stdWasm-.8546854317628957**→pivotX144.4293592771006/144.42935927710062→muzzleX131.77033820112024/131.77033820112027→beam solutionpointX-289.621895633758/-289.6218956337581；159heldpoint同该差、pivot复同，dx-435.01886698910903/-435.0188669891091→已canonicalatan出-2.1486788631111975/-2.148678863111198→angle4.134506444068389/4.134506444068388→160BEAM资格改防御朝向。signed、barreltrig、所有其它算术相同，任何signed替换不消除原输入差。

证明 `diagnostic-mixed-solve-first158/math159/result.json` 只读真实muzzle+native原solve完整输入，source每word原ABBAexact，以及defense独立actualBrowser/rawWasm重构 `diagnostic-defense-turret159/actual-turret-signed-math.json` canonicalSolve sourceexact。目标/范围：仅 `Program::configure_mount` 的 `b.facing.cos()` 接已冻结existing canonical::cos，不动该处sin、refresh_bore trig/global signed/solver算序。无规则/UI/权限/联机/存档/失败影响，原版实机仍待许可，没有新产品取舍。先本文→onlydiagnosticclone一个cos270完整source对照→零strict差且geometryallowlist内→owner生产窄挂；token性能块已验收不重测未受影响fixture。最终Cargo/install sameSHA、七包真Ready、联机与无头UI可游玩门槛仍ROOT，不拿窄270冒全部完成。

2026-10-09 immutable-world校验凭证性能块已落且完整旧新通过：`World::validated`只能原完整校验成功构造private-field双borrow-lifetime `ValidatedWorld`，`Program::aim_validated`只从凭证内部取实际world；公共`aim`仍原validate→私有原算法body。production queued owner原校验点创建凭证、所有mount复用，actualliveflux预算原consumer仍逐发重查；decide等原来未全校验的入口没有额外行为改变。完整same-other-native plain旧新actual22舰270与LAN60/真实reserve/capture共350201415严格值、113700301 typedCells全逐位同、changedDuringCheck[]；public/token复用现9场×300步72900cell exact，12malformed与error先后+memory/RNG不推进32767bits全过。证据`verification-fire-validated-world/result.json`，baseline42bb449b/currentbb600f68（诊断plain构建，非正式installed）。

实际窄profile同200warm/后30ticks：validate904.4→175.7667calls、2.03141→.382577ms；728.6333重复aim全省校验且保持完整一次生产owner校验。机器同期不同CPU负载，plan16.2334→12.8054ms/native73.2153→63.2079ms仅诊断不能作正式提速声明；old/new配对native均值59.72676→59.32198ms、LAN9.15551→8.46911ms同样仅诊断。最终正式ABBA由ROOT做，同SHA门禁仍待。此两生产file本块冻结；数学159炮塔后续另最小计划追真实首因，tokenpassed不冒称所有玩法完成。

2026-10-09 真37防御首因实际炮塔角窄修方案：重新读原版0.98a-RC8 `trackers/oooo_0.java:106–171` 的pivot位置/面向、目标方向、反向pivot余量5°/s及炮弧夹持；原版实机仍待许可，本次不改UI/操作/权限/存档。真实source默认 `ShipWeaponControlSystem.ts:455–471` targetAngle直接Math.atan2(dy,dx)，随后原advanceTurretAim。currentclone107fdb3d真实32/36playerWS005的old/base/point/pivot/turnRate/pivotRate/dt逐位同：32输入dy761.4307023976537/dx292.8681887185141，source atan1.2036107934207936/native std1.2036107934207938；36 dy761.8432258060707/dx295.64737094936436，source1.2006178371079972/native1.2006178371079974。实际BrowserMath+原样Wasm stdprobe重构两边完整advance输出逐位对应，只有targetatan接existingcanonical、其它signed保原std，仍两帧输出逐位source同；artifact `diagnostic-mixed-profile-canonical72/math80/actual-turret-math-analysis.json`。36beamendpoint差再改变37真实BEAM资格，不能patchdefense输出或epsilon。

目标与最小范围为fire_control::Program::turn的目标方向atan2一个调用挂existingcanonical_math，保原point/pivot/炮弧/有限速度/clock/RNG/真实FireDecision与资源；不全局换signed/sin/cos，若下一actual首因证明再先补源方案窄挂。流程/联机权威/回滚原合同，无新玩家取舍。先本文→只diagnosticclone同profile中心候选整合真270，验收所有controls/目标/FireDecision/clock/RNG/资源/FX严格及预登记geometry容差、source仍原ABBAexact→通过相关首差后owner生产窄落，剩余下一strict继续。当前证明两真实输入，完整sameformal可玩门槛仍待ROOT，不能以mathprobe称全部passed。

2026-10-09 重复世界校验性能窄方案（ROOT授权，先记录后实现）：当前真实 `fire_query::plan_queued:157–162` 为每个owner构造完整immutable `World` 并全量validate，随后每mount `Program::aim:293` 重新扫描相同body/weapons/projectiles/budgetrows与armor。ROOT真实22舰profile约904次validate/1.56ms，完整校验不可省略，重复同一不可变借用可省。

目标与范围：保持相同玩家操作、目标、发射、clock/RNG、资源与失败回滚，仅让已完整validated的只读world在它自己的借用范围内被所有mount复用。新增私有字段的 `ValidatedWorld` token，构造器只能在 `World::validate` 原有顺序完整成功后给出；token保存对该实际world的immutable借用，不能伪造bool/handle/hash或在world改变后继续用。`Program::aim` 公共入口仍先原完整validate并保错误先后；生产新增 crate 内入口必须接收此token并读取token内实际world，不能额外传可替换world。可共用私有aim body，值/候选/资格/clock/轮射/实际flux recheck全不改。queued阶段只借观察切片，真实live flux仍在原有序consumer重查，不能拿token冻结实际资源。

依赖与顺序：真实mixed全部control/target/FireDecision/clock/RNG/资源/FX已闭合；防御160几何资格由另owner继续，重复校验token只读合同不依赖其求解。现按本方案窄实现 → 一次同其它native冻结old/new实际270整场与60LANpublication严格比较并核公共非法World原错误；最终formalCargo与完整七包Ready和页面/网络可游玩门槛仍归ROOT。UI、单人规则、联机权威、存档格式、rollback没有改变；失败token不生成、无兜底跳校验。没有新的产品选择。验收前仍不冒充性能或完整可玩通过。

日期：2026-10-08。接续总迁移策划与 `rust-combat-core-ai-audit-2026-10-08.md`；本文件只记录独立火控算法域，真实常驻世界、ABI、发射与生产入口由主代理整合。本块不会据独立算法通过宣称战斗可玩。

## 目标与玩家体验

把当前 Web 火控的目标选择、炮塔转向、武器组轮射和已发射火力预算迁入 Rust；保持手动/自动控制、切组、自动开火、PD、弹药保留、充能/连射承诺和友军避射的现有行为。界面、快捷键、取消操作和射击资源规则不变。已批准数值合同继续适用：纯几何允许限定舍入，真实目标、决定、资源、计时与 RNG 必须严格相同。

## 范围与来源

实现 `native/combat-core/src/fire_control.rs` 中的纯 Rust 数值世界读接口、完整目标资格/排序、稳定拦截解、船体/已展开盾碰撞、真实发射账本预算、每挂点记忆/独立 scheduling RNG、multirate/20Hz held aim、转炮后真实 bore 判定及完整手动/自动武器组轮射。读接口只接受 Rust 数值切片，不回调 TS Ship、AI 或旧火控；现阶段不改 `state.rs`、`lib.rs`、`weapon.rs`、`weapon_fire.rs`、TS 协议与绑定。

不在本模块扣费或发射：查询只产生请求，实际资源与实体必须由主代理接入真实有序 commit。未知自定义 armor/budget 回调不能用零预算假冒支持；准入标志不足时返回不支持，交给整场准入处理。特殊系统策略只接目前可数值表达的 ESCORT/SUPPRESS + suspended，特殊强制射击由其真实策略另行接入。

原版版本：本机已核对 0.98a-RC8。

| 原版证据 | 预期行为/布局 | 当前差异与迁移方法 |
| --- | --- | --- |
| `../decompiled/starfarer_obf/com/fs/starfarer/combat/systems/WeaponGroup.java:195–286,301–381` | 手动轮射、松开时换下一挂点；linked 按 aim point 与 arc 选挂点，无命中时选最接近 arc；auto 由挂点插件决定。 | 当前 Web 的 `FireGroups.ts` 已数值化并有弹药/禁用/burst 连贯性；以该代码完整迁移，保留其已授权差异。 |
| `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ship/trackers/oooo_0.java:105–154` | idle 15 秒后回中；受转速/arc 限制；与舰体转动相反时以 5 度/秒余量补偿。 | Web `WeaponAim.advanceTurretAim` 使用弧度与 shortest angle；Rust 保留其每步表达式次序和夹持方式。 |
| `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:125,461` 与 API `AutofireAIPlugin.java:8–45` | 挂点插件持有目标及 shouldFire；USE_LESS_VS_SHIELDS 影响弹药使用。 | Web 有独立稳定排序、budget 与 sampled cadence；本块保留 Web，不声称已还原原版排序/频率。 |

当前 Web 精确合同来自 `ai/batch/FireProgram.ts`、`FireGeometry.ts`、`FireGroups.ts`、`FireBudget.ts`、`FireProtocol.ts`、`FireInputs.ts`，以及 `FireControlGeometry.interceptTimeComponents`、`WeaponAim.advanceTurretAim`、`ContactKernel.contactHullParameter`、`Vector2.coordinateLength`。候选不截断；priority → impact → utility → retained → traverse → 已编译 lex rank 保持原稳定 tie。ship/projectile 的 row 是阶段次序，跨步目标保留 handle+generation，再解析当前 row。

原版界面本次没有可用截图/实机权限，仍待核实。当前语言迁移没有 UI 改动，不扩大视觉等价声明。

## 操作、关键状态与失败

1. 常驻世界完成全部舰船运动和武器前置状态后，生成 Rust FIRE_QUERY 数值只读租约；成员、visibility、目标身份、炮口与 launched ledger 由常驻数据提供。
2. 手动轮射先写组状态；每挂点按安装顺序配置枢轴/当前 barrel muzzle，自动挂点推进其独立记忆并求目标/held aim，手动挂点使用当前 aim point。
3. 炮塔真正转动后重算 bore；每物理步进行资格、alignment、友军/障碍、hold-fire 与 ammo hysteresis 判定，held aim 不降低物理射击安全检查频率。
4. 自动轮射产生本步 chosen starts；真实 commit 每次重查当前幅能，扣费/发射成功后主代理更新轮射实际 start 和真实账本。不得提前预留未来射击资源。
5. policy、cadence guards 或控制方式变化按旧顺序清理/重播种；目标失效后先推进 tracker 时钟，再清目标并唤醒 aim；禁用、失去目标和取消都不会生成弹体。
6. 不完整世界、旧代次 target、非法索引和未知预算机制在查询前拒绝；整步回滚必须包含 per-mount RNG、memory、组状态与事件。这里仅返回错误，原子回滚由整合层负责。

## 权威、并发、存档和依赖

仅权威 Rust 内核写每挂点 tracker、组状态与 scheduling RNG；呈现端不参与决策。查询租约需绑定当前阶段，主代理防止并发部署/切组污染观测。保存/重放包含完整 memory 与 RNG witness；scratch/candidates/当前 row 不作为跨步身份保存。暂停无 dt 推进；失败不能在半步改用 TS。

实施顺序：来源/策划 → 几何与数值世界接口 → FireBudget 与完整 FireProgram → FireGroups → 定向编译和必要叶验证 → 主代理接常驻世界、实际发射与端到端同场对照。主代理整合前标记为“可接入算法”，不增加 `core_full_battle_ready` 或 domain 完成位。

## 验收与待核实

- 叶验证覆盖 concave hull/inside start、shield 第一根与 5° 门槛、相等速度拦截、arc/快速舰体反转、弹药滞回、全候选稳定选择、PD 威胁/诱饵/flare、手动/自动轮射状态转换及实际 ledger armor 预算。
- 原 TS 对照必须集中检查目标身份、FireDecision、clock、per-mount RNG witness、组状态严格一致；bore/pose 只按已批准几何 allowlist 与阈值比较。独立 Rust 编译/叶验证不取代主代理的 Node/Wasm Worker 与生产流程验收。
- 尚待主代理整合：真实常驻实体、完整能力准入、ordered commit 幅能重查/弹体生成、控制切换 tracker lifecycle、ABI/发布、保存回滚、special systems、真实战斗与性能。没有新产品取舍，无须用户再次确认。

## 算法域交付与实际验证

`fire_control.rs` 已实现所列数值算法。`Program` 的 scratch 与 `Memory` 常驻规则状态分开；目标记忆保存 handle+generation，每次只读阶段解析当前 row，代次失效保留 kind 后按原先的时钟→清理顺序处理。`tracker_salt` 核对了 JS `for...of` + `charCodeAt(0)`：非 BMP 字符每个 code point 只取高代理单元，不能误以为逐 UTF-8 byte 或两个 UTF-16 unit。`Groups.record_success` 只允许真实 commit 成功时记录轮射开始。未知预算/不完整输入明确拒绝。暂不加入公共 Wasm ABI 或生产完成位。

集中定向对照使用真正编译的独立 Wasm 模块，复用现有 TS FireProgram/Groups/Budget 原函数，9 个 aim 场景每场 300 步，另有 300 步 groups 与 300 步 launched budget。覆盖 full-rate、multirate、20Hz、PD/decoy、目标死亡/代次更换、政策 suspension、cadence/arc/range guard 转换、友军/asteroid、弹药滞回、linked/alternating 手动松开/自动成功轮射以及 arm/armor/shield-recovery 预算；预算有 4 个非零样本，避免只核对全零 ledger。全部 62,700 个严格字段相同；24,300 个几何字段中 103 个舍入差异，最大 3.552713678800501e-15，小于已批准阈值。严格字段含完整 per-mount RNG witness、目标/决定、clock、组 optional 写入与预算结果。

证据保存在 `artifacts/rust-combat-core-20261008/verification-fire-control/{check.rs,check.mjs,check.wasm,result.json}`。这里是独立 Node/Wasm 算法对照，没有 fresh browser Worker、公共 ABI、生产入口或整场伤害/结算验收；不把这些证据当作可游玩。原版视觉/实机未验证。rustfmt 组件本机不可用；编译器 metadata 与 Wasm 编译均成功。

状态：策划、来源和数值算法交付完成；真实常驻世界/生产接线及端到端验收由主代理继续进行。
