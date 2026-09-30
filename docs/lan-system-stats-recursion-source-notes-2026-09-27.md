# 原生系统资格递归诊断方案（2026-09-27）

Registry纯身份查找已经是WeakSet，无需增加注册缓存。只诊断下一层ShipSystem.hasNativeStats对auxiliary、parent.allSystems的递归放大；不修改生产、不跳过检查、不缓存结果。复用刚刚验收的冻结旧基底bundle（四实验开），同原init的176实体734挂点。20个初始完整fixedUpdate，一次原样运行与一次透明getter计数运行，最终authority+隐藏tracker/RNG必须相同。

记录顶层调用、总递归访问、同次顶层调用重复对象、深度及期间allSystems次数；计数wrapper只在测量调用图时替换getter，finally恢复后捕获状态。没有计时收益/浏览器吞吐宣称，不与旧profile直接算改善，不并发性能实验。若重复很少则不新增memoization；若集中于特定父/辅助链，下一步再审计可否在同次原调用内安全消除重复。

第一次数量核实：20步hasNativeStats总访问353839，同次顶层重复15173（4.288%），只解释15173次allSystems，而allSystems总数1692701。不能为了这少量重复再加全量Map。定向补一次**源码内插桩**将allSystems归于isPhased/exact-hook/owned-update/stats/其它上下文，保持原函数定义及模块捕获的身份一致，避免prototype wrapper可能影响资格分支；仍20初始步，比较既有原样状态hash，不进行吞吐计时。

插桩工具首次构建后发现断言错误（预期5项、实际6项）：Ship与ShipSystem均有isPhased，phase桶包含两者。模拟尚未开始；保留失败记录，定向改为断言六个明确的文件:getter对，不改生产、不重跑性能ABBA。
