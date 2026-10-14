# 常驻 AI 与七包技能实际接线方案

## 2026-10-09 owner入口三callee诊断已完成

ROOT窗口一次actual210完整captureACK已exit0，210/210真实计数、176body、late181–210共30samples、sourcechanged[]。Host::refresh_owner2.29169ms×156.1667，repair ownerroot+ordered全bodyroot/live/armor2.05546ms（89.69%），systems .07618ms、weapons .11617ms；native49.681ms/两AI9.969ms。proof`profiling-ai-owner-preparation-before/result.json`，临时opt3Wasm E5B05F95B9377AE905E797A28E28EFC7D58FF9F30428E402F8512A1BBD866902。没有把全部owner成本归Vec分配，实际主项是repair root查询。

候选仅下一方案维修只读scope的firstmeta索引，可审temporary `tmp/weapon-ai-repair-roots-candidate.rs`；系统/武器Vec不改、refresh不能减少。最新ROOT CPU命令生产暂不改，故当前BE2A7CB…保持且过程完全结束/CPU释放。准确成本已交ROOT决定单次old/new完整gate时段及窄实施，不冒本诊断已带来生产收益。

## 2026-10-09 owner入口准备来源与诊断方案

目标为降低同phase逐舰Host准备的成本，玩家系统/武器/修复判断和AI全部规则照常。上一sync/build观察候选因实测无收益已撤回且不复活；真实late90samples当前`Host::refresh_owner`156.111次/step共2.577ms。ROOT本轮只授权ai_resident中的Host::new/refresh_owner/refresh与同不可变scope结构准备，不改实际plan/control/effect算法，不改其它生产文件。先写本节，再准备冻结少timer诊断；重型运行等待ROOT窗口。

原版0.98a-RC8 ShipAIPlugin持续advance及system mutable stats证据见下一节并本轮复读；当前直接依据为Web CapitalShipAI系统写后changed/invalidate与live vent，Rust `phase_with_fleet:142–151`每owner controls、effects各创建Host，`refresh_owner:301–309`逐次读meta→live system lifecycle/spec→live mount/cached geometry→owner root→ordered全body roots→live/armor阈值。`terrain_owner::Owned::root:20`逐祖先使用原first identity meta，超过ships.len+1返回8；维修scan跳过其他body的root错误而owner root错误返回HostFailure，`live:24`保can_advance/DOCKED/RETREATED及原65%严格阈值。本次没有原版界面改变，实机仍待许可。

先在临时冻结ai_resident copy加入仅系统Vec准备/武器Vec准备/维修ownerroot及全body查询三个scope计时；同原真实seed917实际22舰/176body/734mount、60Hz自动驾驶、完整推进captureACK、warm180后必要30样本，保全部原算式/资格/错误/访问次序。诊断用于分出2.577ms实际构成，不能直接把全部归alloc。

若维修root查询占主成本，候选只在**单次refresh_owner的维修纯读scope**借`&terrain`构造惰性first-meta索引，按原ownerroot→body序/短路查询与原祖先有限步循环，完整live/armor仍逐body现场读取；索引该函数即销毁，不能跨control/effect或实际refresh写操作。重复identity保持原first-row，-0/+0相同、NaN不相等、parentcycle/缺父/缺meta与原first error保持；不缓存root错误成成功。若Vec构造是主成本，仅可复用容量，所有字段每Host仍完整重读，不能复用旧系统/武器值。每真实effect后的同步、Cache构造及refresh_owner完全不减少。

操作/取消/暂停/联机权限/并发/presence/存档及RNG/ID全部原入口；失败仍原整步事务回滚，scratch不写存档。范围明确不含减少功能/频率、跨写动态cache、scalar算式微调、UI或TSfallback；无产品取舍待决定。分阶段交付为来源/方案→三callee定位→有证据的单块窄改或记录无收益→sameotherfreeze old/new actual270+LAN60/reserve/完整snapshot+scene+capture及必要缺spec/duplicatefirst/坏root/newScope集中验。输出、负零/floatbit、decisions/targets/resources/damage/clocks/RNG/FX/audio与错误严格同；实测无收益精确撤回。性能正式门槛仍ROOT freshCargo installedsameSHA ABBA及正常游玩，窄场景不宣称完成。

## 2026-10-09 系统观察候选无性能收益，已精确撤回

一次10callee稀疏真实actual270/captureACK诊断已完成，sourcechanged[]：late181–270 native62.311ms、两AIphase11.300ms；sync .4373ms×2.111、build2.322ms×2.111、plan3.081ms×78、ownerrefresh2.577ms×156.111、fleet1.311ms×2，真正effectrefresh .1730ms×.111。raw`profiling-ai-system-observation-before/result.json`，临时opt3 SHA732cf8c4…；不是formal性能。sync/build里modifier是有限一部分，本块不能承诺整个2.759ms都可省。

按下一方案试窄candidate，仅ai_resident两个scope各复用既有PublicationObservation.modifiers，全部原row/identity遍历、compose/phase/math/controls/effects/refresh保持。冻结其它native与单一TSbundle old/new actual270+LAN60/真实reserve/capture全部**350201415 strict、113700301 typed cells逐位相同**，nativechanged[]。整体结果passed=false因为其它owner运行中修改RustCombatPresentationData，冻结bundle correctness=true而不冒最新源码门禁；proof`verification-ai-system-observation/result.json`，baseline rawD0EE9205…/candidateC9060A5A…。paired native localmean65.645→67.928、median60.901→62.982；LANmean11.896→12.348、median11.636→11.590。实际无收益，因此校验candidate源E97DD48B…未被他人修改后，**仅ai_resident精确恢复保存的BE2A7CB093EE121E00068513328FFB152A95F68102C38E507497703240AE00C3**；不覆盖其它文件、不重跑已通过整场，不纳最终Cargo候选。必要105错误/新scopefixture已exit0、1016865 raw words逐位同（缺spec原trap/组合首错、重复identityfirst、新scopeflux/lifecycle/parentdeath/engineering、clone隔离），proof`verification-ai-system-observation/fixtures/result.json`。原完整门禁及性能失败记录保留。

## 2026-10-09 每次同步/构造内的只读系统观察方案

目标为降低真实混编AI固定步耗时，同时玩家操控、目标、防御、技能、幅能和全部战斗规则维持当前迁移结果。完整实际22主舰/176body270步、每步capture与ACK的冻结诊断，late181–270两AIphase合计16.155ms；其中同步/构造/规划未分拆，不能把它全归观察构造。ROOT授权本块仅`ai_resident.rs`的`synchronize_live`与`Cache::build`；既有`system_owner::PublicationObservation`API复用，不修改system_owner、phase、Host效果或任何界面/输入。火控已验hulls/token保持。

原版0.98a-RC8本轮复读`ShipAIPlugin.java:12–27`持续advance/自动驾驶立即重评、`ShipSystemAIScript.java:8–9`每系统advance和`plugins/ShipSystemStatsScript.java:26–27`mutable stats apply/unapply，`BasicShipAI.java:146–203`引擎/攻击/防御及system owner分工。源码结构与API互证，不把混淆反编译算式当正确规则。当前直接读写依据为`CapitalShipAI.ts:570–641`系统callback后invalidate/changed，vent必读新现场；`ai_resident.rs:126–148,166–169,204–276,296–299`同步收集后写live、每Cache immutable build、计划→all controls→all effects及真实写后refresh。原版实机/截图仍待许可，本次没有视觉或操作变化。

操作流程完全沿用：冷构造/实际步命令→验证→AI同步→观察构造→只读规划→全部controls→逐effects；取消、拒绝、失败仍走外层原完整事务回滚。联机权限/并发顺序、断线presence、RNG与ID、存档均无变化。本块不降频、不少refresh，不跨写操作缓存，不新增玩法或其它产品取舍。

先一次稀疏callee诊断实际270/captureACK（state/phase/synchronize_live/build/refresh/ownerrefresh/planning/sample/fleet），固定原场景、source冻结，辨别系统观察是否有足够成本。若可复用：每次sync的**原完整只读收集大括号**单独建PublicationObservation，逐原row顺序完整compose，结束borrow后才逐row写live；每次build函数单独建Observation，逐原active顺序完整compose，结束即丢弃。它只复用first-match身份查找及engineering原短路结果，不复用modifier值/phase结果、不跨sync→build、不跨build→controls/effects。不存在改变错误顺序的预热：index仍惰性，调用当刻保持engineering→当前spec存在索引→parent存在/engineering→parent spec→组件检查顺序；同scope不允许修改bodies/specs。phase与weapongeometry继续现场原读取，Host每effect后的refresh完全保留。

实施阶段：本文来源/方案→一次callee定位→窄改或判无收益→冻结所有其它native和TSbundle的old/new actual270+LAN60/实际reserve/完整snapshot、scene与capture逐位对照及少量必要错误fixtures。验收保持负零/所有floats位、targets、controls、damage/resources/clocks/RNG/FX/audio及错误优先级；缺spec保持原panic/trap或原HostFailure、重复identity保持原firstrow、重新scope真实flux/lifecycle/engineering变化必须可见，Rust borrow静态阻止写。若无稳定收益精确撤回本块。计时为诊断，正式性能最终按ROOT的fresh Cargo/LTO installed sameSHA ABBA及可玩门禁；本块窄证据不宣称整场可玩完成。没有待用户决定事项。

## 2026-10-09 大混编场景完整校验性能方案

目标是让现有 22 主舰混编保持正常操控和完整自动战斗。本次只优化 tactical/defense/navigation 观察校验的数据结构，不改任何决策、频率、资源、几何、RNG、UI或存档。实际生产 RustCombatKernel 同 seed917 场有176舰体、734武器；只读诊断40步发现每步 tactical.validate175次约45.22ms、defense.validate156次32.74ms、navigation.new78次16.57ms，主要为重复线性查身份和每武器重扫全舰体区间。诊断期间其它代理运行，时间不作为最终收益。

原版0.98a-RC8本机 ShipAIPlugin.java:17–32本轮再次读取，持续advance和自动驾驶情况重评要求保持；既有原版BasicShipAI及当前Web CapitalShipAI来源见下文。本块没有界面变化，不操作原版窗口。原版证据证明推进要求，不证明Web校验算法；直接依据为当前三个Rust World验证器全部现有检查及只读借用边界。

实施采用每次完整验证内的身份→原行索引、重复身份集合与逐武器区间覆盖计数，把同一次验证的反复全表扫描改为查询和一次计数。仍每次执行全部有限数、generation、目标、父链、可见性、唯一身份、武器拥有者和唯一覆盖、弹体与光束检查；保留原检查顺序/错误类型、真实first-row语义和拒绝能力，不跨观察缓存、不跳过任何验证。已验证的局部集合随调用销毁；实际写入无新增失效问题。先本文→三验证器窄改→同真实场诊断→冻结旧/新完整发布与命令失败对照、现有规则/整场验收。验收完整witness/packet逐字相同，坏身份/覆盖/引用/非有限值仍同错误；性能最终以生产Worker ABBA及实际LAN验收为准。失败继续拒绝并按原整步事务回滚，暂停/命令取消/联机/存档无改变。没有待决定的产品取舍；默认启用仍受主策划最终门槛约束。

索引改完同诊断tactical45.22→11.15ms、defense32.74→6.31ms、navigation16.57→3.62ms；这些仍有175/156/78次重复完整校验。进一步范围只在现有“全部plan只读，随后全部controls，最后effects”的真实规划屏障：建立借用且不可伪造的ValidatedObservation，先完整navigation+tactical+defense+AI拓扑+assignments+policy校验一次，所有plan借该不可变观察，逐entry settings及dt/order仍原检查。只其内部求解可复用完整世界校验，公开旧求解入口仍完整校验。单独复制少量assignments/policy避免memory写入借用冲突；不是冻结现场effects。屏障结束立即销毁借用证书，controls/effects与真实system/vent/phase写后仍原重读/校验；不会跨tick缓存或减少源规则。验收同旧/新全witness/packet与全源长战，尤其系统写后即时反应和回滚。

当前5AI文件已编译冻结，完整前后生产对照通过：同一冻结native其它文件、旧5文件与新5文件两个plain Wasm，实际22主舰混编60步完整snapshot+scene、实际LAN60步（tick8真实Ark后备部署）全部witness及完整packet逐字相同，changed[]空。新plain SHA f80e57bbe3e170455a51c0bd122c422dc3d894d64bf27ba643f7969c00c29b83，artifact verification-ai-observation/result.json。无round/字段豁免/TSsolver桥接。只读诊断新AI phase约7.51ms、native44.85ms（早期178.55受并行机器干扰，不作为正式倍率）；真正性能仍待同installedCargoSHA安静ABBA与LAN600。验证器错误/坏值由existing harness定向对照补验，全部长战和最终可玩仍未完成。

## 2026-10-09 联机断线恢复控制首差：真实冷炮台旋转历史

正式 sparse guest 第4个断线 tick 的 strafe 严格首差为 native `-.9637965075139635` / source `-.9637965075139637`。独立只读真 RustLanKernel/source 诊断显示：不是最终 SteeringKernel 舍入，早在重新策略的 tick1，三个炮口相差几十世界单位，profile 接敌距离 `1170.602829403966` / `1170.8645409174173`、相对 bearing `-.007832010203533857` / `.0006965309162401123` 已不同；舰体、目标位置和速度逐位相同。

直接依据是 `LanWorld.ts:76–77` 冷布阵直接改 hull facing，而 `ShipWeaponControlSystem.ts:101,114,264–266` 保留真实 `previousHullFacingRad`，在首次 advanceState 用 signedAngle 的 hullTurn 累加所有 currentAngleRad。actual enemy 冷 facing `4.71238898038469`，controller previous `1.5707963267948966`，WS007 当前角仍 `1.5707963267948966`；`RustContentCompiler.ts:332` 却把 initialize-weapons facing 设为当前 hull，native weapons.values[0] 因而变 `4.71238898038469`。source 首步累加 π 后炮角 `4.702062448977057`，native漏历史旋转，被炮弧夹到 `2.628029521190462`。`native/weapon.rs:40–41` begin 算法原已相同，AI Cache 正确读取真实 native 炮角，不能修成末位 rounding 或扩大 controls 容差。

原版 0.98a-RC8 `combat/entities/ship/trackers/oooo_0.java:106–119` 已核，炮台目标相对实际 pivot facing，闲置状态仍依 pivot；原版 `BasicEngineAI.java:23–31,167–197` 证据见导航来源。它们证明看真实炮台/运动状态的结构，不证明本 Web 冷布阵行为或完整原版 AI 等价；此次无 UI 修改、原版实机仍待许可。

修正方案由 root 的 compiler owner 窄保一次构造的真实 controller previous facing（可用具名只读 getter或内部有界 typed read），不从 Ship.prevFacingRad 猜、不补炮角、不改 source fixture。保持既有 initialize-weapons ABI，其 facing 已对应 native历史状态；联机权限、断线/重连、取消、失败回滚、存档与玩法不变。实施顺序：记录本证据 → root 冷构造字段窄修 → 独立 actual sparse 控制与炮口定位复查 → defense 正式 current Node/freshWorker；目标/controls/资源/伤害/时钟/RNG 严格一致、纯几何沿用批准容差。诊断 `tmp/flight-lan-steering/result.json` 的 cold-angles、post-step-angles、source-profile 为定位证据，不宣称正式 current/Worker 或整场可玩通过。

唯一 compiler previous-facing 诊断 hook（生产源未改）保持正式 sparse fixture 的原比较、权限/回滚、presence和部署路径，actual RustLanKernel/source 24 tick通过：1854严格字段、2000几何字段、3 receiver、28 capture；原11个推进/模块场景29严格/130几何字段也通过。重新策略的19个 steering 中间值全部逐位一致，旧严格 strafe 首差消失。结果 `tmp/flight-lan-steering/previous-facing-result.json` 带 diagnostic/previousFacingHook标记，验证真实根因与窄修方法，复用的诊断wasm不声称当前完整源码指纹或 freshWorker验收。生产compiler修正和current正式验收仍由root/defense继续。

root生产compiler现已取真实 controller previousHullFacingRad。独立currentnative完整只读诊断copy重新rustc编译exit0、**取消compilerhook**后，同actualRustLanKernel/source正式sparse比较24tick仍全部通过：1854严格/2000几何、3receiver28capture；11propulsion原场景29严格/130几何也通过。所有原presence断线guest/host、重连neutral、权限回滚和部署幂等保留；生产AI未改算术或容差。`tmp/flight-lan-steering/result.json` 的 previousFacingHook=false和 `tmp/flight-lan-steering-current.log` 为当前逻辑证据；只读诊断wasm不等于正式productionfingerprint或freshWorker验收，后者由defense集中完成。

## 2026-10-09 实际整场 AI 观察刷新优化方案

目标为减少模块舰大场景的固定步耗时，保持玩家控制、全部技能、防御和战术结果。实际 RustLanKernel 同一 Ark/Gloriana/Gravity 场 40 tick 诊断显示每步 AI 约 22.8 ms，其中 Host.refresh 100 次约 20.08 ms、Cache.build 101 次约 15.46 ms；整步 clone 约 .48 ms。此次范围仅 ai_resident 内可重建观察及真实失效边界；不改采样频率、舰队/控制/效果顺序、规则、RNG、UI、权威数据或存档。原版 0.98a-RC8 ShipAIPlugin.java:17–32 要求持续 advance 与情况重评，既有 BasicShipAI/OmniShieldControlAI 来源见下文；原版截图/实机待许可，本次没有视觉变化。直接迁移依据仍为现有 CapitalShipAI.ts:320–346,570–641 的全 controls 后逐 effects、系统写后现场观察与 vent 重查。

读依赖：计划观察包括全部真实舰体、模块、运动统计、系统/盾/幅能、武器、弹体/beam、障碍和 visibility。commitControls 仅改变本 owner 的 MANUAL、target/aim/trigger/hold 和驾驶输入；这些不会改变其它舰体几何、弹体、武器或 live modifiers，直接按真实 owner 更新该行观察。publish 仅改变该 owner 的 tactical_present/previous_task，直接更新对应行。手动模块 restore 同样在下一 owner effects 前更新真实行；独立转向依既有 motion stats。系统激活/中断、开始 vent 或真实盾/phase状态写入仍同步全部真实 live modifiers并全场重建；相同盾请求的真正无变更不触发重建。stopped 清 gravity hold 可能中断 push，保留全重建。任何未知写入不使用局部路径。

实施采用单次 phase 拥有一个 scratch Cache，所有 Host 借用它而不为构造重复 rebuild；从计划开始到效果结束严格按上述实际写入失效，不跨 tick 保留、不冻结整个 phase。保留每个真实 system 的失败、资源、顺序与 generation 检查；错误仍由外层整步事务回滚，scratch 不进入 checkpoint。流程、命令取消、暂停和联机并发保持已有入口；没有新产品取舍。顺序为本文 → shared phase scratch 与局部明确写入 → 同脚本实际 RustLanKernel profile → 七包 current-source 完整热步对照。验收资源/伤害/计时/RNG/目标/全部规则决定严格一致，几何维持已批准容差；实际场景耗时与 Cache.build 次数下降且任何技能/phase/vent实时反应不被省略。整场死亡/结果、Worker页面与最终可玩仍由 root 汇总验证。

2026-10-08策划，2026-10-09续接；已授权 Rust/Wasm 战斗内核迁移的后续阶段，浏览器与桌面共用。独立 `ai_resident.rs`、一次性真实metadata编译和连续物理/fire/system的actual TS联合oracle已实现，并取得绑定完成时全源码指纹的正式Node/freshWorker域验收。主任务拥有 shared state/lib/protocol/全局事务和生产入口；完整整场与生产正常游玩仍待root完成，不以本块验收宣告可玩。

### 本次实际实现及验收记录

phase 现只建立一次真实 scratch Cache，Host 借用同 Cache；普通 controls、publish、manual restore 同步真实 owner 行，系统/vent/phase写仍全 modifier 与全观察重读。实际生产lib编译通过。相同实际 RustLanKernel 40 tick80body诊断 AI22.8→2.321 ms、Cache.build101→1次、15.46→.189 ms；整个 native step54.27→30.226 ms包含root同期其它优化，不能将全部收益归本块。真实七包各100tick checker有五包通过，Ark第38帧漏小行星过载音频、Gloriana第71帧漏导弹尾迹，二者battle witness逐位一致；896323严格字段/278964几何字段最大1.421e-13，未到死亡/结果不作为整场完成。

root后续flight/terrain性能改完的同actualRustLanKernel40tick80body独立诊断 `tmp/flight-ai-owner-profile/result.json`：native13.322ms、AI2.472ms；Cache.build .214ms×1、refresh_owner .143ms×40、controls .0116ms×41、synchronize_live .0624ms×1、validate .0938ms×3。剩余owner刷新实测已非主要瓶颈，本次保持生产AI不再新增性能改动，避免为约.14ms引入失效边界风险。此诊断绑定当前copy、非正式fingerprint或freshWorker；整native收益含root改动，不全部归AI。本段Gloriana71“导弹尾迹”旧描述随后只读核实为近炸airburst八团Smoke呈现挂点，准确根因已报root，未因此称修复通过。

既有正式resident runner编译exit0，但共享scene_runtime同期改动触发sourcehashgate拒绝，因此未宣称最新formal/Worker通过。独立tmp诊断复用已编译真实fixture，选24个现有nonassembly场景保全部比较及stage断言，Node800phase、1036278严格/178312几何/20975gravity、24stale回滚/11startup回滚/1fullCoreClone通过；phase高flux/vent及Yamato/Jump/Roc/Zhefeng/引力release/collapse/maneuver正激活、polarity两次都通过。旧numeric11–14/24的batch assembly合同与默认源不同，明确未计通过；默认assembly归真实七包production检验。结果见tmp/flight-ai-mutation-result.json；root后续整场及可玩持续验收。

## 目标与玩家体验

当前所有非战机自动驾驶船、挂接模块仍按既有 AI 目标选择、舰队分工、导航、排散、盾和技能行为战斗。玩家切换自动驾驶、下达战术命令、撤退或重新接管后立即使用真实 resident 控制状态；不会先由 Rust 出 action list 再让 JS 决定规则或资源。技能预热、射击、爆炸、跃迁、炮廊和共享反应堆/材料继续走既有 Rust lifecycle/system owner，AI 与手动输入共用同一个准入与状态。

## 范围、边界与当前差异

本块新增常驻 `Owned`：每个真实 generation 的 AI memory、战术命令、fleet assignment、diagnostics及必须的一次静态 actor/mount metadata；从实际 Body/ShipState/Ordnance/terrain即时形成借用观察，并实现 ai_owner::Host + defense_ai::DefenseHost。系统 AI 实现当前七包注册的 callback（Gloriana Edict、Hyperion Yamato/Jump、Rocinante attitude/localFireControl、Zhefeng和全部有实际 advanceAI 的 Gravity系统）；已有 Burn/Jets/AmmoFeed/EnergyFocus/Eclipse/Ark行为直接使用已验证 ai_owner，不增加替代公式。

`ai_resident.rs` 已为 ai_owner 接真实Host，直接读写 Body/ShipState/Ordnance和七包系统准入；`fire_query.rs` 的observe_ship/observe_weapons、纯predict/reachable query已可借用。system_owner::Host跳跃现在传真实terrain asteroids，Gravity activation直接使用主任务同一gravity_runtime。完整phase reader正在与ship agent接线，尚不把shield-only状态当最终实现。native DirectionalPush源没有advanceAI，应注册明确的SystemAI::None（它本来是手动控制专用），不能因此把其它未知callback降级为None。

不新增玩法/数值/快捷键/页面，不改用户舰包、UI布局、战役存档、服务器权限或发布流程。不移植原版另一套Java AI以改变当前Web行为；不加入尚未注册的原生系统callback/外部JS扩展。当前七包之外的未知callback明确准入失败，不能无声忽略。战机持续AI仍由flight_world/飞行resident，CapitalShipAI不接管战机。

## 原版证据 → 预期行为 → 当前差异 → 验证方法

原版版本0.98a-RC8，本机文件核实；未启动原版窗口，界面实机操作仍待许可。

- `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipAIPlugin.java:8–35`：setDoNotFireDelay用于舰载机起飞友火保护，forceCircumstanceEvaluation用于开启autopilot时立即重评，advance推进持续AI。预期保存持续AI状态、切换边缘立即失效旧意图；当前Web用已有CapitalShipAI clock与key驱动，保持它，不另加原版不存在于Web的行为。验证真实TS切换/命令/缓存边缘。
- `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/BasicShipAI.java:146–203,366–425`：独立engine/attack/threat/order/vent和phase/OMNI/FRONT defense owner，按真实船/世界推进。预期导航与防御各自保持持续状态，危险/控制读当前世界；当前Web明确先提交movement再系统effects再defense，保持Web顺序。反编译unicode混淆名称只用结构交叉验证，不照搬异常代码。验证相同真实TS stage与资源顺序。
- `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/OmniShieldControlAI.java:75–130`：threat/碰撞tracker/盾持续推进，不以目标中心替代所有危险；现有defense_ai已真实oracle通过。本块必须借用同一世界并在系统写后重建读视图，验证系统改变资源后的pre-vent refresh。
- 当前实际 `src/engine/ai/CapitalShipAI.ts:320–348,570–641`：plan token只提交一次、先所有controls、后系统effects；tacticalSystems在无rightClick系统时排除最后defense，随后独立defense AI仍会运行；venting/overloaded挡tactical系统但不自动挡独立defense；system callback之后刷新观察。预期精确复制这些barrier，不能每船plan后立即commit抢看另一船新控制。验证真正TS CapitalShipAI，不用预计action常量。
- 实际 `GlorianaEdict.ts:61–76`：target与当前aim同舷；readyBatteries、炮廊flux<.6、实际每炮range和角度；捕获accepted broadside而不追准星。Rust须即时读真实children/flux/炮台，用system_world真实activation。验证炮廊封舱/死亡/无法开火与同帧硬幅能。
- 实际 `HyperionSystems.ts:60–67,106–117`：Yamato距离450至range-50、实际reactor cost/互斥/角差≤.1；Jump退却1500或接近目标范围，超最大range才裁剪；均临时写aim、activate捕获后恢复旧aim。Rust必须保留恢复与失败不扣资源，不直接teleport。验证activationInput/反应堆、预热后动态障碍复查与真实system projectile。
- 实际 `RocinanteSystems.ts:14–78`：roleMount不仅PD标记，必须static slot controlRole+builtIn+defaultWeaponId和实际弹体类型；attitude按真实漂移segment净空及预测截击误差25°–145°，localFireControl按实际reachableFireTarget、导弹/战机及热量.45/.72迟滞切换。Rust用同一fire_control predict/可达solver，不用中心距离替代。验证角色不匹配、友舰/小行星遮挡、导弹范围和ACTIVE下的切换。
- 实际 `ZhefengSystem.ts:23–28`：有已开盾等实际activationFailureReason且存在可达非PD炮才启动，不能只看distance。验证真实fire solver与IN时非PD阻断。
- 实际 `GravitySystems.ts:41–46,60–65,92–97,114–118,150–153,163,167–180`：井向owner偏140、退却折转、按周围live roots/弹幕选择repulsor、anchor age/activeTimer控制remote release/collapse、polarity归正，current battle repulsor按轮廓gap与.65s实际CPA。Rust必须读真实ordered actors、projectiles和slot state、复用真实gravity owner准入，不消费额外RNG。directionalPush没有AI callback。验证不同场种类/友军/被禁用弹/目标身份与严格技能决策。

## 完整流程、状态与失败处理

静态准入按完整真实generation接 actor id/locale rank/原spec数值、attachment slot精确字段、hull规则与systems的callback能力证书、每mount的slot rank/原始局部角/arc/turn缺省语义、DPS/role/内建匹配。动态pose、flux、HP、phase、systems、ammo、angles、damage、当前目标和visibility只从真实Rust owner读取；不能作为每帧JS输入重灌。locale tie/训练policy与已有TS完全一致，一次安装或明确边界更新，不推测字符串排序。observations是scratch，不作为第二份权威状态。

每tick阶段：

1. 清本tickAI诊断输出，从真实roster建立admission/visibility/attachment检验；保留dead/retreat/docked的真实stopped状态；FIGHTER移交飞行owner。
2. 与当前AIController一致采样decision clocks、构造唯一fleet plan，按真实roster顺序plan全体。plan只读同一阶段世界、修改每船自己的cloneable memory，不写live控制或资源。
3. 按相同顺序commitControls全体。写真实motion、current target、aim、holdOffensiveFire、fireControlMode=AI/main fire=false。stop清既有clearInput语义及diagnostics；不误清历史mount.triggerHeld。manual/passive船用其已有输入，不被AI顺手接管。重启autopilot必须使对应memory circumstance key失效/立即重评。
4. 按相同顺序commitEffects全体。每次系统写即时使用实际Rust system_world/gravity owner准入，提交life/input/flux和全家live modifiers，使下一callback读当时世界；不会把激活列表留给TS执行。低幅能/互斥/障碍等失败保持真实source生命周期/费用语义；错误身份/缺metadata是错误，整步rollback。
5. defense按source更新。startVenting真实写Flux且必要system interrupt同步执行；盾写真实Shield/Flux；系统写之后的refresh重新读全世界并assess/observe(0)，不得重用计划期缓存或多advance calm clock。
6. 发布typed diagnostics，后续Ship prepare/integrate/weapon query/fire/system dispatch/world death沿主任务既有barrier执行。AI activationInput必须在同tick真实event dispatch可见。回放/renderer只呈现这些结果。

UI没有新布局/确认。用户既有战术命令取消/改目标从command更新resident Order并在下一固定step重评；无效generation、未知target/system证书返回结构化错误且回滚；任意callback不能执行的安装整体失败，不运行半套AI。pause固定step不推进timers/RNG。

## 权威、并发、存档

本地Wasm/Worker为单step权威；浏览器与桌面使用同一Rust。Host直接借用本次事务真实Body/ShipState/Ordnance/terrain/specs/events以及双RNG，AI通常无RNG，任何系统spawn仍使用已有combat RNG。AI memory、commands、assignment/diagnostics和system输入进入root全battleClone/checkpoint；scratch rebuildable，intent只存在当前stage且generation绑定，不能重入或跨步执行。并发入口由root既有sequenced authority串行处理，失败不能改变world、owner/RNG、ticks或发布半帧。不新增战役save schema；生产战斗checkpoint/root恢复仍主任务验收。

## 依赖、实施顺序与交付

依赖主任务world-owner最后真实失败修正、native freeze解除、gravity owner与真实fire_query观察可复用入口。新增独立module，不改shared文件；向root交付需要的metadata/Host call/wire/publication合同，root接共享ABI及生产运行。

阶段一：本来源和方案完成；核对AIController完整roster采样/fleet plan顺序。阶段二：typed Owned/metadata与真实observation映射，generation/schema严格准入；实现Host controls/defense和七包callback，同步真实资源。阶段三：actual TS多步oracle +最少Node/freshheadlessWorker集中验收；失败仅修对应源差异。阶段四：root接入生产Worker、checkpoint、输入/投射/呈现并做七包持续正常游玩；本块不以隔离成功结束根任务。

### 已核实的生产阶段与一次准入字段

`CombatEngine.ts:271–310,861–951` 与 `CombatAIPhase.ts:27–112` 现已核实：player pre-tick autopilot独立于fleet phase；后者按enemyAI、reinforcementAI插入顺序，随后module AI按combatShips順序plan。deployment reserve与externallyControlled roots排除；large-battle-v1/v3仅非player root且不在fullRateAIIds调用sampleDecision，multirate另按owner/root外控与fullRate资格。`AIBatch.ts:33–42` fleet phase首先创建一次fleet plan，其manual set=externallyControlled加MANUAL player；effects前关闭plan lease，全controls之后再按同entry顺序执行effects。root必须显式传当前phase owner顺序/资格，不能用Body数组任意重排全部AI；module阶段仍共享全plan屏障。

独立module需要的静态metadata：actor identity/stableID/localeRank、spec.maxSpeed/spec.armorRating、原始系统callback enum及是否native forecast、attachment的slotID（不得将不存在值写成空串）、station/independent/motion boundary证书、doNotBackOff、systemDrone、preventsAIVenting、训练action（numeric worker=-1）、实际fighter bays/wing各count/range与wingRangeMultiplier；actor的aim/currentTarget/fireMode/recall从owner读取。mount metadata按真实componentID：slot localeRank、damagePerSecond语义所需DPS、真实maxSpeed（maxSpeed??projSpeed）、原始position turnRate缺省0、fixed（HARDPOINT或turnRate??1≤0）、beamDuration的无穷哨兵、original isPointDefense与slot controlRole合法性（builtIn/default匹配/ballistic/noBeam/noRocket）、owner weapon base angle/arc来自已经安装MountQuery，profileDelay按当前生命周期动态取样。DPS/beamDuration无穷需typed Option或与现有stage相同的内部表示，wire用有限presence值。

必须从真实owner动态读：每mount disabled/ammo/cooldown/burst/state/timer/angle/barrelOffset/readiness/range/弹速/发射许可；Body current flags/pose/flux/HP/shield/type/maxArc/phase/full live motion/weapon locks/visibility、prior diagnostics fleetTask；Projectiles完整source/target/team/lifetime/flags/真实guidance maxSpeed/turn、所有beams source/mount/DPS/duration/active；Asteroids仅hp>0，navigation obstacles另追加gravityManaged或fixed hulk。`StageAIProducer.ts:30–81,90–106` 明确这些来源，StageProducer:312–413的flags与damageType沿现有tactical/defense module码映射。常驻metadata不是每帧snapshot。

## 验收标准、待核实与取舍

对照实际Ship构造/CapitalShipAI/各注册系统definition，无复制expected公式。包含全体plan后全体controls后effects、autopilot/manual/stop/撤退/module/无target、fleet roles与tactical order、真实capitals/projectiles/beams/terrain、全部special callback的成功与至少一个拒绝分支；multi-tick保持真实owner；activationInput/资源、system lifecycle、target/decisions/clock、RNG与输出顺序严格一致。纯几何容差为已批准 `max(1e-9,32*EPS*max(1,abs(a),abs(b)))`，决策即使靠近边界仍strict。真实vent barrier系统资源改变、whole-step rollback、stale generation/intent和fullHost Clone continuation必须覆盖。不能只证明policy DTO。

已核实并实现：AIController/fleet阶段、共享fire query公共接口及实际queued owner/per-dt/scope、gravity真实命令、完整一次metadata、full parent/system/external phase reader和零maxFlux源派生NaN的窄准入。lazy/reserve/manual/full Core clone和当前29场连续联合oracle已通过正式Node/freshWorker（详细结果如下），真实七包AI技能正激活及拒绝覆盖保持实际源。原版UI实机以及最终renderer/完整七包checkpoint和生产持续实战仍由root完成。无新的产品取舍，保持已经批准的Web数值/操作。

### 2026-10-09 实现与连续验收进度

Core内部AI identity用slot+1保留零缺席哨兵，wire仍真实Core handle；真实内存及all-plan→all-controls→effects、完整typed callbacks和actualgravity activation已落。23场AI-only诊断为736阶段、266638 strict/47104 geometry、23 stale rollback，未作正式当前源验收。连续真实武器阶段发现夹具缺省accuracy不符实际hullStats，已按 FireInputs.ts核实并修；同时补真实InFlightFireBudget、实际导弹roster和ShipStepBatch plan-all→commit-all屏障，禁止先一船发射后让下一船query看见新弹。首炮angle已一致，最早后续差为几何威胁ETA的4.4e-16差异，仍在核查来源，未放松实际clock/决策/资源规则。

上述phase接线和物理controls/module pose差异已解决。最新current-source build-only为3,572,623bytes、SHA25656284b68d65932da01c0f0ef1c91cad4d7d68d215d7db8837ba37e75a5947020；诊断25场800AIphase且continuous9–17（含modules/Gloriana）全部通过，新增真实无可用炮withdraw的maneuver正激活。扩module连续覆盖查到盾aim权威未同步，已按actualShip.integrateStep同步shield.data31..33，并新增盾arc/facing/aim检查；不改动clock/规则容差。完整正式Node/freshWorker等待共享native集中稳定，旧诊断总计字段数不得冒充最新正式证据。最新scene prelude independent block正执行actualVisibility/EW/shared/vital安装及对照。完整可玩目标由root持续推进，独立场景通过不作为停工条件。

后续expanded诊断已扩大29scene960AIphase，1242132strict/215801geo、29stalerollback/11startuprollback/224lazy/32reserve/32manual/1实际Coreclone。实际gravityFields/Damage/Terrain在source barrier运行，9–22/25–28含continuousphysical；真实well老化→remote release正触发、well→collapse正触发、手动polaritycommand→AI归正和stopped→resume已覆盖，activation计数release24/collapse40/polarity64。原25scene数字保历史，最新正式指纹仍等待shared稳定，不作为最终可玩结论。

完整gravity dynamic witness追加后诊断1257539strict/221369geo，其中20975gravityfields通过，accepted input/anchors/field ages/budgets/hits/releases/collapse/polarity/held/maneuver均对照actualstate。发现并修scene19首次AI BattleWell held1 vsTS0：实际AI调用ShipSystem.activate()不设置用户按住，runtime.command用户edge额外heldtrue，AI入口恢复priorheld保证同源，用户入口保持不变。全CoreClone直接复用productionderive以含新birth/allocator字段。此前build-only3,960,332byte SHA0524186707c599f79dff5b26bf86bc284a543c62dd97e2abd619efbc52becb37为历史诊断，正式最新结果如下。

### 2026-10-09 正式域验收完成

`node scripts/check-rust-ai-resident-module.mjs` 完成 Node 及全新无头 Chromium Dedicated Worker actual TS oracle：29 场960AIphase、1,257,539严格字段、221,369几何字段（其中20,975 gravity动态witness）、29 stale-stage rollback、11startup rollback、224lazy、32reserve、32manual和1实际fullCoreClone/replay；Worker windowAbsent=true。实际技能激活计数与 retained serial观察分开，maneuver/release/collapse>0、polarity≥2。构建4,034,307bytes，SHA256 `7eb2bef54f3134d262e2380d9b36b3f45b34e4b7aee5d0f1fe5751f7c4e04cfb`；全native、owned TS及fixture指纹在 `artifacts/rust-combat-core-20261008/verification-ai-resident/result.json`，运行日志 `formal-current.log`。production/fullBattleReady仍false，后续共享源改动需按影响验证，不能将此域验收替代整场可游玩结果。

Worker发现真实 `advanceTurretAim` 的±π边界三角舍入：3.9575340788971425和-2.325651228282443只差2π及8.88e-16。纯方向角几何比较用 circular delta `atan2(sin(a-b),cos(a-b))` 并使用同一批准容差，geometryLog保原始值；仅船/炮台/弹体/盾朝向、AI facing/bearing及引力输入/目标方向。角速度、remaining turn、clock/资源/伤害/目标/决策仍维持原严格或线性几何比较，native solver无因此改变。
