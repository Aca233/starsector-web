# 私有 Worker 火控资格的蕴含检查：修改前对照（2026-09-25）

## 原版证据与范围
本机原版为0.98a-RC8（沿用此前已核实的版本）；本轮重新读 `../decompiled/starfarer.api/com/fs/starfarer/api/combat/AutofireAIPlugin.java:15–30` 的 advance/shouldFire/forceOff/getTarget/getTargetShip/getTargetMissile 接口，以及 `../starsector-core/data/config/settings.json:8–9` 的vsync/fps。API仅证明原版火控接口，并不能证明Web的内部优化实现。此次不改目标、瞄准、发射顺序、tick频率、实体数、画质或原版UI；不操作原版实机，界面/实机体验未补验。

## 新鲜热点及预期行为
准确302模块代码的新profile见 `artifacts/current-simulation-hotspots-20260925/`。hasOwnedFireControlReadHooks self约427ms/inclusive456ms（120tick采样整段）；这是选热点证据，不是无profiler性能基线。本轮复用该冻结源图，并在改前逐hash确认无漂移。

只考虑删除 `Ship.ts::hasOwnedFireControlReadHooks` 内两次 hasNativeStats 读取：前一项 hasNativeThreatPhaseHooks 已经要求主/辅助系统的 hasNativeThreatPhaseAI 全部通过。在原生 ShipSystem getter 中，AI资格递归要求 Registry.nativeStatDefinitions；stats资格递归要求同一集合或额外的 originalStatDefinitions。故AI为true必然蕴含stats为true，Eclipse仅stats通过仍被AI拒绝。资格的true/false结果应保持完全一致。

## 闭合域与不变量
这条蕴含仅用于已有明确登记的私有local-combat.worker，其字段、原型及原生getter不允许调用者重写。普通公开可变引擎仍执行 hasNativeFireControlReaders 的全部原检查，不删通用hasNativeStats，不把同realm任意插件当安全沙箱。未来Worker加入可执行插件前必须重新审查所有权约定。

保留每舰begin对全名单的检查、辅助关系/额外系统、实时定义替换、外部相位/伤害效果、元数据、盾/甲/过载回调、runtime modifiers、父舰/舰载来源及伤害拦截器等全部独立失效保护。不缓存权限、不跨舰或tick复用资格。不改上一轮导航和预瞄索引。

## 验证与保留门槛
在既有combat-ai增加所有注册系统主/辅助组合、Eclipse、外部注册/克隆定义、逐batch变化与现有实时失效场景。测试构建把冻结旧函数附加到同一个Ship模块，共享原生callback WeakMap/WeakSet；不另造Ship类，也不向生产导出旧函数。对照旧/新资格和roster结果。

完整实现后集中一次typecheck、改动文件oxlint和该既有场景。短无头真实Worker探针确认正常启动/恢复资格启用，再跑一次200 Onslaught、seed917、dt1/60、150预热+180测量的无profiler配对，核对完整显示、权威/隐藏火控/RNG及精确源图。无实际稳定收益则只恢复本候选生产改动，保存失败证据，不择优重跑；保留测试/分析。此阶段不提交、打包、发布，版本保持0.2.11。

## 测量前并发工作区漂移的处理
资格验证与当前路径3tick恢复探针通过后，首个性能命令在esbuild阶段失败（GlorianaPack正在引用的gloriana-geometry.json当时不可解析）；没有产生性能样本。检查发现其他工作正在修改ModManager.ts/DesignModel.ts并增加Gloriana内容。绝不恢复或覆盖这些内容。

本轮仅扩展既有benchmark的--candidate冻结输入支持。前后两臂都使用起始302模块，after只替换本轮Ship.ts函数，候选输入保存candidate-input-sources.json。失败日志保留为paired-200.log，修正后使用paired-200-isolated目录；这不是重跑选择更好数据。性能结论仅对应该受控源图，不宣称最新并发工作区所有内容均已回归。
