2026-10-09 当前整体交付状态（以下里程碑保留为历史）：完整常驻战斗、纯呈现、Local Worker、LAN/Steam 权威及恢复均已接线，默认仍 TS，ready=0。正式 Cargo/LTO cf8c3f8a（2,719,695 bytes）真实生产22主舰/176body、90warm+180测量、TS/Rust/Rust/TS ABBA：规则严格12195/几何5691，maxDifference0，errors[]；正确性 passed=true、performanceGate=false。simulation32.334→55.661ms、encode11.934→29.645、decode7.063→9.453、roundtrip51.824→95.893，P95/P99及两对也回退，不能宣称提速或启用默认。完整原始证据 performance-abba-cf8c3f8a/result.json 保留。

后续保留已验 fire PreparedHulls、近炸远界有序查询、Ship显示存储及弹体字段选择；immutable-copy schema缓存、弹体身份retainer、逐炮系统观察和火控rosterindex因实际无收益/回退弃用。系统全发布只读观察最终验收进行中。下一正式构建/完整ABBA、同SHA七包整场、真实无头CombatView操作、完整结算与存档回写、LAN房间/恢复/末帧FIFO仍未完成。旧SHA历史成功独立列出，不冒充当前最终构建证明；外部真实Steam账号及原版可见实机对照仍未验证。战斗范围types与ROOT改动ordnance lint本轮exit0；不构建/发布生涯内容。
# Rust/Wasm 战斗迁移：P0 与 P1a–P1f 交付记录

日期：2026-10-08。整体迁移仍在开发，未完成、未启用、未测完整战斗性能。方案见 [迁移策划](rust-combat-core-plan-2026-10-08.md)，原版及 Web 来源见 [来源记录](rust-combat-core-source-notes-2026-10-08.md)。

## 实际交付

- 已确认浏览器/Electron 共用 Rust/Wasm，以及限定几何舍入、实际规则结果严格一致。已写完整策划及最小原版对照；后续阶段不需要重新询问这两项选择。
- 找到并实际使用本机 Rust 1.93.0。匹配的 `wasm32-unknown-unknown` 标准库从官方分发地址下载，SHA-256 `3100cb920ddac646943243f0eddd331128836b9161dd5f7b0a6c76375d39cc5e`，21,553,640 bytes；在项目 `artifacts` 内独立提取，没有运行安装器、改 PATH 或覆盖已有 Rust 安装。
- `native/combat-core` 是可编译、可执行的实际 Rust 代码，不是完整战斗后端。已实现常驻身份/代次/语义顺序、两条现有 RNG 与 ID 流、批量具名命令、运动状态推进、幅能、局部时钟、通用多槽系统生命周期、普通/相位/虚空护盾自身状态、数据化维持费用、装甲格/直接舰体扣血、武器健康/前置时钟/弹药/停火/故障组补偿、战损贴花包络/RNG、发动机控制器/伤损运动、组件传播与严重武器/发动机故障实际侧伤、原子失败拒绝，以及合法发布/销毁。
- `src/engine/runtime/rust/RustCombatCore.ts` 初始化一次，后续推进不上传姿态或整世界。控制、stats 修订、生成/移除通过命令；发布输出复制，不能写回权威。内存增长后重取视图；错误代码与 Wasm trap 分开处理。
- 新增匹配标准库准备、离线锁定构建和集中领域差分命令；Rust/TS 记录布局在装载时核对。构建源哈希与模块哈希记录于 manifest，验证前后确认来源未漂移。

当前 ABI 6，`core_domain_mask=4095` 表示身份/RNG、运动、幅能、通用生命周期、局部时钟、护盾、维持费用、装甲/直接舰体伤害、武器健康/前置状态、发动机与组件传播的开发领域；`core_full_battle_ready=0`。现有本地/LAN/Steam 战斗入口没有导入这个开发绑定；没有替换默认后端或使用旧失败的实验开关。P1a–P1e 的历史回执仍保留在下方。

## P1a 首轮集中运行回执（历史）

首轮实际 Wasm 产物如下；该 build 路径在 P1b 重建后已更新，下列尺寸/哈希只描述首轮，不描述当前文件：

- `artifacts/rust-combat-core-20261008/build/wasm32-unknown-unknown/release/foundry_combat_core.wasm`
- 61,670 bytes；SHA-256 `a0fb506952674248d77c01076e7fe1aac91e45374b64c47073c92073ed4d1fe2`。
- 编译成功；模块 imports 为空，没有导入旧 JS 规则求解器。

严格 TypeScript 检查覆盖新绑定、协议及实际领域差分入口；改动 TS/MJS scoped lint 均退出 0。两份 PowerShell 脚本解析通过。等待 Wasm target 时一次 host metadata 检查报告两个未使用布局常量 warning；随后将其接入发布容量和 ABI 核对，实际最终 Wasm 编译没有该 warning。

`node scripts/check-rust-combat-core.mjs` 退出 0，执行 Node 与新建无头 Chromium 的真实 module dedicated Worker：

| 验证 | Node | Chromium dedicated Worker |
| --- | --- | --- |
| 战斗 RNG 逐值严格对照 | 5,000,000 样本，跨过 JS number 安全整数边界 | 4,000 样本 |
| 视觉 RNG、两条 ID 与完整 RNG 游标 | 严格一致 | 严格一致 |
| 实际生产 MotionKernel 对照 | 24 个命令/控制状态，300 步，158,400 字段 | 相同规模和字段数 |
| 几何差异 | 0 | 77 次；最大绝对差 `1.4210854715202004e-14` |
| 控制、状态、dt、clock/tick | 严格一致 | 严格一致 |
| 命令失败不部分提交、非有限运动拒绝 | 通过 | 通过 |
| 失效实体代次、销毁实例/旧 tick、独立实例 | 通过 | 通过 |
| 真实内存增长、保留输出不 detach/不写权威 | 通过 | 通过 |
| Worker 内没有 window | 不适用 | 通过 |

完整结果、来源哈希和冻结验证 bundle 在 `artifacts/rust-combat-core-20261008/verification/result.json`。浏览器和辅助 HTTP 服务已由 finally 清理；没有连接用户浏览器、开可见窗口或触碰现有开发服务。

## P1b 实际交付与验收

- 新增 `flux.rs`、`lifecycle.rs`、`ship_state.rs`；扩展既有私有 Core 和 TS 协议/绑定，未把旧 JS solver 导入 Wasm。FluxTracker 的软/硬幅能、费用成功/过载返回值、过载/排散、耗散、引擎加力，以及 `advanceHullModFlux` 的硬幅能预算和零幅能修正按现有 Web 算术迁移。
- 不可变通用规格与任意数量的有序系统槽位常驻 Rust。激活费用预留/按槽位结算、IN/ACTIVE/OUT/COOLDOWN/IDLE、零时长、overshoot、Infinity ACTIVE、OUT 入场强度、充能/回复、启停/中断/重置及待派发计数由 Rust 持有。激活失败生成有序结果，不改变资源；非法批次和溢出步骤不部分提交。
- world/tactical/subjective dt 在系统更新前取样；耗散用 tactical dt，系统和运动用 subjective dt；零局部倍率清理运动输出。phase effect 和外部时间属性为具名修订，相位状态机本身尚未迁移。
- 过载即时撤下资源域 shield-active 标志，并按回调/音频顺序记录通知；完整护盾碰撞、arc/phase 仍待实现。系统派发通知保留原启动/ACTIVE/advance 顺序及重新取样 dt；通知不执行真实效果回调。事件在读取后仍保留，累计 ACK 才回收，部分/重复 ACK 已核对。
- 实查排除已停用的 `NativeCombatSystems`/时间贝壳；保留当前 custom-only 注册状态，没有更改原生内容开关，也没有把通用规格当完整系统能力声明。

P1b 当轮 Wasm 104,856 bytes；SHA-256 `441bbe06657a2c397575a01fdf9a94728002e9a92d3c0462d3770f35dea66df7`，imports 为空。来源/模块指纹在构建与验收前后核对。该历史构建与 manifest 已另存于 `artifacts/rust-combat-core-20261008/milestones/p1b/`，当前 build 路径已更新为 P1c。

`node scripts/check-rust-combat-core.mjs --lifecycle` 最终退出 0，Node 和真实无头 Chromium module dedicated Worker 各完成：

| 核对范围 | 实际结果（两种运行时各自通过） |
| --- | --- |
| 19 个领域实体、100 步 | 222,272 次资源/局部计时/通用生命周期字段严格比较，无差异 |
| 有序领域事件 | 2,078 个事件的实体/系统/类型/值/tick/代次/序号严格一致 |
| 源算法 | 真实 TS FluxTracker、ShipSystem、Ship 主观时钟 getter、advanceHullModFlux；owner adapter 仅提供领域输入 |
| 规则边界 | 精确容量、费用拒绝、硬幅能/超量时长、各舰级、排散/取消/完成、耗散阻断、回复、零/无限时长、多槽预留、中断/重置、零局部倍率通过 |
| 失败与输出 | 批次/步骤原子拒绝、失败定义不残留、事件读两次不消费、累计/部分/重复 ACK、资源/系统输出不能写回权威通过 |
| ABI 后 P1a 回归 | 4,000 RNG 样本、24 运动实体 ×300 步、158,400 字段、代次/实例/内存增长通过；未重复历史 5M 随机检查 |

Node 的 P1a 几何差异为零；Worker 仍为 77 次，最大 `1.4210854715202004e-14`。该几何容差从未用于幅能/计时/费用/事件。新领域运动也仅使用同一 allowlist；没有完整游戏性能测量。

首轮独立检查遇到 Vite 环境、循环模块装载和主动停用的原生工厂，定向调整检查入口；发现并修正未知 tag 错误码和零局部倍率的推进输出边界后复查。没有因这些失败运行全套测试。最终回执与冻结 bundle 位于 `artifacts/rust-combat-core-20261008/verification-p1b/result.json`。浏览器/辅助服务器由 finally 清理；不占用桌面输入。

新协议/绑定 strict TypeScript 检查与改动脚本 scoped lint 通过。没有运行完整应用 typecheck 或完整战斗验收。领域证据不证明特殊系统回调、七包、完整 Ship 更新或原版实机/视觉等价。

## P1c 实际交付与验收

- 新增常驻 `shield.rs`，迁移 NONE/FRONT/OMNI/PHASE 自身生命周期、关闭计时、延迟重开/取消、展开、移动后朝向、强制相位输入、世界时钟硬幅能维持费及相位最高速度倍率。相位一次更新只进入一个 switch 分支，不消费 overshoot。
- 普通护盾维持费、系统软/硬维持费、激活费、耗散及护盾更新保持现有调用顺序；raw toggle 与舰体按钮分别返回即时 active/命令 accepted。过载/排散立即影响护盾，保留关闭计时、相位 OUT、系统中断和音频顺序。护盾 active 与 phase effect 由常驻状态独占，旧命令不得覆盖。
- 系统资源子规则是显式生命周期门控数据：软固定值、硬固定值/容量比例、护盾倍率与控制标志；保留右结合 auxiliary 组合、不可用中间槽的资源截断及 OUT 控制释放。无护盾安装时系统资源费用仍结算。只覆盖可表达的资源子规则，不代表完整系统能力准入或任意回调迁移。
- 虚空护盾独立容量/延迟/整层重建/armed/suppressed 与表现包络已迁移；独立吸收命令保持现有伤害转幅能和容量恢复结果。该命令不查询命中、不提交装甲/结构伤害。普通盾分段亮度保持呈现边界，虚空护盾仍明确属于现有 Web 改编。
- ABI 3：命令 26、发布头 17、body 59、system 29、shield 67、event 8 个 f64；增加具名护盾/费用命令和复制发布字段。完整战斗 readiness 仍为零，没有修改现有生产后端选择。

P1c 当轮实际 Wasm **123,824 bytes**；SHA-256 `7de3e86bfbc88fc5589658da8645312f311166c1c55bc436c08f41364ed3efed`，imports 为空。Rust 1.93.0 release 编译退出 0；manifest 与源哈希、验证前后来源均核对。没有安装发布资产；当前 build 路径已更新为 P1d，下方 milestone 保存该历史构建。

`node scripts/check-rust-combat-core.mjs --shield` 最终退出 0，在 Node 和全新无头 Chromium module dedicated Worker 运行实际 TS 方法对照：

| 核对范围 | Node | Chromium dedicated Worker |
| --- | --- | --- |
| 护盾主场景 | 14 个领域实体 ×100 步 | 相同 |
| 护盾/幅能/时钟/生命周期字段严格比较 | 287,648 次，无差异 | 287,612 次，无差异 |
| 有序事件 | 462 个，实体/系统/类型/值/tick/slot/代次/序号严格一致 | 相同 |
| allowlist 几何差异 | 28 次，最大 `8.881784197001252e-16` | 1,346 次，最大 `3.339550858072471e-13` |
| 原子性/所有权 | 无效批次、护盾角度失败步骤回滚、失效代次、复制护盾不能写权威通过 | 相同 |
| 无护盾系统维持费 | 实际 ShipSystem/FluxTracker 字段严格对照通过 | 相同 |
| P1b 回归 | 19 实体 ×100 步、222,272 字段、2,078 事件严格一致 | 相同 |
| P1a 回归 | 4k RNG、24 运动实体 ×300 步、158,400 字段、内存增长/代次/实例隔离通过 | 相同；历史几何 77 次，最大 `1.4210854715202004e-14` |

字段严格比较计数包括逐位相同的护盾几何样本，已用容差的几何样本另计，因此两端计数略不同；费用、幅能、阶段、timers、phase effect/phase speed 和事件从未应用几何容差。每个 P1c 几何差异的标签、实际值、参考值和误差保存在结果 `geometryLog`，非有限几何不能通过容差。

对照使用真实 `Shield`、`FluxTracker`、`Ship.prepareStep/integrateStep/toggleHullShield/startVenting`、`ShipSystem` 和已注册 Adun 护盾超载资源 reader。窄 owner 显式提供领域输入；部署和 CR/PPT 推进未迁移，contact age 只按其原主观时钟增长；运动以实际 MotionKernel 的已求解姿态进入 integrateStep。没有用费用/相位算法副本代替这些真实 TS 方法。

本块构建初次失败的参数/借用问题定向修正；对照初始化遇到 getter-only owner 属性后改为提供底层输入；非法角度回滚用独立已展开 OMNI 固定前置状态。最终复核修正了系统费用错误依赖可选护盾安装的问题，并定向复查本块。新绑定/协议 strict TypeScript、改动 TS/MJS scoped lint 退出 0，最终 lint 无 warning。没有运行完整应用 typecheck、全套测试或原版实机/视觉验收。

完整结果、来源哈希和冻结 bundle 位于 `artifacts/rust-combat-core-20261008/verification-p1c/result.json`。浏览器及辅助服务器由 finally 清理；没有可见窗口、桌面输入或既有服务操作。P1c 构建与 manifest 另存于 `artifacts/rust-combat-core-20261008/milestones/p1c/`。

## P1d 实际交付与验收

- 新增 `armor.rs`、`component.rs`。装甲网格、HP、dirtyVersion、四类型伤害倍率、减伤/残留、连续伤害、21 格扣减/溢出及逐格通知常驻 Rust。格写入保留 Float32，解算/HP 保持 f64，返回损失保留原 pre-store 算术；格边界、原点和决策不使用几何容差。
- 直接舰体扣血沿用真实 Ship 方法的死亡/撤离/抑制/Vast Bulk 门槛和虚空护盾接触延迟；零 HP 阻止后续舰船资源、运动、护盾、组件与贴花推进。HP 到零尚不构成完整死亡处理/殉爆/胜负，Vast Bulk 门槛也不代表整个舰装能力已迁移。
- SMALL/MEDIUM/LARGE/XL 与 turret/hardpoint/hidden 武器健康状态常驻，保留实际 health profile、安装/延迟 tracker、随机 interval、周期零血禁用、显式永久禁用、修复门槛/倍率/余时。组件使用本步预取样 subjective dt；仅健康函数已迁移，控制器的 burst/charge 清理、完整停火、发射和 CR 故障回调尚未支持。
- 战损贴花保留每内格创建顺序、opacity、热量/闪烁/phase、dirtyVersion 同步与 visual RNG 消费，按 world dt 推进。亮度由 TS 对复制包络作纯呈现派生；没有让 TS 调用规则回调或继续推进随机流。单独主舰的装甲/直接舰体接触即时重置已安装虚空护盾 quietRemaining，模块 assembly-root 接线待后续。
- 发布新增复制的可变长装甲格、固定装甲记录、贴花包络与武器健康记录；事件增加两个具名 detail 字段，表达格坐标或组件 ID。两条 RNG 在命令和步骤预览中保持私有副本，完整提交时替换，失败不会偷走随机样本。既有 scratch 复用格/组件数组；显示投影不能反写权威。

P1d 当轮 ABI **4**、domain mask **511**；命令 26、发布头 21、body 59、system 29、shield 67、armor 36、scar 18、weapon-health 23、event 10 个 f64，装甲格单独连续发布。当轮 Wasm **151,236 bytes**；SHA-256 `8535808afbd0c8f6d2e0a8478967dea1d1247177afb3de926e9b10ec0b917c29`。Rust 1.93.0 release 构建退出 0、imports 为空、manifest/源指纹核对通过。

`node scripts/check-rust-combat-core.mjs --damage` 最终退出 0，Node 与新建无头 Chromium module dedicated Worker 各完成：

| 核对范围 | 两种运行时各自的结果 |
| --- | --- |
| 伤害主场景 | 12 个领域实体、144 个武器健康槽位、120 步 |
| 装甲/HP/组件/贴花/时钟 | 1,248,956 次字段严格比较，无差异，包括每格 Float32 和派生亮度 |
| 有序事件 | 7,225 个事件，实体/类型/值/两个 detail/tick/slot/代次/序号严格一致 |
| 两条 RNG | 1,452 个完整 witness 字段严格一致，无丢失/额外消耗 |
| 伤害边界 | 四类型、连续/低强度、零/负免伤倍率、整数/非整数原点、边界、边缘格、耗尽/重复打击、直接伤害抑制与零 HP 通过 |
| 武器健康 | 12 种尺寸/挂载组合、XL 重型基线、隐藏伤害免疫、周期与显式禁用、永久禁用、修复禁止/开启/倍率/战中修复、interval overshoot reset 通过 |
| 因果与所有权 | 虚空接触延迟、失败批次/步骤同时回滚格/HP/包络/事件/RNG、输出复制隔离、失效代次通过 |
| P1a–P1c 回归 | 4k RNG、24 运动实体 ×300 步、19 资源实体 ×100 步、14 护盾实体 ×100 步及原子性/内存增长/事件 ACK 全部通过；未重跑 5M RNG |

本块伤害字段、贴花几何/亮度均严格一致，没有应用容差；历史运动/护盾的允许几何差异仍在原约定范围内，逐项日志保留于结果中的 prior。

对照源是实际 `ArmorGrid`、`ShipDamageState`、`Ship.prototype.applyHullDamage`、`weaponHealthProfile/createWeaponHealthTracker/damageWeaponComponent/disableWeaponComponent/advanceWeaponComponent`。窄 owner 提供直接扣血输入和空 interceptor 集，mount adapter 提供健康字段；没有替换源算法，未以该窄域 adapter 代替整个 Ship、完整 firing controller 或世界命中链。

原子性场景明确先进入未创建贴花的内格及新组件 interval 安装，随后非法组件命令拒绝；步骤场景先固定更早实体的 interval reset/闪烁随机调用，再令后部实体时间乘法溢出。两条 RNG、资源、格和事件均未部分提交。一次 concentrated 验收通过后，只针对这项回滚前置状态的加强进行复核；未运行完整应用 typecheck 或全套测试。

协议/绑定 strict TypeScript 和改动 TS/MJS scoped lint 退出 0，最终无 warning。完整结果/源哈希/冻结验证 bundle 位于 `artifacts/rust-combat-core-20261008/verification-p1d/result.json`；构建/manifest 另存于 `artifacts/rust-combat-core-20261008/milestones/p1d/`。浏览器和辅助 HTTP 服务由 finally 关闭；无可见窗口或桌面输入，没有修改现有开发服务、生产接线、生涯、默认后端或发布资产。

## P1e 实际交付与验收

- 新增 `engine.rs`，完整保存本块的 ordered slots、health/repair tracker、贡献和偏航、READY/FLAMING_OUT/DISABLED、cooldown、永久补偿、静默/强制熄火、待显示 disabled indices 及喷口前后 thrust/spread。构造每喷口两次 combat RNG，restore 保留 interval/repairDuration、不重抽随机数；scratch clone_from 复用喷口和事件数组。
- 伤损五项运动属性、degrees→radians、零幅能 boost、phase 减速、最小 1、漂移与 maneuver 喷口按源算术处理。初始化后 engine flameout 不允许普通 flags 覆写，原始 motion-stats 不再冒充已经乘过伤损的基础输入。系统延长喷口使用显式资源子规则标志，仍不表示整个系统能力获准。
- 传播使用真实 armor+hull+有效 EMP、现有格映射、内九格 .5/外十二格 .25，武器→发动机提交次序、隐藏/系统喷口免疫以及目标/来源独立倍率。来源只接受有效 resident ship handles；本批已改来源 stats 在后续传播可读取。组合命令执行装甲结果→可选直接扣血→传播，但没有查询命中或运行完整舰装监听。
- 发动机周期故障的条件 malfunction/critical roll 与 .66 永久阈值真实执行；critical 在修复前立即进行随机侧伤、直接结构或装甲/self-source 传播，后部组件能看见结果。显式严重故障同样执行真实侧伤；最后普通引擎 veto 仍保留先写永久位、重复永久贡献补偿以及侧伤。CR/PPT/部署序列与武器严重故障生产仍待迁移。
- 每步 prepare 复制上一喷口、按旧引擎态取消系统；运动/护盾后依次武器健康、world 贴花、subjective 引擎健康与控制器/glow。两条随机流参与同一原子提交，失败发布和事件不前进。controller/slot/pending indices 均为独立发布副本；没有把 TS callback 接回 Rust 求解。

当前 ABI **5**、domain mask **2047**；command 26、header 24、body 67、system 29、shield 67、armor 36、scar 18、weapon-health 23、engine-controller 49、engine-slot 30、event 10 个 f64。船身尾部增加 8 个 damage policy 属性；controller records 之后为喷口和连续 disabled indices，再跟有序事件。最终 Wasm **181,465 bytes**；SHA-256 `6338ee2d4a91e9ef8cc921a66ea8444c81bb37f11390ec1dbd169dee89b7c51c`。Rust 1.93.0 release 构建退出 0、无 host imports，来源/模块 manifest 核对通过。

`node scripts/check-rust-combat-core.mjs --engines` 在 Node 与全新无头 Chromium module dedicated Worker 各通过：

| 核对范围 | Node | Dedicated Worker |
| --- | --- | --- |
| 主场景 | 12 实体、36 喷口、84 武器健康槽 ×150 步 | 相同 |
| 严格字段 | 1,500,513 次引擎/传播/装甲/HP/贴花/clock/运动规则比较，无差异 | 相同 |
| 有序事件与 RNG | 2,894 个事件、1,812 个两流完整 witness 字段严格一致 | 相同 |
| 预登记几何 | 27,180 次比较，296 条差异，最大 `1.7763568394002505e-15` | 435 条差异，最大相同 |
| 状态覆盖 | 11 次熄火、10 次重启、49 次修复；普通/系统/机动/零喷口、无普通喷口、零健康倍率、静默 force、restore、extended veto、重复永久补偿 | 相同 |
| 实际 critical | 周期触发 3 次真实侧伤，非致命装甲和致命分支均覆盖；criticalChance=0 的 17 次条件故障及 RNG 严格对照 | 相同 |
| 原子性/所有权 | 新喷口不完整安装拒绝、旧来源代次/旧实体拒绝、新 interval/新贴花后整批拒绝、前部 interval 重抽后后部时钟溢出回滚、复制状态隔离 | 相同 |
| P1a–P1d 回归 | 同轮已有领域检查通过，长 RNG 保留历史证据，仅 4k 样本 | 相同 |

几何 allowance 只用于位置/速度/角度和 maneuver thrust 的纯几何派生；正常 thrust、spread、timer、贡献、阈值、速度倍率、HP、格及离散结果全部严格。几何逐字段 actual/expected/limit 在 JSON 中保留，不能以几何容差放行故障、熄火或随机差异。

差分源为实际 `EngineController`、`shipMotionStats`、`Ship.prepareStep/integrateStep/finishStep`、`ComponentDamage`、`Ship.applyCriticalMalfunction/applyCriticalMalfunctionDamage`、ArmorGrid/贴花和武器健康函数。owner 仅提供窄域输入和未迁移部署/CR producer，事件 wrappers/setters 转发真实方法并记录位置；禁止修复案例直接调用实际控制器。首轮遇到 owner 武器 setter 安装顺序、raw shield 结果及 critical 装甲结果见证遗漏后只修正对应适配器；首轮通过后定向补齐周期 severe 与非致命装甲分支，并修正一项未用 type import。

协议/绑定 strict TypeScript 与改动文件 scoped ESLint 通过，最终无 warning。复用缓存的 typescript-estree/scope-manager 作 TS AST reader；没有下载新 lint 依赖。未跑全应用 typecheck/全套测试。结果/源哈希/验证 bundle 位于 `artifacts/rust-combat-core-20261008/verification-p1e/result.json`，当轮 Wasm/manifest 冻结于 `milestones/p1e/`；P1d 构建仍保留。验证浏览器/HTTP 服务由 finally 关闭；没有操作桌面、启动可见窗口、接入生产战斗、修改生涯或发布资产。

## P1f 实际交付与验收

- 新增 `weapon.rs`：按实际安装顺序常驻 mount 规格、冷却/装填/lifecycleDt、有限/无限弹药与 recharge、burst/charge/trigger 初始状态、recoil/glow/spread、双轨加载包络、武器组和 pending disabled/repaired IDs。状态初次安装后不再由 DTO 每步还原；controller/group scratch 的 clone_from 复用可变长数组。
- 新禁用直接清除 burst/charge/trigger，保留原冷却最大值；重复禁用只执行健康源副作用，不重复取消或新增恢复冷却。普通永久 disable 与严重故障的永久弹药/组补偿分开；严重故障清零有限弹药，并删除所有组内同槽的全部出现。
- 健康按 begin→条件故障/真实侧伤→finish repair→controller cancellation 的顺序推进。故障周期只针对非隐藏/未禁用且仍在 firing cycle 的组件，两次条件 RNG 保持。永久 veto 保留临时禁用的其它可用武器、maxAmmo>20/regen 条件、零 CR 和隐藏限制。当步写永久位后仍完成当次修复，下一步 health early return，与 Web 源保持一致。
- 严重故障同步执行真实结构/装甲/self-source 传播；显式调用先取消和永久补偿后侧伤，周期调用先侧伤/修复后取消。当周期侧伤打到零 HP，当前武器循环/后续组件及 world 贴花仍完成，下步不再推进。旧 health-only 实体继续通过既有路径；真实发射尚未接线。
- 常驻系统 controls 新增 blockWeapons/forceAutofire，门控仍按现有生命周期/OUT 释放。有效武器属性和外部相位接受具名修订；任意系统 modifier/CR/PPT producer 未迁移，不能把这些数据输入当成特殊系统支持。已有本地/LAN/Steam 权威路径未导入 Rust。

ABI **6**、domain mask **4095**；command 26、header 29、body 67、system 29、shield 67、armor 36、scar 18、weapon-health 23、engine-controller 49、engine-slot 30、weapon-controller 30、weapon-mount 39、weapon-group 16、event 10 个 f64。新增可变长组成员和 disabled/repaired IDs 分区；无界 ammo 用显式有限 marker 初始化，输出允许 Infinity。最终 Wasm **204,874 bytes**，SHA-256 `2e66eefe491725a5eca170f69200201373a8f30f159775533ddedaaac62f6a24`；Rust 1.93.0 release 构建退出 0，无 host imports，manifest/源指纹一致。

`node scripts/check-rust-combat-core.mjs --weapons` 在 Node 与全新无头 Chromium module dedicated Worker 各通过：

| 核对范围 | Node | Dedicated Worker |
| --- | --- | --- |
| 主场景 | 11 实体、68 武器槽位 ×100 步 | 相同 |
| 严格字段 | 1,111,327 次武器/健康/组/伤害/装甲/贴花/clock 比较，无差异 | 相同 |
| 有序事件与 RNG | 314 个事件、1,212 个完整两流 witness 字段严格一致 | 相同 |
| 预登记几何 | 29,290 次比较，24 条差异，最大 `2.7755575615628914e-17` | 2,652 条差异，最大 `2.6645352591003757e-15` |
| 禁用/修复 | 17 次禁用、12 次修复；6 次当步禁用并修复，其中 5 次当步写永久位 | 相同 |
| 严重故障 | 周期 6 次、显式 5 次真实侧伤；装甲/结构分支各 5/6 次，周期致零血 1 次 | 相同 |
| 条件与补偿 | criticalChance=0 条件 RNG、暂时禁用其它武器仍计入、正 CR 最后可用武器 veto、零 CR、永久重复组成员删除 | 相同 |
| 原子性/所有权 | 真实 severe/删组/新贴花后失败批次、前部 interval draw 后后部时间溢出、未完成安装与过程中 disable 拒绝、重新上传初始状态拒绝、非整数轨道索引拒绝、旧代次、复制投影隔离 | 相同 |
| P1a–P1e 回归 | 同轮领域回归通过；仅 4k RNG，未重跑 5M 长游标/全应用测试 | 相同 |

仅纯姿态和 mount angle 使用几何 allowance；ammo/health/timer/lifecycleDt、门控、组成员、永久位、事件和 RNG 全部严格比较。actual/expected/difference/limit 逐字段保存在 JSON。原版来源核实和 Web 领域差分已完成；原版实机/画面和真实发射仍未验收。

差分使用实际 `ShipWeaponControlSystem.advanceState/disableComponent/damageComponent`、`ShipSystem` modifier readers、`Ship.prepareStep/integrateStep/finishStep`、原永久 helper、`Ship.applyCriticalMalfunction/applyCriticalMalfunctionDamage`、ArmorGrid/贴花和健康方法。owner 提供窄域属性、空引擎/监听及未迁移 producer；wrapper 转发真实方法并记录事件，不代替算法。未调用空 spawn 回调，未把初始 cycle fixture 当成已完成发射状态机。

集中验收的具体失败只涉及适配器漏记 raw shield 结果、同批 despawn/spawn 的既有拒绝合同；定向修正后通过。随后针对周期致零血与安装期命令边界补齐验证，未因通过而重复全套检查。协议/绑定 strict TypeScript、改动 TS/MJS scoped lint 均退出 0，无 warning；缓存 ESLint/TS AST 包复用，未下载新依赖。

回执及 sourceHashes 位于 `artifacts/rust-combat-core-20261008/verification-p1f/result.json`。Wasm/manifest/Node 和 Worker 验证 bundle/回执冻结于 `milestones/p1f/`，P1d/P1e 构建保留。浏览器/辅助 HTTP 服务由 finally 关闭；没有可见窗口/桌面输入、生产开关、发布资产或生涯修改。

## 未完成和下一阶段

- P0、P1a–P1f 已通过上述领域验收；武器前置状态/停火/故障副作用、发动机控制器、独立船组件传播已完成对应块。实际 charge/burst/beam 发射周期、CR/PPT/部署和任意 modifier producer、特殊 upkeep、真实系统/舰装副作用尚未完成。
- P2 的完整 AI、火控/真实发射、弹体/光束、碰撞/伤害/死亡闭环尚未实现。
- P3 的七包特殊行为、模块/舰载机/无人机、引力、补机、部署和结算尚未覆盖；没有 Rust 内容准入或整场 Rust 验收。
- P4 的生产权威、呈现/声音、LAN/Steam、回放/恢复尚未接线；快照仅为当前领域开发输出，不是可恢复完整 checkpoint。
- P5 的完整同场景配对性能、真实交火、FPS/输入延迟/60Hz 不积债均未测。**本轮没有可报告的游戏提速百分比。** 10,001 个开发实体只用于触发内存增长，不代表战斗容量或帧率。

下一块迁移火控/实际发射周期、扣幅能/弹药和真实弹体/光束生成；特殊系统/舰装费用与副作用仍须逐项迁移。保持有序真实规则与对照要求；不能将这份领域交付当作完整 Rust 内核完成。

只新增本轮明确写集，保留原工作区所有无关改动；未暂存、提交、推送、打包或发布，未修改生涯。
