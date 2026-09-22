# 受限舰船呈现读集：编码前对照（2026-09-22）

- 原版版本：0.98a-RC8。重新查看 `../decompiled/starfarer_obf/com/fs/starfarer/combat/CombatEngine.java:1185–1200`：300 单位分类空间网格属于权威引擎，并不意味着每个渲染消费者要复制整套战斗组件。此前已核实 `combat/systems/G.java` 护盾表现、`combat/systems/P.java` 相位表现、`combat/systems/int.java` 传送表现（Web 对应文件内有出处）；本次不改变其规则/时间步。
- 原版实机界面：待核实。用户正在使用电脑，本轮只做后台源码工作、无头 Web 对照，不操作原版窗口。
- 当前差异：Worker 的兼容呈现编码器枚举 Ship 全部可变组件，传输了装甲受击计算、武器控制和系统状态机等渲染不需要的图。现有 Float64 特效包不能消除此成本。主界面仍使用 inline authority，不默认切 Worker。
- 预期：把 WebGL 消费者的 Ship 依赖收窄为显式读接口；Worker 在结算后投影必要字段与查询结果，不能将带有更新/受击/开火方法的权威 Ship/Shield/System 原型暴露给新呈现路径。舰船和武器显示身份保留；原始精度、舰船/挂点/特效顺序、插值、可见性、航母系统投射、武器射程和系统表现保留。原有兼容模式保留作对照。
- 当前读集证据：TypeScript checker 扫描 `src/engine/render`，包括 Ship 的 32 个直接读取，Shield 12 个、System 10 个、Flux 7 个、WeaponMount 11 个；还需覆盖外部只读 helper 的间接读取与舰体残骸引用。扫描和含已接受光束优化的新源码基线保存在 `artifacts/render-projection-20260922/`。
- 验证：全应用类型检查约束消费者，独立兼容编码与受限编码配对；普通/航母/相位/系统/残骸/多队可见性/可变武器规格测试；真实无头 WebGL 图像对照与 Worker 生命周期；测编码/解码成本（不是 FPS）。任何未通过的默认接管门槛保持未完成，不调整 AI 频率、Worker 数或 scheduler catch-up 预算。
- 范围边界：本轮实现 renderer 的受限舰船读集；完整 TacticalHUD、部署与生涯命令迁移仍另行验收。不能把 renderer 帧当作完整存档、故障恢复快照或完整 HUD 状态。

## 实现中补充核实

- 重新读取原版 `combat/systems/G.java:499–518` 的 `setArc`：按 20 世界单位与 5 度两种分辨率取顶点数，初始命中显示值为 100。没有改动这个规则。
- 完整权威对象检查发现：Web 的 `Shield.hitSegmentLevels` 是**带初始化副作用的 getter**。直接在 Worker 投影时读取，会提前改写权威护盾的内部 hitLevels/hitRadius/hitArcDeg。已添加 `presentationHitSegmentLevels()`：几何有效时借用已有数值，尚未初始化时生成等值数组而不改写护盾；原 getter 的实现与模拟更新不变。测试同时检查读值相同与源对象不变。
- Renderer 之外的间接读也已覆盖：纹理闭包仍保留所有主舰与飞行甲板的 specId（不能简单删掉 playerWings/enemyWings）；锁定目标、武器射程、舰体残骸、航母系统投射，以及舰体/炮塔显示插值覆盖显式投影。
- 非原生系统统计、非原生射程 hullmod、被替换的原生查询会走既有兼容桥，不在受限路径执行额外自定义查询。此处不是任意 Proxy/猴子补丁的行为等价证明，也不是不可信网络协议；本地同构建 Worker 仍受 epoch/sequence/ACK 与内容签名约束。

## 后续块：武器规格与发动机状态读集（编码前）

一次当前冻结源诊断（100 初始混合主舰，第 75 tick）发现剩余图包含 1,700 个挂点，完整可变 WeaponSpec 是最大的记录类别：单一规格形状就有 600 份、98,400 个标量槽；1,150 个发动机状态又带入 healthTracker 等非显示字段。证据在 `remaining-graph.json`。这改变下一步优先级：先收窄这些实际已经进入 Worker 显示通道的字段，不另建后端/测试工程。

原版行为仍使用已有炮塔/发射/命中规则，本块不改变它们。Web 直接依据 `WebGLShipPass` 的贴图/后坐/辉光读取、`WebGLTacticalOverlayPass` 的弹速/射程读取，以及 `CombatAssetClosure` 的贴图和 beam/onHit/everyFrame/MIRV 子弹效果资源闭包。特别保留后者，不能因为不在绘制循环里就漏加载效果资源。可变规格仍每次采样，不把它按 id 误判为不可变；射程由原规则计算后作为显示读值传输。

预期去掉未读伤害/装填/制导字段及发动机健康跟踪组件，仅改变 opt-in render 发布内容；compatibility 及实际模拟字段保留。实现完整后集中跑一次类型检查、局部 lint 和既有读集场景；性能用同一构建切换读集版本比较，避免再反复启动完整压力矩阵。

## 第三块：共享已复制的武器显示字典（编码前）

重新读取本机 0.98a-RC8 的 `decompiled/starfarer.api/com/fs/starfarer/api/combat/WeaponAPI.java:49,135`：运行时 `getRange()` 与描述数据 `getSpec()` 是分开的接口；这不证明原版采用本 Web 字典方案，但明确不能按相同显示规格合并实际射程。原版界面仍未占用桌面补验，本块不改玩法或布局。

当前差异：上一块已经缩小字段，仍给 1,700 个挂点各建一份相似显示规格，再让通用图逐份检查。预期改成按内容合并**复制后且深冻结的显示数据**，复用已有 metadata 字典传输；原 WeaponSpec 和原数组继续可变，每次采样全部已声明读取字段，检测原位颜色、MIRV 子资源与缺省值变化。NaN/±Infinity/-0/undefined 不得用普通 JSON 值混为一谈。

约束：射程以挂点而不是显示规格作 key；相同外观不同 range 的挂点保留不同结果。字典只强持有本次/上次发布使用的条目，源对象缓存用 WeakMap，不保存全部历史样式。验证沿用现有读集契约，增加合并/变更/清退/射程差异覆盖，集中一次检查与一个既有百舰场景，不再跑全部压力矩阵。
## 第四块：真实战术地图与 HUD 命令入口（编码前）

本机 0.98a-RC8 的 decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatTaskManagerAPI.java:23–33,39,57–61 将 createAssignment/giveAssignment、orderRetreat/orderFullRetreat、指挥点读取和 removeAssignment/createWaypoint2 放在任务管理器中。它不证明 Web 的命令队列或 Worker 架构属于原版；本块只将已有 Web 战术规则的调用权收回权威端，不改变指挥点消耗、恢复、AI 或 UI 布局。

当前差异：TacticalMap 仍直接调用 engine.issueOrder/issueEscortGroup/cancelOrder/setPlayerTarget/selectUnit/deployment.requestRetreat，绕过 CombatSession 的在途 tick 屏障；武器组/联队 HUD 在没有回调时也直接写 Ship。结构化复制会丢失航点 Vector2 原型，主线程生成 issuedTime 也可能与 Worker 实际时钟不同。

预期：添加数据型战术命令（id/tuple，而非 Ship/Vector2 实例），在 inline/LocalCombatKernel 共享入口恢复向量、重新检查目标/权限/指挥点、生成权威下令时间与序号；把实际 CombatView→TacticalHUD→TacticalMap 接到 session.dispatchControl。界面等 accepted 回执后才显示成功，不再偷偷写显示副本。LAN 的地图观察选择/关闭由显式本地回调负责，撤退继续走现有主机请求，不开放未实现的联机战术命令。缺少武器命令回调时禁用操作，不回退为写 Ship。

验证仍集中一次类型检查、改动 lint 和既有战斗场景：结构化复制后的命令/航点、陈旧目标/CP 不足/取消不退款/多舰护航只扣一点、暂停时操作以及真实默认 CombatView 的地图点击和快捷键。原版实机未获桌面操作许可，仍待核实。本块是实战写入口迁移，不等于完整 HUD 只读投影或默认 Worker 接管；不重复百舰性能矩阵，也不宣称这一命令迁移直接提高 FPS。
## 第五块：实际增援/模拟部署的权威事务（编码前）

重新读取本机 0.98a-RC8 CombatFleetManagerAPI.java 的 spawnFleetMember、getDeployedCopy/getReservesCopy、addToReserves/removeFromReserves、getMaxStrength：部署与后备成员由舰队管理器处理，UI 不是舰船生成器。仅以此核实管理边界，不声称 Web 双方批量部署/Worker 协议是原版实现。原版实机仍未获桌面操作许可；界面布局和既有预算规则不改。

当前差异：FleetDeployment 缺少回调时直接 deployment.deploy；SimulationDeployment 在主线程 registerSimulationOption，再直接 deploySimulationFleet/setSimulationPointLimit，既绕过在途 tick 屏障，又会让浏览器/Worker 内容库分叉。现有模拟器双方事务、原版目录、DP 校验和全局内容签名必须保留。

预期：UI 只提交己方后备 id，或双方原版目录 id/上限；权威端从共同目录编译真实配装与成本，完整校验后一次部署双方。编译期间不写世界，提交时重新检查代际、预算和战斗结束状态。编译后的舰船定义可直接交给引擎，不为一场模拟注册进全局舰船内容库；舰名的本地化元数据随现有显示 spec 传播，不能绕过内容签名保护。旧 SimulationRoster 路径保留兼容导出，目录纯逻辑移至 engine/content，不把 React UI 带入 Worker。

实际 CombatView 与 LocalCombatKernel 共用该入口。UI 等 ACK，等待时禁止重复提交和关闭，失败保留双方选择；关窗/换场后的旧 ACK 不关闭新窗口。集中类型检查、局部 lint 和一个既有部署场景（包括实际页面与真实 Worker），不重跑百舰矩阵。完整 HUD/部署只读数据迁移仍另行完成，本块不据此默认切换 Worker，也不宣称 FPS 收益。

## 第六块：部署窗口的只读状态连接（编码前）

重新读取本机 0.98a-RC8 CombatFleetManagerAPI.java:32–34,76 的已部署/后备副本及上限，ShipAPI.java:86–88,117 的舰体/配装和当前 CR。原版数据边界支持按实际参战成员读取配装与状态；不证明原版采用 Web DTO/Worker。原版实机仍待许可，沿用第五块已经检查的 Web 默认/选择/等待禁用状态，不改变窗口布局和交互。

当前差异：上一块只有写入口进入权威端，FleetDeployment、FleetDeploymentRoster 和 FleetShipInspection 仍解引用 Ship/CombatEngine；模拟器直接读取引擎预算。即使 Worker 已返回显示船，完整后备配装、CR 和预算仍不能独立供这些实际组件使用。

预期：新增无 Ship/引擎方法的 DeploymentView（成员 id/阵营/状态/DP、实际只读配装、结构/CR、双方预算、可用性及代际）。inline 会话、网络显示适配和本地 Worker 发布相同读集，实际两个窗口与装备检查器只接读源及命令回调；UI 的预算提示仍只是预检，最后校验保持在权威端。复用已复制深冻结定义，动态成员行按内容复用；对调用者自带可变定义必须复制，不能把 UI 只读类型当作真的隔离。旧回执按读源和代际判定，不能因为预算更新生成了新快照就取消合法 ACK。

验证：集中一次类型检查、改动 lint、既有投影契约及同一无头部署场景；检查真实 Worker 数据直接挂载实际部署窗口，无模拟 Ship/CombatEngine 实例作为 prop，预算/条件/配装和代际变化不漏更新；保持原版部署/撤退状态规则。此块不默认切换整场 Worker，也不宣称 FPS 收益，不重跑百舰矩阵。
## 第七块：战术地图的完整只读输入（编码前）

本机 0.98a-RC8 CombatEngineAPI.java:59,63,71,211 分别提供舰船/小行星、按阵营 FogOfWar 和 isAwareOf；CombatTaskManagerAPI.java:19,23,57 提供成员任务读取、下令与撤销。仅用于确认接触可见性按观察阵营、任务由权威管理；不声称本 Web 投影/Worker 或现有地图外观是原版实现。原版实机仍待许可；参考第四/六块的 Web 地图/禁用截图保持布局，不改快捷键、指挥点或视野规则。

当前差异：部署已隔离，但 TacticalMap/Painter/ShipStatus 仍直接读取 CombatEngine/Ship、重新运行多次 contactVisible，并访问 ArmorGrid 方法。预期按既有共享 CombatVisibility 规则在权威读边界一次采样可见主舰/舰载机、观察者视野半径、任务目标位置、地形、旗舰幅能/装甲和部署/指挥点。界面仅持有无行为的坐标/数组/显示数据，绘制、拾取、选舰复用同一可见集合；地图关闭时不采样全场，不为普通战斗附加地图负担。按 id 而不是投影对象引用判旗舰身份，避免结构化复制后丢失选中标记；按读源/代际过滤旧回执。

实际 CombatView→TacticalHUD、LAN 显示边界和 LocalWorkerHost 发布接入相同读源。控制意图保持第四块入口，LAN 仍限制为观察/增援/撤退，不开放未实现战术命令。验证集中类型/lint、既有投影契约和地图场景，涵盖矩形投影拾取、后备/入库/退场不可见、多队观察与丧失全部观察者、任务线隐藏目标、旗舰装甲/CR、真实 Worker 驱动地图的下令/取消/关闭。仍不是完整 HUD/整场 Worker 接管，不重跑百舰矩阵、不新增 FPS 声明。
## 第八块：剩余 HUD、输入与实际 Worker 生命周期（编码前）

核对本机 0.98a-RC8 CombatEngineAPI.java:59,79,81,127,193（舰船/旗舰/暂停/时间/结束），ShipAPI.java:74,92,109,117,200（武器/幅能/装甲/CR/武器组副本），CombatFleetManagerAPI.java:52–56（伤残/损失/撤退名单）。沿用当前布局与快捷键：呈现读数来自完成的权威帧，输入只发送意图；暂停等待已经接受的 tick，不另推进；舰队写回使用权威保存的参战成员，而非渲染船反推。上述 API 不证明原版使用 Web Worker 或 DTO。原版实机/像素补验待许可，本轮仅后台与无头验证。

差异：实际 HUD、音频、镜头、输入还读写模拟对象；普通 CombatSession 尚未接 LocalWorkerHost，GameSession 仍向主线程 CombatHandoff 收集结算。方案：完整显示读面（只读联系人、旗舰/锁定目标详情、系统/武器/雷达/通知/声音）、输入 ACK 与代际隔离、Worker 启停/暂停屏障/失败即停止/更换遭遇、权威结算 DTO 接通。普通战斗启用 worker-render，视觉实验室保留明确 inline 编辑后端；不要将显示快照当成恢复检查点或崩溃后自动重演。内容在新 Worker 初始化时传递数据定义并核验同一签名，运行中内容变化仍拒绝。不改模拟频率、随机顺序、精度、实体数或默认 4 AI Workers。

验证：实现完成后集中应用类型检查、改动 lint、既有投影契约及实际单人 Worker 场景；包括输入/暂停/下令部署/重启切场/内容/结算/释放与陈旧回执，不重复跑百舰矩阵。实际帧率目标单独测量，迁移本身不等于性能达标。
## 第九块预审：Worker 故障后的确认边界恢复（2026-09-22）

- 原版依据：本机 0.98a-RC8 的 `CombatEngineAPI.java:59–81` 区分在场舰船、弹丸、玩家舰与暂停；`CombatFleetManagerAPI.java:52–56` 分别提供失能、摧毁、撤退结果。它们支持模拟实体与结算归属，不证明原版支持 Worker 或战斗中检查点。原版无本功能的已核实对等 UI，实机未操作。
- 当前差异：Worker 故障只能停止；呈现图不能恢复 WeakMap（AutofireController/模块 AI/技能）、闭包、RNG、在途弹丸及 CombatHandoff 绑定。不得对显示图补字段冒充 StateStore。
- 实施边界：增加版本化的**重放式检查点**（初始内容/种子＋按序已确认输入/命令＋权威端校验见证），在全新的 Worker 内运行原来的构造、命令和固定 60Hz 步进以重建全部隐藏状态。保留 4 AI Worker 策略。仅手动恢复到最后确认边界，未确认操作丢弃，不重演半完成 tick；声音重放静默，旧代际回执不能复活。内存日志有上限，达到上限只关闭恢复能力，不改变正在运行的模拟。
- 本块不是即时随机访问状态快照、磁盘中场存档或无界日志，不改原版战斗规则/UI布局。新增错误覆盖层按钮属于明确标识的 Web 容错扩展；不自动续跑、不自动重试未知 Mod。
- 验证：扩展既有 hosted 场景，真实默认 Worker 操作后终止、从确认日志恢复，比较 RNG/舰船/弹丸等轨迹，继续同一权威结算且只写一次；检查版本/内容/见证不符拒绝、未确认操作隔离、恢复中切场/卸载。集中执行类型/lint及该场景，失败仅定向复查。

## 第十块预审：浏览器持久中场点与同遭遇续战（2026-09-22）

- 原版依据继续限于本机 0.98a-RC8 `CombatEngineAPI.java:59–81` 的权威实体/暂停与 `CombatFleetManagerAPI.java:52–56` 的失能、摧毁、撤退归属；没有证据表明原版具有浏览器 IndexedDB 中场重放。本项是明确标注的 Web 扩展，不冒充原版功能。新增入口复用现有“舰队 / 存档”布局；原版实机对照未做。
- 当前实现只有同页面 ACK 日志，刷新后丢失。GameSaveStore 仍保存战前/战后 JSON 并防其他页面覆盖；不能把大日志塞进同步 localStorage，也不能用 JSON 丢掉 Infinity/undefined/typed array 精度。
- 预期：用户主动在暂停边界保存 IndexedDB 中场点，原 GameState 存档不改格式；用完整 GameState 绑定、遭遇请求、构建身份、内容签名关联。只在相同未结算遭遇/同逻辑构建显式恢复，新 Worker 重建后暂停。旧存档仍从战前开始，不自动替换舰队或自动重放。存储错误、版本差异、跨页冲突、过期结果应明确拒绝且保护已有记录。
- 生命周期：中场保存与恢复都检查异步代际；重新开始/新建/导入/切场/成功结算使旧点失效，IDB 写入按修订 CAS 防陈旧覆盖。没有关闭页面时临时抢写承诺，没有逐 tick 同步磁盘写入。
- 验证：集中类型/lint/既有契约，复用 hosted 场景测试实际菜单保存、真实刷新/重建、继续同一舰队遭遇并只结算一次；数据类型、构建/遭遇不匹配、存储失败、跨实例修订冲突定向覆盖。仍是重放恢复，不声称 O(1) 完整 StateStore 或新百舰 FPS 数据。
