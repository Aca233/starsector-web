# 私有 Worker 舰队规划距离复用：修改前对照（2026-09-25）

## 原版来源与范围
本机原版0.98a-RC8。本轮重新读 `../decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatFleetManagerAPI.java:23–49`：部署舰船、Waypoint、CombatTaskManager接口；前轮原版AutofireAIPlugin和settings.json的60fps证据仍适用。这里只优化既有Web舰队启发式 `FleetTactics.ts::planFleetTactics`，不把其评分、角色和站位策略宣称为原版AI还原。未操作原版实机或UI，本轮无画面/交互变化。

## 热点和只读域
最近准确源图profile中FleetTactics距离helper self约106.6ms/inclusive239.1ms（120tick整段），planFleetTactics inclusive753.4ms。这里包含玩家自动驾驶预阶段和fixedUpdate舰队阶段，不可全部算到单一阶段。两次规划之间会处理combatEffects/visibility/electronicWarfare，输入可能变化，因此绝不复用整份计划或跨调用距离。

现实现于influence、贡献资格、选敌、护卫、掩护/锚点与接敌阈值重复计算同一舰对距离。预期只在一次同步plan调用中复用原Vector2.distanceTo结果，保留原数学（包括极值/NaN）、有向参数顺序、遍历及累计顺序、平局和所有评分。

## 候选设计
- CombatEngine两个规划入口仅在原有FireControlQueryRoster私有Worker登记成立时传入内部owned能力。普通公开引擎和直接三参数调用仍走逐次live读取。
- 规划中只有64–512条有效Readiness且全输入名单通过已有hasOwnedFireControlReadHooks时申请工作区。它保留原生系统/射程/不可变元数据及所有外部效果/组件失效边界，拒绝未知或可重入用户读钩子。闭合Worker字段和原型没有调用者getter；这不是同realm插件沙箱。
- Readiness携带内部稠密index；Float64Array按有向a.index*n+b.index寻址，没有Ship对Map查找，不改Ship对象。NaN作未命中标记（NaN结果再次计算也不改语义），Infinity照旧。
- 仅复用数值缓冲区，不存舰船引用或权限。按需容量翻倍、最大512²×8=2MiB；每次调用仅填充有效区域NaN。busy防嵌套借用，try/finally归还，跨plan/舰队/名单重排不留数值缓存。小战斗、过大名单、未知效果及非owned回退。
- Readiness创建之后的本体读操作均为已准入原生只读查询；plan只写新建assignment。主/辅助系统原生stats、射程修饰通过前述门约束。资格本身不是持久权限，下一次plan仍重查。

## 验证和保留门槛
冻结当前最新304模块（含其他工作已新增内容），改前逐hash核对。扩展既有check-ai-fleet-focus，使用冻结旧planner与共享Ship类对照完整FleetPlan、实时失效、64/512边界、多队/手控/指令/隐藏/重复ID/死亡/平局/极值、位置改变及不同舰队连续调用；直接通用路径保留可观察回调顺序。测试构建计数距离读取并验证重入/异常归还。不要新建测试工程。

集中一次类型检查、改动文件oxlint和相关既有场景；短真实Worker计数确认普通调用/恢复确实使用矩阵。再做一次无计数/profile的200 Onslaught、150预热+180测量配对，前后源图固定，仅本候选模块不同，完整显示/权威/隐藏火控/RNG一致。没有实际收益则按精确字节/补丁撤回本候选，不碰上一轮火控检查和并发内容改动、不择优重测。不改版本、不提交或发布、不开可见窗口。

## 首轮场景失败的定向处理
类型检查和六文件oxlint通过。所选check-ai-fleet-focus是要求显式experimental bundle的早期策略实验，它的第一项预期a-target，但当前生产冻结旧planner与新planner均返回完全一致的b-target计划（focus-failure-diagnosis.log）。本候选不改选敌策略来迎合旧实验预期。保留首次失败日志与全部断言，为同一既有脚本增加OWNED_FLEET_ONLY定向入口，仅执行本轮新增对照；不能将原完整实验套件报告为通过。
