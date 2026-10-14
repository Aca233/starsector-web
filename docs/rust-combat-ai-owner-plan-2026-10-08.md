# Rust 常驻舰船 AI 编排方案

2026-10-08。延续“全部做完，能正常游玩再停”和浏览器／桌面共用 Rust/Wasm 的授权。本块在已完成 tactical_ai、navigation_ai、defense_ai 周围建立真正的持续 AI 所有者，保持现有目标选择、队形、转向、盾／相位、排散及系统启动体验。没有新 UI、快捷键或玩家规则取舍。

## 原版依据和迁移合同

原版 0.98a-RC8。本机 `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipAIPlugin.java:5–43` 明确自动驾驶切换需要立即重新评估，AI advance 和取消机动各有边界，fighter refit 是另一职责；`starfarer_obf/com/fs/starfarer/combat/ai/BasicShipAI.java:555–620` 核实目标必须仍在 engine roster、固定位置／station 模块有独立机动处理。反编译的随机机动和恢复不完整变量不能替代目前 Web 规则。原版任务、防御及运动证据分别引用已交付 tactical/navigation/defense 的 source-notes。

直接移植合同是实际 `CapitalShipAI.ts:82–309,320–352,566–638`、`CombatEngine.ts:271–310,859–896`、`CombatAIPhase.ts:53–108`、`StageAIData.ts`、`SystemAI.ts`、`NativeCombatSystems.ts`、`BurnDrive.ts` 和七舰包系统源码。当前 CapitalShipAI 是 Web 战术启发式，不等同完整原版 BasicShipAI。没有新原版实机／截图权限；沿用现有布局与交互，原版画面验证仍待核实。

## 范围、状态和操作流程

新增独立 `ai_owner.rs`。OwnedAI 持有完整 handle/generation、目标记忆、退避、attached 边沿、20Hz／10Hz／whole-decision 时钟、forecast 与 defense calm 状态、计划缓存及本地 intent sequence/stage。原 UTF-16 FNV 相位不消耗 RNG。借用 resident typed Observation 包含三套模块观察和真实 AI 元数据；不接受每帧 JS 世界成为权威。原 JSON memory keys 对应 typed 原始字段，保留完整 attachment 五字段和 raw doNotBackOff，不用 bool／assemblyRoot 丢信息。

计划时先处理 cadence 模式、手动／自动驾驶边沿与不可活动状态，再 hostile preselection、明确命令／fleet target、威胁时钟和 profile、退避、regroup／escort／avoid／waypoint、站位、协作让火、逐步避碰与 steering。attached 只在真实 resident eligibility 被确认时停掉自运动，不跳过其目标、防御和射击。fighter 使用独立 AI，调用本所有者须明确拒绝；fighter 仍可被选为敌目标。死亡／撤离／docked／retreating 的停止 intent 清输入、诊断、hold 和 defenseFacing。取消命令进入空 Order；切到自动驾驶的第一帧立即刷新。

所有计划完成后按 roster 顺序 commitControls，再按相同顺序 commitEffects；intent 必须同 owner／当前 sequence 且经过 planned→controls→closed，重复、异主、过期均拒绝。effects 真正同步调用 Rust Host 写控制、启动／停止系统、盾状态、排散和诊断，不能只返回 action list。每个系统读取当前 owner 状态；forward 查询在原消费边界借用当时 resident 世界。系统效果之后的排散刷新重新计算 phase window／vent recovery，并且只 observe(0)，不能重复推进 calm timer。host 的启动失败继续原后续逻辑；未知 callback 不映射 NONE。

系统策略采用显式 typed 枚举。普通 jets／weapon boosts／burn／drive／defensive／missile reload 和 Eclipse／Adun 简单策略由本模块执行；需要专门世界查询的 Hyperion／Edict／Rocinante／Zhefeng／Gravity 通过明确 Rust Host 专项入口执行，默认 Unsupported，不能调用 TS callback 或默许成功。必须在装配 admission 核验 Host 支持全部安装系统；主任务完成专项适配后才可报告整舰包可玩。本块不重复实现父任务负责的系统实际载荷、生成实体和特效。

## 权威、存档及失败处理

联机宿主输入、暂停、退却／自动驾驶授权仍由既有输入链决定。命令、目标和 topology 全代次核验，计划 lease 不跨 effects 写入复用。OwnedAI 可 Clone，必须与 host 的 Ship／Shield／Flux／system／roster／RNG 一起纳入事务与 checkpoint；scratch 只做可重建工作区。未知系统、失效代次／拓扑、非有限 dt、阶段错误返回明确错误，外层事务回滚，不带一半提交的状态继续战斗。不能把诊断或 action DTO 当存档。生涯不在本块改动／发布范围。

## 实施顺序与验收

方案→typed owner 与 Host→直接组合已有模块→实际 TS CapitalShipAI planNumeric／commitControls／commitEffects、sampleDecision 的 Node 和 fresh 无头 Worker oracle→主任务 resident 接线和整场可玩验证。集中一次独立差分后仅定向修具体失败，不默认全项目测试。

严格比较目标与真实决策、手动／自动驾驶／退却状态、缓存 clock、原阶段拒绝、hold、calm、resource／RNG、系统动作及 vent 结果；位置、角度、纯几何限定 `max(1e-9,32*EPS*max(1,abs(actual),abs(expected)))`，不能放宽选目标、vent 或系统决定。涵盖有无 fleet assignment、明确 orders／取消、无目标、附属模块、死亡／撤离／docked、sampling、multirate 切换、紧急失效、系统写入后威胁重查、shield／phase／无盾、过期 intent。尚未覆盖的专项 callback、生产连接和原版实机明确列为未完成，不以独立模块通过冒充全部可玩。

本 agent 不修改 shared lib/state/battle/projectile/protocol／生产文件，不 stage／commit／push／release，不操作可见窗口或用户输入。主任务负责最终整场验收。

## 实际交付及主任务接线

完成 `ai_owner.rs`、独立 harness／check／runner。`OwnedAI::new`、`sample_decision`、`plan`、`commit_controls`、`commit_effects` 真正推进持续记忆并同步调用 resident Rust Host。`Intent` 私有 owner／sequence／effects 阻止外部伪造可执行权威能力；phase/hash、whole-decision/tactical/multirate/forecast、defense、profile/navigation/position memory 和各 typed keys 都属于 Clone 的 OwnedAI。`Scratch` 只存可重建模块工作区。当前 schema 没有通过 JS 传入或返回全世界／动作权限。

主任务须在真实 AI_PLAN 观察内先 `tactical_ai::fleet`，然后逐舰 `OwnedAI::plan`（或按原资格 sample）；在全体计划之后逐舰 `commit_controls`，最后同顺序 `commit_effects`。三个模块的观察必须同一语义 ordered roster／挂点；`AIInput` 提供 raw doNotBackOff、原五字段 attachment 和 actual tacticalPresent／attached eligibility／nativeForecast／systemMode／engineState。Host.systems 为原 ship.systems 顺序，独立 defense 槽必须唯一且最后；rightClickSystem 标志决定它在 tactical loop 或独立 defense 分支执行。Host.commit_controls 必须实际设置 AI ownership、清主炮手动 firing、combatShips；停止时调用真实 clearInput（包括 directional-gravity release）、清 defenseFacing／hold／诊断；活跃时设 current target、aim 和四控制值。不能省略这层 writer，也不能每步从 JS 重建这些记录。

Host 实现 `DefenseHost` 直接调用真实 Shield／Flux／系统停用规则；`activate(index,defense_entry)` 必须走本身实际 activationFailure／资源预留／次数／activation serial／输入捕获，失败返回 false；`deactivate` 保留真实 OUT／取消事件。效果后的 `observation` 必须借用当时 resident world，不能返回计划缓存。防御排散 barrier 会以新 window／ventTime 重算全 horizon，并 observe(0)；Forecast.remaining 仅在真实重查后回 -1。Host.publish 写原诊断所需的 role/task/mode/range/position/threat/defense 字段。Host/OwnedAI/系统/roster/RNG 必须一起纳入 root transaction 和完整 checkpoint；本块 Clone 续跑通过，跨进程 codec／生产存档接线由主任务继续，尚不能声称其通过。

`SystemAI` 的 jets／weapon boost／BurnDrive／Eclipse／Adun 内部执行实决策，另保留明确的 defensive/drive/dynamic/temporal/reload/SolarForge variants。实际当前 custom-only build 已移除 nativeSystem factory，后一组原 native variants 没有装配 runtime／本块差分覆盖，不能报告原生全系统已可玩。SpecialAI 列出 GlorianaEdict、HyperionYamato/Jump、RocinanteAttitude/LocalFireControl、Zhefeng、Gravity 四种以及 native 世界查询策略；`supports_special` 默认 false、`advance_special` 默认 UnsupportedSystem。root 必须实现对应真实 Rust 查询／执行或拒绝装配，不能给 true 然后 no-op。Unknown 总是拒绝。这是清楚的剩余接线缺口，不是七舰包功能完成证明。

## 实际集中验收结果

实际 `CapitalShipAI` class 的 numeric planning、controls、effects、sampleDecision，真实 TS Shield／FluxTracker 和真实 Rust Shield／Flux 对照，Node＋fresh 无头 Chromium dedicated Worker 均通过 25 场景×50步（1,250步），64,905 strict 字段、17,500 geometry 字段。包括63 held steps、20 live pre-vent threat refresh、20 vent、1次真实 phase activation，7个 mode 和 STOPPED 全部出现。实际 TS 计划阶段未写资源／控制／盾；三种错误阶段、旧 sequence、异主 intent 均拒绝；Rust Clone owner＋真实 host／shield／flux 的同 intent 续跑完整 memory／资源／诊断一致。

额外960组是实际源码 `advanceJetsAI`／`advanceWeaponBoostAI`、BurnDrive／Eclipse／Adun advanceAI 的策略差分，包含106次 activate 请求、4次 deactivate 请求、未知和未支持专项拒绝。这里使用请求 spy＋成功／失败反馈，验证策略与顺序；完整 ShipSystem activation payload／资源消费沿用父任务系统生命周期检查，不能将 spy 等同完整系统载荷实装。

Node最大 geometry 差 `2.7755575615628914e-16`（4字段）；Worker `3.3306690738754696e-16`（531字段），皆低于既定容差。目标／代次、控制阶段、hold、退避、clock/calm/resource、排散和系统开关请求严格同；无 RNG 消耗。Wasm341,535 bytes，SHA256 `8418c90eee4b8617298dbae0d64e32e99011f16f6cf51c399c4e8fd1ada90478`。`verification-ai-owner/result.json` 留实际输出、逐项 geometry 和源码／Wasm fingerprints。改动TS／runner严格 ESLint通过；未运行全项目类型检查或全套测试。

本块只交付模块和真实同步 Host 合同；shared lib／Core／battle／生产 Worker 没有接线，完整七舰包专项 AI、动态 roster、联网恢复、原版实机／UI和整场性能待主任务继续。`productionIntegrated` 和 `fullBattleReady` 均为 false。
