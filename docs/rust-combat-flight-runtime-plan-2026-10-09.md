## 2026-10-09 同一私有 Host 的名册身份查找

实际detail late22 Host row约79016次/9.53ms，visible约10748次/4.88ms（包括timer开销，非正式速度）。来源沿本方案FighterWingAPI及当前hostile/findHostile的真实scope顺序，无新玩法。范围仅flight_runtime私有Host同步生命期：懒构建(handle,generation)→原序first row，命中再次核真实代次；bodies长度变化重建，可扩展/回调writer清索引，missing沿原linear stale拒绝。该Host不向外开放，不跨tick存值、不freeze姿态/flux/phase/目标，body字段的原COW及失效保持。

hostile仍按scope读全部同字段资格，visible同原team数值校验/同team true/其它team完整query.visible即时读取，但复用刚定位真实row，减少inner重新查找。公开flight_owner Host保持原合同；实际callback后下一查询重读。所有失败/取消、部署/身份/并发及存档不变。先本文→窄改→与只恢复gravity reconcile/flight runtime旧版的同其它源Wasm真实270/60完整严格比较，必要scope/stale/append fixture集中一次，不借此替代最终正确性/性能。
## 2026-10-09 共享观察集中验收记录

`verification-flight-shared/result.json` 当前两文件旧新、同其它全部native冻结编译，真实270混编/60LAN含reserve全snapshot/scene摘要strict相同，changed=[]，plainSHA85e22426338488c10fee328b0d55c6f1c381caf840e7ad346f2c9427f094a699。`verification-flight-shared-isolation/result.json` copied-native fixture使用真实Core克隆及真实Host/with_host，两场均bits255，验证同次Rc共享、owned caller独立、commands/clear_input COW保旧观察、stale拒绝、pose/heal失效与后续owned读取；270/60后继正常。该fixture窗口ROOT后续navigation两trig更改，记录wholeCurrentSourceUnchanged:false（navigation唯一changed），flight_world/runtime保持冻结，非全最终源验收；诊断exports不在production。现优化功能集中通过；未claim最终可玩或性能门槛。
# 舰载机常驻生产调度方案

## 2026-10-09 同一生产 Host 的不可变观察共享

实际 late22 每步约 9,720 次 body 请求，即使命中缓存仍 clone String、wing 与 Footprint.bounds；算法只读这些捕获观察。重新查看原版 0.98a-RC8 FighterWingAPI 的 source/carrier/members（只说明实体关系），沿当前 FighterSystem/flight_world 既有规则，目标只减少观察的重复分配。范围为 flight_world 的内部读取接口与 flight_runtime 缓存，不改规则、姿态算式、目标资格、更新频率、RNG、UI、联机或存档。

新增 Host::body_shared 的默认实现仍调用原 owned body 并包装 Rc；公开 body 返回独立可变 owned 快照合同保持。生产局部 cache 保存 Rc<Body>，共享读取只借本次最新合法观察；任何当前字段原位更新先 Rc::make_mut，保证已经交给算法/调用者的旧观察不被后续命令、clear_input、heal 或 pose 反写。保所有现有完整失效条件和错误先后，scope 结束释放，不跨 tick 缓存。内部只读路径用 shared；必须独立更改的局部 body、公开 dogfight 返回仍保持 owned clone，原有失败/取消及世界事务不变。

顺序：本方案/依赖核查 → 精确接口与当前 cache → 冻结旧新生产实际混编 270 步/LAN60 步完整 snapshot/scene 逐位核，另真实 Host 的命令更新和旧共享观察/owned caller/clone 隔离必要检查；集中一次，具体失败才定向复查。若生命周期依赖发现不纯则保旧路径；最终正确性、性能与同 SHA 游玩门槛另验。没有新的产品取舍，原版实机继续待许可。

## 2026-10-09 大混编观察身份失效续块（ROOT）

本轮 10 文件联合旧新实际 Kernel 验收通过 `verification-resident-combined/result.json`：22 主舰混编 270 步、含真实 reserve 部署 LAN60 步，全 snapshot/scene 严格位与结构相同，changed=[]。此证据只核 ROOT 性能失效变更，没有替代尚未闭合的 TS/Rust 规则首因及最终正式构建验收。

目标仍为保持所有玩法、实际输入、60Hz、舰载机/导弹/FX/音频和严格规则一致，缩减同一 `with_host` 中重复的只读观察。无新UI、玩家操作、联机权限或存档变化。沿本文既有0.98a-RC8 FighterWingAPI及实际 `FighterSystem` / `flight_world::update_fighters/update_bombers` 原序对照，不新增原版推断；原版实机仍待许可。实际 late22/176body诊断181–240步：collect_wings10.47ms、body请求9720次、system reader9834次；profile只作热点定位，有timer/并发开销，不是正式收益。

目前 `Host` delegate 所有可变方法都全清观察；真实每机 `disable_autofire` 仅修改武器组automatic、控制器manual与AI attrs，均不在 `f::Body` 字段或 effective motion/phase依赖；`deployed_remove` 仅改carrier deployed列表，`cancel_order/event`亦不是body依赖。保真实服务与错误先后，这些写不再全清。`heal` 仅本机HP、`pose/rearm`本机已精准失效；heal亦只在成功后删本机观察。可能影响child pose、身份/wing/recall、spawn/removal、phase/system/parent/global modifiers的写仍全清。每次body仍按当前缓存失效边界读取，不跨with_host/tick，不冻结真实目标/攻击判断。保公开legacy原路径与严格检查。

顺序为依赖审查/本方案 → flight_runtime一文件窄改 → 与只恢复本文件旧版的同其它native Wasm对照，真实22混编270步及LAN部署60步全部snapshot+scene逐字同（不是仅witness22word），必要错误/新生场景由现有七包与dynamic集中复核。任何失败定向修复，不以profile称正常可玩。weapon独占flight_owner/world实际aim规则修复，ROOT不覆盖。

## 2026-10-09 舰载机单次观察与真实失效性能续块

用户目标仍为正常游玩所需的60Hz预算，保持原舰载机规则/更新频率/全部RNG。原版0.98a-RC8本机 `FighterWingAPI.java:26–76` 明确成员、返回、来源舰和remove/add真实变更边界；其API不证明本Web的算法或性能。当前迁移对照为 `FighterSystem` / `flight_world.rs:141–175` 的实际顺序：每机ark_defense → clear_input → commands →后续target/formation读取，scope不能冻结；`flight_runtime.rs` Host lifetime仅单次with_host，真实spawn/removal/system影响继续失效，原版实机仍待许可，无UI改动。

实际同RustLanKernel原80body/40tick profile：collect_wings2.940ms、body请求2354次/1.900ms，inner实际body重造602次/.784ms，set_shield14次仅.0039ms却每次清空全部观察。每个cache miss还重复 `system_owner::modifiers` 两次与 `engine.motion_row_live` 一次，随后覆盖为 `motion_owner::stats` 真propulsion结果，重复没有规则/RNG输出。

窄范围方案：提取`flight_owner`同字段pure body assembler，独立legacy body仍按原live算一次，production wrapper算一次真实modifiers+motion_owner::stats后组装；无移动/算术顺序改变。缓存只针对with_host内真实body字段；commands成功后更新已缓存自身controls/aim/hold/firing/target，clear_input无gravity系统时只更新自身controls/firing，有gravity系统仍全清。普通/void set_shield实际仍调用，但其变化不在body字段（phased只PHASE/docked/retreated/系统/parent/external；普通护盾不改flux），保缓存；PHASE请求能改变phase与flux，仍全清。其它heal/removal/spawn/sync/bind/recall保原全失效，不扩跨phase缓存。root-ownedscene_runtime/state/battle/presentation不改；system_owner全局读合同不改。

实施为依赖审查与方案 → 两owned文件窄改 →同场profile、currentplain正式Wasm真实dynamic source与定向Ark/Gloriana实际战斗集中验收。严格规则、资源、控制、身份和RNG不放宽；几何保持已批准容差。收益按对应flight/body计时与实际重造次数报告，不能把root并行火控/defense读优化收益归本块。未到整场/result时明确区分。

已按上述方案落`flight_owner::observe_body`一次纯组装、production仅实际modifiers+propulsion+phase读一次，以及`flight_runtime::Host`真实自身command/input字段原位同步与普通/void盾非依赖失效。其余writer原全clear、PHASE盾与gravity clear全clear；无global system_owner缓存。actualRustLanKernel相同40tick/80body profile（独立tmp、只读timer）：collect_wings **2.940→1.395ms**、body请求2354不变/耗时1.900→.548ms、system reader2407→1388、phase868→437、innerlegacybody602→14（生产避免重复legacy读，剩余独立innercaller保留）。整native12.12→8.54ms期间存在root/defense并行修改与机器计时差异，不全归因于本块。artifact `tmp/flight-observation-profile/before-result.json`/`after-result.json`，profiling Wasm有只读timer，不能当正式指纹。

current plain生产lib集中编译exit0、零native诊断/补tag。真实动态首180DP/default部署后120帧，既有完整checkerpassed165757strict/104318geo max7.105e-15/113firstDamage。另same正式checker Gloriana/Ark/Gravity各180帧全passed **1823976 strict /820331 geometry max6.821210263296962e-13**、543publications，分别10/5/19firstDamage，所有弹体/beam/audio/radio/FX/trail/result断言保留；canonicaljournal已由root checker自动产出，artifact `tmp/flight-observation-profile/hot-oracle-result.json`。三场180帧无result不称整场，用户可玩/UI/network最终由root集中验收。不再为已通过同域追加重复测试。

## 2026-10-09 真实页面首个 180 DP 默认配装准入修错

真实 CombatView 的原目录排序首个可选舰为荣光级 `web_gloriana`，默认选项为 `default-web_gloriana`，180 DP 在200 DP敌军额度内。页面与独立真实catalog输入的12模板逐字相同；current plain生产lib冷安装成功，动态tags198–200在 `StaticShip.validate` 的初始shield/flux检查失败，尚未改变活跃世界。旧Wasm/newTS产生的tag194失败已通过current重编排除，不修改启动合同。

原版0.98a-RC8本机 `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatFleetManagerAPI.java:28–66` 证明按spec/variant实际生成舰/翼并可从临时reserve出击；原版不包含本Web扩展虚空盾。本次迁移依据明确为 `Ship.ts:490` 调用 `Shield.ts:47–49 configureVoidShield`（fresh constructor立即active、360度）及 `VoidShield.ts:29–33 createVoidShield`（armed=true、满integrity）。native `shield.rs:96–100 configure_void` 已实现同一出生效果；差异仅 `flight_owner.rs:58–63` 静态验证错误地要求所有初始盾关闭、flux.flags固定DISSIPATE=2，因此拒绝真实虚空盾的initialActive=1/flags=3。

窄修将初始shield与flux证书严格按静态void定义核对：有void配置必须initialActive=1且flags=SHIELD|DISSIPATE，无void仍必须0/仅DISSIPATE。不接受运行时active/timer或额外flags，不改额度、身份、RNG、几何容差、目录选择、UI流程、网络权威或存档。现有whole draft仍保持失败无污染。完成后以current正式lib真实页面重新选择相同荣光默认配装，部署后继续键盘飞行/开盾/开火/暂停/地图/菜单；动态真实source按原严格规则比较出生和热步。原版实机仍待桌面许可，页面无头验证可执行。

实际集中验收：current plain `lib.rs` 编译exit0、SHA `4bff331940b6bcdd7facdd6f97ea2fa6c782d379add35c35f45e5d90b6593bad`，零diagnostic native代码/补tag。同actual source `LocalCombatKernel` 与正式 `RustCombatKernel`，真实catalog选上述首180DP/default且200DP额度、真实页面seed0x51f15e，部署receipt/出生witness及120热帧全部passed：165757严格零差异、104198几何max7.105427357601002e-15、121publications、113帧firstDamage。比较保原正式checker全部弹体/beam/audio/radio/FX/trail/result断言；artifact `tmp/flight-ui-dynamic/oracle-result.json`。这场120帧尚无battleResult，不称完整战斗结束。

同SHA准入边界定向验证 `tmp/flight-ui-dynamic/rollback-result.json` passed：虚空盾active篡改0、虚空盾flux标志篡改2、普通模块伪造active1/flags3，均Err8且完整Core snapshot/scenePublication序列化逐字不变；三次失败后原合法首波仍accepted。提高额度400后后来同一180DP/default再部署accepted、完整presentation可生成，覆盖重复craft模板variant合并与laterwave。此处日志字段enemyDP实际是capital count（3），不拿它充当部署点验证。

同SHA真实headless Chromium CombatView 8项操作均passed：冷boot、取消/重开、相同首180DP/default敌军部署、W权威移动、护盾/目标/编组/开火、暂停tick冻结/恢复、地图、菜单/设置/取消重新模拟；633实际音频解码，真实资源115 textures，无重建，截图 `tmp/flight-ui-dynamic-page/cockpit.png`/`map.png`。页面checker整体仍false，仅3条测试Vite HMR websocket错误（5173 HTTP/port0 WebSocket unsafe-port及LocalNetwork）；未过滤错误，root-owned正式UI harness需修测试连接后复验。相关输入日志仅tmp只读trace，native正式lib保持无诊断。部署故障已消除；全新最终指纹/正式页面无错误/所有七包整场与联网由root集中验收。

## 2026-10-09 战斗中增援与模拟器整波准入

最新实际集中结果：正式 installer 已原子合并重力 metadata/collation，startup 精确只编码 radio id/sender/text/color；检查器零diagnostic补tag，actualcoldgraph/source与真实Core完整安装通过。真出生/wholecommit/clone rollback及新增status实际入口共180151strict零差异、6147geometry max2.842170943040401e-14、51born。新增status含Ark真实repairACTIVE库存和原序声音/电台/critical/挂点repair/engineclear。当前scene_dynamic实现已落且actualcurrent全部native联编exit0，动态source验收已完成：普通+模拟共182701严格零差异、4524几何max0、152实际出生，首波/后来双方、ordinary不入DP、超额无污染、完整AI目标及wholeCore clone继续通过。actualactive roots证书按cold active过滤排除DEAD占位；不是全Worker页面或可游玩。

目标是现有增援/模拟部署操作在 Rust 权威内直接出生并继续正常战斗，不重建活跃世界。范围为已有 `CombatEngine.addShip` / `deploySimulationFleet` 的相同行为、模板字典准入及完整事务；不新增舰包、按钮、阵型规则、网络权限或生涯存档，不发布。原版 0.98a-RC8 `CombatFleetManagerAPI.java` 的 `spawnShipOrWing` / `spawnFleetMember` 明确暂存/出击边界；其 API 不证明本 Web 模拟器阵型和额度，后者明确以当前 `CombatEngine.ts:188–232`、`245–255` 与 `ModuleGeometry.ts:24` 为迁移对照。现有界面和确认流程由主代理保留；原版实机仍待桌面许可。

输入使用既有有界 UTF16 Value 和 complete static_ship 构造合同，root 提供 `{version:1,kind,templates,collation,entries}`。root确认每 entry 的 cost 来自既有validated deploymentCost可信边界；descriptor可选cost会额外核相等，不再require重复字段。constructor 仅纯静态，生命周期 ID/模板 key 由 root 分配不冲突。完整 collation 同时覆盖原有名称、动态ship/craft身份和新挂点，不任意 append rank。出生后 all domains、read/prelude/systemRead、allocator、spec字典、scene、AI、flight和两 RNG 只在 whole draft 成功后提交；失败/取消保留原世界和展示字典。

普通增援使用实际 `random.nextId('ship')`、指定姿态/阵营，根舰按 Ship 默认 MANUAL 构造；新 CapitalShipAI 只建立目标及稳定 hash，首 AI 热更新再切到 AI。源普通 addShip 先加入 carrier 再加入 reinforcement/AI。整波先核实两方部署额度和所有 cost，再按 entries 原序构造完整树；首次两方共用至多六列、1000 横距、+1500/-2600 与 1200 行距，碰撞避让沿 Y 继续。后来整波复用真实 entry_position。新舰 incoming envelope 是 `assemblyRadius` 的旋转累加偏移，occupied envelope 是运行 Ship.deploymentRadius 的递归路径长度，分别原生计算；不得混用。全部主舰构造后先建立首敌 AI，再逐 entries 加 reinforcement AI 和 carrier，因此翼机 RNG 不插入主舰之间。

空模拟器首敌 `enemy_ship` 与旧 sentinel 名冲突：推荐在同一 draft 把旧、非参与查询的 sentinel tree 改为请求中认证的保留 stable 名（按相同 module 后缀），同步 allocator、flight、death、terrain、AI、gravity、visual 和 born metadata；原句柄继续作为内部 witness，scene.enemy 改真实新舰，展示字典按旧 handle alias 更新。请求的完整 collation 必须覆盖保留名；旧 sentinel 不发生死亡效果或计数。root 核实此协议后接线，不能保重复 stableId。

实施顺序为来源与协议明确 → 独立 scene_dynamic 实现 → root 编译/whole Core tags 接线 → 同一既有 source 检查器集中验证 → root 全新 Worker/page/恢复/结果可玩验收。验收须覆盖普通新增继续战斗、首次及后来双边 wave、模块 envelope、carrier/RNG/真实AI目标、两方超额和错误cost零变更、stale/重复/缺certificate拒绝、clone继续。几何容差沿既定批准，规则/资源/身份/计时严格。当前实现中，未宣称可玩。

## 2026-10-09 完整出生事务集中验收

生产 status 续块保持 `CombatShipStatusSystem.ts:51–118` 的完整顺序：captial transition/muffled pass 先完成，然后 captured componentShips 原序，各 ship.allSystems 派发、hullmod.advanceCombat，再同船关键损伤/挂点修复/引擎反馈及清除。root批准新增 `gravity_runtime::dispatch_with_flight`，复用唯一gravity/flight权威；每实际 Drone slot 替换generic dispatch，context持actualallocator，birth立即注册所有domain但不加入本次captured components。逐slot重新读取真实subjectiveTimeMultiplier，避免先前slot改变runtime后沿用旧值。返回有序Radio给root，最后由rootadmitBorn.pre​​lude/read/systemRead。原入口仅旧domainfixture保留；无新玩法/UI、存档、联机取舍。验收将复用现有bornchecker增加这一真实入口与source status状态，最终整场由root执行。

已在既有临时 actualCore/source 检查器扩展真正 `validate_scene_draft`/`commit_scene_draft`，Gloriana 两配装和 Ark 一配装各 startup/reserve/recover/relaunch/loss/rebuild，最新174984严格字段零差异、4507几何max0、51实际born。每阶段将所有slots/数字ID/世代/free/next_order/next_numeric/births/world/scene/RNG提交到真正Core；reserve后真实Core clone继续4阶段，共12次完整Core publication、scene numeric words和私有身份一致。批量有效map后stale命令whole rollback、缺spawnAdmission但实际allocator已工作后未提交、duplicate/exhaustion原子、born.read stalegeneration均拒绝，随后合法命令仍可继续。

actual全currentnative modules宿主联编exit0。启动是同源compiler/encoder/actualShip metadata的diagnostic补缺tag：生产installer当前未齐101/prelude/read/visual/systemRead/startup；检查器没有声称productionstartup或freshWorker完成。源开放消息使用实际FleetCommandSystem、与真实startup.finish同visualID，不补随机默认。当前authoredDrone catalog仍空；正常页面、全Worker整场、实际输入/联机边界由root最终验收。

## 2026-10-09 动态生成完整准入修订

目标是补充、重新出击与部署新增模块在同一 Rust 事务内成为可查询、可运动、可战斗、可呈现的真实实体。玩家使用既有召回/部署操作，失败沿用 whole command rollback；无新按钮、规则、联网权威或存档格式变化，不发布生涯。原版 0.98a-RC8 `FighterLaunchBayAPI.java:19–27` 明确落舰移出引擎、重新出击创建新 AI；`FighterWingAPI.java:34–83` 明确成员/来源/回收边界。当前 Web `FighterSystem` 实际生成和 `Ship` 递归构造仍为迁移的行为对照；API 不证明具体计时或排序，相关原版实机仍待许可。

新增 `flight_allocator.rs` 持有 root 提供的真实 slots generations/free 顺序/next_order/next_numeric_id，核对 existing bodies/stable IDs 后 clone。分配按 Core free.pop、无 free 时追加 generation1、数字 ID 顺序、order 顺序；输出有序 allocation 与提交后的 snapshot，root 才负责最终 slots commit。禁止从 max slot 猜已释放槽世代，失败不局部提交。

新增 `flight_admission.rs` 实现 mandatory Authority：StaticShip 保存纯 `spawn_admission`；实际 constructor 在所有递归 children 完成后按 born tree 同步注册 terrain、phase exact controls/anchor、AI 静态 Actor（memory 首次 AI lazy 创建）、aux payload/hooks/travel systems、gravity 系统/挂点纯定义、motion、query scope 和 art specKey。现有 startup 实体不得重新注册或再次抽 RNG；born 不追加入已经捕获的 ordinary/AI roster。root 按真实 barrier 消费 born allocations/membership。已有 ShipMeta 保存其 template certificate，以免靠 specId 在不同配装中猜模板。

编译合同字段为 `specKey`、`phase`（anchorCRCost 可缺，controls 完整）、`ai`（实际静态 actor + module attachment，不含 live memory）、`aux`（两 payloads、stealth 可缺、stealthHooks、ineligible、drone、travelSystems）、`motion`（station、axial、independent、inherit、turnAcceleration、maxTurn）、`gravityRows`（actual纯95–100/103的23word行）、`prelude`（实际源编译的全部静态字段）与 `visual`（实际挂点音效/炮口/尾迹/引擎/文案静态证书）。visual 复用 `visual_wire::decode_meta` 与 `world.visual.admit`，新机在生成事务内成为呈现和声音工厂的合法来源；不补采样、不修改渲染规则。静态证书必须核对挂点 component/slot 和引擎数量，失败回滚整个生成步骤。旧独立 constructor fixture 可缺 certificate；生产 Authority 必须拒绝缺失，不能补虚构默认。

依赖顺序：静态 compiler certificate 与有界 decode → allocator + born registration → root Core 集成 → 新生成/回收/clone失败集中验收。验收要求每 born handle 出现在全部 mandatory 域且 stableId/death/art 匹配；slot0、free generation、duplicate/stale、同 hull 多配装、module双向拓扑、query barrier、无新增 RNG、clone后身份继续一致。几何容差保持原批准，规则严格。动态 `localeCompare` 必须有实际编译证书，不能任意追加 rank；无证书为明确失败，仍在核实可支持的 ID grammar。完整生产与正常游玩验收由 root 完成，当前未标可玩。

## 2026-10-09 生产导入修订

完整 wire 新增 host 集中验证（真实 lib 全 modules/Core + actual RustCombatInstall/compileRustContent）：七包13配装 pure编码通过，11配装 complete flight/native final RNG 安装通过；两 gravity 配装因 root installer 尚漏 initialize-gravity-world94，在95域注册前失败，待root定向补齐。中文+emoji stableId、10个实际 craft 模板 pure解码passed。尚未宣称Was​​m Worker完整场景或可玩；实际队列/动态生成由root下一集中验证覆盖。

本次补齐完整启动协议：`RustFlightProtocol.ts` 将实际 compiler 的纯模板、已有 ShipMeta、机翼与模式、active roots/carrierOrder、formation 编成有界 UTF-16 JSON 数据；tags 133 begin、134 严格顺序分块、135 complete。Rust 解析器限制大小/深度/节点、拒绝重复与未知字段，所有 identity/模板/挂载/系统/父树完整核实后一次安装 `world.flight`，缺少 complete 或重复导入拒绝。模板 fire/query 复用现有实际 typed encoder 的纯静态行，不复制运行中的 tracker。已有 initialWings 由实际 compiler 构造并保留 end RNG；导入不得再次 init 或生成。无机翼启动时保存空 FlightWorld，后续 addCarrier 仍由 Rust actual allocator 执行。所有模板 lifecycle definition 同时核对或安装，不冒用初始主舰 system spec。

玩家操作、UI/联机权限/存档均不变；取消/失败通过 root whole command transaction 回滚，同一 owner 含 admission draft 参与 Clone。实施顺序为协议/完整 static decode → one-time installation → root actual allocator/queue → shared Node/fresh Worker 七包集中启动验收；不再额外扩展旧窄 fixture。验收包括 ordinary/Ark/Gloriana、同 hull 不同配装、PD技能继承、slot0、reserve不模拟、中文/UTF-16 strings、unknown/重复/不完整拒绝。原版依据同下文 FighterWingAPI/source-notes；本层没有新增界面状态，原版实机仍待最终许可。

统一相位场景归 `world.phase`，Context/Authority 不另传 phase owner。formation 的编译期 WeakMap 有序 slots/footprints 通过 `Formation::install` 一次导入；禁止覆盖运行中的阵型。Core slot0 是有效身份，资格只要求 generation 非0。舰船真实 `spec_id` 与 refit variant 的 `carrier_spec_key` 分开：同原版舰体不同配装必须选择编译好的对应 variant，不能改真实 spec ID 伪造不同舰体。StaticShip、ShipMeta 都保独立 carrier key，新增机体从编译模板继承；源 sourceCarrier 保实际module身份，assembly root 则通过原parent树查。

最新集中 Node/全新无头 Worker 对照通过 14 场、191 次状态比较、76 个实际构造、8 次实发射、156 次有序队列比较、223,591 strict 零差异、16,468 几何，Node 最大差异0/Worker 1.1368683772161603e-13；Clone 继续1次、失败合同13项。新增空 formation 只能安装一次、合法 slot0/generation1、失败输入后可继续正确安装。`Formation.installed` 入 Clone；空列表也不可被后续安装覆盖。Readiness 已真正按 queue ships scope 计算；Gloriana 和 recovered replacements 的完整物理仍等共享 queued-owner query/commit 与 per-owner missile scope，当前该部分仅真实决策入队屏障，不标全可玩。artifact `artifacts/rust-combat-core-20261008/verification-flight-runtime/result.json`。

## 目标与本次范围

浏览器和 Electron 共用真实 Rust FlightWorld/Body/ShipState 权威，舰载机发射、补充、回收、轰炸重装、召回、额外机体与 Gloriana 飞行规则保持当前玩法。实现一份 runtime Owned、实际 ordered roster、每机源 dt、真实系统 held 清理/死亡/发射后回执。Core allocator/static admission 与完整 phased batch 由 root 连接；不新增翼队/UI、不改指挥规则、不把离线探针当完整可玩交付。

## 依据与现状

0.98a-RC8 `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/FighterLaunchBayAPI.java:10–69` / `FighterWingAPI.java:12–89`、现有 `rust-combat-flight-world-plan-2026-10-08.md` / `flight-owner-plan`。当前 Web 源 `CombatEngine.ts:1097–1120`：ordinary AI/Ship.update collect 后 decks → capture wingShips → fighters → bombers → drones → batch.execute；born craft 可进入当帧 flight arrays/flight queue，但不能追加入已捕获 ordinary/AI roster。`ShipStepBatch.ts:67–139` 所有 state→motion→weapon-state→query→commit→finish 后才逐 ordered entry 执行 receipts；该行为为本迁移基线。原版界面和实机没有新增操作，待 root 最终实际 UI 验收。

## 操作与调度规则

Owned 唯一持有 flight_owner metadata/static templates、FlightWorld、capital roots 与普通 drones/孤儿 ordered list、当前事务 queue 与明确 Stage。构造仅调用已验证真实 static constructor；allocator 与 admitted 是 mandatory Rust trait，root须同步分配 generation/数字id/源顺序并注册 terrain/gravity/phase/query/AI等所有领域。未知支持报错，不能回到 JS solver 或填默认模板。

每 tick begin 捕获先前 ordinary roster/fire world。capital queue按真实 AI 顺序由root送入；runtime在collect阶段 update_decks 后捕获新的 wing fire roster，随后 fighters/bombers调用真实 flight_owner Host 收集每机 Step，保留源 dt、target 和 FirePermission。drones由root实际规则按源顺序入队。重复 craft/过期stage 报错；removed只改真实成员列表，不删 Bodies/metadata/witnesses，老弹丸仍可追溯source。

Gloriana权限精确为源方友军+选中敌舰、唯一选中导弹；该 ordered去重scope在queue收集时封存。普通craft的World为decks之后捕获的真实 wingShips，不能自动扩大为所有Bodies。火控必须保留实际terrain/LOS，不能通过临时克隆/修改projectiles绕scope。root须提供scoped per-owner fire-query接口；runtime提供实际permission与scope供消费。

batch stage顺序由root实际共享服务执行。queue含每craft dt，不能一套统一dt推进全部Bodies，也不能推进recovered/retired。所有fire-query先于commit；全部Ship.finishStep后，runtime按queue顺序仅对实际pending receipts调用FlightWorld.finish_ship；reserve return没有receipt，因此不会虚构finish。完成前残留receipts报错。status阶段额外发射的机体不会加入已经封存queue，当帧后续terrain/weapon是否可见按各源roster屏障处理。

召回、reserve deploy、recover/detach是真实Rust命令，支持暂停下命令边沿；detach加入普通drone roster；recovered/retreated/destroyed移出活动list但保留generation witness。clear_held复用phase_runtime真实push/held处理，destroy调用world_owner::Host实际stats/explosion/hulk/FX。

## 权威与失败

runtime Owned、队列stage、FlightWorld私有formation/receipts/reserve、metadata、allocator、Bodies、world/gravity/phase、两种RNG及有序事件参与整个Core Clone。allocate/admitted任何失败由whole-step rollback，不能只截断body。禁止外部热callback、默认no-op、跨步重复演化ShipState。源fire rosters包含dead witness时资格由live flags判断，不能为了“清理”去重排源contact顺序。

## 阶段和验收

先方案/API→独立runtime→真实actual fixture集中Node/freshWorker→root生产协议/allocator/phased batch→完整可玩验收。复用此前真实constructor/Ship.update flight-owner比较，增加capture屏障、deck born admission、ordinary/wing scope、Gloriana导弹权限、dt、orderedreceipt、detachment/recovery/paused commands、Clone后继续/stale/duplicate stage。规则strict，几何max(1e-9,32EPS*scale)。只对实际新块集中一次检查，不重复全套。

来源和方案完成；实现中。root必接Core allocator/static-domain admission、ordinary/drone实际调度、scoped query、所有phase读数、完整snapshot/ABI/UI。productionIntegrated和fullBattleReady暂为false；无新产品取舍。
## 导弹 capture 与 DroneSystem 续块（2026-10-09）

本块实际诊断记录：Gloriana2fit/Ark1fit、18 source阶段、51新生机，175383严格字段零差异、4507几何字段max0；actualruntime/allocator/domain用完整当前native宿主联编，源oracleactualFighterSystem。完整源库存回收/rebuild/RNG/组件/机组/armor比较通过，duplicatealloc与untouchedCoreclone见证通过。正式installer缺101的tmpexactcollation补丁仅诊断，不能标production/fullBattleReady；尚无本块freshWorker/完整页面验收。

目标：在 Rust 保持当前 Web 普通舰、翼队、无人机的 fire-world 捕获时刻，以及真实 launcher 的库存、环绕控制、回收和孤儿清理。玩家继续现有系统按键与战斗操作，本块无 UI 或玩法选择。范围只迁移已有 authored content；`native-drone-launchers.json` 当前为空，不导入原版无人机变体、不新增系统或舰船。未来非空证书也必须来自 actual authored data 与完整 StaticShip，不填占位模板。

原版 0.98a-RC8 `../starsector-core/data/shipsystems/drone_pd.system` / `drone_sensor.system` 提供 DRONE_LAUNCHER、库存部署数、释放延迟、环绕配置与 priority；`../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/DroneLauncherShipSystemAPI.java` 给 RECALL/DEPLOY/ATTACK；`../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/system/drones/DroneAI.java` 的 advance 说明母舰 hulk / 不在场后回收孤儿（反编译细节不能视作逐帧等价）。当前 Web `DroneSystem.ts` / `DroneLaunchers.ts` 明确使用 Web 转向/火控而非完整原版 DroneAI；本次迁移这一现状，原版差异继续保留。无新界面，原版实机补验仍待桌面许可。

捕获规则：`CombatEngine.ts:998` 普通 fire world 只过滤 rocket/MISSILE/mine/flare；1106 wing world 捕获 decks 后全部 projectiles；1113 drone world 重新取得 ships，沿用 captured projectile list。Rust queue 每条记录保存此时真实 serial，FireQuery 只消费封存身份，不能读之后 append 的 live ordnance；资格仍读取该身份实际 live 状态。Gloriana selected scope 保原权限。失效身份/不完整内容失败并 whole-step rollback。

launcher 流程：系统 onAdvance 按真实 dt 注册 launcher、清理 dead/docked/HP0、按 maxCharges 减部署数限制库存并累计 regen；RECALL/禁用/过载/排散/相位/延迟未到均不出生。满足时按 SYSTEM 槽轮转构造指定完整变体，source RNG nextId(`${carrier.id}_drone`)、CR/速度/队伍复制、isSystemDrone 与 AI 模式、真实 born-domain 注册、耗一库存并音效。onActivate 依 allowFreeRoam 循环 RECALL→DEPLOY→ATTACK 或 RECALL→DEPLOY；AI 使用已有 withdrawing/distance 条件。状态显示使用真实订单与非 dead/docked 数量。sensor_drones 按 2/秒平滑部署 COUNT，提供 25% 视野/15% 实弹能量射程修正。

收集阶段：在 wing 阶段之后按 launcher insertion order 更新 ringAngles、按 source index/ring membership 求环绕点与速度，严格 MISSILE/FIGHTER/SHIP priority 与最近距离（等距保原序）；回收在原 launch slot 距离 <35 时 dock/clear/返还库存并跳过该机 Ship.update；否则真实控制/目标/盾/组模式后 enqueue。母舰 dead/retreated/HP0/不在 source ships 时 drones HP=0/clear/shield-off 并删 launcher，普通 drones list 只移 dead/docked。detached 翼机在此 list 但没有 launcher，不应无依据额外 enqueue；原源本身保持此差异。born status 中产生的舰不加入已捕获 queue。

实施顺序：先快照和出生 read 合同→独立 clone-owned drone runtime 与 bounded admission→root 同事务接 onAdvance/collect/activation/status/publication→actual authored empty启动及已有生成翼队 born 对照→root 完整页面游玩。所有 launcher state/RNG/allocations/queue/domain/events 随 Core Clone 回滚；浏览器和桌面共用相同 Wasm，联机 authority/replay 使用既有命令。无存档 schema 新取舍。

验收：actual source 对照库存/订单/slot/elapsed/regen/ringAngles/目标/返回/清理/RNG/身份严格一致；方向与位置仅既定几何容差；源非空才测试非空 authored launcher，不虚构已支持。生成翼队实际构造及 read/visual/prelude 准入、重复/缺失/过期证书 rollback、clone continuation 必须通过。空 authored drone 只证明当前内容启动，不代表有原版无人机玩法或整场可玩。最终集成与 UI 正常游玩由 root 验收。

2026-10-09 私有名册索引完成集中验收：verification-resident-indexes/result.json old/new真270混编+60LAN实际reserve部署，全snapshot/scene位与结构同，changed=[]，SHA103e166c40aa349849136532ffcf81d38ebc3d1b431a4e9c773c524d618944a8。verification-resident-index-fixtures/result.json copied真实Core/with_host两场bits255，append/duplicate first-row/同长度代次改变/移除/stale/delegated失败失效及visible当前值错误先后同legacy，committed state未改、production无诊断exports、changed=[]，SHA492dd951168880410aff66c25e5ae3da6c6bfd731cd1da6553100d0a9f3025ac。未claim正式全局性能或最终可玩。
