# 常驻 Rust 威胁预测和防御 AI 策划／来源

2026-10-08。本块属于已经授权的完整 Rust/Wasm 战斗迁移，目标是让自动舰船继续按当前方式独立朝向来袭伤害、升降盾／相位，并仅在安静窗口满足且实时复查安全时排散。界面、右键／Shift 右键、玩家手动控制、暂停、舰装和原有玩法不改。

## 最小原版对照

原版目标 0.98a-RC8，本机 `../starsector-core/data/config/settings.json` 和 `../decompiled` 已再次读取。`starfarer_obf/com/fs/starfarer/combat/ai/BasicShipAI.java:151–202` 分别建立相位、OMNI／FRONT 防御 AI 与独立 ventModule；`:366` 推进排散模块，`:419–420` 调用护盾 AI。`OmniShieldControlAI.java:75–130` 独立推进 threatEvalAI、碰撞及护盾模块。`starfarer_api_source/com/fs/starfarer/api/combat/ShieldAPI.java:25–64` 明确最大弧、展开弧、中心、伤害幅能比和维持费用。CFR 反编译并不能证明 Web 阈值等同原版，不据此更改现有规则。

当前 Web `ShipDefenseController.ts:7–47` 明确安静 .5 秒、幅能 .7、持续发射禁排散、排散前实时复查、相位余量和已知致命实际来袭保护。`ThreatAssessment.ts` 是 live 算法；`batch/AIThreatSolver.ts:13–100` 是已经投入当前原生 AI 路径的数值算法。数值路径区分 frame observer 的 Math.hypot 和 live Vector2.length、frame 与 live 的离场过滤／提前拒绝。迁移必须保留此差异。`ShieldThreatSector.ts` 在密集集合仍按原威胁顺序累加权重并保留首个同分方向。`CapitalShipAI.ts:235–247,446–465,605–624` 持有远期武器 forecast 记忆并在排散前清除缓存重新查询 live 世界；不得以计划时无威胁替代实时复查。

原版实机和截图状态仍待许可。本块无可见窗口、无 UI 修改，不声明原版视觉／交互已实测。预期玩家操作沿用现有按钮、快捷键、禁用提示、确认／取消流程；实际暂停与退出重开由主任务常驻世界接线验证。

## 范围、规则和流程

新增独立 `native/combat-core/src/defense_ai.rs`：借用由 Rust 常驻世界持有的完整有序舰船／挂点／弹体／光束、真实阵营可见性，计算实际弹道、追踪导弹保守追击 ETA、交叉光束及敌舰第一轮武器威胁；保留同组已活跃光束去重、frame/live 差异、原顺序伤害和幅能累计、精确扇区成员及首个同分方向。输出含来源实体的 handle＋generation 和挂点索引，不能把数组行作为持久身份。

控制器持有 quietFor/safeVentFor 和远期 forecast 的真实时钟／记忆。阶段观察来自 Rust，一般步骤禁止接受 JS 完整世界或目标／防御结果回写。`decide` 给出防御朝向、升降盾、排散或必须实时复查的具名动作；原生 `DefenseHost` 接口执行真实 resident Shield/Flux/系统操作并返回实际状态，不用发射通知冒充真实操作。实时复查仅在本来会排散的位置发生，observe(0) 不能再次累计安静时间；失败排散继续原护盾逻辑。主任务应在系统 AI 写入之后构造 live 世界，计划观察不能存活跨写入。

本块不修改 `lib.rs/state.rs/ship_state.rs`、公共 ABI、生产后端、导航／舰队分配或特殊系统 AI；不伪造视野、输入时钟、伤害／RNG、舰装 modifiers。缺失 resident 属性／可见性／拓扑、失效代次及非法数字拒绝。借用求解不改变权威；控制器须由主世界事务克隆，失败步骤连同所有其他域一起回滚。控制器 snapshot 不是完整联网恢复 checkpoint。LAN／Steam仍以现有宿主输入权威为目标，生涯存档不修改。

## 实施、验收及待核实

顺序：本文与源码依据 → 完整 typed 求解／记忆／防御动作 → 一次独立实际 TS 数值威胁和 ShipDefenseController 对照（Node＋fresh 无头 dedicated Worker）→ 主任务接入 AI／effect barrier 和真实操作 → 完整可玩验证。几何容差仅用于方向／纯坐标，威胁有无、扇区选择来源、ETA、伤害、幅能、安静计时、刷新／排散／升降盾动作和资源必须严格一致。

集中对照覆盖 guided/miss/fuse、缺失阵营、flare/disarm/noCollision/didDamage、交叉／无效光束及挂点去重、frame/live 武器过滤、恢复／转向／逼近／第一轮弹药、相位、密集128+与同分方向、安静计时和远期记忆、持续开火、排散成功／失败及更新后实时威胁。模块无 RNG 消费，必须保持该事实。缺失实际常驻世界接线、特殊系统行为、完整内容闭包、联网恢复、实机视觉与整场性能均由主任务继续，不把独立对照当作可玩交付。没有新的玩家产品取舍待决定。

## 实际交付与集中验收

完成独立 typed `defense_ai.rs`、验证 ABI、真实 TS 差分入口与 Node／fresh headless dedicated Worker runner。`node scripts/check-rust-defense-ai-module.mjs` 最终两环境各通过 720 个威胁场景、9,065 条逐项威胁、420 次防御步骤（5 次实时复查，37 次排散尝试）、720 次实际 CapitalShipAI 源码 forecast 时钟、96 个实际 SourceMissileLifecycle lifetime 和8种失效输入拒绝。75,434 条规则／资源／计时／目标身份字段严格相同；10,565 个预登记纯几何字段，Node 最大差0，Worker 最大差 `2.7755575615628914e-17`（6项方向误差）。没有把 ETA 归入几何豁免，始终严格比较。

斜向 frame 武器首次检查实际遇到 Rust libm `hypot` 与 V8 `Math.hypot` 导致 ETA 相差一 ULP；已用当前 V8 二元 Math.hypot 的 normalized summation 顺序修正 `frame_length`，重编译并定向复查本块。live 路径继续使用 Vector2.coordinateLength 顺序。源行为和源码／Wasm SHA256、逐项几何日志保留在 `artifacts/rust-combat-core-20261008/verification-defense-ai/result.json`，Wasm76,369bytes，SHA256 `991bd7fe4a48bfb71821f7811e1b779f2e0ce094636b6c3d73d386aa22f8733c`。改动文件严格 ESLint通过；本块未运行全项目类型检查或全套测试。

root 接线契约：`assess_into(World,Identity,horizon,window,weaponHorizon,weaponFrameEligible,Assessment,Scratch)` 读取真实 resident stage；`remaining_lifetime` 直接读取 resident生命周期字段；`Forecast::begin/finish/invalidate_after_live_refresh` 和 `Controller::observe/update/reset` 属于常驻 AI 事务状态；`DefenseHost` 只由 Rust resident服务实现。`Controller::update` 的 refresh 闭包必须从系统 AI 写入后的 live resident世界重查，不能传计划结果；排散会真实调用同一 resident Shield/Flux/系统 deactivate和音频路径。Scratch只有可重建缓冲，不持有实体身份或权威记忆。

局限：独立模块尚未接入主 ABI或生产世界；对照内 defense host 使用真实 Rust／TS Shield和Flux，但不含完整特殊系统deactivate、死亡／撤离输入链、联网恢复或UI交互。`fullBattleReady`保持false。原版实机／截图验收仍未运行；无桌面／输入／可见窗口、无生涯改动、无暂存／提交／发布。

## 实际混舰首14防御决策差：上游光束截断算序（2026-10-09）

本次按ROOT授权保原defense_ai/ai_resident规则，只修contact.rs::beam_query实际光束截断点。重看0.98a原版BeamWeaponRay.java:156起advance及OmniShieldControlAI.java:82起advance；前者保持真实炮口与终点，后者独立推进威胁评估。不能据Java Float逻辑推断JS Float64阈值。当前Web真实依据是BeamSimulationHandler.ts:25–42 intersectRayCircleEntry，返回origin+dir*t；排序距离路径55–56用scale(1/beamLen)，实际命中234–235用normalize坐标分别/=len，截断268附近直接copy返回点。native contact.rs::beam_query却将ray t/len后lerp重建点，且距离排序也使用/=len。两式数学等价但浮点运算顺序不等价。

actual22 seed917 frozenSource/native originalABBA14证据diagnostic-defense-first/result.json、rows/tick-13.json、ray-analysis.json：13真实enemy_ship WS003 beamend差约1e-13，14 source segmentCircleEntry恰t=1接受beam/native拒绝，之后按原firsttie防御扇区不同并134严格target不同。已有几何容差不允许改变真实候选资格；不能加epsilon、改sector tie、排序或patchdefenseFacing。

目标与玩家体验沿用既有防御/自动开火，不改UI或输入流程、范围只beam_query排序unit与真实circle hit point算序；保所有原圆/多边形资格、遍历、距离、伤害/事件/RNG，其他投射物及AI模块不做改动。先隔离冻结native clone恢复source arithmetic→actual14首点/资格和140其余defense差→窄落production→weapon同270整合→ROOT新Cargo/current完整可玩验收。若上游beam前端还有Math误差则记录具体路径再协调，不能靠此候选强行称完成。无产品新取舍，联机host/60Hz/预算、存档/生涯无改变；失败仍原世界事务回滚。原版实机/UI未运行，后台源与actualWorker为本块证据。

### 实际首个端点差的进一步核实

仅恢复contact算序的clone候选未关闭14差，未落production。增加真实source/native光束1–13记录后，1–11 WS003截断端点全部逐位同，12首差来自方向的sin：同angle `-0.6182928583579343`、previousLength `405.78745872549194`、frontLength `455.78745872549194`和炮口，source `Math.sin=-0.579644908742576`、native std `sin=-0.5796449087425759`；cos逐位同。12截断差使13 previousLength变为source `405.0644804438035` / native `405.06448044380346`，再改变14真正beam资格。原ABBA source/native每word仍exact，没有修改源Math/RNG/阈值。

`battle.rs::Ordnance::advance_beams`的`dir=[m[15].cos(),m[15].sin()]`属于所需上游窄入口，canonical_math由weapon代理负责，已向ROOT报告路径/真实输入，未在越权范围生产修改。当前V8 `src/base/ieee754.cc:229`调用LLVM shared sin，并非原生Rust libm。只有实际算法和真实输入候选吻合后才允许按授权挂接；不能用输入舍入、单值特判、epsilon或输出补丁代替算法。本文的contact算序范围和原验证顺序仍保留，生产完整可玩资格待当前源新Cargo验收。

### 共享canonical sin/cos范围与来源

ROOT随后明确新增授权：本代理可仅在`canonical_math.rs`新增sin/cos，保已有atan2/DD/表/signed；只接`battle.rs::advance_beams`的dir两调用及必要contact算序。其它nav/steering/projectile调用由各owner按具体真实证据挂接，无全域trig替换。

实际无头Chromium CDP版本`151.0.7922.34` / V8 `15.1.206.8`（revision `782af9cb30a53f54487e5d2e44738645a8ec457c`）。已取得这个V8 tag的DEPS，LLVM libc subtree pin为`265cc6a83652bac5cb8ceb59741bc288ebe6b312`；本机直接raw/googlesource传输失败，subtree hash不是llvm-project主树hash，镜像该hash404，未冒称取到exact pinned源码。已读取LLVM公开主树的shared/sin.h与cos.h（转math函数）、math sin.h/cos.h/sincos_eval.h/range_reduction_double_common.h/range_reduction_double_nofma.h，以及FPUtil/dyadic_float.h与big_int.h，原文件、许可证保存在tmp。V8当前ieee754.cc:167/229明确共享入口，CPU flags文件证明x64基线SSE2而非编译期AVX2+FMA采用noFMA。Wasm只round-nearest，保持正常运算、原LLVM Ziv快路径判据、失败精确128bit回退、完整大角度约减、signed0/NaN/Inf；不把快路径失败偷回std libm。

诊断候选`tmp/defense-sin-complete.rs`按上述原算序移植，精确常量直接f64bits，128bitquick_mul按原UInt两word忽略最低项/截断，禁止近似采样表。实际Chromium全域480050次逐位对照均一致（小角、多象限、pi邻界、0/负0/最小与最大有限值、从约2^-1020至2^1019的尺度、NaN/Inf），unsupported0、failures[]，`tmp/defense-sin-complete-result.json`。这证明候选行为对应当前实际runtime，仍不代替混舰实场/最终Cargo可玩验收。Node原JS V8 `13.6.233.17-node.40`与Browser对首12sin本来不同；按ROOT已明确Browser为主规则oracle，Node必须运行同canonicalWasm对比Browser记录，不能同时强求两个不同JS runtime结果。

实施仍先clone合并数学和contact→14真实资格→140其它defense/134目标→窄生产新增/挂接→同candidate270交weapon→ROOT新Cargo最终；没有新玩家规则、UI、权限或存档取舍，联机行为与原60Hz完整字段合同保持。

完整数学集中检查还追加Node原样同Wasm480044条有限输入与实际BrowserWasm逐位对照，全部exact，保NaN/Inf在BrowserSource比较中的实际语义。真实14 clone SHA4226d625全部source22word仍原ABBA逐位，旧14defenseFacing差已消失。140旧baseline仍37防御差，旧65/110首差移到82，原134target无差，不能称整场已过。按授权已窄落上述三个production文件；canonical旧prefix byteexact，证书`tmp/defense-sin-installed.json`。下一当前nav候选整合后继续37真实threat资格，不改已有defense输出。

### 当前真正首159：同角度下的光束炮口旋转（2026-10-09）

fire_control炮塔目标atan2 canonical和tactical profile中心已由owner按真实证据修复，actual37/82关闭。当前clone eb8644692d1f4cc4af4b731aa4b23a607e3e3c73610e2c8d00da8362b90f2b5e actual159首差ship_z defenseFacing。source每word仍originalABBAexact，前158严格analog和所有规则输出同。158 enemy_ship WS005 source/native完整pose与angle4.134740970396228逐位同，但beamstart sourcex131.6099509321015/native131.60995093210153，端点source[-153.0922189801236,-1004.5462440420957]/native[-153.09221898012368,-1004.5462440420959]。159相同shieldcenter[-282.78580897330517,-1200.5170906358696]/radius235，source segmentCircleEntry null、native t.9999999999999996；nativeBEAM先入、source同mount WEAPON末后，首tie不同。仍不允许用geometry容差改变真实资格或patchdefense输出。

窄下一方案只读获取BeamSimulationHandler.ts:168–182的barrel/relativePos、Vector2.rotate:107和mountworld intermediate，以及battle advance_beams同输入和stdtrig。若真正stem是mount/barrel stdsin/cos，按ROOT准确授权仅此两旋转调用接已有canonical helper；不替换contact::rotate全域、规则、mountangle、candidate圆epsilon或damage。先隔离clone同native验证true159关闭且无更早strict差，再owner落生产。原版BeamWeaponRay与OMNI AI已有对照支持真实炮口/端点观察，不能冒称Java Float与Webfloat64等同；无UI/权限/存档影响，玩家操作未改，错误原事务回滚。证据diagnostic-defense-current159/result.json/rows158，新的onlyreadbeaminput clone9f36f85b正在采真正intermediate，尚未称通过。

进一步actual158真正输入已经取得：angle4.134740970396228、facing2.5957409300285623、position[80.32795189488343,-509.0180721436832]、relative[-75,0]、barrel[23.593,.076]完整逐位同。barrel旋转与sin同，但**facing的cos source-.8546854317628956/native std-.8546854317628957**，mountOffset.x64.10140738221716/64.10140738221718精确传到startx131.6099509321015/131.60995093210153。150–157实际mount/start都逐位同，155 barrelsin末位不同未改变最终值。proof diagnostic-defense-beam159-input/result.json sourceScans beam-start-input与native37。已向ROOT给准确两个旋转路径请求恢复窄ownership；仅隔离clone把advance_beams mount+barrel两旋转调用改为browser_rotate（已有canonical sin/cos与Vector2同原运算），未知其它rotate保原。下一current159严格候选，无sourceMath/RNG/资格修改；production尚未落。
