# 固定附属模块 AI 职责拆分：结果 — 2026-10-03

## 已完成的底层改变
不是删掉模块 AI 或降低频率。将「固定附着母舰」能力与「自由机动行动者」分开：在真实私有 Worker 的原生同步 plan span 内，经过资格检查的固定 NONE 系统模块不再计算巡航/站位/让路/避碰/steering。武器局部目标、profile/目标时钟、完整威胁、防御/护盾/排散、停火及舰队任务原样执行。

四个生产文件：AttachedModuleMotion.ts（新增）、CapitalShipAI.ts、CombatAIPhase.ts、TacticalWorld.ts。每个模块的角色 memory 是实例 primitive，保留现有动态 Publisher/Owner codec 的字段模型；未宣称真实线程续接验收。

资格只活在 plan 中，控制/effects 前关闭；原始世界 getter、未知导航 recorder/fire-lane consumer、未注册 owner、独立旋转/STATION、非不可变 spec/mount、系统定义复制/替换、系统实例 getter/方法覆盖、Ship 生命周期方法覆盖、状态钩子/运行时 modifiers、advanceCombat 均不能获得分流权限。全 roster 保守拒绝未知更新消费者。实际系统回调与模块防御独立旋转不移除。
保守限于 standard；large-battle-v1/v3 原 whole-AI sampler 保持原路径。此前 attached role 转进 sampler 立即失效一次，不能持有过时中性控制。角色改变只刷新运动，不抢跑 profile/目标时钟。

## 实际被消除的求解（不是 gate hit 推算）
同 seed917、2玩家+20AI、22根舰/176初始实体/734挂点场景，150 warm +120 timed。另用 solver 函数 BODY 插桩取证，方法身份/原生资格不变；插桩臂不用于耗时。

| 每步真实调用 | 基线全部 | 修改后全部 | 基线固定模块 | 修改后固定模块 |
|---|---:|---:|---:|---:|
| avoidCollisions | 76 | 20 | 56 | 0 |
| planVelocity | 76 | 20 | 56 | 0 |
| chooseCombatVelocity | 25.342 | 6.675 | 18.667 | 0 |
| yieldFireLane | 24.142 | 5.883 | 18.258 | 0 |

所有非准入模块/其它船对应 solver 调用次数严格不变。56模块每步仍各自 AI 计划/威胁/防御，没有从舰队压力/火力归属中删掉它们。最终两 candidate 臂各15120 attached plans/270步，timed6720/120步。

## 行为验收与允许差异
- 270步逐步完整 captureCombat 对照，仅白名单已准入模块的 turnInput/throttle/strafeInput=0、brakeInput=false。每次先独立断言中性值，再在测试捕获时临时替换为同 ID 基线控制值，捕获后恢复；绝不全局删除控制字段。此操作不进入物理更新/计时。
- 所有其余快照字段（物理、武器、幅能、护盾、引擎显示、统计等）严格相同；每步模拟 RNG 和视觉 RNG 一致。
- 实际局部目标 ID 一致；15120模块非导航 AI memory/defense memory、20520所有 AI 非导航诊断对照一致。
- 导航诊断允许差异独立核对：标记 motionRole=ATTACHED，desiredFacing 是规划时真实船身方向，positioning/score/clearFire 清空，avoiding/yielding=false。不能拿推进后的朝向要求规划时诊断相等。
- false flag 原始270步完整快照/双 RNG 相同，attached plans=0，不需要任何控制白名单。
- 23定向边界已通过，包含已关闭实际 motion permission/decision plane、角色转未知回调不提前 profile 时钟、sampler 中性控制失效及30步原生选择模块 MANUAL 回执（aim/trigger/target/hold/快照/双 RNG）。手动场景仍复用既有三舰种场景，未新建测试工程。
- app tsc/四改动文件 lint exit=0，明确记录 static-checks.json。

## 性能：没有证明稳定提速，更没解决整体高 ms
最终完整资格检查版本 ABBA：

| 臂 | 整步 ms | AI 三阶段 ms |
|---|---:|---:|
| A基线 | 35.862 | 12.508 |
| B修改 | 35.222 | 12.395 |
| B修改 | 32.653 | 11.624 |
| A基线 | 32.624 | 11.156 |

均值整步34.243→33.938ms（约0.305ms）；**AI均值11.832→12.009ms，反而略高**，顺序漂移明显。真实无消费者工作减少是已验证结论；整体速度显著改善不是。本块新增资格检查成本没有独立 CPU 分离测量，不能断言精确占比，也不能把不同版本/不同窗口的降幅相加。

修改后 fire-query 本窗仍约9.493ms，AI约12.009ms；剩余高 ms 仍包括这些有效规则求解、重复关系读取及资格检查。不得把本块的76→20写成整步76→20ms或已60Hz。保留当前内部职责分流是为了纠正无消费者工作图，不冒充已完成性能验收。回滚 VITE_COMBAT_ATTACHED_MODULE_AI=false。

## 验证中修正的具体问题
前两次同场景检查先后发现测试断言/fixture 问题：规划朝向误比物理推进后朝向；CombatEngine.ships getter 每次返回新数组导致定向 phase/world 身份不匹配。生产准入同时补上 own 生命周期和系统实例覆盖拒绝。最终全270/工作量/回滚已通过后，定向 fixture 使用了错误 fire-lane 方法（select而非get），以及 closed permission 重复读取 ships、手动测试误选无战斗模块的 player placeholder。之后只修并复查定向部分，不重跑全套。失败日志保留，不充当生产故障或已通过记录。

## 尚未验收
C:/starsector-core、C:/decompiled 不存在，原版0.98a-RC8源码/实机/UI等价待核实。本块无 UI 布局改动，无桌面操作。无浏览器真实 worker/网络传输/跨机/多核续接/全舰种后期战斗验收。不改生涯、不提交/推送/打包/发布。

证据：artifacts/combat-attached-module-ai-20261003/ 下 result.json、metrics-summary.json、manifest.json、performance-accepted.json、trajectory-accepted.json、boundaries-accepted.json、static-checks.json、final-source-hashes.json。冻结基线来自上一块最终 threat-relations candidate；最终生产四文件与 final-source 哈希一致。
