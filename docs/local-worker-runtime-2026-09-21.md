# 单机 Worker 纵向迁移记录（2026-09-21）

## 编码前对照与范围

- 原版版本：本地 0.98a-RC8。`../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipAPI.java:213` 的 giveCommand 与 `CombatEngineAPI.java:70` 的 isPaused 证明命令/暂停边界；`../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:75` 的 advance 仍按原有时间步推进。这些源码不证明新的跨线程协议或 Web 操作等价。
- 预期：不改变键位、UI、固定 dt、AI 先后次序、舰队数量、视觉/模拟随机流。玩家控制仍在引擎 AI 阶段之前；暂停时离散控制仍可执行，不用多跑一帧模拟实现按钮。
- 当前差异：useCombatLoop / useCombatInput 直接写 live Ship；上一轮 CombatRenderView 只是借用 facade；worker-lab 限定固定无舰载机 Onslaught 编成，不适合直接替代正式战斗。
- 本轮实现目标：正式路径共用可序列化玩家输入/命令解释器；真正执行完整 CombatAuthority 的 LocalWorkerHost；任意受支持原生编成与动态舰船的 detached presentation packet；有界请求、epoch、ACK、取消与错误关闭。渲染适配暂保留组件只读方法，不将其宣称为完整只读 DTO/StateStore 或可恢复 checkpoint。
- 集成门槛：主界面战术/部署/战役结算尚存在其它直接写入，未经逐项迁移不能默认启用 Worker。禁止用一个试验入口宣称整个新架构完成。
- 验证：后台 TypeScript/lint；有序命令/暂停/取消/旧 epoch 契约；同 seed 同命令 inline/真实 module Worker 对照；混合舰队、舰载机/模块、FX、渲染图像；记录编码/解码成本，不把 UI 空闲或 FPS 增高称作模拟加速。
- 原版实机/UI 对照：本轮不新增 UI；按用户边界不操作桌面，实机补验待许可。Web 检查仅无头浏览器。

### 实施中补充的视觉依赖审计（先于修改）

`ShipSystem.isActive` 的发射器持续状态以及 `PulseDrive.pulsePusherOffset` 读取 WeakMap，不能从同字段对象自动重建。原版 `OrionDeviceStats.java:40,64–77,107,169–176` 以弹簧压缩值 ×14 设置 pusherplate 渲染偏移。预期保持权威端得到的同一个偏移/技能显示状态，不在呈现端重算技能。为 detached 系统发布计算后的显示读数；原 inline/LAN 路径保持原 getter。系统任意私有 AI 状态仍非 checkpoint；新增模组的行为注册/呈现读依赖必须另审计。

## 已实施（当前工作区）

1. **正式输入入口**：`CombatControl.ts` 统一数据化的玩家控制采样/离散命令解释器。`useCombatLoop`、`useCombatInput` 和 CombatView 的清输入/关闭地图入口改走 CombatSession；采样在每个被接受的固定步之前执行，暂停的离散操作不推进模拟。命令先结清已采样 tick，epoch 更换/销毁会拒绝旧命令；重复失焦/松开事件不反复拆 AI 池。战术命令、部署等其它写入口尚未全部收拢。
2. **真实本地权威 Worker**：`local/LocalWorkerHost.ts` + `local-combat.worker.ts` + `LocalCombatKernel.ts`。一个已发布事务、128 个在途/待处理命令额度；严格 sequence/epoch/ACK；一次只接受一个待完成模拟步；暂停 barrier；初始化、传输错误、超时、销毁均终止并拒绝待处理请求。失败后的已变更权威不能从显示帧恢复，不做危险的中途 inline 回退。
3. **复用权威与多核**：Worker 内仍调用 CombatAuthority/CombatEngine 固定 1/60 秒推进，不重写物理/AI/随机流程。已复用 CombatTickHost、CombatMulticore、原生 Onslaught 快路、审计串行屏障、原有 3000ms 原生池期限以及成本守卫。百舰真实 Worker 测试观察到四个 AI Worker、99 个提交、0 个回退。
4. **独立显示数据**：兼容现有 WebGL passes 的 display-owned replica，不再借用权威 Ship 实例。动态战机/模块/目标引用通过 epoch 内永不复用的对象 ID 维持稳定显示身份；Float64 数据区、共享字段形状、不可变内容字典、可转移/归还缓冲区；不把数值降为 Float32。环境/舰体/武器/光束/粒子/残骸/尾迹等原有数据仍保留。技能的 isActive/statusText、外部相位的显示读数和脉冲推力板偏移由权威计算后发布，不假装能靠跨线程 WeakMap 重建。
5. **战役边界**：CombatHandoff 的参数改为窄结构能力（只改类型，不重写部署/结算规则）。Kernel 可使用现有 CombatRequest 建立舰队并由权威执行 collect；结算绝不从 RenderFrame 反推。GameSession 的正式跨线程 ACK/持久化接线仍未完成。
6. **内容保护**：主线程/Worker 的舰体武器数据指纹不一致，或运行中内容注册变化时明确拒绝；不悄悄把用户同名改装舰换成 Worker 内置版本。指纹是兼容性检查，不是安全签名；动态代码模组迁移未实现。

### 不得误称完成的边界

- **普通战斗仍默认使用原有 inline/AI-worker 路径**，没有对用户启用未经性能验收的后端。
- LocalWorkerHost 已能真实执行和渲染，但尚未接管主界面的全部战术/部署/重开/换船/战役写入；不能把上述 API 称为“正式单机已全量切 Worker”。
- 当前是逐步请求/ACK 链路，不是独立时钟、latest-frame credit 的最终运行调度器。
- detached replica 仍复用有限的组件原型/读方法，且为了渲染缓存会原位更新；它不是 deeply readonly DTO，也不是可留存的历史帧。旧 LocalCombatFrame.presentation 引用会在下一个 ACK 更新，调用方只能消费 latest。
- Float64 **呈现数据包不等于权威 StateStore**。未实现完整检查点恢复，也未迁移所有 AI/技能 WeakMap 私有状态。不得用本包做存档、回滚或继续模拟。
- 显示记录适用于已审计的原生读集；未审计的新类直接报错。所有技能/HUD 私有读方法的全面适配仍需继续，不能以几个场景通过宣称任意模组等价。

## 性能结果：仍不满足切换默认后端的门槛

证据目录：`artifacts/local-worker-runtime-20260921/`。这些是无头 Chromium 固定步工作量，不是实际游戏 FPS/TPS，也不是独立权威时钟验收。前后版本运行于不同时间窗口，期间存在其它工作负载；下表用来揭示桥接开销，**不证明确定的百分比优化收益**。

| 场景/版本 | 同场景 inline kernel | Worker kernel（含 AI 预测等待） | 编码 | 主线程解码 | step 端到端 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 初始主舰，对象图消息实验（已弃用） | 103.85ms | 115.01ms | 81.39ms | 161.37ms | 686.97ms |
| 100 初始主舰，整包 Float64 + 4 AI Workers（build3） | 122.92ms | 119.69ms | 103.91ms | 105.17ms | 329.65ms |
| 24 Odyssey/Paragon 主舰（72 实体），整包 Float64（build3） | 24.08ms | 23.87ms | 15.53ms | 12.80ms | 52.80ms |

- 二进制版本移除了大批跨线程对象克隆，但 **完整兼容对象投影仍然过重**。百舰场景的最终发布（测试末尾加入一艘航母后为 105 实体）数值区约 14.8MB。必须进一步按渲染/HUD 的真实读取字段构建精简投影，并避免重发未变数据，而不是降低模拟频率或删实体/特效。
- 此轮**没有证明正常游戏变快**。不使用“Worker 在运行”或更高 UI FPS 来冒充模拟吞吐提高。
- 被弃用的对象图源码和原始结果保留为 `object-codec-rejected.ts` / `frozen-stress.json`；整包版本结果为 `packed-stress.json`，测试产物为 `frozen-build3`；后续记录增量版本见文末。不删除历史失败样本。

## 验证范围

- `contracts.json`：32 个全状态检查点，四组场景各 120 固定步，与原控制顺序/现有 CombatSession 对照；覆盖 engine、playerAI、武器 autofire WeakMap tracker。只规范化函数身份和墙钟 kernelMs，不把这个对照称为包含全部技能 WeakMap 的恢复检查点。
- `host-lifecycle.json`：14 个有界排队、一次采样、ACK 序列、暂停 barrier、超时、错误和迟到响应契约。
- `packed-contracts.json`：16 个二进制边界/损坏帧不污染当前画面、内容变更、不可变字典、相位隔离、推力板私有视觉状态和权威结算检查。
- `packed-browser-worker.json`：6 组真实 module Worker，每组 120 步及额外一步，73 个呈现图对照点；Onslaught、Odyssey、Doom、Harbinger、Astral、Retribution、Paragon、Sunder、station1；含战机数量变化、模块、技能、暂停命令、加船与销毁。与 inline 投影逐值比较，**不是全 Worker 私有状态检查点**。
- `packed-stress.json`：整包版本上述两组压力场景，25 个呈现图对照点一致；四个原生 AI Worker 成功提交被实际观测到。
- `packed-render-comparison.json`：真实 WebGL 对同状态 inline / detached 进行 1280×720 渲染；差异 62 / 3,686,400 个 RGBA 通道，平均绝对差约 0.0000315（0–255 范围），最大 12。原 inline 的 A/A 重绘自身也有 98 个通道差异、最大 12。图像非常接近但**不是像素全等**，不能直接把所有差异归因于驱动。
- 原版实机/UI 等价：未验证；不占用桌面，不启动可见窗口，不注入桌面键鼠。

## 下一阶段的明确关键路径

先缩小显示发布/解码开销并拆开显示发布与权威 tick 的节奏，再迁移 TacticalMap、部署、GameSession 的所有命令/ACK 与权威结算持久化；之后才评估默认切换。StateStore、完整 checkpoint/restore、全技能读依赖审计继续保留为未完成项。不能为了宣称“新架构完成”跳过这些边界。

### 最终回归补充

- 普通 `?view=combat` 入口在独立无头浏览器真实运行至 31 tick，`getAuthorityStatus()` 仍为 inline；暂停后技能/手动接管/地图开关/清输入命令可执行，而 fixedUpdateControlled 不多走一帧。证据 `ui-smoke.json`；未向桌面注入键鼠。
- `worker-teardown.json`：真实 60 主舰 Worker 已启动四个子 AI Worker并提交 59 个决策后，在在途 tick 销毁宿主；请求被取消，CDP 检查剩余 Worker 数为 0。
- 当前工作区 TypeScript `tsc -b` 通过；最终全局 oxlint 无错误，有两条本轮未修改文件中的警告：`scripts/check-campaign-calendar-integration.mjs:29` 未使用参数，以及 `scripts/check-snapshot-encoder-worker.mjs:14` 稀疏数组。
- 既有 LAN 弹丸显示/独立权威生命周期回归 30 项通过，不修改 LAN 的权威到 I/O 直通路径。
- `source-check.json` 区分冻结构建覆盖的 Worker/渲染文件与未被该独立构建包含的正式 UI/session 适配。后者另由当前工作区检查及正常入口 smoke 覆盖；不将所有测试概括成全架构验收。
- 没有暂存、提交、推送、发布或打包发布版；构建仅为 ignored artifacts 下的无头测试夹具，未递归删除任何产物目录。

### 增量发布补充对照（编码前）

固定百舰负载已证实整图 Float64 发布仍不合格：Worker 编码与主线程解码均约 100ms。原版时间步与顺序要求不变；只改同一权威状态的跨线程表示，不更改实体、特效、字段、精度或推进频率。下一步对全部可变字段逐值比较，使用稳定对象 ID 发布变化记录和删除记录，不能把 mutable weapon spec 当作不可变数据；解码先验证完整候选引用图，再原位提交变化。使用旧整包实现的冻结副本、字段新增/删除、同 ID 引用、Map/Set、非有限数字、错误帧原子性与真实 Worker 混合舰队对照，量化实际收益。未通过前仍不接管普通战斗。

## 后续实现：记录级增量协议（v3）

- 不再每个 ACK 重发全部动态对象。仍逐一检查全部可变字段，但仅发送变化记录、新记录和退休 ID；未变化的显示对象保留身份。Map/Set/数组内容变更、字段新增/删除、NaN/Infinity/-0、可调整长度 typed array 的父引用重绑均覆盖。不是字段级稀疏补丁，也不是按渲染读取集合裁剪。
- 可变 weapon spec 逐值检查，没有缓存为静态数据或冻结。不可变内容字典保持原约束。严格连续 revision/epoch，不可任意丢弃中间 delta。
- 编码器复用已存在的比较缓存，减少每步临时数组；发生编码错误后必须新建代际，不重用可能已部分更新的增量基线。解码先构造并校验完整候选引用图、活跃总预算、退休 ID，再修改当前显示记录。
- 仍为兼容旧读取方法的 display-owned 对象，不是深只读 DTO。消费者不得写入显示字段；增量不会用每帧全包覆盖消费者的不当修改。全渲染/HUD 写入依赖审计仍未完成。
- 新的冻结构建为 **frozen-build5**，包含 local-combat.worker-BY1BSQoU.js；协议为 **3**。保留 full-packet-reference.mjs/ts 和 build4-delta-*.json，分别用于旧整包语义基线与中间分配方案的负面结果。
- delta-contracts.json：与独立冻结的旧整包代码对照，六组场景各 120 步、78 个呈现图检查点；附加 17 个增量/引用/故障契约。session-edges.json：3 个旧 epoch、销毁期间冲刷和暂停命令检查。
- 记录级增量仍须遍历全部兼容数据、为变化对象发布完整记录，不能据包大小变小宣称解决了百舰卡顿。默认后端继续保持原状。

### v3 最终压力结果与验收决定

| 场景（build5） | inline kernel | Worker kernel | 编码 | 主线程解码 | step 端到端 | 每 step 平均数值区 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 初始主舰 | 106.00ms | 96.85ms | 125.44ms | 93.50ms | 316.54ms | 7.02MB |
| 24 主舰 / 72 实体 | 35.42ms | 34.29ms | 31.21ms | 18.90ms | 85.10ms | 1.47MB |

- 两组仍为固定工作量的诊断样本，不是正常 rAF FPS/TPS；不同构建/运行窗口不能直接计算可信优化百分比。百舰模拟 kernel 本身已超过 16.67ms，搬出主线程不会令它自动满速；本候选还增加大量编码/解码工作。
- 百舰的 115,656-byte 最后一包是**暂停加船命令的 delta**，不是普通战斗每 tick 的包。每 tick 平均约 7.02MB、峰值约 8.90MB；不能用最后一包冒充压缩到 0.12MB/tick。载机场景平均约 1.47MB/tick。数值区统计不含 strings/shapes/metadata/retired IDs。
- delta-browser-worker.json：73 个真实 Worker 呈现检查点通过；delta-stress.json：25 个压力检查点通过，四个 AI Workers、99 commits、0 fallbacks。
- delta-render-comparison.json：inline/detached 差异 63/3,686,400 RGBA 通道，均差 0.000050455729166666666，最大 12；inline A/A 差异 66、最大 12。压力渲染 delta-stress-render.json 差异 81 通道、最大 1，A/A 差异 102、最大 9。均非严格像素全等，未证明原版实机等价。
- 当前优化没有达到端到端性能门槛，不将记录增量宣称为已经验证的净提速。保留为未默认接入的迁移基础；下一步必须改成真正受限的渲染/HUD 读集及连续显示数据，而不是继续为整个组件图做通用序列化。普通战斗后端不变，架构尚未完成。


## 2026-09-21 后续热路径进度（协议 v4）

最终 frozen-build10 将纯视觉数组拆为 Float64 连续传输。受控配对百舰编码+解码 274.71→133.62ms（约 -51%），但整模拟内核未测得净提速；真实 Worker 往返仍慢于 inline，普通后端不变。密集盾面分支仅在 >=128 个 imminent 威胁启用，不能用其微基准冒充普通多舰提速。资格缓存与圆形排除试验无净收益，已撤回。见 [本轮实现、负面试验、验收与未完成边界](combat-hotpath-2026-09-21.md)。此前 v3/build5 的负面结果保留为历史，不与本轮直接作受控百分比比较；完整架构尚未完成。
