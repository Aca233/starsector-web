# 真实 Worker 分配诊断（2026-09-26）

## 结论与边界
在恢复上一轮负收益碰撞FX候选后，对313个冻结生产模块进行真实LocalWorkerHost采样。主要新热点是Ship.isPhased经allSystems反复构造slice、成员数组与some回调，而不是据静态对象计数猜测收益。此轮没有修改生产代码，也没有得出提速比例。

200 Onslaught、seed917，150tick预热，151–210共60tick采样。独立无头Edge153；两个既有串行/自动调度臂，仅serial采样。两次运行均210次witness、211次完整显示图（4,653,851节点）及既有权威/隐藏状态检查点通过。当前源图、CPU采样源图、heap采样源图313项完全相同；工具hash见final-verification.json。

## 工具与修正记录
benchmark-real-workers.mjs新增可选 --profile serial --heap-profile：CDP HeapProfiler.startSampling，32KiB间隔，包含minor/major GC已收集对象，无强制GC。没有此flag时旧计时路径不变。summarize-browser-profiles.mjs按完整调用栈分离workerAudit测试快照分配；GC CPU样本独立分桶，不能把GC时长归到具体分配调用链。语法/lint与汇总器合成会计检查已通过。
第一次多行编辑因CRLF锚点不符，在写文件前失败，外层命令仍启动旧runner。因此run目录仅CPU profile，绝非heap采样。待进程成功终止，修正后才运行heap-run，CPU与heap文件均存在；两个exitCode均0，详见setup-repair.json。不重跑已完成采样。

## CPU-only诊断
60tick：simulation 2292.844ms，display-graph 836.065ms，display-projection-and-packed-visuals 386.593ms，GC 361.867ms，test-authority-audit 47.870ms，other 43.366ms。idle 6011.926ms单独列出，不当模拟工作。

## 堆采样诊断
1440节点、69,526样本。节点selfSize合计2,297,860,664估计字节；sample.size合计2,298,374,880，保留原始字段差异，不强制相等。独占桶：simulation 1,803,851,520；display-graph 280,318,056；display-projection-and-packed-visuals 168,412,276；test-authority-audit 44,527,160；other 751,652字节。
get isPhased合并self约343.585MiB（inclusive395.067MiB）。其中fixedUpdate→resolveShipToShipCollision→get isPhased路径self266,557,200字节，同路径slice另40,347,264字节；AI assessThreats→get isPhased self36,411,396字节。已核对采样bundle位置对应当前Ship.ts，并非撤回的旧候选。

这些是V8统计分配估计，不是精确malloc、保留堆、ArrayBuffer/GPU内存，也不是泄漏证据。inclusive行重叠不可相加。heap采样极具侵入性，所有profile运行耗时都不用于提速结论。

## 下一候选
只在封闭Worker的原生单战术槽路径，按查询即时读取主/防御成员，再顺序查询相位状态；不创建成员数组。不跨帧缓存isPhased，不跳过外部效果，不修改相位/碰撞规则。普通可扩展入口、多系统和覆盖allSystems路径保持原实现。通过合同、既有场景后，只做一次冻结的真实Host固定串行配对，有净收益才保留。

工件：artifacts/worker-allocation-profile-20260926。总体优化仍active；没有发布、桌面操作或子代理。
