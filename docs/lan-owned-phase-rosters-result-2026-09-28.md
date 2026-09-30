# 封闭 AI 区间成员名单复用：结果（2026-09-28）

## 决定
保留两文件实验实现；VITE_LAN_OWNED_PHASE_ROSTERS 默认关闭，未自动晋升。唯一无插桩 ABBA 的 passesPrescribedGate=true，numericGatePassed=true，sourceAuditPassed=true。不是完成整个优化目标，也不是已解决真实浏览器开场过载、实时 Hz 或联机输入延迟。

## 来源与范围
- 原版只读依据与编码前方案见 lan-owned-phase-rosters-source-notes-2026-09-28.md；原版 UI/实机本轮未验证，本轮不改变 UI/玩法。
- 只修改 src/engine/ai/WeaponThreatEnvelope.ts、src/engine/simulation/CombatEngine.ts；保留全部其它工作。初始两文件 SHA、候选 SHA、最终逐文件核验在工件 before.json、candidate.json、final-state.json。
- 仅在既有 Worker 所有权、原生方法身份和威胁阶段资格成立时，复用有序成员数组；不缓存敌我、存亡、位置或攻击结果。不启用其它索引/批处理，不改弹体和光束 live 世界。
- 遇到初始 retreating、当前舰撤退、失去本地更新资格、未知状态回调，停止复用；异常 finally 清空区间引用。公开 getter 仍返回新数组，不做跨帧全局名单缓存。
- 新增 Adun 方舟系统已包含在此次冻结源中：AI 激活只影响/排队技能状态，世界事件 dispatch 在交错阶段之后；未修改这些系统，也未用旧 740 模块图代表当前源。

## 验证
固定 C:/Program Files/nodejs/node.exe（v24.13.0）。755 个冻结源码模块；入口实际打包输入 346 个（含依赖及测试入口），实际外部文本依赖经 onLoad 保存代码和 SHA。同一冻结图，仅用保存的两文件原始字节构成真实 before；after 开启，disabled 默认关闭。另有独立 probe 构建，性能构建确认不含 __rosterProbe。

- 一次类型检查通过，两文件 lint 通过。
- 7 项合同全部通过：factory 引用/顺序/关闭/重建；真实根舰与模块 AI 每次名单逐引用逐顺序核验；初始撤退及真实越界退场；自定义 findHostile/updateShipAI/getter/根模块 AI/ship.update/navigateRetreat 回退及调用参数；状态回调新增舰船；异常清理及中途失去资格；60 步扰动完整状态与独立默认关自然场景。
- 4 步 probe：旧版 1064 次名单 getter，开启 448 次，默认关闭 1064 次。开启时 80 次根舰、224 次模块 AI 使用复用名单；均与当时 live 名单逐引用、逐顺序一致。重复构建减少 57.89%，不是整段模拟提速 57.89%。
- 60 步扰动：第8步技能，第20步近距离交火，第30步排散，第38步低血模块；before/after/default 三路每步完整 authority、所有记录的 RNG 与 autofire tracker 一致。用 structuredClone 去除跨 bundle 类原型差异后严格深比较，保留特殊数值和 undefined；不是只比最终击杀数。
- 独立20步自然场景验证默认关闭与真实旧版逐步相同。合同完整源码和逐项结果均保留；本轮无合同失败或修复重跑。

## 唯一 ABBA
预登记要求：A0/B1/B2/A3 独立隐藏 Node；150 完整 fixedUpdate 热身、120 热步，固定1/60；2玩家+20AI，三舰循环 web_zhuyuan/web_gloriana/web_sc2_hyperion，seed917，3200DP。初始176实体、734挂点。两侧相同开启已有 exact threats、owned motion、early preaim range、interleaved threats 四项实验，仅本轮名单开关不同。

|臂|初始化 ms|冷150步 ms|热120步 ms|热步均值 ms|
|---|---:|---:|---:|---:|
|A0旧版|106.828|5557.280|4429.358|36.911|
|B1开启|105.306|5346.498|4123.830|34.365|
|B2开启|98.983|5125.005|4094.910|34.124|
|A3旧版|103.802|5314.764|4285.634|35.714|

- 热段耗时下降 6.90% / 4.45%；预登记每对至少3%，均通过。
- 冷段变化 -3.79% / -3.57%；不得变慢超过3%，均通过。
- 初始化变化 -1.522 / -4.819 ms；各自上限 10.683 / 10.380 ms，均通过。
- 四臂第20步完整状态 SHA：bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224。
- 四臂第270步完整状态 SHA：bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6。
- 四臂资产 SHA、实体/挂点数一致；测量输入、脚本、Node、依赖和资产被保护，测量期间及最终无保护输入漂移，当前源码无漂移。未择优重测，未改变门槛。

## 尚未证明
这是完整模拟 fixedUpdate 的离线实验，不含实际渲染、网络/IPC 排队、输入往返、P95或P99。约34ms/步仍高于60Hz的16.67ms预算，不能称为已实现60Hz，也不能将倒数当作实际浏览器Hz。常规默认构建尚不会获得本实验收益；后续应在保持保护机制的真实无头浏览器链路验证是否值得开启，不擅自提高占用率、开GPU或取消过载保护。

完整证据：artifacts/lan-owned-phase-rosters-20260928；关键结果 abba-once/abba.json，最终状态 final-state.json。未暂存、提交、推送、发布，也未修改原版安装文件。
