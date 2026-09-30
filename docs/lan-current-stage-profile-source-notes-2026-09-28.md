# 当前默认路径：完整链路分段 CPU 审计（2026-09-28）

上一轮 static-phase-slots 为 progress：正确性通过但模拟段两对退步，候选已精确撤回。现行全关路径没有新增加速。旧热 CPU 样本开着四项实验且源码较旧，不能用于判定当前默认路径的细粒度热点。

本轮先做一次只读分段采样，不再以调用量替代耗时：当前源码逐 SHA 与上轮真正 before 对照，一致才复用其 bundle；资源与依赖也核实。2玩家20AI、三舰循环、seed917/3200DP，150冷步+120热步，每步完整 simulation/capture/encode/decode/apply。只对热段开启 Node inspector，各段函数边界单独命名以归因；每样本每桶只计一次，self 与 inclusive 分开，子桶不得相加。Profiler 耗时不与未插桩 ABBA 相除声称提速。

270步完整 wire、tick20/270权威+隐藏RNG/autofire、完整receiver须与相同冻结 before 的既有A0一致。不要暴露ArmorGrid.cells。无生产写集、无桌面/可见窗口/子代理、无重新测速选优，不停止用户Vite，不发布或打包生涯。原版证据仍为本机0.98a-RC8实时战斗API；本轮不改玩法/UI，原版实机/UI未验证。产出应明确下一处有证据支持的结构优化，不把审计当作优化落地。
