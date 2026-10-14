# LAN/Steam Rust 主机权威接线（2026-10-09）

## Steam 接线与终场异步发送收尾（2026-10-09）

目标与体验：Steam 保持现有浏览器房主、房间、操作及传输，复用同一 Rust/Wasm 权威；加载回退与恢复必须记录实际后端，正常结束前已经准入的完整终帧不得被异步编码取消。范围仅 LanBattle 的 ready/recovered 身份接线、relay 身份验证和 Steam preparation 的终场排序，不改规则、频率、快照字段、信用预算、部署、联机权限或存档。

来源→行为→差异→验证：`LanBattle.tsx` 创建同一个 `host.worker.ts` 且显式选择 Rust；Worker 的 ready/recovered 已给出实际 backend/SHA/冷回退原因，页面目前丢掉身份。`steam-launcher.mjs` 的生产 gateway 使用 browser-host relay（不使用 Dedicated authorityFactory），因此 Node LAN 后端身份检查不能覆盖 Steam。补 host-only、同 match 的初始化身份控制消息；页面保存实际 ready 身份，每次真正 loaded/重连 loaded 前按同 FIFO发送，异步初始化期间连接暂不可用时不得永久丢身份。一旦登记，恢复不能缺失或改变身份。旧未登记身份的客户端保持现有握手，以免静默破坏现有传输兼容。

`SteamPeer.send` 目前发送 ended 时立即 resetSnapshots，`SnapshotPrepareBroker.reset` 会使尚在真正编码 Worker 中的完整终帧失效。终场控制应等待该 peer 已准入的 active/latest proposal 完成真实发送与 commit，然后沿原 FIFO 发送 ended 及随后 room 控制；不会提高 credit，也不重试已按原政策跳过的普通帧。未准入、断线或预算拒绝的普通帧仍按既有行为处理；该窄修只保证已准入终帧的排序，不能宣称每个慢客户端收到每帧。新 epoch、主动退出和 transport 故障继续原取消/关闭流程。

实施顺序：本证据/方案→实际身份接线与校验→有界 drain barrier→生产 relay+真实 preparation Worker 的 binary/full/delta、错误 ACK、重连和终场顺序最少相关检查。无需 Steam 账号、原版可见窗口或桌面输入。原版 0.98a-RC8 战斗指令依据沿本计划；此次为既有 Web 联机生命周期修错，不改变原版 UI。Steam 实际远程账户及 Steam 网络传输未运行时明确留待实机核验，不用 mock 当成实机证明。

验收：known Rust 与冷 TS 的真实 ready 身份抵达房间；其他席位/旧 match/运行中切换身份拒绝；真实后端 recovery 一致。已有完整 binary 终帧由生产 preparation Worker 准备后实际 native framing 发送，必须出现在 ended 之前，其后 room 控制不反超；等待期间下一场普通替换帧不能覆盖上一场已准入终帧，仍按原信用拒绝并等待后续新的完整publication。假/旧 ACK 不额外授信，peer 退出清除待发送控制。无新玩家取舍，生涯与发布完全不涉及。

## 全场冷启动回退收尾（ROOT于2026-10-09明确委托）

目标与体验：按核心已授权内容兼容合同，未知能力、Wasm加载/清单/编译、原生安装错误都在尚未推进时保留完整现有配装并启动原TS世界；玩家继续既有loading/loaded/ready/start，不新增后端选择界面。范围仅host.worker初始化分支和server实际authority身份/恢复记录；不改默认选择、舰队、控制、房间、预算、快照格式或生涯/存档。真实Rust已推进后的step/command/publication错误仍停止，不转换TS。

依据→行为→差异→验证：core-plan“扩展和内容兼容”要求任一未知能力初始化前整场TS选择；host.worker::init当前RustLanKernel.create拒绝直接fail，server/authority-worker固定发显式rust-wasm。RustLanKernel.create已在安装/席位/初始publication失败时销毁候选Core；host旧TS初始化路径完整保留。原版0.98a-RC8 ShipCommand/API支持控制和战斗规则，后端选择是技术兼容行为，未改原版UI，因此无新增原版画面或桌面操作。

流程：init先清前epoch → 同generation尝试Rust冷编译/加载/安装 → 成功登记全部seat、中性controls、初帧与ready真实Rust/SHA → create拒绝且generation仍有效、无activeauthority/运行时，清候选队列并调用提取的完整旧TS初始化 → ready真实typescript+有限长度原因。重init/stop/fail使旧异步结果失效，旧成功候选销毁；旧失败不得启动新epochTS。显式typescript路径调用同一旧函数。ready后只使用既有权威，recover清输入保持该后端并携实际身份；加载和内容失败不是运行中recover。

权威/并发/存档：同Worker生命周期fence、无热切换。ServerBattleAuthority handle保存真实ready身份；房间保存同身份，recovered若携不同身份拒绝，接回同match/seat沿原握手。原因仅开发诊断，完整数据和玩家交互不变，存档及权限不变。实施顺序为本最小证据/策划→提取不改变旧TS初始化→窄Rust拒绝分支→真实backend/recovery记录→已冻结正式Wasm下加载失败、未知能力、已开始故障不可回退与knownRust实际测试；之后真实600tick/Node房间/终场验收。

验收：加载失败和未知内容均从tick0沿TS真实推进、完整人数/舰船和ACK不变；known内置包实际Rust及正式SHA；旧epoch异步失败不覆盖新init；已开始Rust故障只error无第二ready；ready/handle/room/recovery身份与实际solver一致。不得让验收靠冷回退冒充Rust通过。当前可审阅方案无新产品取舍；原版实机界面仍待许可。

完成帧发布分层（ROOT于2026-10-09明确委托）：host每成功物理步只读取真正原生固定10字摘要 `[version,tick,time,resultReady,winnerPresent,winner,projectileCount,lastEventSequence,audioSequence,audioCount]`；tick须严格等于Core已成功step，浮点/整数/flag/可选winner canonical检查不减。结果就绪直接使用scene与未完成舰毁FX同一个原生判据，不由JS判断。`RustLanKernel` 成功step/presence/deployment后标完整帧dirty；capture/report/witness及部署读取名册前同步一次完整snapshot+scene并严格核tick/time/结果/计数，随后同次完成帧消费复用。无消费者中间帧不建立完整读图，不改60Hz、显示节奏、输入或恢复预算。

只读系统理由发布（ROOT同次明确委托）：`scene_system_publication::words` 已在完整发布开始调用 `Reader::active` 验证当前真实名册；每个系统 `system_reason` 又重复调用它，实际profile包含大量重复flight roster构造。增加仅crate可用的 `system_reason_at_barrier`，由上述已经验证的同一次只读发布调用；普通命令/UI查询仍使用原 `system_reason` 并完整验证。生命周期、技能原因、gravity完整read-world及同owner共享预留不变，不缓存跨帧数据。用冻结生产源码副本旧/新40完整witness与packet逐位核实；失败只定向修此边界。

完整网络编码布局定位：实际部署后的profile显示DisplayPacker.object是较大JS热点。原来每个普通对象都把完整键数组JSON字符串化以查布局。本次仅在同一packet中用键数量和首键找候选，然后逐项严格比较完整键顺序，不构造这些重复字符串。嵌套值仍先完整pack，随后才分配布局编号，保持既有首次出现顺序、1024上限、危险键/深度检查、undefined/nonfinite/类型标签及所有字段。不是跨帧事实cache，候选键匹配必须全部相同。冻结旧/新display文本同真实Wasm40完整packet逐位验收，含tick8真实后备Ark部署；只在实际减量有效时保留。

同次网络读取：`decodeRustLanReads` 的record输入已经是Core完整隔离publication的一部分，内部只同步读取且返回全新scalar/string/array/object，没有输出保留rawrecord；内部record用subarray免第二次数组复制。所有finite/integer/flag/count/membership/尾部检查仍按原顺序执行。固定BALLISTIC/ENERGY/MISSILE三键按原顺序逐值构造，免两次map/tuple数组。独立caller解析后变异必须不影响已解码结果，真实malformed记录旧/新拒绝与错误一致；与布局窄改一起同40完整包strict核对。

host仍每step立即collectRustAudio。为避免这一真实消费者迫使完整scene解码，新增独立已保留音频publication，复用visual_wire同一audio record编码，只有audio category非空，完整Play/Loop/Muffled/order/sequence/原始position/listener/rate/maxDistance保留；零声音从小摘要核序列，同步确认现有event/audio前缀。声音读取不推进/抽RNG/排空，只有既有明确ACK移除成功前缀。完整网络包依旧当前所有字段、所有domain验证，最后snapshot仍同tick FIFO先于finished。以旧eager/newlazy同一plainWasm 40完整witness+packet严格AB、真实多步无消费后的当前帧/每step音频对照，以及当前Node/freshWorker数值与600真实tick零recovery集中验收。

ACK仍在原位置立即调用原生audio/event确认，不延后、不删除额外记录。因为ACK会改变完整publication里的保留队列，ACK后也标完整帧dirty；后续capture/report/witness读取真实当前queue事实，不能把旧eager持有的ACK前快照当作ACK后的原生当前快照。40帧完整witness的逐位AB在ACK前读取；实际主机ACK后核完整网络包、每步完整audio、原生规则/RNG严格一致，并单独核lazy完整witness逐位等于ACK后的原生当前snapshot+scene。此处唯一允许的原生读取差异是原有ACK确实清掉的保留队列及acknowledgedEventSequence，不能借此忽略其它字段。

解码profile实际发现 `RustWorldProtocol::Reader.string` 在100次真实完整publication中占约48ms；多数world record保留原完整values，校验用字符串/身份列表/数字数组的返回值从未使用。新增只验证的 skipString/skipIdentity/skipIdentities/skipNumbers，仍按原count、有限值、整数、generation范围逐项读取，不构建随后立即丢弃的字符串、身份对象与TypedArray子视图。真正loss文本/active名册/stats/particleLives仍重建原结果；完整rawrecord保持。独立decoder caller隔离、错误与尾部检查保全。用同plainWasm40帧完整witness和packet逐位对照，并用既有malformed路径核拒绝，继续集中实场验收。

发布性能后续窄改：Core::publish 对同一个完成帧的每舰 `system_owner::Owned::words(ship)` 先用于统计总宽，再用于offset宽，最后用于写入，连续构造三份相同只读Vec。仅在这一次publish内按原roster生成完整 `(id,handle,words)` 列表；header总宽、offset与最终数据全部读取这同一完整结果，继续保持原字段与顺序。无跨帧缓存、不写world、不改command/step/rollback，不影响现有错误或存档。用冻结原生副本前后双plainproduction40帧完整snapshot/scene/wire严格对照，再纳入最后集中主机验收。

实际持续断线对照修正：现有 TS CombatEngine 的根 AI 名册始终排除主玩家，host.worker 没有补独立 playerAI。因此主机自身断线的当前行为是清输入并停留 MANUAL。Rust 保留这个已存在行为，撤销先前推测的 host AI 接管；其他客人断线继续真实进入 AI。改善主机断线行为属于另行产品改动，本次严格迁移不包含。浮点操控 analog 仍按既定严格决策合同核实，不能改为几何容差。

## 目标与范围

浏览器与桌面继续共用 Rust/Wasm。LAN/Steam 每名玩家操作自己的真实舰船和武器模块，移动、技能、舰载机、锁定、部署、撤退、断线 AI 接管及重同步保持现有行为。客户端继续接收已有完整显示快照及现有二进制/JSON 编码，不持有规则权威。

本块只迁移主机规则运行与事实投影，不修改房间、席位、输入手势、按钮、音量、舰船包、数值、暂停或恢复政策，不修改生涯、发布流程或默认 fullBattleReady。原版实机 UI 待许可；没有桌面操作授权，本块不操作窗口。

## 来源与当前差异

- 原版 0.98a-RC8：`../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipCommand.java` 列举移动、武器组、自动开火、开火、排散、防御、召回、技能命令。原版证据支持这些舰船命令；多席位与网络恢复属于现有 Web 扩展。
- `src/network/LanWorld.ts::createLanWorld` 是当前真实队伍、设计包、出生阵型、初始 DP、AI 自动增援、craft 载舰绑定和席位身份来源。冷启动允许调用一次并编译；之后不保留或推进 TS 规则图。
- `src/network/host.worker.ts::step/clearControls/handleMessage`：每席位依次执行移动、模块武器输入、去重后的命令边沿、引力保持；输入 500ms 失鲜后中性化。connected/syncing 保手动，真正 disconnected 释放 AI。部署回执按 seat:requestId 缓存 128 条，不能撤退其他真人舰船。恢复预算、快照信用及完整 tick 发布不变。
- `HostSnapshot.ts::captureLanDisplayCombat`、`LanShipProjection.ts`、`LanDisplaySnapshot.ts` 是兼容显示契约：真实 controlled 身份、全大舰/动态 craft 字典、完整系统/盾/武器/装甲数据、世界 FX、部署、队伍、时钟及 ACK。当前 Rust 本地只有主舰控制，尚未接到此网络契约。
- `scene_control.rs`、`scene_commands.rs` 已实现同源控制和普通拒绝；复用它们时提供真正席位 actor 和独立 manualWeapon/target，不能把其他玩家输入提交到旗舰。

## 状态与完整流程

1. init：按现有 Match 冷建一次真实 LAN 图，采样中性手动控制，编译内容、实际 RNG、部署与每个 seat→handle，释放冷图。Wasm 安装席位后发布 tick 0，沿现有 ready/fresh-frame 握手开放输入。
2. 每步：主机按现有收包序号及 action id 消重；Rust 接收每席位新样本及仅该帧的已接受边沿。每席位独立 actor 执行移动/模块→边沿→引力，再共同推进唯一世界一次。stale 样本不触发边沿，已消费 action id 不回放。
3. 失鲜/恢复：清移动、trigger、queued edge；连接者保持中性手动，断线者完整 AI 接管。online 仍由现有新快照握手决定。恢复丢弃声音和历史边沿，保留房间/身份/战斗事实；超出既有预算沿原错误返回。
4. 部署：验证当前 seat 与 online，从原生真实队伍及部署名册执行。同队 AI 允许部署/撤退；其他真人舰船撤退拒绝；撤退/withdraw 含后备标记按既有规则。回执普通失败带原理由并缓存，重复 requestId 不重复改变世界。
5. 发布：从已完成 Rust snapshot/scene facts 构建已有显示 DTO。只做只读数据投影，不实例化 TS Ship/CombatEngine 或调用规则回调。native audio 进入既有两条 bounded64 声音队列，并在实际发布后按序 ACK。世界 tick 与模拟时间、各席位 seq ACK 绑定同一完成帧。
6. 结束：发布终帧，沿原 FIFO barrier 发唯一结算报告，报告含真实 seat/team/DP/status/hull/CR。

取消/失败仍使用现有 stop、生命周期 fencing 和错误消息。schema/stale handle 错误整包原生回滚；合法技能/部署拒绝保持现有普通回执，不关闭 Worker。

## 权威、并发、存档

主机 Wasm 唯一权威，各席位只控制登记根舰及其模块。网络输入、presence、deployment 沿既有单线程/完整 tick 边界执行。异步编译以 lifecycle fence 阻止旧 init 覆盖新会话。显示快照不是存档或重建检查点；本块不修改存档格式。

## 实施顺序与依赖

1. 独立 native `scene_seat.rs`、固定 tags201–207、席位样本与行动控制；root 在 scene owner/router/runtime 做所列挂接。
2. 冷编译 `RustLanStartup.ts` 与真实 `RustLanKernel.ts`，直接复用 Core/install/publication，不修改 root 本地 Kernel。
3. 纯事实 `RustLanDisplay.ts` 与主机条件分支，保留 TS 兼容路径以及已有编码/信用机制。
4. 集中一次实际无头网络验证，再按具体失败定向修正。

## 验收

至少两队与非连续席位均能独立移动/技能/锁定/模块；失鲜边沿不迟发；断线 AI 与 connected neutral 差别真实；本队部署、真人撤退保护与回执幂等通过。真实 display receiver 必须能初始化、连续更新、恢复和解码二进制/JSON。投影重复读取不得改变时间/任一 RNG/身体事实。结束报告身份及顺序正确。只报告实际运行证据；域测试与编译不等于完整可玩。

几何容差沿用户已批准 max(1e-9,32*EPS*max(1,abs(a),abs(b)))，方向角用循环差；决策、RNG、资源、伤害、计时、文本、presence、ownership 严格相等。

## 当前实施与传输优化（2026-10-09）

实际源逐帧 Node 与 fresh Dedicated Worker 的三场已通过，涵盖稀疏席位、三队、模块、部署和 88 craft；实际生产 host Worker 的大舰场仍因真实 core_step 超载未通过，不能称可游玩。真实 capture 约 28.5ms、encode 约 10.3ms；原生 step 约 74.8ms 是首要瓶颈，由主流程继续处理。

本块显示采用既有 displayVersion 2 定义字典，源码依据 `DisplayDefinitionCapture.ts`、`DisplayDefinitionReceiver.ts`、`LanDisplaySnapshot.ts`，以及 `AuthorityCombatSnapshot.ts` 的 `$record` 结构恢复。只对武器/系统的实际不可变定义使用现有有界字典；超预算定义回落普通数据。每包自带完整定义与结构表，顶层 ship state/world/displayWorld 仍为接收器所需显式字段，不引入跨包差分或恢复依赖。craftSpecs 继续实际原始规格。预构建静态规格查询表、每帧父子索引及一次 assembly tree，消除相同事实的重复查找。验收沿实际 JSON/二进制接收器及只读 witness，玩家行为、数值和流程没有新增取舍。

后续同包投影还会对相同已完成数据对象重复递归，例如同一系统同时出现在 system、systems、allSystems。采用仅存活于当前完整包的对象 identity memo，以分别保存普通 record 和显式顶层对象的编码结果；同步 capture 期间这些事实没有权威写入。每包仍包含所有字段、布局与定义，接收器仍独立恢复数据，无跨包缓存、无数值简化、无共享模拟组件。通过既有真实 JSON/二进制显示接收器、只读 witness 和 host timer 集中验证。

RustCombatPresentationFrame 已提供同次 capture 的 `shipRecords:ReadonlyMap<number,RustPresentationShipRecords>`。网络投影直接读取这些已由完成事实验证和构建的 render/hud/contact，显式核对 numeric id、handle/generation、stableId、specKey 和全舰覆盖；沿既有 network extras、完整定义和 row codec 输出，避免对同舰第二次构造整套投影。数据只读且没有权威组件。使用相同 Wasm 的 40 帧旧/新投影完整包字段对照，并集中用实际显示接收器和 host timer 验收。

网络组包进一步减少当前完整包的中间对象。现有逐舰与逐武器投影先 pick 再双 spread，重复写入同一字段；改为在一个新显示对象内按原先 render→hud→额外字段顺序写入，保持 own enumerable 键与插入顺序。当前生命周期、组件、挂载读数预先建立仅该舰本帧的实际索引，避免每武器反复 find；缺失绑定仍失败，不缓存规则事实或删除字段。用同一生产 Wasm 40 帧旧/新完整 JSON SHA 严格比较，再检查集中既有 LAN 接收器。无几何简化、控制容差变化或权威修改。
组包 codec 的相同形状仍用原完整 keys 列表登记；对象编码预分配 values 数组并直接读 own enumerable 字段（来源是已完成纯数据投影），同包 memo 只查一次。静态 WeaponSpec 已由冷编译冻结且不变，同包 definitions.reference 可以复用同对象的结果，避免每挂点重复完整定义资格读取；系统动态 definition 不跨对象或帧缓存。每个完整包仍包含相同定义/layout、顺序与字段，非法执行/禁用键/预算检查保留。以相同生产 Wasm 与当前冷输入40帧完整JSONSHA严格对照；没有实际收益的尝试不保留。
经主流程委托检查完整 publication 解码成本。RustCombatCore 在读取 Wasm 后已复制整包、彻底脱离原生 memory；scene、dynamic、world 内 record 再 slice 会二次复制。只在这份 detached 全包内采用 subarray，并保留所有原有限长、finite、整数、membership、UTF16、canonical optional 与尾部检查。world 的 numbers 只做有限值扫描并返回 detached 子视图，避免验证每组固定字段时分配 TypedArray。visual Reader 可直接读 detached Float64Array：验证记录全部 finite 后使用局部子视图，结果仍逐字段重建 Vector/数组/对象。Core 外部独立 decoder 默认仍复制调用者输入，保持不共享 caller 数据的隔离合同；内部显式 detached 模式才借用。用同 Wasm 40帧完整 snapshot/scene witness与packetJSONSHA严格对照，并验证原生进步/内存grow之后已发帧不受影响；不省任何字段、解码检查或更改 ABI。
完整 native snapshot 的 world_wire 两次只读使用 Body 的死亡定义和武器 delivery，但 Core::publish 先复制所有 Body 与其全部嵌套数组。保留原 words(slice) 入口并委托给同一个只读 cloneable iterator 实现；Core::publish 按原 roster 顺序借现有 Body，world_wire每次遍历clone的只是迭代器。完整world记录、名字、伤害、静态delivery、FX与事件顺序不变；不改 step/rollback 或 scene_publish 的slice依赖。以同一份实际native源码的旧/新构建各40帧完整snapshot/scene/packet比较验证。
scene publication 现有依赖需要连续 Body slice，保留该结构与全部读取，仅复用 Core 已有可重建 scratch 并逐 Body.clone_from 更新。普通 step 在每次消费 scratch 前同样从权威 Body clone_from；完整 scene step 不消费此 scratch。每次 publication 先刷新全 roster 并 truncate，generation/生成/退出后的名册仍完整。此缓存只节省分配，不复用旧事实，不改变成功/失败 authority 或复原合同；读取错误仍拒绝，下一次重新从权威刷新。与 world_wire borrowed iterator 一起做同一native副本旧/新40完整witness对照。
## 实战发现的动力模块接线补齐（2026-10-09）

源码证据：`ModulePropulsion.ts:7–24` 用声明 slot 列表作永久分母，以真实子模块 parent、dead/hullHp/retreated/docked、继承指令、引擎数与 flameout 门控累计 movementMultiplier；`ShipMotion.ts:26–46` 用此系数进入 maxSpeed/acceleration/maxTurnRate 的 Math.max 之前，而 turnAcceleration 在非 disabled 的 Math.max 之后乘 turn；deceleration 不乘。原版 0.98a-RC8 `ShipAPI.java:527,541–542,589–596` 支持模块与母舰绑定；具体 modulePropulsion 是现有舰船包扩展，不声称原版固定数值。无需改变玩家界面与操作，损失动力模块后实际操控、AI预测与HUD必须一致。

当前只有 `scene_system_publication.rs::propulsion_status` 使用真实静态 slot/reserve，运动权威仍未使用。按 root 明确委托补齐 `motion_owner` 的只读采样和 engine stats：冷静态配置从已验证的 scene.system_read 绑定，小型物理索引只存实际配置根舰；generated admission 从已解析 metadata 登记相同配置。AI、玩家转向读数、物理积分与display读取同一采样 helper，保留源码乘法/夹取顺序及 disabled 分支，不用夹取后乘替代。缺失声明slot计零但保留分母，未知已声明handle/错误parent失败回滚。

验收利用实际 Gloriana/modulePropulsion 舰船，集中比较完好、部分引擎失效、模块离线、缺失声明slot及 disabled 情况的 source shipMotionStats 与真实原生运动；检查决策/计时/RNG严格不变。无新玩家取舍或存档格式修改。

## 生产 Node 权威构建修错

真实 `build-battle-server.mjs` 构建出的 authority Worker 在 ready 之前抛 `JSON.parse("[object Object]")`，路径 `NativeVariantCatalog.ts` 的 `simulation-variants.json?raw` 被 esbuild 默认 JSON loader 导出对象。构建器补与 Vite 一致的显式 `?raw` text 插件，保留现有 component transform 与原始数据字节。验收用真实 Node Worker、原始本地 asset fetch、同一生产 Wasm manifest/hash、ready/持续 tick/ACK/部署回执；不只以 bundle 成功判断可启动。

验收来源修正：仅在运行开始散列当前文件，不能证明先前已构建的Worker由这些文件构建。生产构建额外记录authority bundle SHA/字节和实际input fingerprints，原有input列表保留；真实Node loader、WebSocket room、终场检查都在运行前后核构建manifest、bundle以及正式plainWasm对应的native源码指纹。记录source qualification是否通过，不能把独立传输通过冒充整个大场已可玩。不改变生产Worker输入、玩法、回执或输出格式。

正式native验收指纹在rustc编译开始前读取，保留到结束核对；不能等编译完成后才散列并把期间新改源当作已编译代码。最终仍需所有所有者冻结源码及独立CPU计时窗口，不以同时重编/采样时的timer数据冒充正常可玩。

实际大场短验收能跑到 tick 65 却经历两次原生恢复、约 35Hz，不能作为“正常游玩”通过。host timer 验收明确要求现有 60Hz 大场至少持续 600 完整 tick 且零恢复；保留完整舰船、原输入/部署/快照信用与原恢复政策，不能提高预算。任何 recovered 事件在本验收中保留计数并判定未达标。稀疏权限流程也必须零恢复。
## 真实房间与传输的验收范围

最终集中验收还需通过已有 createLanServer 与 createAuthorityFactory 的真正 WebSocket 房间：两玩家用已有舰船协议应用配装、分队、准备、开始，通过真实 Node Wasm 权威发全快照，既有 PMD/二进制 delta 解码、ACK、暂停单席位快照信用、真实输入和同 matchId 的凭据恢复。测试只创建当前验收拥有的本地 ephemeral 房间和端口，退出时关闭其连接与 Worker；不操作桌面、不发布、不更改房间规则。主流程负责两浏览器真实渲染/操作路径；此项检查真实传输与权威，而非代替画面验收。
## 引力运行阶段读取优化（2026-10-09）

目标是让现有大舰与舰载机联机场景持续实时运行，不改变玩家操作、技能、输出顺序或恢复预算。源码 `Ship.ts:983–998` 在每艘舰内按 allSystems 顺序更新技能，然后运行战备处理，再取消过载、排散和熄火下的技能；原版 API 仅作为战斗指令和模块接口依据，本引力玩法是既有 Web 扩展。实际 RustLanKernel 40 帧诊断中 prepare 每帧 65 次，重复完整 hydrate 与全场 observe，合计约 4.46ms；fields 约 2.9ms。

本次仅减少未被当前操作消费的读取与回写。prepare 仍逐舰 begin_clock，保留全部非引力技能调用、readiness、事件与 RNG；仅当前舰真实引力 slot 逐次从当前生命周期和 metadata 读取，并在原顺序立即提交。取消前后只需要本舰真实事实，改为共享完整 observe 所用的单舰读取函数；Slot.update 内真正世界查询仍在发生时读取完整现场，不跨技能缓存。无引力 slot 的普通舰不复制全场控制器、牵引武器或地形。after_readiness 重新读取本舰 slots，避免覆盖战备处理中实际中断状态。引力 collapsed 状态只回写被处理舰。

fields 保留全部场、机动、推送、牵引/偏转和伤害；经主代理授权，仅当实际 controllers 无 slot 且无非零 tidal damage 武器时省掉空 advance_damage。源码此时只有 observe 与空循环，没有状态、事件或 RNG 写入。任何实际 slot 或 tidal 武器存在时，仍沿原完整 roster 与每次真实伤害后的现场重读，不改变处理顺序。

验收集中一次相同实际 Kernel 诊断及当前 Node/fresh Dedicated Worker 的 LAN 严格源对照，包含持续断线、模块、11 动力配置。诊断只衡量真实成本，不代替正式源验收；实际大场 host timer 仍必须运行通过。界面和存档格式不变，无新增玩家取舍。当前断线原规则差和大场初始化失败仍保留为未完成，不以优化覆盖。

## 待核实/取舍

没有新增玩家行为取舍，沿既有 LAN。原版实机操作仍待授权；网络端到端运行需 root 新 Wasm 完整挂接及实际构建。当前协议尚不提供单独技能 facing；维持既有 edge aim 行为，不添加新 UI。可选 motion/critical/projectile 小通道若暂不能采样真实事实，仍保完整快照可玩并明确记录，不能发送伪值。







