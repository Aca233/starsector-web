# Combat core replacement — 定向复验失败回执

## 2026-10-05 紧急止损：数值 core 失败，默认关闭

- 工程诊断 ABBA 四行 step 均值（ms）：A baseline `34.925`；B candidate `49.464`；B candidate `60.940`；A baseline `35.292`。
- 汇总：baseline `35.109ms` / p95 `44.376ms`；candidate `55.202ms` / p95 `80.601ms`，慢 `57.23%`。候选 step ≤16ms 为 `0/240`；actualshots 每 row `177+209`。
- 行为未通过：tick228 盾朝向差异仍未解决。上述工程诊断不是行为验收，也不是完整交付验收。
- 默认关闭，只有显式 `VITE_COMBAT_NUMERIC_DECISION_CORE=true` 才 opt-in；不复用此前已通过优化的 `VITE_COMBAT_STAGE_KERNEL` 开关，实验代码保留。
- 默认碰撞批次按本机冻结 `artifacts/combat-multirate-20261004/multirate.mjs` 的 `updateProjectiles` / `checkShipCollisionsBatch` 恢复（约40000 / 39190行）：恢复弹体批次、原 flush 边界、批量查询及原顺序失效 hit 回退；默认 generic 查询复用阶段已准备的 spatial index。opt-in 保持有序单发实验及未知回调 rebuild。
- 未发布；本次仅做最小止损，不继续优化或研究。补丁验证仅 app tsc，不重跑行为、benchmark 或全套 lint；以下历史记录保留，其“最新状态”及“ABBA未执行”等描述均为当时回执。

日期：2026-10-04。**最新状态：授权加入1e-9几何绝对底限后，原candidate复验到tick228出现真实防御控制方向差异并停止（bitExact=false）。tick0及前227步在policy内等价；防御朝向差0.0421355rad，非舍入误差。270步未完成，ABBA未执行。以下历史回执保留。**

## 1e-9绝对底限授权后的复验：tick228真实防御朝向差异

- 未改生产、未重建candidate，继续使用 `5aa4709c0a442aa99a6e1ec5680eb0d655e542bb685aaa12042441e0fc6244fb`；仅apply_patch更新policy v3及driver manifest。现有allowlist未新增字段，连续几何/control/纯预计ETA界限为 `max(1e-9,32*EPSILON*max(1,abs(a),abs(b)))`，整数、所有实际clock、资源、target、shot/伤害、生命周期及RNG仍严格。
- 修订原因：beam大坐标相减/三角延伸产生消减误差，仅按结果值缩放32EPS低估误差；主代理将几何数值比较调整为远低于碰撞容差的1e-9绝对底限；该调整不是用户提出的验收标准，非逐位等价或行为差异白名单。
- tick0及前227步按policy等价；tick228（timed第78步）唯一失败字段是 `ship_1w` 的 `$.captureAndDualRng.snapshot.ships.13.state.defenseFacingRad`：旧 `0.3684362416881238`、新 `0.4105717440344104`，差 `0.0421355023462866`rad（约2.414186°），明显超出限定舍入误差，属于真实防御控制输出差异。
- 此tick双RNG、所有tracker RNG、resources及effects仍严格等值；除该防御方向外，其余完整world/行为状态均在policy内等价。未放宽这项真实差异，立即停止，未跑ABBA。
- `bitExact=false`；已放行容差命中17672次、1643个路径，其中66次需要1e-9底限；实际max absolute=`2.1600499167107046e-12`，max EPS-scaled=`907.8272492414908`。超界防御方向未计入放行统计，全部明细保留。
- 原tick205失败及policy v2证据完整保留于 `C:\starsector-web-master\artifacts\combat-core-replacement-20261004\attempt-8-tick205\`；当前根目录保存本次回执、双方witness及policy v3 driver manifest。仍无性能改善结论，等待定向处理。

## 几何ETA授权扩展后的复验：tick205 beam坐标超过32EPS

- 未改生产、未重建candidate，继续使用 `5aa4709c0a442aa99a6e1ec5680eb0d655e542bb685aaa12042441e0fc6244fb`。policy v2只增加已由源码确认的forecastEarliest几何ETA（CapitalShipAI.ts:242–246、453–463），32EPS界限不变；forecastRemaining、scanIn、aimIn及所有实际timer/资源/targets/shots/伤害/RNG仍严格。artifact源码和verification-driver-manifest均通过apply_patch更新，绑定原build manifest。
- tick0及前204步按policy等价；tick205（timed第55步）仅两条连续几何坐标超界，均属 `ship_h/S09` 的 `web_sc2_hyperion_pd` beam（id=`0.39978396939113736`，world.beams[12]）。
- `endPos.y`：旧 `-47.761892982538654`、新 `-47.76189298253826`；absolute=`3.979039320256561e-13`，允许bound=`3.3936866104894147e-13`，EPS-scaled=`37.519450928277486`。
- `rayEndPrevFrame.y`：旧 `-47.76189298253854`、新 `-47.7618929825382`；absolute=`3.410605131648481e-13`，允许bound=`3.3936866104894066e-13`，EPS-scaled=`32.15952936709507`。
- 除这两条超界坐标外，其余完整world/行为状态均在policy内等价；双RNG、所有tracker RNG、资源、effects、target/selection、发射/伤害及实际clock未见分叉。不是重新出现PD target/timer错误，但预先限定数值界限未通过，未自行放宽或追改生产。
- `bitExact=false`；已放行容差命中7352次、697个路径，max absolute=`1.3073986337985843e-12`，max EPS-scaled=`22.84366692972728`（不包含两条拒绝值）。全部命中仍保存在numerical-tolerance-result.json。
- tick178历史证据保留于 `C:\starsector-web-master\artifacts\combat-core-replacement-20261004\attempt-7-tick178\`；当前根目录保存本次回执、双方witness与driver manifest。已停止，未运行ABBA，没有性能改善结论。

## Missile scope修复后的复验：tick178派生ETA未列allowlist

- 仅重建candidate一次，SHA-256 `5aa4709c0a442aa99a6e1ec5680eb0d655e542bb685aaa12042441e0fc6244fb`；未重跑静态、未改生产、未增加场景或改窄容差policy。
- tick0及前177步按原policy等价，原tick164 target/timer差异不再出现。tick178（timed第28步）仅有一个未放行字段：`ship_y` 的 `$.semanticState.aiMemory.6.state.forecastEarliest`，旧 `2.3475863805535355`，新 `2.347586380553536`，绝对差 `4.440892098500626e-16`。
- 定向源码读取确认该字段为 `Math.min(...incoming.eta)` 的派生威胁ETA缓存（CapitalShipAI.ts:242–246、453–463），不是推进节拍的倒计时；双方forecastRemaining均为-1。仍保留该行为相关字段，不删除、不默认按容差放行，也未追改生产运算顺序。
- 此tick除该字段外，完整物理capture和其余行为状态均在既有policy内等价；双engine/visual RNG、全部tracker RNG、resources及effects严格等值。没有发现新的target/资源/RNG/节拍差异，不能将这个派生ETA诊断冒充真实离散失败。
- `bitExact=false`；容差已命中4609次、437个不同路径，max absolute=`6.821210263296962e-13`，max EPS-scaled=`18.93754297336178`；未包含未授权的forecastEarliest命中。
- tick164旧证据及bundle保留于 `C:\starsector-web-master\artifacts\combat-core-replacement-20261004\attempt-6-tick164\`；当前根目录保存新manifest、回执和双方witness。未扩allowlist、未重跑，尚无ABBA/性能结论。

## PD负row修复后的复验：tick164 craft target/timer差异

- 按授权仅重建candidate一次，SHA-256 `46c2ec7d987c685ff4b151506594954349af27787800d65d84fd4230da2716e1`；既有几何allowlist与32EPS界限不变，未重跑静态、未改生产。
- tick0及前163步数值等价，原tick132差异不再出现；tick164（timed第14步）出现首个真实差异并停止。涉及 `ship_1h_craft_4h/GUN_0`、`ship_1h_craft_4j/GUN_0`、`ship_1h_craft_4o/GUN_0,GUN_1`。
- 旧target均为MISSILE `0.9467570506967604`，reason=`ALIGNING`；新target为空，reason=`NO_TARGET`。四个tracker的idleFireTime旧0、新 `2.7333333333333285`，scanIn也不同，例如4h旧 `0.2045704437769018`、新 `0.08182817751076073`。共44条失败字段路径，完整见logic-result.json。
- 首个失败tick的engine/visual双RNG、全部tracker RNG、资源及effects仍严格等值；但target/selection与timer真实不同，不能放宽、不执行ABBA。
- `bitExact=false`；截至失败tick容差命中3737次、375个不同路径，max absolute=`6.821210263296962e-13`，max EPS-scaled差异=`18.93754297336178`；全部容差命中仍原样记录，不含上述真实差异。
- 原tick132失败输出、bundle与接线完整保留于 `C:\starsector-web-master\artifacts\combat-core-replacement-20261004\attempt-5-real-pd\`。当前根目录保存新manifest、回执及双方witness。旧verification-driver-manifest已归档；新build manifest直接锁定现有数值等价driver。已停止等待定向处理，无性能改善结论。

## 用户限定数值等价复验：真实离散/RNG差异

- 沿用candidate `c934541ad75c575a0e4315b4549358af0b21e855b09047c967ea86e0b880a388`，未修改生产、未重建；原build manifest不变，新增verification-driver-manifest仅锁定授权后的artifact接线。
- 仅位置/速度/角度/控制及派生aim/tactical字段允许有限浮点误差 `<=32*Number.EPSILON*max(1,abs(old),abs(new))`；整数、非有限值、target/selection、timer、HP/armor/flux/ammo/伤害、RNG及生成/死亡/发射等仍严格。完整policy与全部命中保存在 `numerical-tolerance-result.json`。
- `bitExact=false`；截至失败tick容差命中1621次、219个不同路径，max absolute=`2.2737367544323206e-13`，max EPS-scaled ulp=`16`。scaled ulp定义为差值除以 `EPSILON*max(1,abs(old),abs(new))`，不是相邻double的实际间隔计数。
- 首个真实失败为tick132（warm阶段），`ship_h` / `S05`：旧target为MISSILE `0.304321376606822`、reason=`ALIGNING`；新target为空、reason=`NO_TARGET`。挂点角度旧 `4.278621334325225`、新 `4.3318240113890525`，明显超出限定舍入误差。
- 同一tracker：scanIn旧 `0.18969956572982483`、新 `-0.016666666666666666`；firingTime旧0、新 `0.016666666666666666`；RNG witness第2项旧 `14253487516`、新 `12421921703`。cadence aim/acquisition计时及held target也不同。没有将这些真实行为差异容差化。
- 该tick engine/visual双RNG、resources/effects/死亡和shots统计仍等值，但局部tracker RNG已经不同，故不通过、不跑ABBA、不报告性能改善。
- 原tick88逐位差异和前87步逐位等值完整保留在 `attempt-3\`。首次数值接线漏列sourceVelocity（授权的速度类别）所产生的tick111回执保留于 `attempt-4-wiring\`；补齐已有位置/速度表示后使用同场景继续，未增加场景或放宽数值界限。
- 当前根目录保留首个真实差异回执与双方witness；容差明细及接线manifest均位于 `C:\starsector-web-master\artifacts\combat-core-replacement-20261004\`。已停止，等待定向处理。

## B 算术顺序修复后的定向复验（第三次）

- 按授权不重跑 app tsc/scoped lint，仅重建candidate一次：SHA-256 `c934541ad75c575a0e4315b4549358af0b21e855b09047c967ea86e0b880a388`。
- 同一冻结baseline、scene与初始规模；tick0及前87步严格等值，执行到tick88立即停止，未运行ABBA。
- 差异属于**物理/控制行为状态，不是仅派生cache**：`ship_h` 的 `$.captureAndDualRng.snapshot.ships.4.state.throttle`，旧 `-0.22083273949005508`，新 `-0.22083273949005566`。
- 同船AI状态 `$.semanticState.aiMemory.3.state.tacticalX`：旧 `49.49174958420565`，新 `49.49174958420564`。未放宽精度或扩展适配。
- 首个失败tick的engine RNG及visual RNG仍严格等值；trackers、weapons、resources、effects、roster、events、combatEffects及combatStats也等值。这仅界定此tick差异，不构成270步通过。
- 第二次失败输出与candidate已原样保存至 `C:\starsector-web-master\artifacts\combat-core-replacement-20261004\attempt-2\`；当前根目录保存第三次回执及双方witness。D未修改生产，停止等待定向修复。

## A/B 修复后的定向复验（第二次）

- 现有 app tsc 退出0；仅自上次静态回执以来变化的5个生产文件 scoped oxlint 退出0，无 warning：CapitalShipAI、AutofireController、CombatEngine、ShipWeaponControlSystem、FireProgram。D 未修改生产。
- 新 candidate SHA-256：`984717bf46c9e9a27c3affa82a74dc252921fe7e2c1379a7947d15edf4b284fb`。baseline 与 scene 保持原冻结 hash。
- 默认完整 capture 没有豁免 `fireProgram` / `actualFireCoverage`，若出现仍直接报错；本次未复现污染/RangeError。两个 cadence point 独立拷贝，未删除或放宽行为状态。
- 同一 seed917、20AI＋2玩家、150 warm＋120 timed 场景：tick0 等值；仅执行tick1后停止，270步未通过。
- 唯一已报告差异：`$.semanticState.trackers.314.state.cadence.steeringPoint.x`，`ship_1w` / `L03`，旧 `500.3240847448694`，新 `500.3240847448695`，差值 `5.684341886080802e-14`。这是保留的 steering 坐标数值差异，不是 shared-ref 编码差异；不加容差、不自动放行。
- 对本次已存 witness 的离线读取：tick1完整物理world/双RNG与aiMemory等值；仅此tick的诊断事实，不是270步验收。
- 当前回执及双方 witness 位于 `C:\starsector-web-master\artifacts\combat-core-replacement-20261004\`；旧失败输出、manifest与bundle已原样保存于其 `attempt-1\` 子目录。未运行ABBA，无性能改善结论，等待主代理定向处理。

## 首次失败摘要

- **静态回执**：现有 app tsc 退出0；仅 A/B/C 本轮生产写集 scoped oxlint 退出0。有一条 `FireProgram.ts:254:35` 未使用变量 `w` warning，D 未修改生产。
- **构建回执**：首次尝试因 artifact 输入 hash 边界漏掉既有 desktop/@msgpack 依赖而失败，未写包；只修 artifact 后一次成功落盘。已执行 candidate SHA-256 为 `032448aa33395882cc306db880bc197dccc4fb52fd34184385e7935ca2982e27`。旧 multirate bundle 没有重建。
- **执行范围**：同一个既有 scene，tick0 对照等值；两侧只执行一个物理 tick 后停止。不是150 warm＋120 timed通过，也没有性能数值。
- **A 真实行为差异**：对已有双方 witness 离线读取，未再次执行 scene，确认56个 attached module 的 `forecastRemaining` 不同：旧值 -1；新值包括 `0.016666666666666666`、`0.03333333333333333`、`0.05000000000000001`。主代理已恢复 A 修 scene 级 compactForecast 资格。该行为时钟必须严格保留，不能按派生缓存删除、白名单化或容差放行。
- **B 生产 snapshot 污染**：可枚举 `weaponControl.fireProgram` / coverage 在 tick0 packet 已出现；绑定 Stage 后产生巨大列/规格图递归展开，最终写 candidate raw JSON 时触发 `RangeError: Invalid string length`。根因不是单纯日志上限，而是 transient authority scratch 泄漏。B 正在改外部 WeakMap，numericCadence 不得保全 Stage。
- **表达差异单列**：flat/numeric 与 nested/bool 的 multirateStateKey 编码，可保留全部 guard 组件做语义映射；两个 cadence point 的 alias ref-vs-literal 是适配器构造差异，已改成独立 `{x,y}` 拷贝，坐标仍严格。以上不能覆盖 forecastRemaining 的真实行为差异。
- **撤回绕过方案**：未复跑的 readonly capture façade 和 scratch 字段排除已撤回。默认 capture 使用实际 engine；若 transient scratch 仍进入 packet，直接报失败。无需强行输出巨型 raw-candidate JSON。
- **局部等值的边界**：已存 tick1 witness 的 world 字段、双 RNG、资源/effects/死亡/shot stats 等值，仅为此失败 tick 的诊断事实，不证明所有舰船行为、270步或原版等价。

原 `logic-result.json`（RangeError）、双方语义 witness、tick0 hash、静态/build 回执均保留。完整摘要见 `artifacts/combat-core-replacement-20261004/FAILURE-RECEIPT.md` 及 `verify-attempt-1-summary.json`。停止指令后只有文件补丁和保存 witness 的离线读取，没有构建、scene、检查或 ABBA 重跑。

## 范围与依据

- 已读项目 AGENTS 和 `combat-core-replacement-plan-2026-10-04.md` 开头当前 TS 同步数值决策域方案；不使用已撤回的 Rust 全核心方案。
- A 负责 AI 全查询域；B 负责 fire 全查询域；C 负责共享 Stage、contact、Engine/ShipStepBatch 默认入口。D 只写 `artifacts/combat-core-replacement-20261004/**` 和本文，不修改生产。
- 初始准备仅后台读取/hash及 apply_patch；随后在用户明确授权下执行上列集中检查和首次失败场景。未 profile、矩阵、容量探针或可见窗口，未提交/发布。D 未修改生产；主模型未由本任务切换。
- 当前没有 `multi_agent_v1` 工具，未调用 app thread 聊天工具。依据主代理消息和实际源码适配 AIBatch 的 aiDomainWork/admission、B readFireDomainCoverage(control) 当步及累计旧调用、C readStageCoverage(owner) 与 contactCoverageFor(owner)/actualCoverage。新 API 已接入，不伪造未完成的覆盖结果。
- 原版资源/反编译与实机/UI：本轮未补验。计划已有证据限制保持不变；本工作是当前 Web 行为的替换验证准备，不声称原版等价。

## 已冻结的旧默认与既有场景

| 输入 | 文件 | 已读取 SHA-256 |
| --- | --- | --- |
| 旧默认 multirate | `artifacts/combat-multirate-20261004/multirate.mjs` | `afd0a72fc17e971ca7e04114b3d5f745b1df42c8d1de23ed7a30fa4d41d5f683` |
| 对应 manifest | `artifacts/combat-multirate-20261004/build-manifest.json` | `2f8ce478379c145fabe25fbd1d2778878585c592c1943b1d38e926cb1cc293d5` |
| 不变 scene | `artifacts/combat-fire-scan-program-20261004/scenario.mjs` | `9c944eeb2bd242a7af4591054fe97c418b97b49882fe452c1684905927907eaf` |

旧 manifest 记录的 `bundles.multirate` 与文件 hash 一致，`variants.multirate="true"`。不重建旧代码，不退回同目录的 `baseline.mjs`（multirate=false），不复制覆盖源码。

固定 seed917、20AI＋2玩家、150 warm＋120 timed、60Hz。旧已执行 `timing-row-1.json` 的初始规模为 22 roots / 56 modules / 552 mounts / 70 fighters / 28 bombers / 0 drones；这是旧记录，不是新 candidate 结果。新 driver 固定规模并严格对照身份、装备和 tick0 全 capture。

## 验收边界及当前进度

1. **candidate entry/build**：已从当时冻结生产源码构建新入口，保留 multirate；旧包只读取。构建前后锁定实际输入并生成 manifest。当前 candidate 是失败版本，不能冒充已覆盖后续 A/B 修复。
2. **一次定向正确性**：复用上一轮 driver 结构与同一个 scene，tick0 与全部270步完整 raw capture＋双 RNG；补充 AI/defense、每挂点 tracker/RNG、武器状态、资源/effects、死亡与实际发射观测。首差异输出 tick、阶段、字段路径和双方完整 witness；规则不变的声明不能忽略任何差异。实现若声明允许差异，单列报告/待审，不自动放行。
3. **一组短 ABBA**：旧multirate、新candidate、新candidate、旧multirate；四个独立隐藏 Node 子进程，同样150+120。输出逐行 mean/p95/p99、120步原样 samples 和每变体240步合并统计。只计完整 fixedUpdate，不加 phase trace、不缩计时边界、不关闭 FX/采集/刷新/提交或本来在步内的工作。
4. **覆盖及旧链退出**：按实际已有 stats 核对主 AI/fire/contact 域进入、Stage admission、累计旧方法退出及真实 shotsFired；逐步聚合所有已知 control 的当步统计，不能只拿最后一份 plan。牵引/偏转不属 shot solver，单列而不强令0；细子域零请求或无独立计数明确未验证，不强迫新增四元计数或场景。当前严格对照中止，主域覆盖尚未完成验收。
5. **snapshot/network 单列**：外部 capture/encoding/transport 不在既有 fixedUpdate 基准里，本轮未测，未来输出明确 `not-measured`；不把它们当零成本或宣称端到端60Hz。

所有脚本要求 `--execute-after-source-ready`；ABBA 还要求相同 candidate/driver manifest 的严格对照与覆盖回执。该参数是误运行防护，不替代人的实际执行授权。

## 当前状态 / 不预填通过

| 项目 | 当前状态 |
| --- | --- |
| A/B/C 生产实现完成并通知 | 首次冻结后已验收失败；A/B 正在定向修复，等待重新就绪 |
| 真实 stats exports / 分支计数语义 | 已按实际 API 接线；B WeakMap 修复后的访问须定向复核 |
| 实现自定义允许差异清单 | 当前按方案“规则不变”；如实现改变必须更新并报告 |
| candidate 构建及输入稳定性 | 失败版本已构建并锁定输入；后续生产修复未构建 |
| 集中一次 typecheck / scoped lint | 首次冻结版本通过，lint 有一条 warning；后续修复未复查 |
| tick0＋270步严格正确性 | 未通过：tick0等值、tick1行为差异及 raw dump RangeError |
| 实际 core 覆盖、旧链退出及真实发射 | 270步验收未完成，不宣称通过 |
| 短 ABBA mean / p95 / p99 | 未执行，无数值 |
| 外部 snapshot/network | 未测，另算 |
| 原版实机/UI与真实联机回执、实时积债 | 本包不证明，仍未验证 |

### 观察限制

完整 `captureCombat` 是既有 presentation capture，不是可恢复 checkpoint。补充观察不包装生产函数或改 native prototypes，避免污染核心 admission；步后新弹体/光束观察是下界，可能遗漏当步生成又移除的实体，另以生命周期/资源/RNG/生产真实发射计数交叉核对。不透明 effect WeakMap/回调闭包不能靠本 driver 证明相等。未覆盖的策略或状态保持待验证，不新增矩阵补成绩。

等待 A/B 定向修复完成及继续授权后，只复查受影响内容并继续上述同一场景；不新增 probe、不重跑无关已通过项。严格正确性和主要覆盖未通过前不执行 ABBA、不写性能改善、不发布。
