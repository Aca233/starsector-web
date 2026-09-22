# 受限 Renderer 舰船投影：实现与验收（2026-09-22）

## 实装内容

- `ShipRenderState` 将 WebGL 舰船、系统、护盾、损伤、标识、残骸等读取收窄到实际显示所需字段/只读查询。借用视图仍读取原来的权威对象，不为 inline 每帧复制舰船。
- `RenderShipProjection` 在 Worker 发布时构造独立呈现舰船/系统/挂点，保留跨帧显示身份、原始数字精度、舰体与炮塔插值、相位/传送/推进器/护盾/战损表现、动态射程和航母系统投射。不传输舰船 AI、武器控制器或装甲受击格图。
- `CombatPresentationEncoder(epoch, 'render')` 与 `LocalCombatConfig.presentation = 'render'` 已贯通真实 Worker；第一阶段协议为 **5**，第三块升级为 **6**，第四块战术命令与回执现为 **7**。兼容模式依然存在，完整战斗默认仍为 **inline**，LocalWorkerHost 未指定呈现模式时仍为 **compatibility**。
- 外部查询资格按整个呈现代际选择。未知系统统计、射程 hullmod、相位闭包等在代际开始时选整帧兼容模式；不会让旧方法沿 owner/carrier 引用读到一半是投影、一半是模拟的图。受限代际运行中如果出现不支持的查询，明确失败并要求新兼容代际，不悄悄替换所有显示对象身份，也不从显示帧恢复权威。
- 已审计内置 RecallDevice/PhaseAnchor 的相位回调是纯读取，以 WeakSet 标记原函数，不包装/改写函数体，不改变调用参数、规则或 RNG。
- 补上无副作用的 `Shield.presentationHitSegmentLevels()`，避免投影读取旧 getter 时初始化/改写权威护盾命中数组。旧模拟 getter 与更新路径未改动。
- 纹理预加载需要的 `allCapitalShips` 与甲板 craft specId 保留，不能因为它们不在绘制循环里就直接删掉。

## 性能口径

当前冻结构建，同一个权威状态分别用 compatibility/render 编码，顺序按 ABBA 交替。推进 60 步预热，另有 6 次编码预热，统计后续 **24 个配对样本/场景**。数值是编码/解码诊断，不是 FPS，也不是整场游戏提速；不与历史 v4/build10 的 274.71→133.62ms 跨构建混算。本轮没有额外跑第二组重复矩阵。

| 初始编组 | 实际船对象 | 兼容编码 | 受限编码 | 兼容解码 | 受限解码 | 编码＋解码 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 24 Odyssey/Paragon 主舰 | 72 | 17.04ms | 14.06ms | 8.33ms | 5.85ms | 25.37→19.91ms，-21.5% |
| 100 Odyssey/Paragon 主舰 | 300 | 64.66ms | 50.36ms | 34.17ms | 21.47ms | 98.83→71.84ms，-27.3% |
| 100 Onslaught | 100 | 70.89ms | 61.06ms | 37.90ms | 34.47ms | 108.79→95.53ms，-12.2% |

100 混合主舰每 tick 数值区平均 **4,999,832→3,488,844 bytes**，减少约 30.2%；这是图＋特效数值区，不含 strings/shapes/metadata，也不是最后一个暂停包。其 structuredClone 单独约 4.00→3.67ms，没有混入编码/解码列。

### 真实 Worker 压力结果：仍未达到默认迁移门槛

| 场景，120 次实际 step | inline 模拟 | Worker 模拟 | Worker 编码 | 主线程解码 | 完整往返 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 Onslaught | 73.89ms | 69.28ms | 49.40ms | 28.26ms | 147.48ms |
| 100 混合主舰 / 300 对象 | 197.84ms | 219.92ms | 52.09ms | 21.44ms | 294.03ms |

这是固定工作量诊断，不是生产 rAF 的 FPS/TPS。往返仍慢于直接模拟，**未解决百舰卡顿，不能默认启用这个后端**。Onslaught 仍实测 4 个 AI Workers、99 commits、0 fallbacks；混合 300 对象仍因既有 200 对象门槛走 serial/ship-limit，未擅自调门槛、Worker 数或降低 AI/物理更新频率。

## 验证证据

- `node scripts/check-render-projection.mjs`：**2,188 项**读集/插值/副作用/引用与异常检查。六类场景覆盖 120 tick；78 个检查点比较投影前后完整可枚举权威图（在已有兼容读取之后，不宣称任意 getter 从未产生缓存初始化）。另有护盾纯读取、未知钩子不被额外调用、代际内拒绝不支持的变更、源码对象与解码对象不共享、可变武器规格、数值边界、炮塔/舰体显示 sidecar、残骸引用和挂点删除检查。
- 真实浏览器 Worker：普通六类场景 **73 个**检查点，两个百舰压力场景 **25 个**，核对序列、暂停命令、单步防重入、屏障、错误初始化与销毁。
- 无头 WebGL：普通混合场景差异 82 / 3,686,400 RGBA 通道，均差 0.00003635、最大 12；inline A/A 为 49 通道、最大 12。百舰压力差异 62 通道、最大 2；A/A 为 59 通道、最大 2。没有 WebGL/page errors，但不是严格像素全等，更不是原版实机等价证明。
- 现有默认 `CombatSession` 确认仍为 inline；12 tick 后暂停不推进，接管、盾控制、战术图开关、输入阻塞、渲染和销毁通过。
- 全应用 TypeScript 通过、改动文件 lint 通过。既有 **24 项 combat AI**、**12 项 system intent** 通过；已接受光束索引仍通过 **2,732 项**及真实 300 对象集成检查。
- 全程后台文件工作和无头浏览器；未占用桌面，未提交、发布或打包。保留并发任务对 `LocalFirePrediction.ts` 等文件的改动，没有将其归为本轮改动。

## 尚未完成的真实架构目标

1. 完整 TacticalHUD、部署、生涯结算及所有 UI 写入口尚未迁移到命令/只读状态。
2. 除舰船读取外，传输仍复用通用记录图和现有特效打包；不是完整连续 StateStore/RenderFrame/HudState。
3. 顶层只读类型不等于深冻结全部嵌套向量/内容；消费者仍须遵守只读契约。
4. Worker 发布/解码成本仍大，尚无本轮生产 rAF FPS/TPS/state-age 净收益证据；必须继续削减这部分成本并完成运行连接，不能靠缩减 scheduler catch-up、AI 频率或效果数量冒充优化。

复现产物：`artifacts/render-projection-20260922/`，包括冻结的 `browser-sources.json`、`paired-performance.json`、`stress-worker.json`、`packed-browser-worker.json`、两组 render comparison、默认会话 smoke 与日志。早期中间日志不覆盖最终 JSON 的口径；准备的第二轮性能脚本未运行。

## 第二块：继续收窄武器规格与发动机状态

在上述第一阶段之后，当前工作树又完成了：

- `RenderWeaponSpec` 仅保留炮塔贴图、后坐、辉光、弹速及效果资源闭包；每次仍读取实际可变规格，未按 id 冻结或缓存完整 WeaponSpec。
- MIRV 子弹仅为资源预加载传递所需贴图和 onHitEffect，保留子弹字段缺省语义；顺带修复预加载对缺省 childProjectile 的不安全访问。
- 发动机状态只传递前后推力与展开角，移除显示不需要的 healthTracker 等组件。
- 实际射程继续由权威规则计算；显示层不能将窄 WeaponSpec 强转为模拟规格。默认 inline 读取找到原始挂点后调用原规则。

按用户新增的验证节奏，本块完整实现后集中检查：TypeScript、改动文件 lint、已有读集契约均通过（**2,192 项**），另用一个既有百舰混合场景检查读集变更前后的编码成本及真实 WebGL，不重跑全部 Worker 压力矩阵。

本次相同冻结依赖、ABBA 顺序的 24 对样本是“第一阶段受限投影 → 进一步收窄规格”，**不是第一阶段表中 compatibility → render**：编码 66.54→62.10ms，解码 31.53→28.70ms，合计 98.07→90.79ms。16/24 对变快，节省时间中位数 5.33ms，但均值标准误约 4.55ms，波动仍大；**不将这约 7.4% 的样本均值变化当作已确定的额外提速**，也不能和前表串乘成整场收益。数值区平均 3,488,844→3,371,975 bytes，活跃图节点平均 22,121→20,972，显示数据范围缩减确定。

WebGL 差异 72 通道、最大 2；inline A/A 106 通道、最大 7，无 page/WebGL errors。产物：`spec-performance.json`、`spec-pair-analysis.json`、`spec-render.png`、`browser-spec-before-sources.json`、`browser-spec-after-sources.json`、`contracts-spec.log`、`typecheck-spec.log`、`lint-spec.log`。第一阶段全矩阵结果仍保留，仅支持其当时源代码，未冒充第二块的完整回归。

下一处实际瓶颈是重复挂点规格的反复读、比较和图验证：当前缩小字段数量，但尚未把**已复制的只读显示规格**合并为共享字典。任何后续合并都必须每步检查原可变字段、保留射程差异，不能冻结原始武器规格或错误合并同外观不同射程的挂点。默认 Worker 接管、完整 HUD 与控制迁移仍未完成。

## 第三块：共享显示规格字典，射程按挂点保留

已实现 RenderWeaponDictionary：每次发布仍逐项采样源 WeaponSpec 的显示字段，将值相同的**复制、深冻结**显示规格合并，再走现有 immutable metadata 通道。源规格/辉光数组/MIRV 子资源不被冻结；原位修改会生成新显示条目，不污染仍使用旧值的挂点。源采样使用 WeakMap；强字典在 begin/finish 后只保留当前发布使用的条目，未保留全部历史版本。相同显示规格不代表相同实际射程，故 weaponRanges 改为挂点引用作 key，本地协议由 5 升至 6。

检查集中进行：应用 TypeScript、六个改动文件 oxlint 均退出 0；现有读集契约 **2,359 项**通过（在上一块上新增 167 项），覆盖全部声明标量、原位辉光/MIRV 修改、缺省/null/长度、-0/NaN/无穷值、深冻结副本与可变源、清退/返回，以及真实编码解码后相同显示规格的不同射程、范围变化和挂点删除/重插。六类既有逻辑场景保留权威图不被额外修改的比较，没有另建测试工程。

只运行一个既有百舰混合场景：100 初始 Odyssey/Paragon 主舰，实际 300 船对象；结束时两边均为 323 弹丸、592 光束。两版本从同一份源快照构建，仅旧版覆盖此前的 projector 和 encoder，新版多一个字典模块；冻结记录为 284/285 个模块，无工作树源漂移。60 tick 预热 + 6 次编码预热 + 24 对测量，ABBA 顺序，无头 Chromium。

| 本次测量 | 已收窄、逐挂点显示规格 | 共享显示字典 |
| --- | ---: | ---: |
| 编码均值 | 61.90ms | 53.95ms |
| 解码均值 | 30.75ms | 27.52ms |
| 编码＋解码 | 92.65ms | 81.47ms |
| structuredClone（单列） | 3.82ms | 4.06ms |
| 三项合计 | 96.47ms | 85.53ms |
| 活跃记录图节点均值 | 20,972.29 | 19,071.29 |
| 数值区 bytes 均值 | 3,371,974.67 | 3,371,974.67 |

编码＋解码本次均值下降约 **12.1%**，18/24 对更快；配对节省中位数 8.47ms，均值节省 11.18ms、标准误约 4.40ms，仍有明显抖动。它支持此场景减少图遍历工作的判断，不保证每帧都快、所有舰型同幅度提升，也不与此前分时运行的表格串乘。稳态数值包大小未下降：旧增量编码本来就会跳过未变规格，此次主要省去重复记录的遍历、比较和验证，而非承诺更小的每 tick 网络包。这里没有测初始完整包或真实 Worker 往返。

同一百舰场景真实 WebGL：inline/projected 差异 259 / 3,686,400 RGBA 通道，平均绝对差 0.00007107、最大 2；inline A/A 166 通道、最大 2。无 page/WebGL error，已目视检查截图；不是逐像素完全相等，也没有原版实机界面验证。

**启用范围没有变化**：只在显式 opt-in 的 render 呈现桥生效，默认 CombatSession 仍 inline，默认 LocalWorkerHost 仍 compatibility。此轮未测生产 rAF FPS/TPS，不以编码＋解码的约 12% 下降宣称整场提速或多船卡顿已解决。模拟频率、RNG、精度、数量、顺序和默认 4 AI Workers 未改，压力诊断原有 multicore:false 只用于固定配对条件，不改变生产设置。完整 HUD/部署/生涯命令迁移和主线程权威接管仍未完成。

产物仍在 artifacts/render-projection-20260922/：dictionary-performance.json、dictionary-pair-analysis.json、dictionary-render.png、browser-dictionary-{before,after}-sources.json、dictionary-final-source-check.json、contracts-dictionary.log、typecheck-dictionary.log、lint-dictionary.log。早先全 Worker 矩阵只代表其当时版本，未冒充本块回归。未提交、推送或发布，测试浏览器与本地服务器已退出。

## 第四块：实际战术地图接入串行命令边界

这次改的是默认 CombatView 的实际操作链，不是另建一套只供性能探针使用的界面：CombatView → TacticalHUD/TacticalMap → CombatSession.dispatchControl → applyCombatControlCommand。下令、取消、目标设置、选舰、护航和撤退不再由地图直接写 engine；已有在途 tick 先完成，再执行命令。武器组、射击模式、自动开火与联队召回控件在缺少权威回调时禁用，移除直接修改 Ship 的后备分支。原有布局、地图缩放/拖动和快捷键保留。

新增 TacticalControl 数据协议：舰船只传 id，航点只传二元数值数组；权威执行时构造 Vector2，使用自己的 combatTime 和命令序号产生 TacticalOrder，不采用主线程的旧时钟/可变位置对象。执行时重新检查所属舰队、存活/部署/可见性、原有指挥点规则、撤退资格。护航编组仍调用已有的单次扣点规则；取消仍不退款。普通拒绝回传 CommandResult，不将一次失败的地图操作当作 Worker 崩溃。

地图支持同步及 Promise 回执，收到 accepted 前不显示成功，也不修改引擎副本；已卸载或更换旗舰/引擎的旧地图忽略延迟回执。LAN 地图仅通过显式观察回调选舰/关闭，撤退仍使用原有主机请求，没有开放联机战术下令。LocalCombatKernel 使用同一个入口，发布帧增加 tactical 只读读集（CP、所选 id、地图开关、orders）。协议版本 7；这些只是战术状态，尚不是完整 TacticalHUD/部署状态投影。

### 本块验证

- 一次应用 TypeScript、13 个改动代码/测试文件 oxlint 通过；既有契约 **2,420 项**通过（新增 61 项），包括克隆后的航点方法、实际下一 tick 消费航点、CP 不足、陈旧/不可见目标、错误类型/非有限坐标、取消不退款、多舰护航只扣一点、撤退整批验证与不撤敌舰。护航/撤退等在内核 fixture 验证，未声称默认 UI 已逐项实点或完整 LAN 主机回归。
- 复用既有默认战斗页面无头 smoke：暂停后 tick 始终 **15**；按 Tab/A 打开地图选全舰，点击全面进攻，Delete 取消；注入拒绝回执不产生订单/不扣 CP；注入延迟回执，ACK 前保持旧状态，ACK 后才产生订单。共两次有效下令使 CP **5→3**，取消不返还。Tab 关闭地图后点击武器组，确认实际命令日志经过 session 入口。
- 同一页面启动一个真实 module Worker（默认 AI 配置未更改）：开地图/选旗舰/传航点得到三个 accepted 回执；CP **5→4**，航点 [1234,2345] 及 distanceTo 方法保持；Worker 实际推进到 tick 1 后取消/关图，仍 tick 1、CP 4、订单数 0。小编组按原有门槛使用串行 AI，这不等于更改了默认 4 AI Workers，也未冒充百舰并行性能验收。
- 页面无错误，已目视检查 1280×720 地图截图。原版实机仍待许可；不是像素还原证明。
- 首次 UI smoke 在并发工作区的 Vite 全页重载与关闭地图后立即数 DOM 的窗口中失败（按钮暂未出现）；仅修正测试宿主禁用文件监听/HMR，并等待真实 HUD 按钮可见，定向重跑同一场景通过。没有因此重跑性能矩阵。后台浏览器/服务器已退出。

产物：artifacts/render-projection-20260922/ 下的 typecheck-tactical.log、lint-tactical.log、contracts-tactical.log、tactical-ui-smoke.json、tactical-ui-smoke.log、tactical-command-map.png；最初失败单独保留 tactical-ui-smoke-failure.json。

**未宣称新的 FPS/TPS 收益。** 第三块的 92.65→81.47ms 属于当时协议 6 的冻结构建，并非本次协议 7 的重测结果。默认战斗仍 inline；完整 HUD 读集、部署界面写入口和 Worker 生命周期/结算接管仍需完成。此块消除实际 UI 绕过权威边界的写操作，为后续接管铺路，但没有解决百舰主线程计算和通用编码器的总成本。未提交、发布，也未覆盖并发网络任务的改动。

## 第五块：实际增援与模拟器部署接入权威事务

默认 CombatView 的两个部署入口已经接入 CombatSession.dispatchDeployment：FleetDeployment 只提交己方后备舰船 id；SimulationDeployment 只提交双方目录 id 或部署上限，不再从 UI 注册临时舰船定义、调用生成舰船或设置预算的方法。FleetDeployment 的 onDeploy 现在必填，移除没有回调时直接写引擎的后备分支；原有 LAN 主机回调保留，本轮未做完整联机部署端到端回归。

DeploymentControl 先复制命令，再按需加载共享 SimulationCatalog，由权威侧解析配装、校验定义并从真实定义计算 DP。模拟配装以冻结的临时定义交给现有引擎，不写全局舰船内容库。旧 UI SimulationRoster 路径保留兼容导出，旧注册帮助函数仍供兼容调用使用，不能据此说全项目已经没有全局注册路径。舰名本地化作为定义携带的显示元数据在权威与呈现端注册，内容库 revision/signature 保护没有放宽。

异步准备期间不修改战斗；提交前检查会话/权威代际、内容版本、战斗结束和双方当前预算。inline 入口先完成已接受的在途 tick，再复查代际；LocalCombatKernel 使用同一准备/提交逻辑，并拒绝与准备阶段重叠的内核推进。普通非法目录、超预算和失效命令返回 rejected，不使 Worker 失效。LocalWorkerHost 提供串行部署入口，协议升至 **8**。资源刷新在实际 UI 消费成功 ACK、关闭窗口后执行，避免 loading 转换提前卸载等待中的窗口而丢掉成功回调。

等待 ACK 时禁止重复提交和取消，拒绝后保留双方选择；窗口卸载或更换旗舰/引擎后的陈旧回执不关闭新窗口。界面仍从 CombatEngine 读取部署状态，**本块完成的是这两个实际写入口，而不是完整部署只读模型或默认 Worker 接管**。

### 本块验证

- 集中一次应用 TypeScript 检查通过。改动文件 lint 初次给出两个新增的 react(set-state-in-effect) 警告，已定向改为由 engine/flagship 标记的 busyOwner 派生忙碌状态，随后仅复查这两个 UI 文件，零警告；没有重跑压力矩阵。
- 扩展既有 check-render-projection 检查，**2,456 项**通过（比第四块新增 36 项）。覆盖无效目录/重复 id/非法上限/任一方超预算时双方不入场且世界图与 RNG 不变、await 前复制命令、拒绝重复事务、旧代际/已关闭会话、后备所有权、临时配装冻结及未注册进全局内容库、内容签名不变。不是对所有异常做任意回滚的证明。
- 复用既有模拟器页面，实际挂载 CombatView。通过真实选择器选野狼 wolf_CS 与锤头 hammerhead_Balanced，分别注入失败 ACK 与延迟 ACK：失败保留选择/世界；等待中按钮禁用且不会二次提交；释放真实权威事务后窗口关闭、资源 ready、主舰对象数 **1→3**。攻势 40DP＋友军野狼 5DP＝**45DP**，敌军锤头 **10DP**；新名称正确，临时配装未出现在全局舰船注册表。
- 同一无头场景挂载真实 FleetDeployment 并连接真实 CombatSession：延迟期间只收到 **1** 次请求，ACK 后关闭 **1** 次，只部署本方后备，敌方仍是后备。这是组件＋服务连接验证，不是完整生涯出征端到端验收。
- 同一页面启动真实 LocalWorkerHost：40DP 上限拒绝双方波次、对象数仍 1；调整至 60DP 后部署成功，对象数 3，命令阶段仍 **tick 0**；一次实际 step 推进到 **tick 1**，host 仍 ready。先覆盖主线程舰名为哨兵再接收 Worker 帧，确认定义携带的名称恢复正确；内容签名全过程不变。
- 页面错误 **0**，已目视检查 1280×720 等待 ACK 截图（双方 DP/选择、等待提示及禁用操作）。原版实机与逐像素对照仍未补验，不把 Web 截图当原版等价证明。浏览器与 Vite 在 finally 中退出，进程已 exit 0。

证据位于 artifacts/render-projection-20260922/：contracts-deployment.log、typecheck-deployment.log、lint-deployment.log、lint-deployment-ui-fix.log、deployment-ui-smoke.json、deployment-ui-smoke.log、deployment-awaiting-ack.png。

**本块没有新的 FPS/TPS 或百舰提速数据。** 第三块协议 6 的桥接耗时是历史冻结构建结果，不能充当协议 8 复测。默认 CombatSession 仍 inline，LocalWorkerHost 默认仍 compatibility；完整 HUD/部署读模型、Worker 生命周期/结算接管、StateStore 与百舰实际流畅度验收未完成。模拟频率、随机数精度/顺序、实体数量与默认 4 AI Workers 未调整。未暂存、提交、推送、打包或发布，没有覆盖并发网络/生涯任务的修改。
## 第六块：部署读模型连接真实 UI 与 Worker

新增 DeploymentView/DeploymentViewProjector。读集只包含代际、可用性/战斗结束、旗舰身份、成员 id/阵营/状态/DP、实际配装定义、结构/最大结构/CR，以及舰队与模拟器预算；不含 Ship、AI、引擎或可调用的模拟服务。CombatSession 提供稳定的 deploymentView 读源；LocalWorkerHost 从发布帧生成冻结的 UI 快照，而不是把会被下一帧原位更新的解码图直接交给窗口。协议 **9**。成员行及未变快照复用，已知深冻结定义共享既有元数据字典；调用者提供的可变定义逐次检查，只有内容改变才复制，保留原位变更、undefined 与 Object.is 数值语义，不冻结权威端的原对象。

实际 FleetDeployment、FleetDeploymentRoster、FleetShipInspection 和 SimulationDeployment 已移除对 CombatEngine/Ship 的依赖，预算、队列、结构/CR 和配装均来自上述读源；两种窗口的写入仍走第五块的权威命令。默认 CombatView 传 session.deploymentView；LAN 在显示适配层生成同一读源，保留原主机部署回调。本块没有重构 LAN 数据传输协议，也没有做完整联机部署回归。UI 保持 200ms 刷新节奏；选择按读源/代际隔离，预算变化不废弃同代际合法 ACK。

读模型额外避免两类开销/错误：普通非模拟且无部署名单时不读取全场舰船，也不查询模拟预算；舰队预算按完整部署名单独立保存，网络显示实例缺失时可以省略该实例的配装行，但不能把其已占用的 DP 算成空余。提示仍是 UI 预检，最终部署资格由权威端再次校验。完整 TacticalHUD、战术地图读模型与顶层 CombatView 生命周期仍依赖引擎，本块只交付部署子树的读写闭环，不冒充整场 Worker 接管。

### 本块验证

- 一次完整应用 TypeScript、15 个改动代码/脚本文件 lint 通过。复查发现可变生涯配装可能每帧换元数据身份，补了逐字段快照缓存；随后针对 DeploymentView.ts 做定向 TypeScript、两文件 lint 与既有投影契约复查。没有重跑性能矩阵。最终 **2,524 项契约**通过（比第五块新增 68 项），覆盖成员状态/DP 对照、冻结隔离、CR/结构变化、缺失显示实例仍占预算、同代际快照复用、陈旧代际、可变配装原位变更、未变帧零新增元数据，以及普通战斗不额外读取全场名单。一次新增测试漏写 api.CombatEngine 导致 ReferenceError，仅修正测试引用并复跑同一检查通过；不是引擎故障。
- 复用第五块的一个无头部署场景，保留默认 CombatView 模拟器拒绝/延迟 ACK、资源就绪与 45/10DP 检查，以及 FleetDeployment＋CombatSession 的后备提交检查。首次整站入口等待 DOMContentLoaded 超过 120s，页面没有脚本错误，未据此断言是部署逻辑故障。测试宿主改为 Vite transformIndexHtml 提供的隔离页面，加载真实 CSS/React preamble 并挂载真实 CombatView，定向重跑该场景通过；不把这一结果当作完整主页启动验收。
- 同一场景随后直接把真实 LocalWorkerHost.deploymentView 传给实际 SimulationDeployment，无 engine prop：60DP 上限、友军已用 45、敌军已用 10；选择敌方野狼并延迟 ACK，等待时禁用提交；成功后敌军已用 **10→15**，提交/成功回调各 **1** 次，仍 tick 1。旧快照保持敌军 10DP、不随下一 ACK 变动，同代际不变；host 关闭后读源 available=false。
- 再直接把真实 Worker 的遭遇后备读源传给实际 FleetDeployment：4 名参战成员，友军后备 **45% 结构、37% CR** 显示正确；刻意卸下 WS 001 武器，读到的实际配装仍为空，而不是退回目录默认武器。成员没有 fixedUpdate 方法，定义冻结；一次提交只将本方 reserve→deployed，敌方后备保留，命令阶段 tick 0。此为真实组件＋Worker 遭遇连接，不是完整生涯流程/结算验收。
- 浏览器页面错误 0，目视检查 1280×720 的 Worker-only 部署窗口截图，等待提示、预算和禁用状态正常；原版实机/像素对照仍待许可。最后的普通战斗快速路径与缺失实例预算修正有定向源码契约验证，未再重跑整个浏览器场景。后台浏览器/Vite 已 exit 0，不占用桌面。

证据：artifacts/render-projection-20260922/ 下 typecheck-deployment-view.log、lint-deployment-view.log、typecheck-deployment-view-final.log、lint-deployment-view-final.log、contracts-deployment-view-final-fix.log、deployment-view-ui-smoke.json、deployment-view-ui-smoke-retry.log、deployment-worker-read-view.png。最初导航超时保留在 deployment-view-ui-failure.json/deployment-view-ui-smoke.log。原有第五块产物未覆盖。

**没有新的 FPS/TPS 或百舰 Worker 往返测量。** 稳态复用/不多遍历是已验证的数据成本约束，不是帧率收益声明。默认 authority 仍 inline，默认 LocalWorkerHost 呈现仍 compatibility；完整 HUD/地图读集、Worker 启停/结算、StateStore/恢复以及百舰实际流畅度目标仍未完成。模拟频率、RNG/精度/实体数量与默认 4 AI Workers 未改变。未暂存、提交、推送、打包或发布，保留并发网络/生涯工作。
## 第七块：战术地图读边界（实现）

TacticalMapViewProjector 在既有 CombatVisibility 策略下发布地图所需的可见主舰/舰载机、观察者位置和视野半径、可见任务目标坐标、地形、部署/指挥点，以及旗舰结构/幅能/CR/装甲格。每次采样对同一舰船复用可见性结果；绘制与点击拾取共用已绘制的接触帧，不再由 UI 调用舰船视野方法。地图关闭时 map=null，既不枚举全场，也不复制装甲/地形。纯数据坐标没有 Vector2/Ship/ArmorGrid 原型；未变子树复用，旧发布快照不随权威或解码图修改。

实际 TacticalMap、TacticalMapPainter、TacticalShipStatus 已去掉 CombatEngine/Ship 读取；地图内部平移/缩放仍使用 UI 自有 Vector2，不把它发送给权威。旗舰标记及护航是否包含旗舰按 id 判断，不依赖投影与权威对象引用相等。装甲画像仍按原有约 66ms 节奏从最近绘制帧读取，不因 React 的 100ms 状态刷新而降频。权威命令回执保留，旧代际/读源回执不更新新地图；关闭地图的成功回执允许在 map=null 后执行关闭/焦点回调。

默认 CombatView 经 TacticalHUD 传入 session.tacticalMapView，LAN 在显示适配层提供同型源，LocalWorkerHost 从发布帧提供冻结快照。协议 10。LAN 依旧只有观察/增援/主机撤退回调，没有开放未实现的战术下令。TacticalHUD 的其它面板、顶层运行与输入/结算仍未迁移；默认 authority=inline、LocalWorkerHost 默认 compatibility 不变。
### 第七块验证与边界

- 完整应用 TypeScript 通过；既有投影契约 **2,582 项**通过，比第六块新增 58 项。覆盖地图关闭时不扫描舰船的 getter 陷阱、按阵营/观察者的接触可见性、公开战场、后备/死亡/入库/退场排除、不可见目标不生成任务线、装甲直接改格的刷新、纯数据冻结/快照隔离、代际/关闭/释放，以及命令不改变模拟 tick 或 RNG。之后仅对地图和旗舰状态组件的 effect 依赖与装甲采样修正做定向类型/lint 复查，均通过。
- 在既有 check-multiteam-map.mjs 中接入实际 UI 检查，未创建独立测试工程。实际 CombatView 暂停后通过 Tab/A/突击/Delete/Tab 完成开图、选舰、命令、取消和关闭；tick 保持 **35→35**，CP **5→4**。这是默认组件链路检查，不是完整主页、生涯或结算端到端验收。
- 真实 LocalWorkerHost 的 tacticalMapView 直接挂载实际 TacticalMap，没有 engine/Ship prop。突击后 CP **5→4**，拒绝保持 4，延迟接受后为 3，实际右击空白图面下航点后为 2；覆盖选舰/撤销/F2/关闭、延迟及拒绝回执。坐标无 Vector2 方法，装甲数组冻结，旧快照仍为 CP 5。命令时 tick 0，关闭回调恰好 1 次、map=null；真实 step 后 tick 1，host ready，dispose 后 available=false。
- 场景宿主有两次定向修正：多队 fixture 会注册临时舰体，若复用文档启动 Worker，会被原有内容签名保护拒绝；改为同一浏览器中重新加载独立文档后再测 Worker，没有移除或绕过保护。原固定右下角右击点被命令栏遮挡，改用 DOM 命中检查加生产地图拾取函数寻找未遮挡空白点，没有强制穿透 UI。隔离宿主补上真实 native-chrome.css 和字体等待，未修改生产字体样式。最终 Worker 地图截图已检查，文字/旗舰装甲/命令栏正常；原版实机和同状态像素对照仍待许可。
- 最后一次完整既有场景为 **95/96 条断言通过**，实际 UI/Worker 操作全部通过、页面错误 0；唯一失败是旧测试要求双队 LAN 使用传感器视野。已核实 LanWorld.ts 在已提交的 **9e83433** 中明确对所有队数使用公开战场，该运行文件本轮无差异。只把旧期望更新为公开战场，并将首帧可见性检查扩展到双队；独立传感器规则断言保留，未修改运行策略。
- 按项目验证节奏，仅对这一失败做双队定向无头复查，**9 项全通过**：公开策略/首帧、传感器边界对称、真实 tick 后公开可见、地图读模型、超传感器范围在公开场景可见而普通传感器场景不可见、切回普通战斗清除 LAN 标志。最后改动的场景脚本/助手 lint 通过。**未重跑修正后的完整多队/UI 场景，因此不将最后一次完整场景记录改写为 exit 0。** 所有本轮自建浏览器与 Vite 进程已结束，没有桌面输入。

产物在 artifacts/render-projection-20260922/：typecheck-map-view.log、contracts-map-view.log、lint-map-view.log、typecheck-map-view-ui-final.log、lint-map-view-ui-final2.log、map-ui-contracts.json、worker-tactical-map.png、map-view-scenario-final.log、map-view-two-team-targeted.json/.log、lint-map-view-scenario-final.log、map-view-final-sources.json。前两次宿主问题日志 map-view-scenario.log / map-view-scenario-retry.log 保留，没有掩盖失败记录。

**此块是实际战术地图的读写边界接通，不是新的百舰性能结果。** 地图关闭路径不增加全场扫描、同次采样复用可见性，是代码/契约约束；打开地图仍需采样和复制动态显示数据，没有宣称净 FPS 收益。完整 HUD（含雷达/武器控制台等）、输入/顶层生命周期/结算、完整 StateStore/恢复迁移仍待完成。默认 inline authority、Worker 默认 compatibility、模拟频率/RNG/精度/实体数量与 4 AI Workers 均未改变。未暂存、提交、推送、打包或发布；不标记整场新架构完成或多船卡顿已解决。
末次差异检查发现 TacticalMapPainter.ts 混合 CRLF 与 3 处孤立 CR，已仅统一换行为 LF（不改逻辑），该文件 lint 和本块受查文件 git diff --check 复查通过；未因此再运行场景。

## 第八块：正常战斗主链路接入 Worker（协议 11）

### 实装范围

- **实际 CombatView 默认启用 Worker**，不再只在独立实验页启动 LocalWorkerHost。GameSession/CombatSession 负责启动、初始资源等待、单个在途 tick、暂停屏障、重启/换舰/换遭遇、释放、失败呈现及战果通知。主线程仍可创建初始配装/遭遇的引导对象，但不推进这个对象的模拟；Worker 活跃时 `session.engine` 直接拒绝访问，防止误把引导世界当成权威。视觉实验室和显式 `?combat=inline` 参考/诊断路径保留同步编辑能力，不是运行失败后的自动回退。
- 新增 CombatHudView/CombatHudProjector：HUD 武器与技能状态、战备/幅能/装甲、旗舰/锁定目标详情、联系人/雷达、联队与通知、镜头传送偏移和持续武器音效。只有旗舰与锁定目标携带完整显示用装甲/武器详情；其它联系人不复制这些图。HudContactRecord 只有显示数学/可见性查询，不继承 Ship，也没有 activate/fixedUpdate/applyDamage 等权威方法。稳定读外观接收最新帧；RAF 消费者不锁死在初始化快照。解码图是实时可变显示数据，不冒充历史快照或恢复检查点。
- 实际 TacticalHUD、武器/技能控制台、纸娃娃、目标详情、悬浮信息、雷达和通知，以及 useCombatInput/useCombatLoop、镜头和音频改读该边界。地图/部署继续使用第六、七块的独立读源。LAN 的实际 HUD 使用显示适配器，但其网络协议/主机权威不改写；本轮不是完整 LAN 回归。
- 手动/自动驾驶等输入边沿等待 ACK，按控制代际过滤旧结果；松键、松鼠标、焦点丢失后的延迟回执不会重新按住输入。同序段重复的清输入/停火请求可合并，有后续采样或其它命令时不能越过它们合并。已经进入命令队列的驾驶意图优先于尚未更新的 UI 自动驾驶采样，防止旧采样反向覆盖控制权。Worker 路径要求固定 1/60 秒；旧同步编辑步进接口在该路径明确拒绝，不悄悄推进主线程引导引擎。
- 渲染仍在主线程使用受限显示投影；默认 Worker 配置请求 render 模式，既有编码器针对不支持的自定义读取行为的 compatibility 机制仍保留，不把这层兼容代码删除当作完成条件。实际普通原生舰体场景验证为 worker-render。模拟音效事件按 ACK 顺序消费一次，重新准备资源不会重放初始化事件；持续音效从显示读数同步。碰撞/尾迹遥测由权威随帧传递，不再为了统计访问主线程模拟服务。
- 新 Worker 初始化可接收当前舰船/武器**数据定义**快照，ContentRegistry 先验证完整图再安装，之后仍校验双方内容签名。运行时内容变化仍拒绝，不能用这条初始化路径绕过版本/内容一致性。已注册的测试靶舰实际跨 Worker 启动并参与战斗，验证不是仅内置 ID 的演示。
- 舰队结算从 LocalCombatKernel/CombatHandoff 的权威 CombatOutcome 写回 GameSession，经既有状态校验和只写一次规则保存，不从 HUD 或 RenderFrame 推导成员损伤/弹药。暂停、切场、失败处理不把呈现数据恢复成模拟世界。Worker 故障停止并展示错误，不自动回退 inline 或重演半完成 tick。

### 并行装甲优化的兼容处理

本轮期间其它工作为 ArmorGrid 增加了私有单元格存储、mutation revision 和 copyCells。保留该实现与相关改动，没有重置/覆盖其优化。HUD 使用 copyCells 取得自有数组，地图通过 ArmorReadCache 在可信 mutation revision 不变时复用副本；raw cells 逃逸/自定义访问导致 revision=null 时必须重取，不能只相信 dirtyVersion。两个装甲画布读取的是显示副本，不调用权威网格方法，也不通过读取权威公开 cells 意外关闭脏标记缓存。具体冲突修复有定向类型/lint 复查。

### 本块验收

- 完整应用 TypeScript 最终通过（typecheck-hosted-final.log）；所有本块改动文件最终 lint 和 diff whitespace 检查通过（lint-full-worker-final.log / diff-full-worker-final.log）。首次类型检查发现 HUD 的少量遗漏字段与伤痕工具类型过宽，定向修正；随后并行装甲改动造成两处 DTO 方法不匹配，按上述读副本边界接合。没有重跑百舰矩阵。
- 既有投影契约最终 **2,621 项**通过（contracts-hosted-final.log）。新增 HUD 数值/显示查询对照、无模拟能力、只有旗舰/目标携带详情、解码身份/动态装甲和弹药更新、内容快照一致性/重复 ID 原子拒绝、引导/inline handoff 绑定，以及驾驶意图与旧采样竞争、释放合并、错误 dt/旧同步步进入口拒绝、释放后的陈旧命令和 tick 不提交。装甲投影还检查不改变权威 mutation revision。
- 复用 check-multiteam-map.mjs，新增实际 CombatView 的 hosted 分支；旧 inline 地图步骤明确使用 `?combat=inline`，真实 Worker-only 地图仍保留。第一次完整组合场景的前述 UI/地图步骤完成，最后的结算 fixture 在 1,500 步内没有自然结束，场景 exit 1；没有把它改写成通过，也没有为了测试修改正式战斗/撤退规则。改为可控、静止、1 HP、无盾的**测试专用已注册舰体**，只重跑 hosted 分支（MAP_CHECK_ONLY_HOSTED=1），exit 0、pageErrors=[]。未重跑修正后的整个多队矩阵。
- 实际默认 CombatView 的 backend=`worker-render`，访问主线程 engine 被拒绝；HUD 旗舰无 fixedUpdate，系统无 activate。暂停屏障后 tick **9**；真实武器组按钮、R 目标命令及目标的 **8 门武器**读数、地图选舰/全面进攻/撤销/关闭均通过，暂停命令不推进 tick。真实 W 按下/松开后 tick **9→22**，位置从 (0,600) 到约 (0.0000053,599.85278)，随后暂停成功。
- 实际 GameSession 切换沙盒使控制代际 **1→2**，旧命令 accepted=false，旧 host disposed。随后通过同一个实际 GameSession 启动/导入舰队遭遇：自定义靶舰定义已送入新 Worker，正常武器伤害击毁敌舰；**269 个权威 tick**后 battleResult ready，pendingCombat=null，写回 outcomes 中对应遭遇恰好 **1 条**，敌舰状态 destroyed，GameSession.error=null。不是伪造结算帧，也不是修改生产舰体 HP；测试 fixture 的自然战斗耗时不当成 FPS/TPS 基准。
- 人为触发 Worker 故障后下一命令 accepted=false，呈现状态 failed，后端仍标识 Worker、tick 保持 269；没有 fallback。实际 React 卸载后 host 与 session 均 disposed。阶段日志及详情在 scenario-hosted-targeted.log、hosted-combat-ui.json、hosted-settlement-latest.json；完整组合失败保留 scenario-full-worker.log。hosted-combat-hud.png 已检查布局、纸娃娃/武器组/技能/雷达和暂停提示。原版实机/同状态像素对照仍未做，不能冒充原版完全等价。

### 明确保留的边界

**正常单人战斗的 HUD/输入/渲染连接/地图部署/生命周期/舰队结算主链路已经迁移并默认启用 Worker。** 这不等于百舰 60 FPS/TPS 已达成；本轮没有新的百舰性能数据，不能套用此前协议 6 的桥接时间。默认模拟频率、随机性、精度、实体数量和 4 AI Workers 没有降低。主线程引导构造和显示编码仍有成本，仍需真实规模下 profiling 后再决定优化。

视觉/Worker 实验工具的同步参考能力、渲染器的受限兼容适配保留。**完整运行中检查点（含 AI/在途弹丸/RNG）及崩溃后无损续战，尚未交付；显示帧不是 StateStore/ReplayCheckpoint。** 当前保存/重开仍采用既有战前 GameState 与权威战后成员写回；不伪装为战斗中任意时点恢复。也不据本轮宣称完整生涯产品、完整 LAN 或所有长期架构项目已经完成。未暂存、提交、推送、打包或发布。
## 第九块：已确认日志驱动的 Worker 故障恢复（协议 12）

本块补上实际恢复入口，而不是给 RenderFrame 增加“存档”名称。普通战斗仍默认 Worker；不改变固定 60Hz、随机数精度、实体数和默认 4 AI Worker 策略。

### 实现

- `CombatReplayCheckpoint.ts` 保存初始内容/种子/遭遇配置和完整的已确认命令、每 tick 输入。同样的连续输入采用无损 RLE；空屏障不增加操作。只在主线程接受合法 ACK 后入日志，发送中/排队中/失败的操作不进入检查点。
- 恢复只能在**全新 Worker** 中执行原有构造、命令、异步部署及 `stepScheduled`，从而重建原生 AI、WeakMap/闭包、弹丸、模块、技能和 CombatHandoff 绑定；不是从显示对象补回模拟对象。重放期间音效事件被抑制，最终只发布当前帧；不重播历史声音和结算事件。
- 协议、内容签名、tick 总数、命令结果以及权威端见证必须匹配。见证保留未截断的模拟/视觉 RNG 游标、ID 计数，以及部分舰船/弹丸数量等数值；**它是低开销差异检测，不是全状态密码学哈希**，不能据此证明所有第三方行为都可恢复。
- `CombatSession.recoverAuthority()` 递增控制代际、终止旧 Worker，在恢复后发送新的释放输入命令、重建渲染资源并保持暂停。旧回执/恢复期间的切场或释放不会重新激活旧战斗。错误覆盖层增加“恢复至已确认进度”，明确提示未确认操作丢弃；不自动回退 inline，不自动继续开火。
- 日志为当前页面的**内存日志**：最多 216,000 tick（一小时模拟时间）、131,072 个 RLE/命令记录、32 MiB 的 UTF-16 JSON 估算日志载荷（不含初始内容快照和 JS 对象额外开销，不能说总堆内存只有 32 MiB）。超限清空日志、关闭恢复能力，但不停止正常模拟。不做截尾导致假恢复。重放进度定期续期超时，有总时长保护。
- 自查发现暂停且无待处理事务时，原 host 只拒绝 Promise，不能立即通知 Session。补上 `subscribeFailure`，空闲 Worker 崩溃也马上进入错误覆盖层；dispose 不发送故障通知。仅为此补做恢复/空闲故障/中途卸载的定向检查。

### 验证记录

- 首次完整应用类型检查和本块文件 lint 通过；既有投影契约 **2,621 项**通过（`typecheck-recovery.log`、`lint-recovery.log`、`contracts-recovery.log`）。新增恢复断言在既有 hosted 浏览器场景，不混入该计数。
- 既有 `check-multiteam-map.mjs` 的 hosted 分支通过，`scenario-recovery.log` exit 0、pageErrors=[]。真实默认 CombatView 的日志恢复，与未中断 Worker 连续 **60 tick** 比较 RNG 见证、舰船位置/速度/船体/幅能、旗舰/目标装甲武器、弹丸及光束等选定字段；全部一致，期间最多 **41 个弹丸**。此处不是全部内部字段的直接序列化对照，也不是性能基准。
- 篡改协议、tick 计数、内容签名被拒绝；篡改 RNG 见证的真实 Worker 恢复被拒绝；日志上限关闭恢复而不继续截断记录。重放帧不包含历史音效。
- 实际点击恢复按钮：从 epoch 1 切换到新 epoch 5，在最后已确认 **tick 82** 恢复，仍为 `worker-render` 且保持暂停；一个未获 ACK 的地图命令被丢弃，恢复前后的上述观测值一致。
- 同一 hosted 场景随后再次完成真实舰队战斗，269 tick 击毁测试靶舰，权威结算只写回一次、pendingCombat=null，并验证故障与卸载。**这不是舰队战斗中途恢复后的结算覆盖**：本轮中途恢复覆盖的是普通沙盒入口，舰队恢复仍需后续针对性场景。
- 空闲故障通知修正后的类型检查与局部 lint 通过（`typecheck-recovery-final.log`、`lint-recovery-final.log`）；定向场景详情见 `scenario-recovery-idle.log` 和 `hosted-recovery-idle.json`，不重跑百舰/完整多队矩阵。

### 剩余边界

这是可实际操作的**同页 Worker 崩溃后、最后确认边界的重放恢复**。恢复耗时随历史长度增加，不是即时完整 StateStore 快照；没有中场持久化到磁盘/刷新或关闭浏览器后续战，不承诺恢复未确认 tick，不声称任意第三方 Mod 可无损重放。百舰实际 FPS/TPS 未复测；本轮是容错连接，不是百舰性能提升数字。原版实机/同状态 UI 对照未做，新增故障按钮属于 Web 扩展。未暂存、提交、推送、打包或发布。

## 第十块：中场点持久化、刷新续战与舰队恢复结算（协议 13）

本块完成上轮缺少的**主动保存中场点 → 页面重新加载 → 同遭遇续战 → 一次性舰队结算**连接。仍采用重放，不是任意时点的 O(1) 全量 StateStore。

### 数据与归属

- 新增 `CombatCheckpointStore`，用 IndexedDB structured clone 单独存放中场日志，不把大日志写进同步 localStorage，也不通过 JSON 往返丢失 Infinity、-0、undefined 或 Float64Array。原舰队 GameState v1 存档格式不变，原导入/导出仍只包含战前/战后数据。
- 一个原游戏存档 key 对应一个中场槽。保存点绑定规范化后的**完整 GameState**（含 gameId/revision/pendingCombat），恢复还必须匹配遭遇请求、内容签名、种子与模拟器配置。GameSaveStore 在异步 I/O 前后及恢复提交前重查真实存储，拒绝其它页面改动。
- IndexedDB readwrite 事务使用 revision CAS；清理写 tombstone 而不是删除槽，避免“旧页面见空 → 另一页面写入又清空 → 旧页面误以为仍为空”的 ABA 问题。quota/不可用/冲突不会报告为保存成功。异步保存检查游戏状态和控制代际，过期操作拒绝。
- 中场格式升为 2、协议升为 13。新 Vite 插件以 src 内容和 package-lock 生成代码指纹；源码热更新刷新指纹并全量刷新。旧代码、不同内容不能拿同名舰体蒙混恢复。无构建指纹的独立探针只允许内存日志，不允许持久中场保存。
- 重新开始、导入、新游戏、切场、结算使旧点失效。对同一出击重新开始/导入时提升 GameState revision，防止相同遭遇 ID 重用旧点；不更改 HP、弹药或战斗规则。即使 tombstone 清理失败，完整 GameState 绑定仍使旧点不可用于新状态。

### 实际入口与恢复生命周期

“舰队 / 存档”侧栏增加 **中场保存点 · Web 扩展**，提供“保存中场进度”和“继续中场进度”。保存会暂停并等待已接受 tick/命令屏障；只有 IDB 事务完成才显示成功。关闭页面前需主动保存并等待成功，没有 unload 临时抢写或每帧自动写盘承诺。

页面启动先等待中场点检查；发现适用点或检查错误会暂停并打开存档面板，不自动覆盖战前世界。继续需要明确确认，成功后保持暂停。保存点限同浏览器存储、同源/同路径、兼容构建；清理站点数据会丢失中场点。JSON 导出不包含中场日志，UI 已明确说明。

CombatSession 将恢复重放放在候选 Worker 中：保留旧的暂停权威，候选通过验证及存档归属复查后才更换；拒绝的候选不会覆盖原战斗。释放/切场会终止候选，恢复中拒绝旧世界的新输入；输入释放作为新的命令记录。同页故障恢复复用该路径，视觉/设计参考模式仍无持久存档。

### 验收与失败记录

- 应用 TypeScript 与本块 lint 检查通过。第一次 lint 提示 effect 内同步 setState，已改成响应 GameSession 订阅事件并定向复查。既有 **2,621 项投影契约**通过（`contracts-persistent.log`）；浏览器持久化断言不计入这个数字。
- 只扩展既有 `check-multiteam-map.mjs` 的 hosted 场景，没有跑百舰/完整 LAN 矩阵。首次测试 fixture 使用了错误的 ReactDOM 动态导入形式（`createRoot is not a function`），修正为与既有 helper 相同的 default 导出；失败保留 `scenario-persistent.log`。
- `scenario-persistent-fix.log` exit 0、pageErrors=[]：真实菜单保存舰队战斗 **tick 45**；真实 page.reload 销毁旧 JS realm/Worker/内存日志，重新加载同一数据定义，页面恢复到同一遭遇、同一 GameState revision、**tick 45**，RNG 等见证逐项一致，保持暂停。
- 从该恢复点继续 **237 tick** 后真实武器击毁测试靶舰；对应战果恰好 **1 条**，pendingCombat=null、GameSession.error=null、持久 GameState 为 saved。再次发送屏障不改变结算 revision；中场槽已清空为 tombstone。再次真实刷新后战果仍只有一条，没有旧中场点可继续。详见 `persistent-combat.json`。测试靶舰为固定注册的 1 HP/无盾/静止 fixture，每次 mount 相同注册；没有修改生产舰船或伪造战果。
- 同场景检验代码指纹不符、错误遭遇拒绝且旧 host 未替换；两个独立存储实例的陈旧 CAS 写被拒绝；真实 IDB 往返保留 Infinity/-0/undefined/Float64Array；存储不可用被拒绝。并非穷尽所有浏览器/配额异常。
- 自查并用延迟存储读复现启动竞态：先前 mount effect 无条件 start 会覆盖暂停 owner，定向检查得到 running 而失败（`scenario-persistent-startup.log`）。已在 mount 和统一暂停条件两处保留加载暂停；只定向重查保存/刷新/启动/恢复分支，`scenario-persistent-startup-fix.log` exit 0、pageErrors=[]，人为延迟一秒时 **state=paused、tick=0**，之后正常恢复。完整舰队结算场景不重复跑；`persistent-startup.json` 记录最后定向结果。
- `persistent-checkpoint-panel.png` 已检查 1280×720 的真实面板布局、保存状态、入口和说明，不声称原版同状态像素等价。全部后台/无头运行，未占用用户键鼠。

### 明确边界

已验证**真实刷新**后的持久读取和舰队恢复结算；没有执行用户桌面浏览器退出/重启实机验证，私密窗口、清理站点数据或浏览器回收存储不保证保留。生产打包/发布、跨代码版本迁移、跨浏览器携带中场点、完整 LAN 恢复均未做。仍是有上限且恢复耗时随历史增长的重放式中场点，不是瞬时全量状态快照。没有新的百舰 FPS/TPS 结果；默认固定 60Hz 和 4 AI Worker 策略不变。未暂存、提交、推送、打包或发布。
