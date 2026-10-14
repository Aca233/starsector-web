# 单次瞄准扫描查询复用：实现前边界（2026-10-01）

## 原版证据 → 预期行为

本机 0.98a-RC8（../starsector-core/starsector.log:1）。已重读 ../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:236–268（候选、角色/阵营/可见性、提前量与射界），MutableShipStatsAPI 的即时武器统计，以及 CollisionGridAPI.java:8–16（区域查询并不总比线性扫描快）。反编译存在类型异常，不照搬；Web 保持现有逐挂点候选顺序、目标优先级、精确拦截/命中、tracker/RNG 与发射时序。内部 CPU 优化无 UI 变更，原版实机/截图验收未做；不操作桌面。

## 当前差异 → 本轮最小改动

AutofireController.aim:385 把同一扫描中 prepareAimQuery 的复用绑定到 hasNativeThreatPhaseHooks；自制舰即使统计回调已经纯读审计，仍对每个候选重复生成炮口、延迟、弹速和射程。这里不需要任何 AI 生命周期/compactForecast 许可。

已查阅 2026-09-27 authored fire-query 与 weapon-stat-cost 记录：全名单资格审核/家族重审引入的新成本抵消了收益，候选已撤回。本轮不恢复这些候选，不建立整场索引/家族缓存，不改 >=100 火控花名册门槛，不默认开启任何 AI 实验标志。

只让封闭 local module Worker 在一次 aim 调用内、一个挂点的纯读取候选连续段中懒复用 prepareAimQuery。沿用现有 stat 身份白名单、不可变舰体/原生射程定义资格；不扩大白名单。新分支仍执行旧精确 solveAcquiredWeaponAim，不因传入 prepared 而新增 acquisition 粗筛。遇到未知的 target/parent/auxiliary/相位读回调，在 canTarget 调用之前丢弃局部结果；即使未知目标最终不可选，下一纯候选也重新求值并重审射手资格。未知射手/自定义射程或弹速读取仍逐候选计算。只缓存局部查询结果，不跨调用、舰船更新、事件、发射、tick 或 await。

普通 UI/inline realm 不启用；原 native 路径不改。sourceCarrier 只涉及其 spec 的 fighterRange native hook，父舰模块修正使用既有纯统计资格。未知读取或运行时修正保守回退。封闭 Worker 仍依赖原有 data-command 所有权约定，不是防同 realm 任意 monkeypatch 的安全沙箱。

## 完成后的验证方法

使用本轮 current graph 冻结源作前后配对，24 Hyperion（60+120 tick）和8 Gloriana/184实体（30+60 tick），Worker-owned CPU。每 tick witness/RNG、隐藏火控与显示读值，30 tick/末尾完整权威帧字节一致。保留 78 小行星、60 Hz、舰船/弹丸数和全部发射效果；CPU 不包含真实 IPC/渲染/多核，不换算 FPS/TPS。

完成后集中一次类型检查、改动文件 lint 和既有 simulation-visibility 场景；在现有独立 Worker 契约加入逐挂点输出/隐藏状态、下一扫描重算、未知目标副作用（含返回不可选）、未知射手/辅助/父级、自定义 getter/射程回退、carrier/模块、空/无效扫描等覆盖。只有具体失败定向修复并复查，不新建测试框架。

若正确性不成立或两个目标场景没有可辨识收益，撤掉本轮生产改动，不择优报告。不会将通用批次/索引开关启用冒充本轮完成；真实高负载多核/端到端仍单独待验。

状态：实现/验收结果待补。无暂存、提交、推送、打包、发布、生涯修改、桌面操作或子代理。
